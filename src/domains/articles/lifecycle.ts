import type { ArticleStatus } from "@/domains/articles/article-schema";
import { isBlank, type RichDoc } from "@/domains/articles/rich-text";

/**
 * Draft -> Published -> Archived, validated on the server:
 *   draft     -> published (publish) | archived (archive)
 *   published -> draft (unpublish)   | archived (archive)
 *   archived  -> draft (restore)
 * An archived article cannot be published directly: restore it first.
 */
const ALLOWED: Record<ArticleStatus, readonly ArticleStatus[]> = {
  draft: ["published", "archived"],
  published: ["draft", "archived"],
  archived: ["draft"],
};

export const canTransition = (from: ArticleStatus, to: ArticleStatus) =>
  ALLOWED[from].includes(to);

export class InvalidTransitionError extends Error {
  constructor(
    public from: ArticleStatus,
    public to: ArticleStatus,
  ) {
    super(`An article cannot move from ${from} to ${to}.`);
    this.name = "InvalidTransitionError";
  }
}

export type PublishProblem = "no_title" | "no_content";

export function publishProblems(article: {
  title: string;
  content: RichDoc;
}): PublishProblem[] {
  const out: PublishProblem[] = [];
  if (article.title.trim() === "") out.push("no_title");
  if (isBlank(article.content)) out.push("no_content");
  return out;
}

export class PublishArticleBlockedError extends Error {
  constructor(public problems: PublishProblem[]) {
    super("Add a title and some content before publishing.");
    this.name = "PublishArticleBlockedError";
  }
}

/** URL slug from a title; stable once assigned at first publish. */
export function slugFromTitle(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base.length >= 3 ? base : `article-${base}`.replace(/-+$/, "");
}

export const withSuffix = (slug: string, attempt: number, random: string) =>
  attempt === 0 ? slug : `${slug.slice(0, 70)}-${random}`;
