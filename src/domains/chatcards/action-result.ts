import "server-only";
import { ZodError } from "zod";
import {
  ChatCardsNotInstalledError,
  ChatConflictError,
  ChatPersistenceError,
  ChatRateLimitedError,
  ChatUnavailableError,
} from "@/lib/db/query";
import { ProRequiredError } from "@/domains/billing/plans";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { logLoadError } from "@/lib/server-log";
import { ChatCardExpiredError } from "./chat-card-service";

export type ChatActionResult<T = undefined> =
  | ({ ok: true; message?: string } & (T extends undefined
      ? object
      : { data: T }))
  | { ok: false; message: string; proRequired?: boolean; signIn?: boolean };

const CONFLICTS: [RegExp, string][] = [
  [
    /limit reached for this card/,
    "You have reached the number of conversations this card allows.",
  ],
  [
    /active conversation limit/,
    "This card already has its maximum number of active conversations. Close one first.",
  ],
  [/wait for a reply/, "You can send another message once they reply."],
  [/wait for the request/, "You can write more once your request is accepted."],
  [/closed/, "This conversation is closed."],
  [/archived/, "This card is archived."],
];

/**
 * One mapping from domain errors to what a person reads. Never includes database details,
 * codes or ids; anything unexpected is logged (without input values) and shown generically.
 */
export function chatFailure(
  action: string,
  error: unknown,
): { ok: false; message: string; proRequired?: boolean; signIn?: boolean } {
  if (error instanceof ProRequiredError)
    return {
      ok: false,
      proRequired: true,
      message:
        error.message === "This design is part of Folioone PRO."
          ? "ChatCards are part of Folioone PRO."
          : error.message,
    };
  if (error instanceof AuthenticationRequiredError)
    return {
      ok: false,
      signIn: true,
      message: "Your session has ended. Sign in again to continue.",
    };
  if (error instanceof ZodError)
    return {
      ok: false,
      message: error.issues[0]?.message ?? "Check the highlighted details.",
    };
  if (error instanceof ChatConflictError) {
    const hit = CONFLICTS.find(([re]) => re.test(error.reason));
    return { ok: false, message: hit?.[1] ?? error.message };
  }
  if (
    error instanceof ChatUnavailableError ||
    error instanceof ChatRateLimitedError ||
    error instanceof ChatCardsNotInstalledError ||
    error instanceof ChatCardExpiredError
  )
    return { ok: false, message: error.message };
  logLoadError(action, error);
  if (error instanceof ChatPersistenceError)
    return { ok: false, message: error.message };
  return { ok: false, message: "Something went wrong. Please try again." };
}
