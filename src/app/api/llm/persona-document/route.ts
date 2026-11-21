import { NextResponse } from "next/server";
import {
  PersonaFileError,
  readPersonaDocumentAsMarkdown,
} from "@/domains/personas/persona-document";
import { getPersonaService } from "@/domains/personas/persona-runtime";
import {
  MarkItDownConversionError,
  MarkItDownUnavailableError,
} from "@/lib/ai/markitdown";
import {
  extractPersonaDetailsFromMarkdown,
  PersonaExtractionFailedError,
  PersonaExtractionUnavailableError,
} from "@/lib/ai/persona-extractor";
import { AuthenticationRequiredError } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ErrorCode =
  | "unauthenticated"
  | "invalid_file"
  | "unavailable"
  | "extraction_failed";

function jsonNoStore(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

function errorResponse(status: number, code: ErrorCode, message: string) {
  return jsonNoStore({ ok: false, code, message }, status);
}

/**
 * Authenticated LLM API service:
 * 1) verifies session, 2) validates file, 3) converts to Markdown via MarkItDown,
 * 4) classifies Persona type and extracts Create Persona screen-model fields via LLM.
 */
export async function POST(request: Request) {
  try {
    await getPersonaService().loadCanonicalForCreate();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return errorResponse(
        401,
        "unauthenticated",
        "Sign in to upload Persona details.",
      );
    }
    console.error(
      "[api/llm/persona-document] unexpected auth failure:",
      error instanceof Error ? error.name : "non-error thrown",
    );
    return errorResponse(
      503,
      "unavailable",
      "We could not verify your session right now. Please try again.",
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(
      400,
      "invalid_file",
      "Send a multipart form upload containing a single file.",
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return errorResponse(
      400,
      "invalid_file",
      "Choose a PDF, Word (.docx), or plain-text (.txt, .md) file first.",
    );
  }

  try {
    const markdown = await readPersonaDocumentAsMarkdown(file);
    const data = await extractPersonaDetailsFromMarkdown(markdown);
    return jsonNoStore({ ok: true, data }, 200);
  } catch (error) {
    if (error instanceof PersonaFileError) {
      return errorResponse(400, "invalid_file", error.message);
    }
    if (
      error instanceof MarkItDownUnavailableError ||
      error instanceof PersonaExtractionUnavailableError
    ) {
      return errorResponse(503, "unavailable", error.message);
    }
    if (
      error instanceof MarkItDownConversionError ||
      error instanceof PersonaExtractionFailedError
    ) {
      const code =
        error instanceof PersonaExtractionFailedError && error.code
          ? ` (${error.code})`
          : "";
      console.error(
        `[api/llm/persona-document] extraction failed: ${error.name}${code}`,
      );
      return errorResponse(422, "extraction_failed", error.message);
    }
    console.error(
      "[api/llm/persona-document] unexpected extraction failure:",
      error instanceof Error ? error.name : "non-error thrown",
    );
    return errorResponse(
      422,
      "extraction_failed",
      "We could not extract persona details right now. Please try again.",
    );
  }
}
