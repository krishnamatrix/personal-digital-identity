import "server-only";
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import {
  getAuthenticatedDb,
  findPlan,
  findViewerProfile,
  BillingPersistenceError,
} from "@/lib/db/query";
import { isProActive } from "@/domains/billing/plans";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { logLoadError } from "@/lib/server-log";
import { resolveViewerName, type Viewer } from "./viewer-name";

/**
 * The signed-in person, for the workspace chrome. Verifies the session (auth.getUser())
 * and reads only their own profile through RLS; the user id never comes from input.
 * Returns null when nobody is signed in. If the profile cannot be read, it still names
 * the person from their sign-up details. Cached per request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  let session: Awaited<ReturnType<typeof getAuthenticatedDb>>;
  try {
    session = await getAuthenticatedDb();
  } catch (error) {
    // Let Next's own signals (dynamic rendering, redirects) through untouched.
    unstable_rethrow(error);
    if (!(error instanceof AuthenticationRequiredError))
      logLoadError("workspace-viewer", error);
    return null;
  }
  const { client, user } = session;
  let profile = null;
  try {
    profile = await findViewerProfile(client, user.id);
  } catch (error) {
    unstable_rethrow(error);
    logLoadError("workspace-viewer", error);
  }
  let isPro = false;
  try {
    isPro = isProActive(await findPlan(client, user.id));
  } catch (error) {
    unstable_rethrow(error);
    // Billing is optional for workspace chrome before M9 is provisioned. Missing
    // tables (including a stale PostgREST table cache) keep the Free display;
    // entitlement checks and payment flows still fail normally in the billing layer.
    if (
      !(error instanceof BillingPersistenceError) ||
      (error.code !== "PGRST205" && error.code !== "42P01")
    ) {
      logLoadError("workspace-viewer:plan", error);
    }
  }
  return {
    name: resolveViewerName(profile, user),
    headline: profile?.headline ?? null,
    isPro,
  };
});
