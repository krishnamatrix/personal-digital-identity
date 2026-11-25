import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { logLoadError } from "@/lib/server-log";
import {
  currentUserIsAdmin,
  listAdminDesigns,
  starterDesigns,
} from "@/domains/designs/design-admin-service";
import {
  CARD_DESIGN_CATEGORIES,
  WEBSITE_CATEGORIES,
  type DesignSurface,
} from "@/domains/designs/design-spec";
import { DesignsNotInstalledError } from "@/lib/db/query";
import { NewDesignForm } from "./new-design-form";

export const metadata: Metadata = {
  title: "Folio Designer",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const STATUS_STYLE = {
  draft: "bg-muted",
  published: "border-success/30 bg-success-soft text-success",
  retired: "text-muted-foreground",
} as const;

export default async function DesignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const surface: DesignSurface =
    (await searchParams).surface === "card" ? "card" : "website";
  let data;
  try {
    // Not an admin: the page does not exist for them.
    if (!(await currentUserIsAdmin())) notFound();
    data = await listAdminDesigns(surface);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AuthenticationRequiredError) redirect("/login");
    if (error instanceof DesignsNotInstalledError) {
      return (
        <WorkspaceShell>
          <p className="text-muted-foreground max-w-xl text-sm">
            Folio Designer is being set up: the milestone-14 SQL has not been
            run on this database yet.
          </p>
        </WorkspaceShell>
      );
    }
    logLoadError("/admin/designs", error);
    throw error;
  }
  const categories =
    surface === "website" ? WEBSITE_CATEGORIES : CARD_DESIGN_CATEGORIES;
  return (
    <WorkspaceShell>
      <div className="space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="eyebrow">Platform</p>
            <h1 className="font-display mt-3 text-3xl md:text-[2.5rem] md:leading-tight">
              Folio Designer
            </h1>
            <p className="text-muted-foreground mt-2 text-[15px]">
              Create website and digital card designs from a prompt or by hand.
              A design is a draft until you publish it; every change is a new
              version, and live sites keep the version they were published with.
            </p>
          </div>
        </header>

        <nav aria-label="Design type" className="flex gap-2">
          {(["website", "card"] as const).map((s) => (
            <Link
              key={s}
              href={`/admin/designs?surface=${s}`}
              aria-current={surface === s ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-medium ${surface === s ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground ring-1 ring-black/5"}`}
            >
              {s === "website" ? "Website designs" : "Digital card designs"}
            </Link>
          ))}
        </nav>

        <NewDesignForm
          key={surface}
          surface={surface}
          categories={[...categories]}
          starters={starterDesigns(surface)}
          aiAvailable={data.aiAvailable}
        />

        <section aria-labelledby="designs-heading" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="designs-heading" className="text-base font-semibold">
              Designer designs
            </h2>
            <p className="text-muted-foreground text-xs">
              Plus {data.builtInCount} built-in designs (managed in code).
            </p>
          </div>
          {data.designs.length === 0 ? (
            <p
              className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-sm"
              data-testid="designs-empty"
            >
              No designer designs yet. Describe one above to start.
            </p>
          ) : (
            <ul className="border-border bg-card divide-border divide-y rounded-lg border">
              {data.designs.map((d) => (
                <li key={d.id} data-testid="design-row">
                  <Link
                    href={`/admin/designs/${surface}/${d.id}`}
                    className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{d.label}</span>
                      <span className="text-muted-foreground block text-xs">
                        {d.category} · {d.tier === "pro" ? "PRO" : "Free"}
                        {d.currentVersion
                          ? ` · live version ${d.currentVersion}`
                          : ""}
                        {" · updated "}
                        {d.updatedAt.toISOString().slice(0, 10)}
                      </span>
                    </span>
                    <Badge className={STATUS_STYLE[d.status]}>
                      {d.status[0]!.toUpperCase() + d.status.slice(1)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
