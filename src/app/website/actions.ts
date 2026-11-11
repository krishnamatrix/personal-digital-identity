"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  AuthenticationRequiredError,
  AuthorizationError,
} from "@/lib/supabase/server";
import {
  checkSlug,
  InvalidSlugError,
  publishWebsite,
  PublishBlockedError,
  saveSlug,
  saveWebsiteDraft,
  unpublishWebsite,
  WebsitePersistenceError,
  WebsiteSlugTakenError,
  type SlugCheck,
} from "@/domains/website/website-service";
import { ProRequiredError } from "@/domains/billing/plans";
import { SLUG_MESSAGES } from "@/domains/website/slug";

export type WebsiteActionResult = {
  ok: boolean;
  message: string;
  /** The chosen design needs PRO: the UI offers the pricing page. */
  proRequired?: boolean;
  slug?: string;
  publishedAt?: string;
};

function failure(error: unknown): WebsiteActionResult {
  if (error instanceof ProRequiredError)
    return {
      ok: false,
      proRequired: true,
      message:
        "This design is part of Folioone PRO. Upgrade, or choose one of the free designs.",
    };
  if (error instanceof AuthenticationRequiredError)
    return {
      ok: false,
      message: "Your session has ended. Sign in again to continue.",
    };
  if (error instanceof AuthorizationError)
    return { ok: false, message: error.message };
  if (error instanceof InvalidSlugError)
    return { ok: false, message: SLUG_MESSAGES[error.problem] };
  if (error instanceof WebsiteSlugTakenError)
    return {
      ok: false,
      message: "That address is already taken. Try another.",
    };
  if (error instanceof PublishBlockedError)
    return {
      ok: false,
      message: error.problems.includes("no_name")
        ? "Add your name in My Identity (Profile → Personal) before publishing."
        : "Add some content to publish: a headline, biography or at least one section.",
    };
  if (error instanceof ZodError)
    return {
      ok: false,
      message: "Some website settings are invalid. Review them and try again.",
    };
  if (error instanceof WebsitePersistenceError)
    return { ok: false, message: error.message };
  return { ok: false, message: "Something went wrong. Please try again." };
}

export async function checkSlugAction(
  slug: string,
): Promise<SlugCheck | { ok: false; state: "error" }> {
  try {
    return await checkSlug(String(slug ?? ""));
  } catch {
    return { ok: false, state: "error" };
  }
}

export async function saveSlugAction(
  slug: string,
): Promise<WebsiteActionResult> {
  try {
    const site = await saveSlug(String(slug ?? ""));
    revalidatePath("/website");
    return { ok: true, message: "Address saved.", slug: site.slug };
  } catch (error) {
    return failure(error);
  }
}

export async function saveDraftAction(
  theme: string,
  config: unknown,
): Promise<WebsiteActionResult> {
  try {
    await saveWebsiteDraft({ theme, config });
    revalidatePath("/website");
    return { ok: true, message: "Draft saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function publishAction(): Promise<WebsiteActionResult> {
  try {
    const at = await publishWebsite();
    revalidatePath("/website");
    return {
      ok: true,
      message: "Your website is live.",
      publishedAt: at.toISOString(),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function unpublishAction(): Promise<WebsiteActionResult> {
  try {
    await unpublishWebsite();
    revalidatePath("/website");
    return { ok: true, message: "Your website is no longer public." };
  } catch (error) {
    return failure(error);
  }
}
