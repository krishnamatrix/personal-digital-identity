import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { BusinessCard } from "@/components/cards/business-card";
import { CardWithQr } from "@/components/cards/card-with-qr";
import { cardDesign } from "@/domains/cards/card-designs";
import { cardVCard, shortUrl } from "@/domains/cards/card-content";
import { getPublicCard } from "@/domains/cards/card-service";
import { getSiteUrl } from "@/lib/site-url";

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
  const design = cardDesign(card.design);
  const { content } = card;
  const url = `${await getSiteUrl()}/social/${card.slug}`;
  const vcard = cardVCard(content, url);
  const vcf = `data:text/vcard;charset=utf-8,${encodeURIComponent(vcard)}`;
  const fileName = `${content.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "contact"}.vcf`;

  const rows = [
    content.email && {
      label: "Email",
      text: content.email,
      href: `mailto:${content.email}`,
    },
    content.phone && {
      label: "Phone",
      text: content.phone,
      href: `tel:${content.phone.replace(/[^\d+]/g, "")}`,
    },
    ...content.links.map((l) => ({
      label: l.label,
      text: shortUrl(l.url),
      href: l.url,
    })),
    content.location && { label: "Location", text: content.location },
  ].filter(Boolean) as { label: string; text: string; href?: string }[];

  return (
    <main
      className={`flex min-h-screen flex-col items-center px-4 py-10 sm:py-16 ${design.dark ? "bg-[#111113] text-white" : "bg-[#f0f0f2] text-[#1d1d1f]"}`}
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
            className={`inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-medium ${design.dark ? "bg-white text-[#111]" : "bg-[#1d1d1f] text-white"}`}
          >
            <UserPlus aria-hidden className="size-4" /> Save contact
          </a>
        </div>

        {rows.length > 0 && (
          <ul
            className={`mt-8 divide-y overflow-hidden rounded-2xl ${design.dark ? "divide-white/10 bg-white/5" : "divide-black/5 bg-white"}`}
          >
            {rows.map((row) => {
              const body = (
                <>
                  <span
                    className={`text-xs tracking-wide uppercase ${design.dark ? "text-white/60" : "text-black/55"}`}
                  >
                    {row.label}
                  </span>
                  <span className="truncate text-[15px]">{row.text}</span>
                </>
              );
              return (
                <li key={row.label + row.text}>
                  {row.href ? (
                    <a
                      href={row.href}
                      target={
                        row.href.startsWith("http") ? "_blank" : undefined
                      }
                      rel="noopener noreferrer me"
                      className={`flex flex-col gap-0.5 px-5 py-3.5 ${design.dark ? "hover:bg-white/5" : "hover:bg-black/[.02]"}`}
                    >
                      {body}
                    </a>
                  ) : (
                    <div className="flex flex-col gap-0.5 px-5 py-3.5">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p
          className={`mt-10 text-center text-xs ${design.dark ? "text-white/50" : "text-black/45"}`}
        >
          A digital card made with{" "}
          <Link href="/" className="underline underline-offset-4">
            Folioone
          </Link>
        </p>
      </div>
    </main>
  );
}
