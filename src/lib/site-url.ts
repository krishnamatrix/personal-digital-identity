import { headers } from "next/headers";

type Inputs = {
  configured?: string | null;
  host?: string | null;
  proto?: string | null;
  vercelUrl?: string | null;
};

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The public origin used in email confirmation / password-reset redirects. Order:
 * NEXT_PUBLIC_SITE_URL (set for a stable domain) > request host (correct for each Vercel
 * Preview URL) > VERCEL_URL. The result must also be in the Supabase Auth redirect allow-list.
 */
export function resolveSiteUrl({
  configured,
  host,
  proto,
  vercelUrl,
}: Inputs): string {
  const fromConfig = clean(configured);
  if (fromConfig) return fromConfig;
  if (host) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
    const scheme = proto?.split(",")[0]?.trim() || (local ? "http" : "https");
    const fromHost = clean(`${scheme}://${host.split(",")[0]!.trim()}`);
    if (fromHost) return fromHost;
  }
  return clean(vercelUrl) ?? "http://localhost:3000";
}

export async function getSiteUrl(): Promise<string> {
  const h = await headers();
  return resolveSiteUrl({
    configured: process.env.NEXT_PUBLIC_SITE_URL,
    host: h.get("x-forwarded-host") ?? h.get("host"),
    proto: h.get("x-forwarded-proto"),
    vercelUrl: process.env.VERCEL_URL,
  });
}

/** Only same-site relative paths may be used as a post-auth destination. */
export function safeNextPath(
  value: string | null | undefined,
  fallback = "/profile",
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return fallback;
  }
  return value;
}
