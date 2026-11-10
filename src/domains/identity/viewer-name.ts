/** Label shown in the workspace chrome when the signed-in person's name is not known. */
export const WORKSPACE_FALLBACK_NAME = "Your workspace";

export type Viewer = { name: string; headline: string | null };

const clean = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * Name for the workspace header and sidebar, most specific first: the Master Identity's
 * display name, its full name, the name given at sign-up (auth user metadata), then the
 * part of the sign-in email before "@". Never another person's or a sample name.
 */
export function resolveViewerName(
  profile: { displayName: string | null; fullName: string | null } | null,
  user: {
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  },
): string {
  return (
    clean(profile?.displayName) ??
    clean(profile?.fullName) ??
    clean(user.user_metadata?.full_name) ??
    clean(user.user_metadata?.name) ??
    clean(user.email?.split("@")[0]) ??
    WORKSPACE_FALLBACK_NAME
  );
}
