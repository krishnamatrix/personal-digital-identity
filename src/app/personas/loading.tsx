import { WorkspaceShell } from "@/components/workspace/workspace-shell";

/**
 * Route loading state: quiet, static placeholders in the shared card style (no
 * animation), with an accessible status for screen readers.
 */
export default function PersonasLoading() {
  return (
    <WorkspaceShell>
      <div role="status" aria-live="polite" className="space-y-7">
        <span className="sr-only">Loading Personas…</span>
        <div aria-hidden="true" className="space-y-3">
          <div className="bg-muted h-3 w-24 rounded" />
          <div className="bg-muted h-10 w-56 rounded" />
          <div className="bg-muted h-4 w-full max-w-xl rounded" />
        </div>
        <div aria-hidden="true" className="grid gap-5 lg:grid-cols-2">
          {[0, 1].map((key) => (
            <div
              key={key}
              className="border-border bg-card space-y-4 rounded-lg border p-6"
            >
              <div className="flex items-center gap-4">
                <div className="bg-muted size-11 rounded-full" />
                <div className="bg-muted h-6 w-40 rounded" />
              </div>
              <div className="bg-muted h-3 w-3/4 rounded" />
              <div className="bg-muted h-8 w-48 rounded" />
            </div>
          ))}
        </div>
      </div>
    </WorkspaceShell>
  );
}
