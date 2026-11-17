import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleView } from "@/components/articles/article-view";
import { getSiteUrl } from "@/lib/site-url";
import { getPublicSite } from "@/domains/website/website-service";
import { getPublicArticle } from "@/domains/articles/article-service";
import { deriveExcerpt } from "@/domains/articles/rich-text";
import { themeColors, type ThemeId } from "@/domains/website/config";
import { publicIdFor } from "@/domains/insights/insights-service";
import { PageTracker } from "@/components/insights/page-tracker";

// Unpublishing must take effect immediately: never cache this route.
export const dynamic = "force-dynamic";

/** The built-in themes keep their tuned text colours; templates use their palette. */
const SHELL: Partial<Record<ThemeId, string>> = {
  professional: "bg-[#faf8f4] text-[#2a2e33]",
  creative: "bg-[#12101a] text-[#e6e1f5]",
  minimal: "bg-white text-neutral-800",
};

async function load(slug: string, articleSlug: string) {
  try {
    const site = await getPublicSite(slug);
    if (!site) return null;
    const article = await getPublicArticle(site.slug, articleSlug);
    return article ? { site, article } : null;
  } catch {
    return null;
  }
}

type Params = Promise<{ slug: string; article: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug, article: articleSlug } = await params;
  const found = await load(slug, articleSlug);
  if (!found) return { title: "Page not found", robots: { index: false } };
  const { site, article } = found;
  const origin = await getSiteUrl();
  const url = `${origin}/${site.slug}/articles/${article.slug}`;
  const title = article.seoTitle ?? article.title;
  const description =
    article.seoDescription ??
    article.excerpt ??
    article.subtitle ??
    deriveExcerpt(article.content, 160);
  const name = site.content.person.name;
  return {
    metadataBase: new URL(origin),
    title: { absolute: `${title} — ${name}` },
    description: description || undefined,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title,
      description: description || undefined,
      url,
      siteName: name,
      publishedTime: article.publishedAt.toISOString(),
      authors: [name],
      tags: article.tags,
      images: article.coverImageUrl ? [article.coverImageUrl] : undefined,
    },
    twitter: {
      card: article.coverImageUrl ? "summary_large_image" : "summary",
      title,
      description: description || undefined,
    },
  };
}

export default async function PublicArticlePage({
  params,
}: {
  params: Params;
}) {
  const { slug, article: articleSlug } = await params;
  const found = await load(slug, articleSlug);
  if (!found) notFound();
  const { site, article } = found;
  const trackId = await publicIdFor("website", site.slug);
  return (
    <div
      className={`min-h-screen ${SHELL[site.theme] ?? ""}`}
      style={
        SHELL[site.theme]
          ? undefined
          : {
              background: themeColors(site.theme).bg,
              color: themeColors(site.theme).fg,
            }
      }
      data-theme={site.theme}
    >
      <header className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5 text-sm">
        <Link href={`/${site.slug}`} className="font-serif text-lg">
          {site.content.person.name}
        </Link>
        <Link
          href={`/${site.slug}#articles`}
          className="underline underline-offset-4 opacity-80"
        >
          All articles
        </Link>
      </header>
      <ArticleView article={article} />
      <footer className="py-10 text-center text-xs opacity-70">
        Made with{" "}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/signup" className="underline underline-offset-4">
          Folioone
        </a>
      </footer>
      {trackId && <PageTracker surface="website" id={trackId} />}
    </div>
  );
}
