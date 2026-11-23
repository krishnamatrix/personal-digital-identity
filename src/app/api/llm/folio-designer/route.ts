import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { generateFolioDesignerProposal } from "@/domains/folio-designer/folio-designer-service";
import {
  FolioDesignerFailedError,
  FolioDesignerUnavailableError,
} from "@/lib/ai/folio-designer-extractor";
import { AuthenticationRequiredError } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ErrorCode =
  | "unauthenticated"
  | "invalid_prompt"
  | "unavailable"
  | "generation_failed";

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

function mapError(error: unknown): {
  status: number;
  code: ErrorCode;
  message: string;
} {
  if (error instanceof AuthenticationRequiredError) {
    return {
      status: 401,
      code: "unauthenticated",
      message: "Sign in to use Folio Designer.",
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      code: "invalid_prompt",
      message: error.issues[0]?.message ?? "Enter a valid design prompt.",
    };
  }
  if (error instanceof FolioDesignerUnavailableError) {
    return {
      status: 503,
      code: "unavailable",
      message: error.message,
    };
  }
  if (error instanceof FolioDesignerFailedError) {
    console.error(
      `[api/llm/folio-designer] generation failed: ${error.name}${
        error.code ? ` (${error.code})` : ""
      }`,
    );
    return {
      status: 422,
      code: "generation_failed",
      message: error.message,
    };
  }
  console.error(
    "[api/llm/folio-designer] unexpected failure:",
    error instanceof Error ? error.name : "non-error thrown",
  );
  return {
    status: 422,
    code: "generation_failed",
    message: "We could not generate a design right now. Please try again.",
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      400,
      "invalid_prompt",
      "Send JSON with a prompt string.",
    );
  }

  const prompt =
    body && typeof body === "object" && "prompt" in body
      ? (body as { prompt: unknown }).prompt
      : undefined;

  const wantsStream = (request.headers.get("accept") ?? "").includes(
    "text/event-stream",
  );

  if (!wantsStream) {
    try {
      const { proposal } = await generateFolioDesignerProposal(prompt);
      return jsonNoStore({ ok: true, data: proposal }, 200);
    } catch (error) {
      const mapped = mapError(error);
      return errorResponse(mapped.status, mapped.code, mapped.message);
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      try {
        send("progress", { chars: 0 });
        const { proposal } = await generateFolioDesignerProposal(prompt, {
          onProgress: (chars) => send("progress", { chars }),
        });
        send("done", { ok: true, data: proposal });
      } catch (error) {
        const mapped = mapError(error);
        send("error", {
          ok: false,
          code: mapped.code,
          message: mapped.message,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
}
