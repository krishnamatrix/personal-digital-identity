import "server-only";
import { createHash, randomBytes } from "node:crypto";
import {
  findLivePublicId,
  findOwnPublicIds,
  getAnonymousDb,
  getAuthenticatedDb,
  insertInsightEvent,
  listInsightEvents,
  type InsightSurface,
} from "@/lib/db/query";
import { beaconSchema, toEventRow } from "@/domains/insights/event-input";
import { isBot } from "@/domains/insights/user-agent";
import {
  aggregateInsights,
  type InsightsReport,
} from "@/domains/insights/aggregate";

/* ------------------------------ recording ------------------------------ */

/**
 * Daily random salt, held in memory only and never stored. The visitor hash is
 * sha256(salt | ip | user agent) truncated to 16 hex: enough to count unique visitors per day,
 * impossible to reverse or to link one person across days (or across a restart).
 */
let salt: { day: string; value: string } | null = null;
function dailySalt(): string {
  const day = new Date().toISOString().slice(0, 10);
  if (!salt || salt.day !== day)
    salt = { day, value: randomBytes(32).toString("hex") };
  return salt.value;
}

function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || null;
}

export function visitorHash(
  ip: string | null,
  userAgent: string,
): string | null {
  if (!ip) return null;
  return createHash("sha256")
    .update(`${dailySalt()}|${ip}|${userAgent}`)
    .digest("hex")
    .slice(0, 16);
}

/** Best-effort flood guard per visitor (per server instance). */
const recent = new Map<string, number[]>();
function allowEvent(key: string): boolean {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= 60) return false;
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 20_000) recent.clear();
  return true;
}

/** The owner looking at their own page is not a visitor. Only checked when a session cookie exists. */
async function isOwnerViewing(
  cookieHeader: string | null,
  surface: InsightSurface,
  id: string,
): Promise<boolean> {
  if (!cookieHeader || !/sb-[^=]*-auth-token/.test(cookieHeader)) return false;
  try {
    const { client, user } = await getAuthenticatedDb();
    const own = await findOwnPublicIds(client, user.id);
    return (surface === "website" ? own.websiteId : own.cardId) === id;
  } catch {
    return false;
  }
}

export type RecordOutcome = "recorded" | "ignored";

/** Validates and stores one beacon. Never throws for bad input: visitors get no error details. */
export async function recordBeacon(
  raw: unknown,
  request: { headers: Headers; host: string | null },
): Promise<RecordOutcome> {
  const parsed = beaconSchema.safeParse(raw);
  if (!parsed.success) return "ignored";
  const userAgent = request.headers.get("user-agent") ?? "";
  if (isBot(userAgent)) return "ignored";
  // Ignore prefetch / prerender requests.
  const purpose =
    request.headers.get("sec-purpose") ?? request.headers.get("purpose");
  if (purpose && /prefetch|prerender/i.test(purpose)) return "ignored";

  const ip = clientIp(request.headers);
  const hash = visitorHash(ip, userAgent);
  if (!allowEvent(hash ?? ip ?? "unknown")) return "ignored";
  if (
    await isOwnerViewing(
      request.headers.get("cookie"),
      parsed.data.surface,
      parsed.data.id,
    )
  )
    return "ignored";

  const row = toEventRow(parsed.data, {
    userAgent,
    headers: request.headers,
    ownHost: request.host,
    visitorHash: hash,
  });
  const ok = await insertInsightEvent(await getAnonymousDb(), row);
  return ok ? "recorded" : "ignored";
}

/** For public pages: the live page's public id (null before the M11 SQL, or when offline). */
export async function publicIdFor(
  surface: InsightSurface,
  slug: string,
): Promise<string | null> {
  try {
    return await findLivePublicId(await getAnonymousDb(), surface, slug);
  } catch {
    return null;
  }
}

/* ------------------------------- reading ------------------------------- */

export const INSIGHT_RANGES = [7, 30, 90] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];

export type MyInsights =
  | { state: "no_pages" }
  | {
      state: "ready";
      report: InsightsReport;
      has: { website: boolean; card: boolean };
      websiteSlug: string | null;
    };

/** The signed-in owner's report for the last `days` days (plus the period before, for trends). */
export async function getMyInsights(days: InsightRange): Promise<MyInsights> {
  const { client, user } = await getAuthenticatedDb();
  const ids = await findOwnPublicIds(client, user.id);
  if (!ids.websiteId && !ids.cardId) return { state: "no_pages" };
  const now = new Date();
  const since = new Date(now.getTime() - 2 * days * 86_400_000);
  const events = await listInsightEvents(client, ids, since);
  return {
    state: "ready",
    report: aggregateInsights(events, { days, now }),
    has: { website: Boolean(ids.websiteId), card: Boolean(ids.cardId) },
    websiteSlug: ids.websiteSlug,
  };
}
