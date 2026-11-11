import type { Metadata } from "next";
import Link from "next/link";
import { logLoadError } from "@/lib/server-log";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { getCardState } from "@/domains/cards/card-service";
import { getViewer } from "@/domains/identity/viewer";
import { CardsWorkspace } from "@/app/cards/cards-workspace";

export const metadata: Metadata = { title: "Digital Cards" };
export const dynamic = "force-dynamic";

export default async function CardsPage() {
  try {
    const state = await getCardState();
    const origin = await getSiteUrl();
    const viewer = await getViewer();
    return (
      <WorkspaceShell>
        <CardsWorkspace
          initial={state}
          origin={origin}
          isPro={viewer?.isPro ?? false}
        />
      </WorkspaceShell>
    );
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError))
      logLoadError("/cards", error);
    const needsAuth = error instanceof AuthenticationRequiredError;
    return (
      <WorkspaceShell>
        <section className="border-border bg-card max-w-2xl rounded-lg border p-6 md:p-8">
          <h1 className="font-display text-3xl md:text-[2.5rem] md:leading-tight">
            Digital Cards
          </h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            {needsAuth
              ? "Sign in to design and share your digital card."
              : "We could not load your card. Please try again later."}
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
