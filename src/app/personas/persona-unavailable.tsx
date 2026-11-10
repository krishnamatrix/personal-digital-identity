import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

/** Auth-required / load-failure card, matching the profile page pattern. */
export function PersonaUnavailable({
  needsAuthentication,
}: {
  needsAuthentication: boolean;
}) {
  return (
    <WorkspaceShell>
      <section className="border-border bg-card max-w-2xl rounded-lg border p-6 md:p-8">
        <p className="eyebrow">My Personas</p>
        <h1 className="font-display mt-2 text-3xl md:text-[2.5rem] md:leading-tight">
          Your Personas
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-6">
          {needsAuthentication
            ? "Sign in with your Folioone account to manage your Personas."
            : "We could not load your Personas. Please try again later."}
        </p>
        <Link
          href={needsAuthentication ? "/login" : "/"}
          className="text-accent mt-6 inline-flex text-sm font-medium underline-offset-4 hover:underline"
        >
          {needsAuthentication ? "Sign in" : "Return to workspace"}
        </Link>
      </section>
    </WorkspaceShell>
  );
}
