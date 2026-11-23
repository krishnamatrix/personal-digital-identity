import Link from "next/link";
import {
  ChatCardsNotInstalledError,
  ChatUnavailableError,
} from "@/lib/db/query";
import { ProRequiredError } from "@/domains/billing/plans";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { logLoadError } from "@/lib/server-log";

export function isProRequired(error: unknown): boolean {
  return error instanceof ProRequiredError;
}

/** The safe "could not load" state shared by the ChatCard pages. */
export function ChatCardsLoadError({
  error,
  route,
  subject = "chatcard",
}: {
  error: unknown;
  route: string;
  subject?: "chatcard" | "conversation";
}) {
  const conversation = subject === "conversation";
  const needsAuth = error instanceof AuthenticationRequiredError;
  const missing = error instanceof ChatUnavailableError;
  const notInstalled = error instanceof ChatCardsNotInstalledError;
  if (!needsAuth && !missing && !notInstalled) logLoadError(route, error);
  return (
    <section className="border-border bg-card max-w-2xl rounded-lg border p-6 md:p-8">
      <p className="eyebrow">{conversation ? "Messages" : "ChatCards"}</p>
      <h1 className="font-display mt-2 text-2xl md:text-3xl">
        {missing
          ? conversation
            ? "Conversation not available"
            : "ChatCard not found"
          : conversation
            ? "Messages"
            : "ChatCards"}
      </h1>
      <p className="text-muted-foreground mt-3 text-sm leading-6">
        {needsAuth
          ? conversation
            ? "Sign in to read your messages."
            : "Sign in to manage your ChatCards."
          : missing
            ? "It may have been removed, or the link is mistyped."
            : notInstalled
              ? "ChatCards are being set up for your workspace. Please check back soon."
              : "We could not load this page. Please try again later."}
      </p>
      <Link
        href={needsAuth ? "/login" : conversation ? "/messages" : "/chatcards"}
        className="text-accent mt-6 inline-flex text-sm font-medium underline-offset-4 hover:underline"
      >
        {needsAuth
          ? "Sign in"
          : conversation
            ? "Back to Messages"
            : "Back to ChatCards"}
      </Link>
    </section>
  );
}
