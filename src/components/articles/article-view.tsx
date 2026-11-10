import { ArticleBody } from "@/components/articles/article-body";
import type { RichDoc } from "@/domains/articles/rich-text";

export type ArticleViewData = {
  title: string;
  subtitle: string | null;
  coverImageUrl: string | null;
  category: string | null;
  tags: string[];
  readingMinutes: number;
  wordCount: number;
  publishedAt: Date | null;
  content: RichDoc;
};

const formatDate = (d: Date) =>
  d.toLocaleDateString("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** The article page body, shared by the owner's preview and the public article route. */
export function ArticleView({ article }: { article: ArticleViewData }) {
  const meta = [
    article.publishedAt ? formatDate(article.publishedAt) : null,
    article.readingMinutes > 0 ? `${article.readingMinutes} min read` : null,
    article.wordCount > 0
      ? `${article.wordCount.toLocaleString("en")} words`
      : null,
  ].filter(Boolean);
  return (
    <article className="mx-auto w-full max-w-[42rem] px-5 py-10 md:py-16">
      <header className="mb-8">
        {article.category && (
          <p className="text-xs font-semibold tracking-[.14em] uppercase opacity-70">
            {article.category}
          </p>
        )}
        <h1 className="mt-3 font-serif text-4xl leading-[1.1] md:text-5xl">
          {article.title || "Untitled"}
        </h1>
        {article.subtitle && (
          <p className="mt-4 text-xl leading-8 opacity-75">
            {article.subtitle}
          </p>
        )}
        {meta.length > 0 && (
          <p className="mt-5 text-sm opacity-70">{meta.join(" · ")}</p>
        )}
      </header>
      {article.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.coverImageUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="mb-10 aspect-[16/9] w-full rounded-lg object-cover"
        />
      )}
      <ArticleBody doc={article.content} />
      {article.tags.length > 0 && (
        <ul className="mt-12 flex flex-wrap gap-2" aria-label="Tags">
          {article.tags.map((t) => (
            <li
              key={t}
              className="rounded-full border border-current/20 px-3 py-1 text-xs opacity-80"
            >
              {t}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
