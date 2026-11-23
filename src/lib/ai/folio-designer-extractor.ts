import "server-only";
import { z } from "zod";
import {
  extractHtmlDocument,
  extractHtmlTitle,
  HTML_MAX,
  stitchHtmlContinuation,
  type FolioDesignerProposal,
} from "@/domains/folio-designer/folio-designer-schema";
import {
  formatIdentityDesignContext,
  type IdentityDesignContext,
} from "@/domains/folio-designer/identity-design-context";
import { getAiConfiguration } from "./config";
import {
  AiRequestError,
  generateTextCompletionChunk,
  type ChatMessage,
} from "./openai-compatible";

const MAX_CONTINUATION_TURNS = 6;
const CONTINUATION_TAIL_CHARS = 8_000;
const COMPLETE_HTML_RE = /<\/html>/i;

const SYSTEM = `You are Folioone's Folio Designer. Your job is to build a complete, single-file, self-contained HTML5 portfolio experience (<!DOCTYPE html> ... </html>) that faithfully implements the user's design prompt AND populates it with ALL of the user's saved Folioone identity information across multiple working navigation links and detail views.

Critical rules:
1. SINGLE STANDALONE HTML FILE: Inline ALL CSS inside a <style> tag in <head> and ALL JavaScript inside a <script> tag before </body>. Never reference local external files like href="styles.css" or src="script.js" because the preview and published page render standalone HTML in a sandboxed iframe.
2. FAITHFUL DESIGN EXECUTION: Reproduce the visual design, layout, typography, @font-face rules, remote asset URLs, CSS custom properties, media queries, animations, and interactive JavaScript choreography from the design prompt faithfully and completely. Do NOT simplify, drop layers, or substitute generic templates when the prompt specifies exact values, layers, or scroll math.
3. MULTIPLE WORKING LINKS WITH ALL DETAILS (NO DEAD LINKS):
   - Because the page runs as a self-contained HTML document, implement multi-page / multi-link navigation using client-side hash routing or view/section switching (e.g. #home, #about, #experience, #projects, #skills, #articles, #contact — adapting the header nav links so every relevant section of <user_identity> has its own dedicated, reachable link).
   - Keep the primary landing/hero experience (including any cinematic scroll stage specified in the prompt) intact on the main view, and ensure EVERY header navigation link, card, and CTA button works interactively:
     * Clicking a top navigation link smoothly switches to or reveals that dedicated full-detail view/section (with a clear active state and easy return to the main view / top).
     * Clicking any highlight card, project card, experience item, article, or "notes / details" button opens a rich, matching-style detail modal/drawer or sub-view showing the full details (full description, role, dates, technologies, external links, etc.) with a working Close / Back button and Escape-key support.
   - Include ALL available details from <user_identity> across those linked views: biography & professional summary, every experience role with dates and descriptions, every project with role/tech/links, education, grouped skills, achievements, certifications, featured posts, published articles, and social/web links (opening external URLs with target="_blank" rel="noopener noreferrer").
   - Style every linked view, sub-page, and detail drawer using the exact same typography, color palette, and visual atmosphere as the design prompt so the entire multi-link site feels cohesive.
4. HONESTY: Never invent employers, degrees, awards, URLs, or credentials that are not in <user_identity>. Only create navigation links for sections that have real content in <user_identity> (plus Home/Overview and Contact/Links).
5. OUTPUT FORMAT: Return ONLY the complete HTML document starting with <!DOCTYPE html> and ending with </html>. No markdown fences, no commentary before or after.
6. SECURITY: Do not include network calls to local/private APIs or attempt to read parent window/cookies. Remote fonts and image URLs explicitly given in the prompt are allowed.`;

export class FolioDesignerUnavailableError extends Error {
  constructor() {
    super(
      "Folio Designer is not available right now because no AI provider is configured.",
    );
    this.name = "FolioDesignerUnavailableError";
  }
}

export class FolioDesignerFailedError extends Error {
  readonly code?: string;
  constructor(code?: string, message?: string) {
    super(
      message ??
        "We could not generate a design. Try adjusting your prompt or try again.",
    );
    this.name = "FolioDesignerFailedError";
    this.code = code;
  }
}

export function isFolioDesignerConfigured(): boolean {
  try {
    return Boolean(getAiConfiguration());
  } catch {
    return false;
  }
}

const geminiResponseSchema = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z
          .object({
            parts: z
              .array(
                z.object({
                  text: z.string().optional(),
                  thought: z.boolean().optional(),
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

export async function extractFolioDesignerProposal(
  prompt: string,
  identity: IdentityDesignContext,
  options?: { onProgress?: (chars: number) => void },
): Promise<FolioDesignerProposal> {
  let config;
  try {
    config = getAiConfiguration();
  } catch {
    throw new FolioDesignerUnavailableError();
  }
  if (!config) throw new FolioDesignerUnavailableError();

  const identityText = formatIdentityDesignContext(identity);
  const userBody = `Create a single self-contained HTML5 document (inline <style> and <script>) implementing the design prompt below using this person's full Folioone identity across multiple working navigation links and interactive detail views so every section and item detail is accessible.

<design_prompt>
${prompt}
</design_prompt>

<user_identity>
${identityText}
</user_identity>`;

  let rawText = "";
  if (config.provider === "openai-compatible") {
    const mainModel = config.model;
    const fallbackModel = config.fallbackModel || config.model;
    let useFallback = false;

    for (let turn = 0; turn < MAX_CONTINUATION_TURNS; turn++) {
      const targetModel = useFallback ? fallbackModel : mainModel;
      const baseChars = rawText.length;

      const messages: ChatMessage[] =
        turn === 0
          ? [
              { role: "system", content: SYSTEM },
              { role: "user", content: userBody },
            ]
          : [
              { role: "system", content: SYSTEM },
              { role: "user", content: userBody },
              {
                role: "assistant",
                content: rawText.slice(-CONTINUATION_TAIL_CHARS),
              },
              {
                role: "user",
                content:
                  "Continue the exact same HTML5 document immediately from the last character above. Do NOT repeat already-written code, do NOT add markdown fences or commentary, and finish cleanly through </html>.",
              },
            ];

      let chunkResult;
      try {
        chunkResult = await generateTextCompletionChunk(config, messages, {
          model: targetModel,
          maxTokens: 16000,
          timeoutMs: 600_000,
          onProgress: (chunkChars) =>
            options?.onProgress?.(baseChars + chunkChars),
        });
      } catch (error) {
        // If the fallback model fails, automatically switch back to the main model so we don't break.
        if (useFallback && targetModel !== mainModel) {
          useFallback = false;
          try {
            chunkResult = await generateTextCompletionChunk(config, messages, {
              model: mainModel,
              maxTokens: 16000,
              timeoutMs: 600_000,
              onProgress: (chunkChars) =>
                options?.onProgress?.(baseChars + chunkChars),
            });
          } catch (retryError) {
            const code =
              retryError instanceof AiRequestError
                ? retryError.code
                : "ai_network";
            throw new FolioDesignerFailedError(
              code,
              code === "ai_timeout"
                ? "The AI provider timed out before finishing this design. Try again or use a faster model."
                : undefined,
            );
          }
        } else {
          const code =
            error instanceof AiRequestError ? error.code : "ai_network";
          throw new FolioDesignerFailedError(
            code,
            code === "ai_timeout"
              ? "The AI provider timed out before finishing this design. Try again or use a faster model."
              : undefined,
          );
        }
      }

      rawText = stitchHtmlContinuation(rawText, chunkResult.text);
      options?.onProgress?.(rawText.length);

      if (COMPLETE_HTML_RE.test(rawText) || rawText.length >= HTML_MAX) {
        break;
      }

      // Ping-pong between main and fallback model on continuation turns.
      useFallback = !useFallback;
    }
  } else {
    for (let turn = 0; turn < MAX_CONTINUATION_TURNS; turn++) {
      const contents =
        turn === 0
          ? [{ role: "user", parts: [{ text: userBody }] }]
          : [
              { role: "user", parts: [{ text: userBody }] },
              {
                role: "model",
                parts: [{ text: rawText.slice(-CONTINUATION_TAIL_CHARS) }],
              },
              {
                role: "user",
                parts: [
                  {
                    text: "Continue the exact same HTML5 document immediately from the last character above. Do NOT repeat already-written code, do NOT add markdown fences or commentary, and finish cleanly through </html>.",
                  },
                ],
              },
            ];

      let json: unknown;
      try {
        const response = await fetch(config.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": config.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents,
            generationConfig: {
              maxOutputTokens: 16384,
              responseMimeType: "text/plain",
              thinkingConfig: { thinkingLevel: "MINIMAL" },
            },
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(180_000),
        });
        if (!response.ok) {
          throw new FolioDesignerFailedError(`gemini_${response.status}`);
        }
        json = await response.json();
      } catch (error) {
        if (error instanceof FolioDesignerFailedError) throw error;
        throw new FolioDesignerFailedError("gemini_network");
      }

      const parsed = geminiResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new FolioDesignerFailedError("gemini_shape");
      }
      if (parsed.data.promptFeedback?.blockReason) {
        throw new FolioDesignerFailedError("blocked");
      }
      const candidate = parsed.data.candidates?.[0];
      if (!candidate) throw new FolioDesignerFailedError("no_output");
      const text = candidate.content?.parts
        ?.filter((part) => !part.thought && typeof part.text === "string")
        .map((part) => part.text)
        .join("");
      if (!text) throw new FolioDesignerFailedError("no_output");

      rawText = stitchHtmlContinuation(rawText, text);
      options?.onProgress?.(rawText.length);

      if (
        COMPLETE_HTML_RE.test(rawText) ||
        rawText.length >= HTML_MAX ||
        candidate.finishReason !== "MAX_TOKENS"
      ) {
        break;
      }
    }
  }

  let html: string;
  try {
    html = extractHtmlDocument(rawText);
  } catch (error) {
    throw new FolioDesignerFailedError(
      error instanceof Error ? error.message : "no_output",
    );
  }

  return {
    html,
    title: extractHtmlTitle(html),
    identityFieldsUsed: identity.populatedFields,
    generatedAt: new Date().toISOString(),
  };
}
