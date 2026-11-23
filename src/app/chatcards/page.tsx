import type { Metadata } from "next";
import Link from "next/link";
import { logLoadError } from "@/lib/server-log";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { ChatCardsNotInstalledError } from "@/lib/db/query";
import { getChatCardsHome } from "@/domains/chatcards/chat-card-service";
import { ChatCardsDashboard } from "@/app/chatcards/chatcards-dashboard";
import { ChatCardsUpgrade } from "@/app/chatcards/chatcards-upgrade";

export const metadata: Metadata = { title: "ChatCards" };
export const dynamic = "force-dynamic";

export default async function ChatCardsPage() {
  try {
    const home = await getChatCardsHome();
    return (
      <WorkspaceShell>
        {home.entitled ? (
          <ChatCardsDashboard cards={home.cards} />
        ) : (
          <ChatCardsUpgrade />
        )}
      </WorkspaceShell>
    );
  } catch (error) {
    const needsAuth = error instanceof AuthenticationRequiredError;
    const notInstalled = error instanceof ChatCardsNotInstalledError;
    if (!needsAuth && !notInstalled) logLoadError("/chatcards", error);
    return (
      <WorkspaceShell>
        <section className="border-border bg-card max-w-2xl rounded-lg border p-6 md:p-8">
          <p className="eyebrow">My connections</p>
          <h1 className="font-display mt-2 text-3xl md:text-[2.5rem] md:leading-tight">
            ChatCards
          </h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            {needsAuth
              ? "Sign in to create and manage your ChatCards."
              : notInstalled
                ? "ChatCards are being set up for your workspace. Please check back soon."
                : "We could not load your ChatCards. Please try again later."}
          </p>
          <Link
            href={needsAuth ? "/login" : "/"}
            className="text-accent mt-6 inline-flex text-sm font-medium underline-offset-4 hover:underline"
          >
            {needsAuth ? "Sign in" : "Return to workspace"}
          </Link>
        </section>
      </WorkspaceShell>
    );
  }
}
