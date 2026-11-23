import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { getConversation } from "@/domains/chatcards/conversation-service";
import { ChatCardsLoadError } from "@/app/chatcards/load-error";
import { ConversationThread } from "@/app/messages/conversation-thread";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const view = await getConversation(id);
    return (
      <WorkspaceShell>
        <ConversationThread key={view.id} view={view} />
      </WorkspaceShell>
    );
  } catch (error) {
    // A non-participant gets exactly what a wrong id gets.
    return (
      <WorkspaceShell>
        <ChatCardsLoadError
          error={error}
          route="/messages/[id]"
          subject="conversation"
        />
      </WorkspaceShell>
    );
  }
}
