import "server-only";
import { getAnonymousDb, insertInsightEvent } from "@/lib/db/query";
import { visitorHash } from "@/domains/insights/insights-service";
import { deviceOf, isBot } from "@/domains/insights/user-agent";

/**
 * ChatCard analytics through the existing Insights table (docs/sql/milestone-chatcards/003).
 * Recorded with the ANONYMOUS client, so an event is never tied to a signed-in account, and
 * with no message text, no activation code and no names: only the event, its time, and for
 * page views a daily-salted visitor hash and the device class (as for websites and cards).
 */
export const CHAT_CARD_EVENTS = [
  "chat_card_viewed",
  "chat_card_qr_scanned",
  "activation_code_attempted",
  "activation_code_redeemed",
  "conversation_requested",
  "conversation_accepted",
  "conversation_declined",
  "message_sent",
  "conversation_closed",
  "chat_card_paused",
  "chat_card_published",
] as const;
export type ChatCardEvent = (typeof CHAT_CARD_EVENTS)[number];

/** Best effort: analytics never break the action that triggered them. */
export async function recordChatCardEvent(
  cardId: string,
  event: ChatCardEvent,
): Promise<void> {
  try {
    await insertInsightEvent(await getAnonymousDb(), {
      chat_card_id: cardId,
      event,
    });
  } catch {
    // ignored
  }
}

/** A landing-page visit. `fromQr`: opened through the QR code's link (?src=qr), not proof of a scan. */
export async function recordChatCardView(
  cardId: string,
  request: { headers: Headers },
  fromQr: boolean,
): Promise<void> {
  const ua = request.headers.get("user-agent") ?? "";
  if (isBot(ua)) return;
  const purpose =
    request.headers.get("sec-purpose") ?? request.headers.get("purpose");
  if (purpose && /prefetch|prerender/i.test(purpose)) return;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  try {
    const db = await getAnonymousDb();
    const base = {
      chat_card_id: cardId,
      device: deviceOf(ua),
      visitor_hash: visitorHash(ip, ua),
    };
    await insertInsightEvent(db, { ...base, event: "chat_card_viewed" });
    if (fromQr)
      await insertInsightEvent(db, { ...base, event: "chat_card_qr_scanned" });
  } catch {
    // ignored
  }
}
