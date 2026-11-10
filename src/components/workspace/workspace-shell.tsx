import type { ReactNode } from "react";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { getViewer } from "@/domains/identity/viewer";

/** Workspace chrome showing the signed-in person (looked up on the server). */
export async function WorkspaceShell({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  return (
    <WorkspaceFrame viewer={viewer ? { name: viewer.name } : undefined}>
      {children}
    </WorkspaceFrame>
  );
}
