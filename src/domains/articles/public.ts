import type { PublicArticleListItem } from "@/lib/db/queries/articles";
import type { PublishedContent } from "@/domains/website/published-content";

type Item = Extract<
  PublishedContent["sections"][number],
  { id: "articles" }
>["items"][number];

/**
 * The public articles section lists the LIVE snapshot rows (so an article that was unpublished,
 * archived or deleted disappears immediately), in the order approved at publish time. If no
 * article is live the section is omitted.
 */
export function applyLiveArticles(
  content: PublishedContent,
  siteSlug: string,
  live: readonly Pick<
    PublicArticleListItem,
    | "slug"
    | "title"
    | "subtitle"
    | "excerpt"
    | "coverImageUrl"
    | "category"
    | "readingMinutes"
    | "publishedAt"
  >[],
): PublishedContent {
  return {
    ...content,
    sections: content.sections.flatMap(
      (section): PublishedContent["sections"] => {
        if (section.id !== "articles") return [section];
        if (live.length === 0) return [];
        const items: Item[] = live.map((a) => ({
          slug: a.slug,
          title: a.title,
          excerpt: a.excerpt ?? a.subtitle ?? undefined,
          coverUrl: a.coverImageUrl ?? undefined,
          category: a.category ?? undefined,
          publishedAt: a.publishedAt.toISOString(),
          readingMinutes: a.readingMinutes,
          rev: 1,
          href: `/${siteSlug}/articles/${a.slug}`,
        }));
        return [{ ...section, items }];
      },
    ),
  };
}
