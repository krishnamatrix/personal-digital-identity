import "server-only";
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { getAuthenticatedDb } from "@/lib/db/client";
import { findProfile } from "@/lib/db/queries/identity";
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
    profile = await findProfile(client, user.id);
  } catch (error) {
    unstable_rethrow(error);
    logLoadError("workspace-viewer", error);
  }
  return {
    name: resolveViewerName(profile, user),
    headline: profile?.headline ?? null,
  };
});
