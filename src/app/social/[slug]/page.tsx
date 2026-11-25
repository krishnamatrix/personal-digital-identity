import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { BusinessCard } from "@/components/cards/business-card";
import { CardWithQr } from "@/components/cards/card-with-qr";
import { cardDesign } from "@/domains/cards/card-designs";
import { toCardDesign } from "@/domains/designs/design-spec";
import { cardVCard } from "@/domains/cards/card-content";
import { getPublicCard } from "@/domains/cards/card-service";
import { getSiteUrl } from "@/lib/site-url";
import { publicIdFor } from "@/domains/insights/insights-service";
import { PageTracker } from "@/components/insights/page-tracker";

// Unpublishing must take effect immediately: never cache this route.
export const dynamic = "force-dynamic";

async function load(slug: string) {
  try {
    return await getPublicCard(slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const card = await load(slug);
  if (!card) return { title: "Card not found", robots: { index: false } };
  const origin = await getSiteUrl();
  const title = card.content.role
    ? `${card.content.name} · ${card.content.role}`
    : card.content.name;
  return {
    metadataBase: new URL(origin),
    title: { absolute: title },
    description: `Contact details for ${card.content.name}.`,
    alternates: { canonical: `${origin}/social/${card.slug}` },
    openGraph: { type: "profile", title, url: `${origin}/social/${card.slug}` },
  };
}

export default async function PublicCardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = await load(slug);
  if (!card) notFound();
  // A Folio Designer design is pinned in the snapshot; code designs are looked up by id.
  const design = card.content.design
    ? toCardDesign(
        { id: card.content.design.id, label: "", category: "" },
        card.content.design.spec,
      )
    : cardDesign(card.design);
  const { content } = card;
  const url = `${await getSiteUrl()}/social/${card.slug}`;
  const vcard = cardVCard(content, url);
  const vcf = `data:text/vcard;charset=utf-8,${encodeURIComponent(vcard)}`;
  const trackId = await publicIdFor("card", card.slug);
  const fileName = `${content.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "contact"}.vcf`;

  return (
    <main
      className={`flex min-h-dvh flex-col items-center justify-center px-4 py-10 ${design.dark ? "bg-[#111113] text-white" : "bg-[#f0f0f2] text-[#1d1d1f]"}`}
    >
      <div className="w-full max-w-xl">
        <CardWithQr value={vcard} radius={design.radius}>
          <BusinessCard
            design={design}
            content={content}
            interactive
            cardClassName="shadow-[0_30px_60px_-25px_rgba(0,0,0,.45)]"
          />
        </CardWithQr>

        <div className="mt-8 flex justify-center">
          <a
            href={vcf}
            download={fileName}
            data-track-event="vcard_save"
            data-track-label="Save contact"
            className={`inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-medium ${design.dark ? "bg-white text-[#111]" : "bg-[#1d1d1f] text-white"}`}
          >
            <UserPlus aria-hidden className="size-4" /> Save contact
          </a>
        </div>

        <p
          className={`mt-10 text-center text-xs ${design.dark ? "text-white/50" : "text-black/45"}`}
        >
          A digital card made with{" "}
          <Link href="/" className="underline underline-offset-4">
            Folioone
          </Link>
        </p>
      </div>
      {trackId && <PageTracker surface="card" id={trackId} />}
    </main>
  );
}
