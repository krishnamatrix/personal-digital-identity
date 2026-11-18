import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteUrl } from "@/lib/site-url";
import { getPublicSite } from "@/domains/website/website-service";
import { linksLiveOn } from "@/domains/website/build-published";
import { themeColors } from "@/domains/website/config";
import { publicIdFor } from "@/domains/insights/insights-service";
import { LinksView } from "@/components/links/links-view";
import { PageTracker } from "@/components/insights/page-tracker";

// Unpublishing and scheduled links must take effect immediately: never cache this route.
export const dynamic = "force-dynamic";

async function load(slug: string) {
  try {
    const site = await getPublicSite(slug);
    return site?.content.links ? site : null;
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
  const name = site.content.person.name;
  const title = `${name} | Links`;
  const description =
    site.content.person.headline ?? site.description ?? `${name}'s links.`;
  return {
    metadataBase: new URL(origin),
    title: { absolute: title },
    description,
    alternates: { canonical: `${origin}/${site.slug}/links` },
    openGraph: {
      type: "profile",
      title,
      description,
      url: `${origin}/${site.slug}/links`,
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function PublicLinksPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await load(slug);
  if (!site) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const trackId = await publicIdFor("website", site.slug);
  return (
    <>
      <LinksView
        content={site.content}
        items={linksLiveOn(site.content.links!.items, today)}
        siteSlug={site.slug}
        colors={themeColors(site.theme)}
      />
      {trackId && <PageTracker surface="website" id={trackId} />}
    </>
  );
}
