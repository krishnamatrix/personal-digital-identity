import Link from "next/link";
import type { Metadata } from "next";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";

export const metadata: Metadata = { title: "Persona not found" };

/**
 * Shown when a Persona id does not exist or is not the signed-in user's. The two
 * cases are deliberately indistinguishable, so nothing is revealed about other
 * accounts.
 */
export default function PersonaNotFound() {
  return (
    <WorkspaceFrame>
      <section className="border-border bg-card max-w-2xl rounded-lg border p-6 md:p-8">
        <p className="eyebrow">My Personas</p>
        <h1 className="font-display mt-2 text-3xl md:text-[2.5rem] md:leading-tight">
          Persona not found
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-6">
          This Persona does not exist or is not available to you. It may have
          been deleted. Your other Personas and My Identity are unaffected.
        </p>
        <Link
          href="/personas"
          className="text-accent mt-6 inline-flex text-sm font-medium underline-offset-4 hover:underline"
        >
          Back to Personas
        </Link>
      </section>
    </WorkspaceFrame>
  );
}
