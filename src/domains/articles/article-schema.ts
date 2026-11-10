import { z } from "zod";
import {
  deriveExcerpt,
  isBlank,
  plainText,
  readingMinutes,
  sanitizeDoc,
  wordCount,
  type RichDoc,
} from "@/domains/articles/rich-text";

export const ARTICLE_STATUSES = ["draft", "published", "archived"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const ARTICLE_LIMITS = {
  title: 200,
  subtitle: 300,
  excerpt: 400,
  category: 60,
  tag: 40,
  tags: 10,
  seoTitle: 120,
  seoDescription: 300,
  url: 2000,
} as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

const optionalUrl = z
  .string()
  .trim()
  .max(ARTICLE_LIMITS.url)
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^https?:\/\/[^\s]+$/.test(v), {
    message: "Enter a full web address starting with http:// or https://",
  })
  .nullable()
  .default(null);

/** The editable fields of an article. The body is sanitised, never trusted. */
export const articleInputSchema = z.object({
  title: z.string().trim().max(ARTICLE_LIMITS.title),
  subtitle: optionalText(ARTICLE_LIMITS.subtitle),
  excerpt: optionalText(ARTICLE_LIMITS.excerpt),
  coverImageUrl: optionalUrl,
  category: optionalText(ARTICLE_LIMITS.category),
  tags: z
    .array(z.string().trim().min(1).max(ARTICLE_LIMITS.tag))
    .max(ARTICLE_LIMITS.tags)
    .default([])
    .transform((tags) => {
      const seen = new Set<string>();
      return tags.filter((t) => {
        const key = t.toLowerCase();
        return seen.has(key) ? false : (seen.add(key), true);
      });
    }),
  seoTitle: optionalText(ARTICLE_LIMITS.seoTitle),
  seoDescription: optionalText(ARTICLE_LIMITS.seoDescription),
  content: z.unknown().transform((v) => sanitizeDoc(v)),
});
export type ArticleInput = z.output<typeof articleInputSchema>;

/** Values derived from the body on every save (stored so lists never need to load bodies). */
export function deriveBodyFacts(content: RichDoc) {
  const words = wordCount(content);
  return {
    bodyText: plainText(content).slice(0, 200_000),
    wordCount: words,
    readingMinutes: readingMinutes(words),
  };
}

export type ArticleRecord = ArticleInput & {
  id: string;
  slug: string | null;
  status: ArticleStatus;
  version: number;
  wordCount: number;
  readingMinutes: number;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ArticleSummary = Pick<
  ArticleRecord,
  | "id"
  | "slug"
  | "title"
  | "subtitle"
  | "excerpt"
  | "coverImageUrl"
  | "category"
  | "status"
  | "version"
  | "wordCount"
  | "readingMinutes"
  | "publishedAt"
  | "updatedAt"
>;

export const LIST_SORTS = ["updated", "published", "title"] as const;
export type ListSort = (typeof LIST_SORTS)[number];
export const LIST_FILTERS = ["all", "draft", "published", "archived"] as const;
export type ListFilter = (typeof LIST_FILTERS)[number];
export const PAGE_SIZE = 12;

/** Card/listing excerpt: the author's excerpt, else the subtitle, else the start of the body. */
export function displayExcerpt(article: {
  excerpt: string | null;
  subtitle: string | null;
  content?: RichDoc;
}): string {
  return (
    article.excerpt ??
    article.subtitle ??
    (article.content ? deriveExcerpt(article.content) : "")
  );
}

export { isBlank };
