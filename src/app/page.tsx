import { Dashboard } from "@/components/workspace/dashboard";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default function HomePage() {
  return (
    <WorkspaceShell>
      <Dashboard />
    </WorkspaceShell>
  );
}
