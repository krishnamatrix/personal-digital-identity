"use server";

import { revalidatePath } from "next/cache";
import {
  changeChatCardStatus,
  createChatCard,
  generateActivationCodes,
  getActivationCodes,
  revokeActivationCodes,
  saveChatCard,
  type BatchView,
  type IssuedBatch,
  type StatusChange,
} from "@/domains/chatcards/chat-card-service";
import { chatFailure } from "@/domains/chatcards/action-result";

/**
 * Owner-side ChatCard actions. Every one goes through requireChatCardOwner() in the service
 * (PRO checked on the server from the account's own plan row) and RLS checks has_pro() again.
 */

export type OwnerResult<T = undefined> =
  | ({ ok: true; message?: string } & (T extends undefined
      ? object
      : { data: T }))
  | { ok: false; message: string; proRequired?: boolean; signIn?: boolean };

const STATUS_CHANGES: StatusChange[] = [
  "publish",
  "pause",
  "resume",
  "archive",
];

export async function createChatCardAction(
  input: unknown,
): Promise<OwnerResult<{ id: string; publicId: string }>> {
  try {
    const card = await createChatCard(input);
    revalidatePath("/chatcards");
    return { ok: true, data: { id: card.id, publicId: card.publicId } };
  } catch (error) {
    return chatFailure("chatcards:create", error);
  }
}

export async function saveChatCardAction(
  id: string,
  input: unknown,
): Promise<OwnerResult> {
  try {
    await saveChatCard(String(id), input);
    revalidatePath("/chatcards");
    revalidatePath(`/chatcards/${id}`);
    return { ok: true, message: "Changes saved." };
  } catch (error) {
    return chatFailure("chatcards:save", error);
  }
}

export async function changeChatCardStatusAction(
  id: string,
  change: StatusChange,
): Promise<OwnerResult> {
  if (!STATUS_CHANGES.includes(change))
    return { ok: false, message: "Unknown action." };
  try {
    await changeChatCardStatus(String(id), change);
    revalidatePath("/chatcards");
    revalidatePath(`/chatcards/${id}`);
    return {
      ok: true,
      message:
        change === "publish"
          ? "Your ChatCard is live."
          : change === "pause"
            ? "Paused. No new conversations can start."
            : change === "resume"
              ? "Active again."
              : "Archived. Existing conversations stay in Messages.",
    };
  } catch (error) {
    return chatFailure("chatcards:status", error);
  }
}

/** The raw codes are in this response only: they are not stored and cannot be shown again. */
export async function generateCodesAction(
  id: string,
  input: unknown,
): Promise<OwnerResult<IssuedBatch>> {
  try {
    const batch = await generateActivationCodes(String(id), input);
    revalidatePath(`/chatcards/${id}`);
    return { ok: true, data: batch };
  } catch (error) {
    return chatFailure("chatcards:codes", error);
  }
}

export async function listCodesAction(
  id: string,
): Promise<OwnerResult<BatchView[]>> {
  try {
    return { ok: true, data: await getActivationCodes(String(id)) };
  } catch (error) {
    return chatFailure("chatcards:codes-list", error);
  }
}

export async function revokeCodesAction(
  id: string,
  target: { batchId?: string; codeIds?: string[] },
): Promise<OwnerResult<{ revoked: number }>> {
  try {
    const revoked = await revokeActivationCodes(String(id), {
      batchId: typeof target?.batchId === "string" ? target.batchId : undefined,
      codeIds: Array.isArray(target?.codeIds)
        ? target.codeIds.map(String).slice(0, 1000)
        : undefined,
    });
    revalidatePath(`/chatcards/${id}`);
    return {
      ok: true,
      data: { revoked },
      message: revoked === 1 ? "1 code revoked." : `${revoked} codes revoked.`,
    };
  } catch (error) {
    return chatFailure("chatcards:revoke", error);
  }
}
