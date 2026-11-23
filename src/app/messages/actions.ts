"use server";

import { revalidatePath } from "next/cache";
import {
  changeConversation,
  getOlderMessages,
  markConversationRead,
  pollConversation,
  reportConversation,
  sendMessage,
  type ChatMessage,
  type ConversationAction,
} from "@/domains/chatcards/conversation-service";
import { chatFailure } from "@/domains/chatcards/action-result";

/** Conversation actions. RLS limits every one to the two participants. */

export type MessageResult<T = undefined> =
  | ({ ok: true; message?: string } & (T extends undefined
      ? object
      : { data: T }))
  | { ok: false; message: string; proRequired?: boolean; signIn?: boolean };

const ACTIONS: ConversationAction[] = [
  "accept",
  "decline",
  "close",
  "leave",
  "block",
];

export async function sendMessageAction(
  id: string,
  body: string,
): Promise<MessageResult<ChatMessage>> {
  try {
    return {
      ok: true,
      data: await sendMessage(String(id), String(body ?? "")),
    };
  } catch (error) {
    return chatFailure("messages:send", error);
  }
}

export async function pollMessagesAction(
  id: string,
  after: number,
): Promise<MessageResult<{ messages: ChatMessage[]; status: string }>> {
  try {
    return {
      ok: true,
      data: await pollConversation(String(id), Number(after) || 0),
    };
  } catch (error) {
    return chatFailure("messages:poll", error);
  }
}

export async function olderMessagesAction(
  id: string,
  before: number,
): Promise<MessageResult<{ messages: ChatMessage[]; hasOlder: boolean }>> {
  try {
    return {
      ok: true,
      data: await getOlderMessages(String(id), Number(before) || 1),
    };
  } catch (error) {
    return chatFailure("messages:older", error);
  }
}

export async function markReadAction(id: string): Promise<void> {
  try {
    await markConversationRead(String(id));
  } catch {
    // best effort
  }
}

export async function changeConversationAction(
  id: string,
  action: ConversationAction,
): Promise<MessageResult> {
  if (!ACTIONS.includes(action))
    return { ok: false, message: "Unknown action." };
  try {
    await changeConversation(String(id), action);
    revalidatePath("/messages");
    revalidatePath(`/messages/${id}`);
    return {
      ok: true,
      message: {
        accept: "Request accepted. You can reply now.",
        decline: "Request declined.",
        close: "Conversation closed.",
        leave: "You left the conversation.",
        block: "Blocked. They can no longer message you.",
      }[action],
    };
  } catch (error) {
    return chatFailure("messages:change", error);
  }
}

export async function reportConversationAction(
  id: string,
  input: { reason: string; details?: string; messageId?: number | null },
): Promise<MessageResult> {
  try {
    await reportConversation(String(id), input);
    return {
      ok: true,
      message: "Thank you. The report was sent to the Folioone team.",
    };
  } catch (error) {
    return chatFailure("messages:report", error);
  }
}
