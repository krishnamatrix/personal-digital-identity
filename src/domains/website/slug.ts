/** Public website addresses: https://<domain>/<slug>. Pure rules shared by UI, server and tests. */

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Words that may never be a slug: application routes and system paths, plus common
 * future-proofing names. MUST equal the lists in the CHECK constraints of
 * docs/sql/milestone-8/001-digital-cards.sql, which supersede milestone-5 (a test enforces it).
 */
export const RESERVED_SLUGS = [
  "about",
  "account",
  "accounts",
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "blog",
  "cards",
  "contact",
  "dashboard",
  "docs",
  "edit",
  "explore",
  "favicon",
  "folioone",
  "forgot-password",
  "health",
  "help",
  "home",
  "index",
  "legal",
  "login",
  "logout",
  "new",
  "null",
  "onboarding",
  "persona",
  "personas",
  "preview",
  "pricing",
  "privacy",
  "profile",
  "public",
  "register",
  "reset-password",
  "robots",
  "root",
  "search",
  "security",
  "settings",
  "signin",
  "signup",
  "sitemap",
  "social",
  "static",
  "status",
  "support",
  "system",
  "terms",
  "undefined",
  "user",
  "users",
  "website",
  "websites",
  "www",
] as const;

export type SlugProblem =
  | "empty"
  | "too_short"
  | "too_long"
  | "format"
  | "reserved";

export const SLUG_MESSAGES: Record<SlugProblem, string> = {
  empty: "Enter an address.",
  too_short: `Use at least ${SLUG_MIN} characters.`,
  too_long: `Use at most ${SLUG_MAX} characters.`,
  format:
    "Use lowercase letters, numbers and single hyphens, without a hyphen at the start or end.",
  reserved: "That address is reserved. Try another.",
};

export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase();
}

export function validateSlug(input: string): SlugProblem | null {
  const slug = normalizeSlug(input);
  if (!slug) return "empty";
  if (slug.length < SLUG_MIN) return "too_short";
  if (slug.length > SLUG_MAX) return "too_long";
  if (!SLUG_PATTERN.test(slug)) return "format";
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) return "reserved";
  return null;
}

/** A starting suggestion from a display name ("Jane Q. Designer" -> "jane-q-designer"). */
export function suggestSlug(name: string | null | undefined): string {
  const base = (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return validateSlug(base) ? "" : base;
}
