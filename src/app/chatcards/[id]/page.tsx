import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import {
  getActivationCodes,
  getEditorContext,
  getOwnChatCard,
} from "@/domains/chatcards/chat-card-service";
import { getSiteUrl } from "@/lib/site-url";
import {
  ChatCardManager,
  type ManagerTab,
} from "@/app/chatcards/chat-card-manager";
import { ChatCardsUpgrade } from "@/app/chatcards/chatcards-upgrade";
import { ChatCardsLoadError, isProRequired } from "@/app/chatcards/load-error";

export const metadata: Metadata = { title: "ChatCard" };
export const dynamic = "force-dynamic";

const TABS: ManagerTab[] = ["overview", "edit", "preview", "share", "codes"];

export default async function ChatCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  try {
    const [card, context, origin] = await Promise.all([
      getOwnChatCard(id),
      getEditorContext(),
      getSiteUrl(),
    ]);
    const batches =
      card.accessPolicy === "verified" ? await getActivationCodes(card.id) : [];
    return (
      <WorkspaceShell>
        <ChatCardManager
          card={card}
          context={context}
          origin={origin}
          batches={batches}
          initialTab={
            TABS.includes(tab as ManagerTab) ? (tab as ManagerTab) : "overview"
          }
        />
      </WorkspaceShell>
    );
  } catch (error) {
    return (
      <WorkspaceShell>
        {isProRequired(error) ? (
          <ChatCardsUpgrade />
        ) : (
          <ChatCardsLoadError error={error} route="/chatcards/[id]" />
        )}
      </WorkspaceShell>
    );
  }
}
