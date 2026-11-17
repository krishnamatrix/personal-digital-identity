"use server";

import { getAuthenticatedDb } from "@/lib/db/query";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import {
  fetchLinkPreview,
  LinkPreviewError,
  type LinkPreview,
} from "@/lib/link-preview/fetch-preview";

export type LinkPreviewResult =
  | { ok: true; preview: LinkPreview }
  | { ok: false; message: string };

/** Per-user, per-instance throttle: "Fill from link" is a convenience, not a crawler. */
const recent = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 15;

function allow(userId: string): boolean {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    recent.set(userId, hits);
    return false;
  }
  hits.push(now);
  recent.set(userId, hits);
  if (recent.size > 5000) recent.clear();
  return true;
}

/** Session first: only signed-in owners can make the server fetch a link. */
export async function fetchLinkPreviewAction(
  url: string,
): Promise<LinkPreviewResult> {
  try {
    const { user } = await getAuthenticatedDb();
    if (!allow(user.id))
      return { ok: false, message: "Too many lookups. Try again in a minute." };
    if (typeof url !== "string" || url.length > 2000)
      return { ok: false, message: "Enter a full https link." };
    return { ok: true, preview: await fetchLinkPreview(url) };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError)
      return { ok: false, message: "Sign in first." };
    if (error instanceof LinkPreviewError)
      return { ok: false, message: error.message };
    return {
      ok: false,
      message:
        "We could not read details from that page. Fill them in yourself.",
    };
  }
}
