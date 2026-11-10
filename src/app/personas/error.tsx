"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

/**
 * Error boundary for an unexpected failure while rendering a Persona screen.
 * Expected failures (signed out, not found, unavailable) are handled by the pages
 * themselves; this only catches the unexpected. It shows no error text: nothing
 * from the failure is displayed to the user.
 */
export default function PersonasError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <WorkspaceShell>
      <section
        role="alert"
        className="border-border bg-card max-w-2xl rounded-lg border p-6 md:p-8"
      >
        <p className="eyebrow">My Personas</p>
        <h1 className="font-display mt-2 text-3xl md:text-[2.5rem] md:leading-tight">
          Something went wrong
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-6">
          We could not show this page. Nothing was changed. Try again, or go
          back to your Personas.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button onClick={reset}>Try again</Button>
          <Link
            href="/personas"
            className="text-accent text-sm font-medium underline-offset-4 hover:underline"
          >
            Back to Personas
          </Link>
        </div>
      </section>
    </WorkspaceShell>
  );
}
