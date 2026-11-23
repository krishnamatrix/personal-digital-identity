import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { getInbox } from "@/domains/chatcards/conversation-service";
import { ChatCardsLoadError } from "@/app/chatcards/load-error";
import { MessagesInbox } from "@/app/messages/messages-inbox";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  try {
    const inbox = await getInbox();
    return (
      <WorkspaceShell>
        <MessagesInbox
          inbox={inbox}
          initialView={
            view === "started"
              ? "started"
              : view === "received"
                ? "received"
                : null
          }
        />
      </WorkspaceShell>
    );
  } catch (error) {
    return (
      <WorkspaceShell>
        <ChatCardsLoadError
          error={error}
          route="/messages"
          subject="conversation"
        />
      </WorkspaceShell>
    );
  }
}
