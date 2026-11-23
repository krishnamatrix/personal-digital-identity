import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { getEditorContext } from "@/domains/chatcards/chat-card-service";
import { getSiteUrl } from "@/lib/site-url";
import { ChatCardWizard } from "@/app/chatcards/chat-card-editor";
import { ChatCardsUpgrade } from "@/app/chatcards/chatcards-upgrade";
import { ChatCardsLoadError, isProRequired } from "@/app/chatcards/load-error";

export const metadata: Metadata = { title: "New ChatCard" };
export const dynamic = "force-dynamic";

export default async function NewChatCardPage() {
  try {
    const [context, origin] = await Promise.all([
      getEditorContext(),
      getSiteUrl(),
    ]);
    return (
      <WorkspaceShell>
        <ChatCardWizard context={context} origin={origin} />
      </WorkspaceShell>
    );
  } catch (error) {
    return (
      <WorkspaceShell>
        {isProRequired(error) ? (
          <ChatCardsUpgrade />
        ) : (
          <ChatCardsLoadError error={error} route="/chatcards/new" />
        )}
      </WorkspaceShell>
    );
  }
}
