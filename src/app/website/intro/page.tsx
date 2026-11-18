import type { Metadata } from "next";
import Link from "next/link";
import { logLoadError } from "@/lib/server-log";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { getStudioState } from "@/domains/intro/intro-video-service";
import { Studio } from "@/app/website/intro/studio";

export const metadata: Metadata = { title: "Video intro" };
export const dynamic = "force-dynamic";

export default async function StudioPage() {
  try {
    const state = await getStudioState();
    return (
      <WorkspaceShell>
        <Studio initial={state} />
      </WorkspaceShell>
    );
  } catch (error) {
    const needsAuth = error instanceof AuthenticationRequiredError;
    if (!needsAuth) logLoadError("/website/intro", error);
    return (
      <WorkspaceShell>
        <section className="border-border bg-card max-w-2xl rounded-lg border p-6 md:p-8">
          <h1 className="font-display text-3xl md:text-[2.5rem] md:leading-tight">
            Video intro
          </h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            {needsAuth
              ? "Sign in to record your video intro."
              : "We could not open the video studio. Please try again later."}
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
