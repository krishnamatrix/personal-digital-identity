import "server-only";
import { getAuthenticatedDb, type DbClient } from "@/lib/db/query";
import { hasActivePro } from "@/domains/billing/billing-service";
import { ProRequiredError } from "@/domains/billing/plans";

/**
 * The one place that decides whether an account may OWN ChatCards. It reads the account's own
 * plan row (RLS) and applies the existing PRO rule (isProActive: plan 'pro' and pro_until in
 * the future; Folioone has no grace period). Nothing from the request is trusted. The database
 * enforces the same rule independently (folioone.has_pro() in the ChatCard policies).
 *
 * Recipients never pass through here: opening a card, redeeming a code, requesting and
 * taking part in a conversation need only a signed-in account, on any plan.
 */
export class ChatCardsProRequiredError extends ProRequiredError {
  constructor() {
    super();
    this.message = "ChatCards are part of Folioone PRO.";
    this.name = "ChatCardsProRequiredError";
  }
}

export async function canUseChatCards(
  client: DbClient,
  accountId: string,
): Promise<boolean> {
  return hasActivePro(client, accountId);
}

/** For every owner-side service call: the verified session, or ChatCardsProRequiredError. */
export async function requireChatCardOwner(): Promise<
  Awaited<ReturnType<typeof getAuthenticatedDb>>
> {
  const session = await getAuthenticatedDb();
  if (!(await canUseChatCards(session.client, session.user.id)))
    throw new ChatCardsProRequiredError();
  return session;
}
