import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { PersonaEditor } from "@/app/personas/persona-editor";
import { PersonaUnavailable } from "@/app/personas/persona-unavailable";
import { isPersonaError } from "@/domains/personas/persona-errors";
import { getPersonaService } from "@/domains/personas/persona-runtime";
import { AuthenticationRequiredError } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// One load per request, shared by the page title and the page body.
const loadEditor = cache(async (id: string) => {
  const service = getPersonaService();
  return {
    storageKind: service.storageKind,
    data: await service.getEditorData(id),
  };
});

/** The tab title is the Persona's own name; a missing Persona says so. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    return { title: (await loadEditor(id)).data.persona.name };
  } catch (error) {
    if (isPersonaError(error) && error.code === "not_found") {
      return { title: "Persona not found" };
    }
    return { title: "Persona" };
  }
}

const TABS = ["details", "content", "presentation", "preview"] as const;

export default async function PersonaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const initialTab = TABS.find((candidate) => candidate === tab) ?? "details";
  let loaded;
  try {
    loaded = await loadEditor(id);
  } catch (error) {
    if (isPersonaError(error) && error.code === "not_found") notFound();
    return (
      <PersonaUnavailable
        needsAuthentication={error instanceof AuthenticationRequiredError}
      />
    );
  }
  return (
    <WorkspaceShell>
      <PersonaEditor
        initial={loaded.data}
        initialTab={initialTab}
        storageKind={loaded.storageKind}
      />
    </WorkspaceShell>
  );
}
