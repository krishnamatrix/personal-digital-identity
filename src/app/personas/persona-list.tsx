"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveRegions, useAnnouncer } from "@/components/ui/live-region";
import {
  PersonaLifecycleControls,
  type LifecycleOutcome,
} from "@/app/personas/persona-lifecycle-controls";
import {
  FailureAlert,
  SIGNED_OUT_TITLE,
  SignInAction,
  StorageNotice,
  formatDate,
  initialsOf,
} from "@/app/personas/persona-ui";
import { STARTER_PERSONA_NAMES } from "@/domains/personas/persona-constants";
import type { PersonaListResult } from "@/domains/personas/persona-types";

type Props = PersonaListResult & {
  filter: "active" | "archived" | "all";
  storageKind: string;
};

const SUCCESS: Record<LifecycleOutcome["kind"], (name: string) => string> = {
  default: (name) => `${name} is now your default Persona.`,
  remove_default: (name) => `${name} is no longer your default Persona.`,
  archive: (name) => `${name} was archived.`,
  restore: (name) => `${name} was restored. It is not your default.`,
  duplicate: (name) => `A copy of ${name} was created.`,
  delete: (name) => `${name} was permanently deleted.`,
};

export function PersonaList({ personas, counts, filter, storageKind }: Props) {
  const router = useRouter();
  const { announcements, announce } = useAnnouncer();
  const [problem, setProblem] = useState<{
    message: string;
    conflict: boolean;
    signedOut: boolean;
  } | null>(null);

  function handleOutcome(outcome: LifecycleOutcome) {
    const { result, kind, subject } = outcome;
    if (result.ok) {
      setProblem(null);
      announce(SUCCESS[kind](subject.name));
      router.refresh();
      return;
    }
    const conflict = result.code === "version_conflict";
    const message = conflict
      ? `“${subject.name}” was changed in another tab or session. Reload to see the latest version before trying again.`
      : result.message;
    setProblem({
      message,
      conflict,
      signedOut: result.code === "unauthenticated",
    });
    announce(message, "assertive");
  }

  const totalEverything = counts.active + counts.archived;

  return (
    <div className="space-y-7" data-testid="persona-list">
      <LiveRegions announcements={announcements} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">My Personas</p>
          <h1 className="font-display text-3xl md:text-[2.5rem] md:leading-tight">
            Personas
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
            Each Persona presents selected parts of My Identity for a particular
            audience. Creating or editing one never changes My Identity and
            never publishes anything.
          </p>
        </div>
        <Button asChild variant="accent">
          <Link href="/personas/new">
            <Plus className="size-4" aria-hidden="true" />
            Create Persona
          </Link>
        </Button>
      </div>

      <StorageNotice kind={storageKind} />

      {problem && (
        <FailureAlert
          title={
            problem.signedOut
              ? SIGNED_OUT_TITLE
              : problem.conflict
                ? "Out of date"
                : "That did not work"
          }
          actions={
            problem.signedOut ? (
              <SignInAction />
            ) : problem.conflict ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setProblem(null);
                  router.refresh();
                }}
              >
                Reload Personas
              </Button>
            ) : undefined
          }
        >
          {problem.message}
        </FailureAlert>
      )}

      <nav
        aria-label="Persona filter"
        className="border-border flex gap-1 border-b"
      >
        {(
          [
            ["active", `Active (${counts.active})`, "/personas"],
            [
              "archived",
              `Archived (${counts.archived})`,
              "/personas?show=archived",
            ],
            ["all", `All (${totalEverything})`, "/personas?show=all"],
          ] as const
        ).map(([key, label, href]) => (
          <Link
            key={key}
            href={href}
            aria-current={filter === key ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm ${filter === key ? "border-accent text-foreground" : "text-muted-foreground border-transparent"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {personas.length === 0 ? (
        <EmptyState filter={filter} hasAny={totalEverything > 0} />
      ) : (
        <ul className="grid gap-5 lg:grid-cols-2">
          {personas.map((persona) => (
            <li key={persona.id}>
              <article
                aria-labelledby={`persona-${persona.id}-name`}
                className="border-border bg-card flex h-full flex-col gap-4 rounded-lg border p-5 md:p-6"
              >
                <div className="flex items-start gap-4">
                  <div
                    aria-hidden="true"
                    className="bg-accent-soft text-accent font-display flex size-11 shrink-0 items-center justify-center rounded-full text-sm"
                  >
                    {initialsOf(persona.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2
                        id={`persona-${persona.id}-name`}
                        className="font-display text-xl"
                      >
                        {persona.name}
                      </h2>
                      {persona.isDefault && <Badge>Default</Badge>}
                      {persona.status === "archived" && (
                        <Badge className="bg-muted text-muted-foreground">
                          Archived
                        </Badge>
                      )}
                    </div>
                    {(persona.audience || persona.purpose) && (
                      <p className="text-muted-foreground mt-1 text-sm">
                        {[persona.audience, persona.purpose]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                </div>

                {persona.description && (
                  <p className="text-muted-foreground line-clamp-2 text-sm leading-6">
                    {persona.description}
                  </p>
                )}

                <div className="text-sm">
                  <p className="text-muted-foreground text-xs">
                    Shows{" "}
                    <span className="text-foreground">
                      {persona.visibleSectionLabels.length === 0
                        ? "no sections yet"
                        : persona.visibleSectionLabels.join(", ")}
                    </span>
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {persona.includedFieldCount} of 7 My Identity fields
                    included · Updated {formatDate(persona.updatedAt)}
                  </p>
                </div>

                <div className="mt-auto space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/personas/${persona.id}`}>
                        <Pencil className="size-4" aria-hidden="true" />
                        {persona.status === "archived" ? "View" : "Edit"}
                        <span className="sr-only"> {persona.name}</span>
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/personas/${persona.id}?tab=preview`}>
                        <Eye className="size-4" aria-hidden="true" />
                        Preview
                        <span className="sr-only"> {persona.name}</span>
                      </Link>
                    </Button>
                  </div>
                  <PersonaLifecycleControls
                    persona={persona}
                    onOutcome={handleOutcome}
                  />
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({
  filter,
  hasAny,
}: {
  filter: Props["filter"];
  hasAny: boolean;
}) {
  if (hasAny) {
    return (
      <section className="border-border bg-card rounded-lg border p-8 text-center">
        <h2 className="font-display text-2xl">
          {filter === "archived" ? "No archived Personas" : "No Personas here"}
        </h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-6">
          {filter === "archived"
            ? "Archived Personas appear here. You can restore or permanently delete them."
            : "Switch the filter to see your other Personas."}
        </p>
      </section>
    );
  }
  return (
    <section className="border-border bg-card rounded-lg border p-8 md:p-10">
      <h2 className="font-display text-2xl">Create your first Persona</h2>
      <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-6">
        A Persona chooses which parts of My Identity to emphasise for one
        audience. Creating a Persona does not change My Identity and does not
        publish anything.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button asChild variant="accent">
          <Link href="/personas/new">Create a blank Persona</Link>
        </Button>
        <span className="text-muted-foreground text-sm">
          or start from an optional suggestion:
        </span>
        {STARTER_PERSONA_NAMES.map((name) => (
          <Link
            key={name}
            href={`/personas/new?starter=${encodeURIComponent(name)}`}
            className="border-border hover:bg-muted rounded-full border px-3 py-1 text-sm"
          >
            {name}
          </Link>
        ))}
      </div>
    </section>
  );
}
