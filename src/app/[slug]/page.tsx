import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteView } from "@/components/website/site-view";
import { getSiteUrl } from "@/lib/site-url";
import { getPublicSite } from "@/domains/website/website-service";
import { getPublicArticles } from "@/domains/articles/article-service";
import { applyLiveArticles } from "@/domains/articles/public";
import { publicIdFor } from "@/domains/insights/insights-service";
import { PageTracker } from "@/components/insights/page-tracker";

// Unpublishing must take effect immediately: never cache this route.
export const dynamic = "force-dynamic";

async function load(slug: string) {
  try {
    return await getPublicSite(slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await load(slug);
  if (!site) return { title: "Page not found", robots: { index: false } };
  const origin = await getSiteUrl();
  const url = `${origin}/${site.slug}`;
  return {
    metadataBase: new URL(origin),
    title: { absolute: site.title },
    description: site.description ?? undefined,
    alternates: {
      canonical: url,
      types: {
        "text/markdown": `${origin}/${site.slug}/llms.txt`,
      },
    },
    openGraph: {
      type: "profile",
      title: site.title,
      description: site.description ?? undefined,
      url,
      siteName: site.content.person.name,
    },
    twitter: {
      card: "summary_large_image",
      title: site.title,
      description: site.description ?? undefined,
    },
  };
}

export default async function PublicSitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await load(slug);
  if (!site) notFound();
  // The article listing is the LIVE snapshot rows: an unpublished/archived/deleted article is gone at once.
  const [live, trackId] = await Promise.all([
    getPublicArticles(site.slug).catch(() => []),
    publicIdFor("website", site.slug),
  ]);
  return (
    <>
      <SiteView
        theme={site.theme}
        content={applyLiveArticles(site.content, site.slug, live)}
      />
      {trackId && <PageTracker surface="website" id={trackId} />}
    </>
  );
}
