"use server";

import {
  redeemActivationCode,
  startConversation,
} from "@/domains/chatcards/conversation-service";
import { chatFailure } from "@/domains/chatcards/action-result";

/** Recipient actions: any signed-in account, any plan. */

export type RecipientResult<T = undefined> =
  | ({ ok: true; message?: string } & (T extends undefined
      ? object
      : { data: T }))
  | { ok: false; message: string; signIn?: boolean };

const REDEEM_MESSAGES = {
  // Deliberately the same for unknown, used, revoked and expired codes.
  invalid:
    "That code did not work. Check it and try again, or ask whoever gave it to you.",
  unavailable: "This card is not accepting activation codes right now.",
  rate_limited:
    "Too many attempts. Please wait 15 minutes before trying another code.",
} as const;

export async function redeemCodeAction(
  publicId: string,
  code: string,
): Promise<RecipientResult> {
  try {
    const result = await redeemActivationCode(
      String(publicId),
      String(code ?? ""),
    );
    if (result.ok) return { ok: true, message: "Code accepted." };
    return { ok: false, message: REDEEM_MESSAGES[result.reason] };
  } catch (error) {
    const f = chatFailure("chat:redeem", error);
    return { ok: false, message: f.message, signIn: f.signIn };
  }
}

export async function startConversationAction(
  publicId: string,
  input: { name: string; message: string },
): Promise<RecipientResult<{ id: string; status: string }>> {
  try {
    const started = await startConversation(String(publicId), {
      name: String(input?.name ?? ""),
      message: String(input?.message ?? ""),
    });
    return { ok: true, data: started };
  } catch (error) {
    const f = chatFailure("chat:request", error);
    return { ok: false, message: f.message, signIn: f.signIn };
  }
}
