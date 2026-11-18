import { z } from "zod";
import type { InsightEventRow } from "@/lib/db/queries/insights";
import { browserOf, deviceOf, osOf } from "@/domains/insights/user-agent";

/**
 * What the browser beacon may send, and how it becomes a stored row. Everything is untrusted:
 * values are bounded, shapes are fixed, and personal data (IP, full user agent, full referrer
 * URL, query strings, e-mail / phone values) is never kept. Pure.
 */

export const INSIGHT_EVENTS = [
  "view",
  "link_click",
  "contact_click",
  "video_play",
  "qr_open",
  "vcard_save",
  "share",
  "booking_open",
  "video_complete",
] as const;
export type InsightEvent = (typeof INSIGHT_EVENTS)[number];

const short = (max: number) => z.string().trim().max(max).optional();

export const beaconSchema = z.object({
  surface: z.enum(["website", "card"]),
  id: z.uuid(),
  event: z.enum(INSIGHT_EVENTS),
  path: short(300),
  kind: short(24),
  label: short(160),
  url: short(2000),
  referrer: short(2000),
  utmSource: short(100),
  utmMedium: short(100),
  utmCampaign: short(100),
  timeZone: short(64),
});
export type Beacon = z.infer<typeof beaconSchema>;

const TIME_ZONE = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/;
const KIND = /^[a-z_]{1,24}$/;

/** Path without query string or fragment (they can carry personal data). */
export function cleanPath(path: string | undefined): string | null {
  if (!path) return null;
  const p = path.split(/[?#]/)[0]!;
  return /^\/[^\s]*$/.test(p) ? p.slice(0, 300) : null;
}

/** Only http(s) targets are stored; mailto:/tel: become a kind, never the address. */
export function cleanTargetUrl(url: string | undefined): string | null {
  if (!url || !/^https?:\/\/\S+$/.test(url)) return null;
  try {
    const u = new URL(url);
    u.hash = "";
    // Strip query strings except the ones that identify content (YouTube watch ids etc.).
    const keep = ["v", "list", "p", "id"];
    for (const key of [...u.searchParams.keys()])
      if (!keep.includes(key)) u.searchParams.delete(key);
    return u.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

/** Referrer host only, and only when it is another site. */
export function referrerHost(
  referrer: string | undefined,
  ownHost: string | null,
): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
    if (!/^[a-z0-9.-]{1,253}$/.test(host)) return null;
    if (ownHost && host === ownHost.toLowerCase().replace(/^www\./, ""))
      return null;
    return host;
  } catch {
    return null;
  }
}

/** "en-IN,en;q=0.9" → "en-IN". */
export function primaryLanguage(header: string | null): string | null {
  const first = header?.split(",")[0]?.split(";")[0]?.trim();
  if (!first) return null;
  const m = /^([a-zA-Z]{2,3})(?:[-_]([a-zA-Z]{2}))?/.exec(first);
  if (!m) return null;
  return m[2]
    ? `${m[1]!.toLowerCase()}-${m[2].toUpperCase()}`
    : m[1]!.toLowerCase();
}

export function countryFrom(headers: Headers): string | null {
  for (const name of [
    "cf-ipcountry",
    "x-vercel-ip-country",
    "x-country-code",
  ]) {
    const v = headers.get(name)?.trim().toUpperCase();
    if (v && /^[A-Z]{2}$/.test(v) && v !== "XX" && v !== "T1") return v;
  }
  return null;
}

const utm = (v: string | undefined) => (v ? v.slice(0, 100) : null);

export function toEventRow(
  beacon: Beacon,
  context: {
    userAgent: string;
    headers: Headers;
    ownHost: string | null;
    visitorHash: string | null;
  },
): InsightEventRow {
  const isLink = beacon.event === "link_click" || beacon.event === "video_play";
  return {
    website_id: beacon.surface === "website" ? beacon.id : null,
    card_id: beacon.surface === "card" ? beacon.id : null,
    event: beacon.event,
    path: cleanPath(beacon.path),
    target_kind: beacon.kind && KIND.test(beacon.kind) ? beacon.kind : null,
    target_label: beacon.label || null,
    target_url: isLink ? cleanTargetUrl(beacon.url) : null,
    referrer_host:
      beacon.event === "view"
        ? referrerHost(beacon.referrer, context.ownHost)
        : null,
    utm_source: beacon.event === "view" ? utm(beacon.utmSource) : null,
    utm_medium: beacon.event === "view" ? utm(beacon.utmMedium) : null,
    utm_campaign: beacon.event === "view" ? utm(beacon.utmCampaign) : null,
    country: countryFrom(context.headers),
    time_zone:
      beacon.timeZone && TIME_ZONE.test(beacon.timeZone)
        ? beacon.timeZone
        : null,
    language: primaryLanguage(context.headers.get("accept-language")),
    device: deviceOf(context.userAgent),
    browser: browserOf(context.userAgent),
    os: osOf(context.userAgent),
    visitor_hash: context.visitorHash,
  };
}
