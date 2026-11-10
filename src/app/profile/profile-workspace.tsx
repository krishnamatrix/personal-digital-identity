"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EntryListEditor } from "@/app/profile/entry-list-editor";
import { ProfileFieldsForm } from "@/app/profile/profile-fields-form";
import {
  ProfilePreview,
  type PreviewProfile,
} from "@/app/profile/profile-preview";
import {
  LIST_SECTIONS,
  type EntryItem,
  type EntryKind,
} from "@/domains/identity/entry-kinds";
import type { CompletionItem } from "@/domains/identity/completion";

type SectionId =
  | "personal"
  | "professional"
  | "education"
  | "skills"
  | "projects"
  | "social"
  | "additional"
  | "preview";

const SECTIONS: { id: SectionId; label: string; blurb: string }[] = [
  {
    id: "personal",
    label: "Personal",
    blurb: "Who you are, and how people can reach you.",
  },
  {
    id: "professional",
    label: "Professional",
    blurb: "What you do now and where you have worked.",
  },
  {
    id: "education",
    label: "Education",
    blurb: "Schools, programmes and qualifications.",
  },
  {
    id: "skills",
    label: "Skills",
    blurb: "What you are good at, grouped your way.",
  },
  { id: "projects", label: "Projects", blurb: "Work worth showing." },
  {
    id: "social",
    label: "Social & Web",
    blurb: "Your profiles around the web, by URL.",
  },
  {
    id: "additional",
    label: "Additional",
    blurb: "Achievements, certifications, languages and interests.",
  },
  { id: "preview", label: "Preview", blurb: "How your saved profile reads." },
];

type Props = {
  profileValues: Record<string, string>;
  entries: Partial<Record<EntryKind, EntryItem[]>>;
  preview: PreviewProfile;
  completion: { percent: number; items: CompletionItem[] };
  onboarding: { complete: boolean; step: number };
  welcome: boolean;
  initialSection?: string;
};

export function ProfileWorkspace({
  profileValues,
  entries,
  preview,
  completion,
  onboarding,
  welcome,
  initialSection,
}: Props) {
  const [active, setActive] = useState<SectionId>(
    SECTIONS.some((s) => s.id === initialSection)
      ? (initialSection as SectionId)
      : "personal",
  );
  const [dirtySet, setDirtySet] = useState<ReadonlySet<string>>(new Set());

  const setDirty = useCallback((key: string, dirty: boolean) => {
    setDirtySet((cur) => {
      if (cur.has(key) === dirty) return cur;
      const next = new Set(cur);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const profileDirty = useCallback(
    (k: string) => (d: boolean) => setDirty(k, d),
    [setDirty],
  );
  const entryDirty = useCallback(
    (kind: EntryKind, d: boolean) => setDirty(kind, d),
    [setDirty],
  );

  useEffect(() => {
    if (dirtySet.size === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtySet]);

  const sectionDirty = (id: SectionId) => {
    if (id === "personal" || id === "professional") {
      return (
        dirtySet.has(id) ||
        (id === "professional" && dirtySet.has("employment"))
      );
    }
    if (id === "preview") return false;
    const kinds: readonly EntryKind[] =
      LIST_SECTIONS[id as keyof typeof LIST_SECTIONS];
    return kinds.some((k) => dirtySet.has(k));
  };

  const listEditor = (kind: EntryKind, heading = true) => (
    <EntryListEditor
      key={kind}
      kind={kind}
      initial={entries[kind] ?? []}
      heading={heading}
      onDirtyChange={entryDirty}
    />
  );

  const current = SECTIONS.find((s) => s.id === active)!;
  const nextStep = completion.items.find((i) => !i.done);

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div>
          <p className="eyebrow">Master Identity</p>
          <h1 className="font-display mt-2 text-3xl md:text-[2.5rem] md:leading-tight">
            Your profile
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            Keep your core story in one private place. You choose what to
            include in a published presentation later.
          </p>
        </div>

        {welcome && onboarding.complete && (
          <p
            className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
            role="status"
          >
            You are all set. Your Master Identity is saved; keep building it
            section by section.
          </p>
        )}
        {!onboarding.complete && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Setup is not finished (step {onboarding.step} of 7).{" "}
            <Link href="/onboarding" className="font-medium underline">
              Continue setup
            </Link>
          </p>
        )}

        <div className="border-border bg-card rounded-lg border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Profile completion</span>
            <span aria-label={`${completion.percent} percent complete`}>
              {completion.percent}%
            </span>
          </div>
          <div
            className="bg-muted mt-2 h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completion.percent}
            aria-label="Profile completion"
          >
            <div
              className="bg-accent h-full"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
          {nextStep && (
            <p className="text-muted-foreground mt-2 text-xs">
              Next:{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setActive(nextStep.section as SectionId)}
              >
                {nextStep.label}
              </button>
            </p>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label="Profile sections"
          className="-mx-5 overflow-x-auto px-5 lg:mx-0 lg:overflow-visible lg:px-0"
        >
          <ul className="flex gap-1 lg:sticky lg:top-24 lg:flex-col">
            {SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setActive(s.id)}
                  aria-current={active === s.id ? "page" : undefined}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm whitespace-nowrap ${active === s.id ? "bg-foreground text-background" : "hover:bg-muted"}`}
                >
                  {s.label}
                  {sectionDirty(s.id) && (
                    <span
                      className="size-2 rounded-full bg-amber-500"
                      title="Unsaved changes"
                    >
                      <span className="sr-only">Unsaved changes</span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-border bg-card min-w-0 rounded-lg border p-5 md:p-8">
          <h2 className="font-display text-2xl">{current.label}</h2>
          <p className="text-muted-foreground mt-1 mb-6 text-sm">
            {current.blurb}
          </p>

          {/* All panels stay mounted so unsaved drafts survive switching sections. */}
          <div hidden={active !== "personal"}>
            <ProfileFieldsForm
              section="personal"
              initial={profileValues}
              onDirtyChange={profileDirty("personal")}
            />
          </div>
          <div hidden={active !== "professional"} className="space-y-10">
            <ProfileFieldsForm
              section="professional"
              initial={profileValues}
              onDirtyChange={profileDirty("professional")}
            />
            {listEditor("employment")}
          </div>
          <div hidden={active !== "education"}>
            {listEditor("education", false)}
          </div>
          <div hidden={active !== "skills"}>{listEditor("skill", false)}</div>
          <div hidden={active !== "projects"}>
            {listEditor("project", false)}
          </div>
          <div hidden={active !== "social"}>
            {listEditor("social_link", false)}
          </div>
          <div hidden={active !== "additional"} className="space-y-10">
            {LIST_SECTIONS.additional.map((k) => listEditor(k))}
          </div>
          <div hidden={active !== "preview"}>
            {sectionDirtyAny(dirtySet) && (
              <p className="mb-4 text-xs text-amber-700">
                The preview shows saved information only. You have unsaved
                changes.
              </p>
            )}
            <ProfilePreview profile={preview} entries={entries} />
          </div>
        </div>
      </div>
    </div>
  );
}

function sectionDirtyAny(set: ReadonlySet<string>) {
  return set.size > 0;
}
