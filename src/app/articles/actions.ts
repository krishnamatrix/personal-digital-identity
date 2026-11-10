"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import {
  AuthenticationRequiredError,
  AuthorizationError,
} from "@/lib/supabase/server";
import {
  ArticleConflictError,
  ArticleNotFoundError,
  ArticlePersistenceError,
  createArticle,
  removeArticle,
  saveArticle,
  transitionArticle,
} from "@/domains/articles/article-service";
import {
  InvalidTransitionError,
  PublishArticleBlockedError,
} from "@/domains/articles/lifecycle";
import {
  ARTICLE_STATUSES,
  type ArticleStatus,
} from "@/domains/articles/article-schema";

export type ArticleActionResult =
  | {
      ok: true;
      version: number;
      status: ArticleStatus;
      slug: string | null;
      updatedAt: string;
      publishedAt: string | null;
      wordCount: number;
      readingMinutes: number;
    }
  | { ok: false; code: ErrorCode; message: string };

type ErrorCode =
  | "auth"
  | "conflict"
  | "not_found"
  | "invalid"
  | "blocked"
  | "transition"
  | "failed";

function failure(error: unknown): ArticleActionResult {
  const fail = (code: ErrorCode, message: string) => ({
    ok: false as const,
    code,
    message,
  });
  if (error instanceof AuthenticationRequiredError)
    return fail("auth", "Your session has ended. Sign in again to continue.");
  if (error instanceof AuthorizationError) return fail("auth", error.message);
  if (error instanceof ArticleConflictError)
    return fail("conflict", error.message);
  if (error instanceof ArticleNotFoundError)
    return fail("not_found", error.message);
  if (error instanceof PublishArticleBlockedError)
    return fail("blocked", error.message);
  if (error instanceof InvalidTransitionError)
    return fail("transition", error.message);
  if (error instanceof ZodError)
    return fail(
      "invalid",
      "Some fields are invalid. Check the title, links and lengths.",
    );
  if (error instanceof ArticlePersistenceError)
    return fail("failed", error.message);
  return fail("failed", "Something went wrong. Please try again.");
}

const ok = (
  a: Awaited<ReturnType<typeof saveArticle>>,
): ArticleActionResult => ({
  ok: true,
  version: a.version,
  status: a.status,
  slug: a.slug,
  updatedAt: a.updatedAt.toISOString(),
  publishedAt: a.publishedAt?.toISOString() ?? null,
  wordCount: a.wordCount,
  readingMinutes: a.readingMinutes,
});

export async function createArticleAction(): Promise<void> {
  let id: string;
  try {
    id = (await createArticle()).id;
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/login");
    redirect("/articles?error=create");
  }
  revalidatePath("/articles");
  redirect(`/articles/${id}`);
}

export async function saveArticleAction(
  id: string,
  version: number,
  input: unknown,
): Promise<ArticleActionResult> {
  try {
    const article = await saveArticle(String(id), Number(version), input);
    revalidatePath("/articles");
    return ok(article);
  } catch (error) {
    return failure(error);
  }
}

export async function transitionArticleAction(
  id: string,
  version: number,
  target: string,
): Promise<ArticleActionResult> {
  try {
    const status = ARTICLE_STATUSES.find((s) => s === target);
    if (!status) return failure(new InvalidTransitionError("draft", "draft"));
    const article = await transitionArticle(
      String(id),
      Number(version),
      status,
    );
    revalidatePath("/articles");
    revalidatePath("/website");
    return ok(article);
  } catch (error) {
    return failure(error);
  }
}

export async function deleteArticleAction(
  id: string,
  version: number,
): Promise<{ ok: boolean; message: string }> {
  try {
    await removeArticle(String(id), Number(version));
    revalidatePath("/articles");
    revalidatePath("/website");
    return { ok: true, message: "Article deleted." };
  } catch (error) {
    const r = failure(error);
    return { ok: false, message: r.ok ? "" : r.message };
  }
}
