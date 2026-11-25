import { z } from "zod";

export const PROMPT_MIN = 20;
export const PROMPT_MAX = 60_000;
export const HTML_MAX = 250_000;

export const IDENTITY_FIELD_KEYS = [
  "displayName",
  "headline",
  "professionalSummary",
  "summary",
  "location",
  "industry",
  "primaryPurpose",
  "currentDesignation",
  "currentOrganization",
  "experience",
  "projects",
  "articles",
  "skills",
  "education",
  "achievements",
  "social",
] as const;

export type IdentityFieldKey = (typeof IDENTITY_FIELD_KEYS)[number];

export const designPromptSchema = z
  .string()
  .trim()
  .min(
    PROMPT_MIN,
    `Describe your design in at least ${PROMPT_MIN} characters.`,
  )
  .max(
    PROMPT_MAX,
    `Keep your prompt under ${PROMPT_MAX.toLocaleString()} characters.`,
  );

export type FolioDesignerProposal = {
  html: string;
  title: string;
  identityFieldsUsed: IdentityFieldKey[];
  generatedAt: string;
};

export const folioDesignerProposalSchema = z.object({
  html: z.string().min(1).max(HTML_MAX),
  title: z.string().min(1).max(160),
  identityFieldsUsed: z.array(z.enum(IDENTITY_FIELD_KEYS)),
  generatedAt: z.string(),
});

/** Extracts a standalone HTML5 document from raw model output (strips thinking tags and fences). */
export function extractHtmlDocument(raw: string): string {
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const unfenced = withoutThink
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const doctypeIdx = unfenced.search(/<!doctype\s+html/i);
  const htmlStart =
    doctypeIdx !== -1 ? doctypeIdx : unfenced.search(/<html[\s>]/i);
  const htmlEnd = unfenced.search(/<\/html>\s*$/i);
  const lastClose = unfenced.toLowerCase().lastIndexOf("</html>");

  let candidate: string;
  if (htmlStart !== -1 && lastClose !== -1 && lastClose > htmlStart) {
    candidate = unfenced.slice(htmlStart, lastClose + "</html>".length).trim();
  } else if (htmlStart !== -1 && htmlEnd !== -1) {
    candidate = unfenced.slice(htmlStart).trim();
  } else {
    throw new Error("missing_html_document");
  }

  if (candidate.length > HTML_MAX) {
    throw new Error("html_too_large");
  }
  return candidate;
}

export function extractHtmlTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const raw = match?.[1]?.replace(/\s+/g, " ").trim();
  if (!raw) return "Folio Designer preview";
  return raw.slice(0, 160);
}

/**
 * Stitches a continuation chunk onto previously generated HTML without duplicating
 * overlapping tail characters or accidental markdown fences.
 */
export function stitchHtmlContinuation(
  accumulated: string,
  nextRaw: string,
): string {
  const cleaned = nextRaw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/, "");

  if (!accumulated) return cleaned;
  if (!cleaned) return accumulated;

  const maxOverlap = Math.min(400, accumulated.length, cleaned.length);
  for (let len = maxOverlap; len >= 16; len--) {
    if (accumulated.endsWith(cleaned.slice(0, len))) {
      return accumulated + cleaned.slice(len);
    }
  }
  return accumulated + cleaned;
}
