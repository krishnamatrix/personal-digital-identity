import type { Metadata } from "next";
import Link from "next/link";
import { logLoadError } from "@/lib/server-log";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { loadFolioDesignerSession } from "@/domains/folio-designer/folio-designer-service";
import { getOwnerWebsiteSlug } from "@/domains/website/website-service";
import { DesignerWorkspace } from "@/app/designer/designer-workspace";

export const metadata: Metadata = { title: "Folio Designer" };
export const dynamic = "force-dynamic";

export default async function DesignerPage() {
  try {
    await loadFolioDesignerSession();
    const siteSlug = await getOwnerWebsiteSlug();
    return (
      <WorkspaceShell>
        <DesignerWorkspace siteSlug={siteSlug} />
      </WorkspaceShell>
    );
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError))
      logLoadError("/designer", error);
    const needsAuth = error instanceof AuthenticationRequiredError;
    return (
      <WorkspaceShell>
        <section className="border-border bg-card max-w-2xl rounded-lg border p-6 md:p-8">
          <h1 className="font-display text-3xl md:text-[2.5rem] md:leading-tight">
            Folio Designer
          </h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            {needsAuth
              ? "Sign in to describe and preview website designs."
              : "We could not load Folio Designer. Please try again later."}
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