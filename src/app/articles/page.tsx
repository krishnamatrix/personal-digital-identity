import Link from "next/link";
import { logLoadError } from "@/lib/server-log";
import { FileText, Plus, Search } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Button } from "@/components/ui/button";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import {
  getArticleList,
  parseListParams,
} from "@/domains/articles/article-service";
import {
  displayExcerpt,
  LIST_FILTERS,
  type ListFilter,
} from "@/domains/articles/article-schema";
import { createArticleAction } from "@/app/articles/actions";

export const dynamic = "force-dynamic";

const FILTER_LABEL: Record<ListFilter, string> = {
  all: "All",
  draft: "Drafts",
  published: "Published",
  archived: "Archived",
};
const STATUS_LABEL = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
} as const;
const dateFmt = (d: Date) =>
  d.toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseListParams(await searchParams);
  const raw = await searchParams;
  const createFailed = raw.error === "create";

  let data;
  try {
    data = await getArticleList(params);
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError))
      logLoadError("/articles", error);
    const needsAuth = error instanceof AuthenticationRequiredError;
    return (
      <WorkspaceShell>
        <section className="border-border bg-card max-w-2xl rounded-lg border p-6 md:p-8">
          <h1 className="font-display text-3xl md:text-[2.5rem] md:leading-tight">
            Articles &amp; Thoughts
          </h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            {needsAuth
              ? "Sign in to write and manage your articles."
              : "We could not load your articles. Please try again later."}
          </p>
          <Link
            href={needsAuth ? "/login" : "/"}
            className="text-accent mt-6 inline-flex text-sm font-medium underline-offset-4 hover:underline"
          >
            {needsAuth ? "Sign in" : "Return to workspace"}
          </Link>
        </section>
      </WorkspaceShell>
    );
  }

  const href = (patch: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    const merged = {
      q: params.search || undefined,
      status: params.filter === "all" ? undefined : params.filter,
      sort: params.sort === "updated" ? undefined : params.sort,
      page: params.page > 1 ? params.page : undefined,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged))
      if (v !== undefined && v !== "") q.set(k, String(v));
    const s = q.toString();
    return s ? `/articles?${s}` : "/articles";
  };
  const totalAll =
    data.counts.draft + data.counts.published + data.counts.archived;
  const pages = Math.max(1, Math.ceil(data.total / params.pageSize));
  const filtering = params.filter !== "all" || params.search !== "";

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <h1 className="font-display text-3xl md:text-[2.5rem] md:leading-tight">
              Articles &amp; Thoughts
            </h1>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              Capture ideas and publish the insights that shape your
              professional story. Articles belong to your identity; you choose
              which ones appear on your public website.
            </p>
          </div>
          <form action={createArticleAction}>
            <Button type="submit" variant="accent">
              <Plus className="size-4" aria-hidden /> New Article
            </Button>
          </form>
        </header>

        {createFailed && (
          <p
            role="alert"
            className="border-danger/40 bg-danger-soft text-danger mt-4 rounded-md border px-3 py-2 text-sm"
          >
            We could not create the article. Please try again.
          </p>
        )}

        <form
          action="/articles"
          method="get"
          role="search"
          className="mt-8 flex flex-wrap items-center gap-3"
        >
          <div className="relative min-w-56 flex-1">
            <Search
              className="text-muted-foreground absolute top-2.5 left-3 size-4"
              aria-hidden
            />
            <input
              type="search"
              name="q"
              defaultValue={params.search}
              aria-label="Search articles"
              placeholder="Search title and content"
              className="border-border bg-card focus-visible:ring-foreground/15 h-10 w-full rounded-md border pr-3 pl-9 text-sm outline-none focus-visible:ring-2"
            />
          </div>
          {params.filter !== "all" && (
            <input type="hidden" name="status" value={params.filter} />
          )}
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Sort</span>
            <select
              name="sort"
              defaultValue={params.sort}
              className="border-border bg-card h-10 rounded-md border px-2 text-sm"
            >
              <option value="updated">Recently updated</option>
              <option value="published">Recently published</option>
              <option value="title">Title</option>
            </select>
          </label>
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>

        <nav
          aria-label="Filter articles"
          className="mt-4 flex flex-wrap gap-1.5"
        >
          {LIST_FILTERS.map((f) => {
            const count = f === "all" ? totalAll : data.counts[f];
            const active = params.filter === f;
            return (
              <Link
                key={f}
                href={href({
                  status: f === "all" ? undefined : f,
                  page: undefined,
                })}
                aria-current={active ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm ${active ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"}`}
              >
                {FILTER_LABEL[f]}{" "}
                <span
                  className={active ? "opacity-70" : "text-muted-foreground"}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </nav>

        {data.items.length === 0 ? (
          <section className="border-border mt-8 rounded-lg border border-dashed p-10 text-center">
            <FileText
              className="text-muted-foreground mx-auto size-8"
              aria-hidden
            />
            {filtering ? (
              <>
                <h2 className="font-display mt-3 text-xl">
                  No matching articles
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Try a different search or filter.
                </p>
                <Link
                  href="/articles"
                  className="text-accent mt-4 inline-block text-sm underline"
                >
                  Clear filters
                </Link>
              </>
            ) : (
              <>
                <h2 className="font-display mt-3 text-xl">
                  Write your first article
                </h2>
                <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm leading-6">
                  Share an idea, a lesson or a point of view. It stays private
                  until you publish it and choose to feature it on your website.
                </p>
                <form action={createArticleAction} className="mt-5">
                  <Button type="submit" variant="accent">
                    New Article
                  </Button>
                </form>
              </>
            )}
          </section>
        ) : (
          <ul
            className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4"
            data-testid="article-list"
          >
            {data.items.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/articles/${a.id}`}
                  className="border-border bg-card hover:border-accent/50 group flex gap-4 rounded-lg border p-4 transition-colors md:p-5"
                >
                  {a.coverImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.coverImageUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="hidden size-24 shrink-0 rounded-md object-cover sm:block"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display truncate text-xl group-hover:underline">
                        {a.title || "Untitled"}
                      </h2>
                      <span
                        data-status={a.status}
                        className="bg-accent-soft text-accent rounded-full px-2 py-0.5 text-xs font-medium"
                      >
                        {STATUS_LABEL[a.status]}
                      </span>
                    </div>
                    {displayExcerpt({
                      excerpt: a.excerpt,
                      subtitle: a.subtitle,
                    }) && (
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-sm leading-6">
                        {displayExcerpt({
                          excerpt: a.excerpt,
                          subtitle: a.subtitle,
                        })}
                      </p>
                    )}
                    <p className="text-muted-foreground mt-2 text-xs">
                      Updated {dateFmt(a.updatedAt)}
                      {a.publishedAt &&
                        ` · Published ${dateFmt(a.publishedAt)}`}
                      {` · ${a.wordCount.toLocaleString("en")} ${a.wordCount === 1 ? "word" : "words"}`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav
            aria-label="Pagination"
            className="mt-6 flex items-center justify-between text-sm"
          >
            {params.page > 1 ? (
              <Link
                href={href({ page: params.page - 1 })}
                className="underline"
              >
                Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted-foreground">
              Page {params.page} of {pages}
            </span>
            {params.page < pages ? (
              <Link
                href={href({ page: params.page + 1 })}
                className="underline"
              >
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    </WorkspaceShell>
  );
}
