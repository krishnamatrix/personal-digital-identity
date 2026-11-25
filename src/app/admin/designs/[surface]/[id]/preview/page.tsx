import type { Metadata } from "next";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { TemplateSite } from "@/components/website/template-site";
import { BusinessCard } from "@/components/cards/business-card";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import {
  currentUserIsAdmin,
  getAdminDesign,
} from "@/domains/designs/design-admin-service";
import {
  toCardDesign,
  toTemplateSpec,
  type CardSpec,
  type WebsiteSpec,
} from "@/domains/designs/design-spec";
import { SAMPLE_SITE } from "@/domains/designs/sample-content";
import { SAMPLE_CARD } from "@/domains/cards/card-content";
import { getOwnContentForDesignPreview } from "@/domains/website/website-service";
import { getOwnCardContentForDesignPreview } from "@/domains/cards/card-service";

export const metadata: Metadata = {
  title: "Design preview",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Full-page preview of one saved version of a designer design (admins only), with the sample
 * person or the admin's own content. Real page width, so the layout's breakpoints apply.
 */
export default async function DesignPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ surface: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { surface, id } = await params;
  const query = await searchParams;
  if (surface !== "website" && surface !== "card") notFound();
  let design;
  try {
    if (!(await currentUserIsAdmin())) notFound();
    design = await getAdminDesign(surface, id);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AuthenticationRequiredError) redirect("/login");
    throw error;
  }
  if (!design) notFound();
  const wanted = Number(query.v);
  const version =
    design.versions.find((v) => v.version === wanted) ?? design.versions[0];
  if (!version?.spec) notFound();
  const mine = query.with === "me";
  const banner = (
    <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900">
      Preview of {design.label}, version {version.version} (
      {mine ? "your content" : "sample person"}). Not public.
    </div>
  );

  if (surface === "website") {
    const content =
      (mine ? await getOwnContentForDesignPreview().catch(() => null) : null) ??
      SAMPLE_SITE;
    return (
      <>
        {banner}
        <TemplateSite
          spec={toTemplateSpec(design, version.spec as WebsiteSpec)}
          content={content}
        />
      </>
    );
  }
  const content =
    (mine
      ? await getOwnCardContentForDesignPreview().catch(() => null)
      : null) ?? SAMPLE_CARD;
  const card = toCardDesign(design, version.spec as CardSpec);
  return (
    <>
      {banner}
      <main
        className={`flex min-h-dvh items-center justify-center px-4 py-10 ${card.dark ? "bg-[#111113]" : "bg-[#f0f0f2]"}`}
      >
        <div className="w-full max-w-xl">
          <BusinessCard design={card} content={content} interactive />
        </div>
      </main>
    </>
  );
}
