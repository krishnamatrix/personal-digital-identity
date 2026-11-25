import { NextResponse, type NextRequest } from "next/server";
import { createAuthenticatedClient } from "@/lib/supabase/server";
import { liveEnabled } from "@/domains/video-studio/provider";
import { studioJobs } from "@/domains/video-studio/jobs";
import {
  MAX_PHOTO_BYTES,
  validateImage,
  validateScript,
  VOICES,
} from "@/domains/video-studio/studio";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function owner() {
  if (!liveEnabled()) throw new Error("disabled");
  return (await createAuthenticatedClient()).user.id;
}
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return reply({ error: "Open the studio on this site to submit." }, 403);
  let user: string;
  try {
    user = await owner();
  } catch {
    return reply(
      {
        error:
          "Live mode requires server configuration and a signed-in Folioone account.",
      },
      401,
    );
  }
  // Enforce the body budget while reading; do not trust Content-Length alone.
  if (
    Number(request.headers.get("content-length") ?? 0) >
    MAX_PHOTO_BYTES + 32_000
  )
    return reply({ error: "Photo is too large." }, 413);
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Missing upload." }, 400);
    const parts: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PHOTO_BYTES + 32_000) {
        await reader.cancel();
        return reply({ error: "Photo is too large." }, 413);
      }
      parts.push(value);
    }
    const bytes = Buffer.concat(parts);
    const form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const image = form.get("image");
    const script = String(form.get("script") ?? "");
    const voice = String(form.get("voice") ?? "");
    const requestId = String(form.get("requestId") ?? "");
    if (!(image instanceof File))
      return reply({ error: "Choose a portrait." }, 400);
    validateImage(
      new Uint8Array(await image.arrayBuffer()),
      image.type,
      image.size,
    );
    validateScript(script);
    if (
      !VOICES.some((v) => v.id === voice) ||
      form.get("consent") !== "true" ||
      !/^[0-9a-f-]{36}$/i.test(requestId)
    )
      return reply({ error: "Review your consent and voice selection." }, 400);
    return reply(
      await studioJobs.create(user, {
        image,
        script,
        voice,
        requestId,
        consent: true,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error &&
      /^(Choose|Use |POC generation limit)/.test(error.message)
        ? error.message
        : "Unable to submit. Do not automatically retry; check provider activity first.";
    return reply({ error: message }, 400);
  }
}
export async function GET(request: NextRequest) {
  let user: string;
  try {
    user = await owner();
  } catch {
    return reply(
      { error: "Sign in and enable live mode to check video status." },
      401,
    );
  }
  try {
    return reply(
      await studioJobs.status(
        user,
        request.nextUrl.searchParams.get("id") ?? "",
      ),
    );
  } catch {
    return reply(
      {
        error:
          "Video status is unavailable or this job has expired. You can check again without creating another video.",
      },
      404,
    );
  }
}
