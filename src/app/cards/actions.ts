"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  AuthenticationRequiredError,
  AuthorizationError,
} from "@/lib/supabase/server";
import {
  CardPersistenceError,
  CardPublishBlockedError,
  CardSlugTakenError,
  checkCardSlug,
  InvalidCardSlugError,
  publishMyCard,
  saveMyCardDraft,
  saveMyCardSlug,
  unpublishMyCard,
  type CardSlugCheck,
} from "@/domains/cards/card-service";
import { ProRequiredError } from "@/domains/billing/plans";
import { SLUG_MESSAGES } from "@/domains/website/slug";
import { logLoadError } from "@/lib/server-log";

export type CardActionResult = {
  ok: boolean;
  message: string;
  /** The chosen design needs PRO: the UI offers the pricing page. */
  proRequired?: boolean;
  slug?: string;
  publishedAt?: string;
};

function failure(action: string, error: unknown): CardActionResult {
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
  if (error instanceof InvalidCardSlugError)
    return { ok: false, message: SLUG_MESSAGES[error.problem] };
  if (error instanceof CardSlugTakenError)
    return {
      ok: false,
      message: "That address is already taken. Try another.",
    };
  if (error instanceof CardPublishBlockedError)
    return {
      ok: false,
      message: !error.problems.length
        ? "Choose your card's address before publishing."
        : error.problems.includes("no_name")
          ? "Add your name (here or in Profile → Personal) before publishing."
          : "Switch on at least one detail to show on the card.",
    };
  if (error instanceof ZodError)
    return {
      ok: false,
      message: "Some card details are invalid. Review them and try again.",
    };
  logLoadError(action, error);
  if (error instanceof CardPersistenceError)
    return { ok: false, message: error.message };
  return { ok: false, message: "Something went wrong. Please try again." };
}

export async function checkCardSlugAction(
  slug: string,
): Promise<CardSlugCheck | { ok: false; state: "error" }> {
  try {
    return await checkCardSlug(String(slug ?? ""));
  } catch {
    return { ok: false, state: "error" };
  }
}

export async function saveCardAction(
  config: unknown,
): Promise<CardActionResult> {
  try {
    await saveMyCardDraft(config);
    revalidatePath("/cards");
    return { ok: true, message: "Card saved." };
  } catch (error) {
    return failure("cards:save", error);
  }
}

export async function saveCardSlugAction(
  slug: string,
): Promise<CardActionResult> {
  try {
    const saved = await saveMyCardSlug(String(slug ?? ""));
    revalidatePath("/cards");
    return { ok: true, message: "Address saved.", slug: saved };
  } catch (error) {
    return failure("cards:slug", error);
  }
}

export async function publishCardAction(): Promise<CardActionResult> {
  try {
    const at = await publishMyCard();
    revalidatePath("/cards");
    return {
      ok: true,
      message: "Your card is live.",
      publishedAt: at.toISOString(),
    };
  } catch (error) {
    return failure("cards:publish", error);
  }
}

export async function unpublishCardAction(): Promise<CardActionResult> {
  try {
    await unpublishMyCard();
    revalidatePath("/cards");
    return { ok: true, message: "Your card is no longer public." };
  } catch (error) {
    return failure("cards:unpublish", error);
  }
}
