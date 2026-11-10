import type { Metadata } from "next";
import { logLoadError } from "@/lib/server-log";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { PersonaCreateFlow } from "@/app/personas/persona-create-flow";
import { PersonaUnavailable } from "@/app/personas/persona-unavailable";
import { getPersonaService } from "@/domains/personas/persona-runtime";
import { AuthenticationRequiredError } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Create Persona" };
export const dynamic = "force-dynamic";

export default async function NewPersonaPage({
  searchParams,
}: {
  searchParams: Promise<{ starter?: string }>;
}) {
  const { starter } = await searchParams;
  try {
    const service = getPersonaService();
    const { canonical, canonicalAvailable } =
      await service.loadCanonicalForCreate();
    return (
      <WorkspaceShell>
        <PersonaCreateFlow
          canonical={canonical}
          canonicalAvailable={canonicalAvailable}
          storageKind={service.storageKind}
          starter={starter}
        />
      </WorkspaceShell>
    );
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError))
      logLoadError("/personas/new", error);
    return (
      <PersonaUnavailable
        needsAuthentication={error instanceof AuthenticationRequiredError}
      />
    );
  }
}
