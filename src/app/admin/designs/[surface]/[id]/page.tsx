import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { logLoadError } from "@/lib/server-log";
import {
  currentUserIsAdmin,
  getAdminDesign,
} from "@/domains/designs/design-admin-service";
import {
  CARD_DESIGN_CATEGORIES,
  WEBSITE_CATEGORIES,
} from "@/domains/designs/design-spec";
import { SAMPLE_SITE } from "@/domains/designs/sample-content";
import { SAMPLE_CARD } from "@/domains/cards/card-content";
import { getOwnContentForDesignPreview } from "@/domains/website/website-service";
import { getOwnCardContentForDesignPreview } from "@/domains/cards/card-service";
import { isDesignAiAvailable } from "@/lib/ai/design-generator";
import { DesignEditor } from "./design-editor";

export const metadata: Metadata = {
  title: "Edit design",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

async function own<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}

export default async function DesignEditorPage({
  params,
}: {
  params: Promise<{ surface: string; id: string }>;
}) {
  const { surface: rawSurface, id } = await params;
  if (rawSurface !== "website" && rawSurface !== "card") notFound();
  const surface = rawSurface;
  let design;
  try {
    if (!(await currentUserIsAdmin())) notFound();
    design = await getAdminDesign(surface, id);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AuthenticationRequiredError) redirect("/login");
    logLoadError("/admin/designs/[id]", error);
    throw error;
  }
  if (!design) notFound();
  const [ownSite, ownCard] = await Promise.all([
    surface === "website" ? own(getOwnContentForDesignPreview) : null,
    surface === "card" ? own(getOwnCardContentForDesignPreview) : null,
  ]);
  return (
    <WorkspaceShell>
      <div className="space-y-6">
        <Link
          href={`/admin/designs?surface=${surface}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden /> All{" "}
          {surface === "website" ? "website" : "card"} designs
        </Link>
        <DesignEditor
          surface={surface}
          design={{
            ...design,
            createdAt: design.createdAt.toISOString(),
            updatedAt: design.updatedAt.toISOString(),
            publishedAt: design.publishedAt?.toISOString() ?? null,
          }}
          categories={[
            ...(surface === "website"
              ? WEBSITE_CATEGORIES
              : CARD_DESIGN_CATEGORIES),
          ]}
          aiAvailable={isDesignAiAvailable()}
          samples={
            surface === "website"
              ? { kind: "website", sample: SAMPLE_SITE, own: ownSite }
              : { kind: "card", sample: SAMPLE_CARD, own: ownCard }
          }
        />
      </div>
    </WorkspaceShell>
  );
}
