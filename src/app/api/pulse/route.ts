import { NextResponse, type NextRequest } from "next/server";
import { recordBeacon } from "@/domains/insights/insights-service";

/**
 * Visit / click beacon from published websites and cards (navigator.sendBeacon). Always 204:
 * visitors learn nothing about validation, and a failure never affects the page.
 */
export const dynamic = "force-dynamic";

const MAX_BODY = 4096;

export async function POST(request: NextRequest) {
  try {
    const text = await request.text();
    if (text.length > 0 && text.length <= MAX_BODY) {
      await recordBeacon(JSON.parse(text), {
        headers: request.headers,
        host: request.headers.get("host"),
      });
    }
  } catch {
    // Malformed input or a database refusal: ignored on purpose.
  }
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
