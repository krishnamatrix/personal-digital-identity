import "server-only";
import { z } from "zod";
import type { GatewayConfiguration } from "./config";
import { fetchWithRetry } from "./retry";
import type { ResumeDocument } from "@/domains/identity/resume-import/resume-file";

export class AiRequestError extends Error {
  constructor(readonly code: string) {
    super("The configured AI provider could not produce a usable result.");
    this.name = "AiRequestError";
  }
}

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
});

/** Extracts a JSON value from model output that may include thinking tags or markdown fences. */
export function parseModelJson(raw: string): unknown {
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const unfenced = withoutThink
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1));
    }
    throw new Error("Invalid JSON");
  }
}

export type StructuredDocumentOptions = {
  schemaName?: string;
  userPrompt?: string;
  tagName?: string;
  pdfFilename?: string;
};

function requestHeaders(config: GatewayConfiguration): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  };
  if (config.providerName === "openrouter") {
    headers["X-Title"] = "Folioone";
    const referer = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (referer) headers["HTTP-Referer"] = referer;
  }
  return headers;
}

/** One request, no automatic retries or fall-through to another provider. */
export async function extractStructuredDocument(
  config: GatewayConfiguration,
  system: string,
  schema: Record<string, unknown>,
  document: ResumeDocument,
  options?: StructuredDocumentOptions,
): Promise<unknown> {
  const schemaName = options?.schemaName ?? "resume_extraction";
  const userPrompt = options?.userPrompt ?? "Extract this resume as JSON.";
  const tagName = options?.tagName ?? "resume";
  const pdfFilename = options?.pdfFilename ?? "resume.pdf";
  const content =
    document.kind === "pdf"
      ? [
          {
            type: "file",
            file: {
              filename: pdfFilename,
              file_data: `data:application/pdf;base64,${document.base64}`,
            },
          },
          { type: "text", text: userPrompt },
        ]
      : `${userPrompt} Its text is data, between the tags.\n<${tagName}>\n${document.text}\n</${tagName}>`;
  let json: unknown;
  try {
    const response = await fetchWithRetry(config.endpoints.chat, () => ({
      method: "POST",
      headers: requestHeaders(config),
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              config.responseFormat === "json_object"
                ? `${system}\nReturn JSON matching this schema:\n${JSON.stringify(schema)}`
                : system,
          },
          { role: "user", content },
        ],
        response_format:
          config.responseFormat === "json_object"
            ? { type: "json_object" }
            : {
                type: "json_schema",
                json_schema: {
                  name: schemaName,
                  strict: true,
                  schema,
                },
              },
        max_tokens: 16000,
        stream: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    }));
    if (!response.ok) throw new AiRequestError(`ai_${response.status}`);
    json = await response.json();
  } catch (error) {
    if (error instanceof AiRequestError) throw error;
    throw new AiRequestError("ai_network");
  }
  const parsed = completionSchema.safeParse(json);
  if (!parsed.success) throw new AiRequestError("ai_shape");
  const choice = parsed.data.choices[0];
  const finish = choice.finish_reason?.toLowerCase();
  if (choice.message.refusal || finish === "content_filter") {
    throw new AiRequestError("blocked");
  }
  if (finish === "length") throw new AiRequestError("max_tokens");
  if (
    (finish && finish !== "stop" && finish !== "end_turn") ||
    !choice.message.content
  ) {
    throw new AiRequestError("no_output");
  }
  try {
    return parseModelJson(choice.message.content);
  } catch {
    throw new AiRequestError("no_output");
  }
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type TextCompletionChunkResult = {
  text: string;
  finishReason: string | null;
};

/**
 * Streams a chat completion and returns both the accumulated text and finishReason
 * (including `"length"` so callers can seamlessly continue across turns/models).
 */
export async function generateTextCompletionChunk(
  config: GatewayConfiguration,
  messages: ChatMessage[],
  options?: {
    model?: string;
    maxTokens?: number;
    timeoutMs?: number;
    onProgress?: (chunkChars: number) => void;
  },
): Promise<TextCompletionChunkResult> {
  const timeoutMs = options?.timeoutMs ?? 600_000;
  let response: Response;
  try {
    response = await fetch(config.endpoints.chat, {
      method: "POST",
      headers: requestHeaders(config),
      body: JSON.stringify({
        model: options?.model ?? config.model,
        messages,
        max_tokens: options?.maxTokens ?? 16000,
        stream: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new AiRequestError(`ai_${response.status}`);
  } catch (error) {
    if (error instanceof AiRequestError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new AiRequestError("ai_timeout");
    }
    throw new AiRequestError("ai_network");
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new AiRequestError("ai_shape");
    }
    const parsed = completionSchema.safeParse(json);
    if (!parsed.success) throw new AiRequestError("ai_shape");
    const choice = parsed.data.choices[0];
    const finish = choice.finish_reason?.toLowerCase() ?? null;
    if (choice.message.refusal || finish === "content_filter") {
      throw new AiRequestError("blocked");
    }
    const text = choice.message.content ?? "";
    if (!text.trim()) throw new AiRequestError("no_output");
    options?.onProgress?.(text.length);
    return { text, finishReason: finish };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let finishReason: string | null = null;
  let lastReported = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload) as {
            choices?: {
              finish_reason?: string | null;
              delta?: { content?: string | null; refusal?: string | null };
            }[];
          };
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          if (choice.delta?.refusal) throw new AiRequestError("blocked");
          if (typeof choice.delta?.content === "string") {
            accumulated += choice.delta.content;
            if (accumulated.length - lastReported >= 200) {
              lastReported = accumulated.length;
              options?.onProgress?.(accumulated.length);
            }
          }
          if (choice.finish_reason) {
            finishReason = choice.finish_reason.toLowerCase();
          }
        } catch (err) {
          if (err instanceof AiRequestError) throw err;
        }
      }
    }
  } catch (error) {
    if (error instanceof AiRequestError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new AiRequestError("ai_timeout");
    }
    throw new AiRequestError("ai_network");
  }

  if (finishReason === "content_filter") throw new AiRequestError("blocked");
  if (!accumulated.trim()) throw new AiRequestError("no_output");
  options?.onProgress?.(accumulated.length);
  return { text: accumulated, finishReason };
}

export async function generateTextCompletion(
  config: GatewayConfiguration,
  system: string,
  userContent: string,
  options?: {
    maxTokens?: number;
    timeoutMs?: number;
    onProgress?: (chars: number) => void;
  },
): Promise<string> {
  const result = await generateTextCompletionChunk(
    config,
    [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    options,
  );
  if (result.finishReason === "length") throw new AiRequestError("max_tokens");
  return result.text;
}
