import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { BrandMark } from "@/components/brand-mark";
import { ChatCardFace } from "@/components/chatcards/chat-card-face";
import { getLandingView } from "@/domains/chatcards/conversation-service";
import { recordChatCardView } from "@/domains/chatcards/chat-card-events";
import { ChatLandingPanel } from "@/app/chat/chat-landing-panel";

// Pausing or archiving must take effect at once: never cache this route.
export const dynamic = "force-dynamic";

async function load(publicId: string) {
  try {
    return await getLandingView(publicId);
  } catch {
    return {
      card: null,
      availability: "unavailable" as const,
      viewer: { signedIn: false as const },
    };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  const { card } = await load(publicId);
  // Invitation pages are shared deliberately; they are never listed by search engines.
  if (!card)
    return {
      title: "ChatCard unavailable",
      robots: { index: false, follow: false },
    };
  return {
    title: { absolute: `${card.title} · ${card.hostName}` },
    description: `Start a private conversation with ${card.hostName} on Folioone.`,
    robots: { index: false, follow: false },
  };
}

export default async function ChatCardLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ src?: string }>;
}) {
  const { publicId } = await params;
  const { src } = await searchParams;
  const view = await load(publicId);
  const { card } = view;
  if (card && !card.isOwner)
    await recordChatCardView(
      card.cardId,
      { headers: await headers() },
      src === "qr",
    );

  return (
    <main className="bg-background min-h-dvh px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <Link href="/" className="inline-flex" aria-label="Folioone home">
          <BrandMark />
        </Link>
        {card ? (
          <>
            <ChatCardFace
              title={card.title}
              hostName={card.hostName}
              description={card.description}
              welcomeMessage={card.welcomeMessage}
              coverImageUrl={card.coverImageUrl}
              accessPolicy={card.accessPolicy}
              autoAccept={card.autoAccept}
            />
            <ChatLandingPanel
              publicId={card.publicId}
              hostName={card.hostName}
              accessPolicy={card.accessPolicy}
              autoAccept={card.autoAccept}
              availability={view.availability}
              viewer={view.viewer}
              linkPath={card.linkPath}
            />
          </>
        ) : (
          <section
            className="border-border bg-card rounded-[20px] border p-7"
            data-testid="chat-card-unavailable"
          >
            <p className="eyebrow">ChatCard</p>
            <h1 className="font-display mt-2 text-2xl">
              This ChatCard is not available
            </h1>
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              The link may be mistyped, or its owner has retired it. If someone
              gave you this card, ask them for a new link.
            </p>
          </section>
        )}
        <p className="text-muted-foreground text-center text-xs leading-5">
          Conversations on Folioone are private. Neither side sees the
          other&rsquo;s email address or phone number.
        </p>
      </div>
    </main>
  );
}
