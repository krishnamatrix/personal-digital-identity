import { getSiteUrl } from "@/lib/site-url";
import { buildPlatformLlmsTxt } from "@/domains/llms/llms-txt";

export const dynamic = "force-dynamic";

export async function GET() {
  const origin = await getSiteUrl();
  const body = buildPlatformLlmsTxt(origin);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
