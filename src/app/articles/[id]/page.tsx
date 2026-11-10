import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { getArticle } from "@/domains/articles/article-service";
import {
  ArticleEditor,
  type EditorArticle,
} from "@/app/articles/[id]/article-editor";

export const dynamic = "force-dynamic";

export default async function ArticleEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let article;
  try {
    article = await getArticle(id);
  } catch (error) {
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
              : "We could not load this article. Please try again later."}
          </p>
          <Link
            href={needsAuth ? "/login" : "/articles"}
            className="text-accent mt-6 inline-flex text-sm font-medium underline-offset-4 hover:underline"
          >
            {needsAuth ? "Sign in" : "Back to articles"}
          </Link>
        </section>
      </WorkspaceShell>
    );
  }
  if (!article) notFound();
  const initial: EditorArticle = {
    id: article.id,
    version: article.version,
    status: article.status,
    slug: article.slug,
    title: article.title,
    subtitle: article.subtitle ?? "",
    excerpt: article.excerpt ?? "",
    coverImageUrl: article.coverImageUrl ?? "",
    category: article.category ?? "",
    tags: article.tags,
    seoTitle: article.seoTitle ?? "",
    seoDescription: article.seoDescription ?? "",
    content: article.content,
    publishedAt: article.publishedAt?.toISOString() ?? null,
    updatedAt: article.updatedAt.toISOString(),
  };
  return (
    <WorkspaceShell>
      <ArticleEditor initial={initial} />
    </WorkspaceShell>
  );
}
