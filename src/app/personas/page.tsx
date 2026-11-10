import type { Metadata } from "next";
import { logLoadError } from "@/lib/server-log";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { PersonaList } from "@/app/personas/persona-list";
import { PersonaUnavailable } from "@/app/personas/persona-unavailable";
import { getPersonaService } from "@/domains/personas/persona-runtime";
import { AuthenticationRequiredError } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Personas" };
export const dynamic = "force-dynamic";

export default async function PersonasPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  const filter = show === "archived" || show === "all" ? show : "active";
  try {
    const service = getPersonaService();
    const result = await service.list(filter);
    return (
      <WorkspaceShell>
        <PersonaList
          {...result}
          filter={filter}
          storageKind={service.storageKind}
        />
      </WorkspaceShell>
    );
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError))
      logLoadError("/personas", error);
    return (
      <PersonaUnavailable
        needsAuthentication={error instanceof AuthenticationRequiredError}
      />
    );
  }
}
