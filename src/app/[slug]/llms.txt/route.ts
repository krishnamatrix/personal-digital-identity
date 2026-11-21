import { getSiteUrl } from "@/lib/site-url";
import { getPublicSite } from "@/domains/website/website-service";
import { getPublicArticles } from "@/domains/articles/article-service";
import { applyLiveArticles } from "@/domains/articles/public";
import { buildWebsiteLlmsTxt } from "@/domains/llms/llms-txt";

// Unpublishing, slug changes, and article withdrawal must take effect immediately.
export const dynamic = "force-dynamic";

function plainError(status: 404 | 503, message: string) {
  return new Response(`${message}\n`, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  let site: Awaited<ReturnType<typeof getPublicSite>>;
  try {
    site = await getPublicSite(slug);
  } catch {
    return plainError(503, "Service Unavailable");
  }
  if (!site) {
    return plainError(404, "Not Found");
  }

  const [liveArticles, origin] = await Promise.all([
    getPublicArticles(site.slug).catch(() => []),
    getSiteUrl(),
  ]);
  const liveContent = applyLiveArticles(site.content, site.slug, liveArticles);
  const body = buildWebsiteLlmsTxt({
    origin,
    slug: site.slug,
    title: site.title,
    description: site.description,
    content: liveContent,
    today: new Date().toISOString().slice(0, 10),
    liveArticleSlugs: new Set(liveArticles.map((a) => a.slug)),
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
