import type { IdentityProfile } from "@/domains/identity/profile-schema";
import type { EntryKind } from "@/domains/identity/entry-kinds";

export type CompletionItem = {
  id: string;
  label: string;
  section: string;
  weight: number;
  done: boolean;
};

const has = (value: string | null | undefined) =>
  typeof value === "string" && value.trim() !== "";

/** Profile completion: weighted checklist. Pure, so it is shared by page, editor and tests. */
export function computeCompletion(
  profile: Pick<
    IdentityProfile,
    | "fullName"
    | "displayName"
    | "headline"
    | "summary"
    | "location"
    | "profileImageUrl"
    | "contactEmail"
    | "phone"
    | "currentDesignation"
    | "currentOrganization"
    | "professionalSummary"
  >,
  counts: Partial<Record<EntryKind, number>>,
): { percent: number; items: CompletionItem[] } {
  const n = (kind: EntryKind) => counts[kind] ?? 0;
  const items: CompletionItem[] = [
    {
      id: "name",
      label: "Add your name",
      section: "personal",
      weight: 10,
      done: has(profile.fullName) || has(profile.displayName),
    },
    {
      id: "headline",
      label: "Write a headline",
      section: "personal",
      weight: 10,
      done: has(profile.headline),
    },
    {
      id: "bio",
      label: "Write a short biography",
      section: "personal",
      weight: 10,
      done: has(profile.summary),
    },
    {
      id: "image",
      label: "Add a profile image",
      section: "personal",
      weight: 10,
      done: has(profile.profileImageUrl),
    },
    {
      id: "location",
      label: "Add your location",
      section: "personal",
      weight: 5,
      done: has(profile.location),
    },
    {
      id: "contact",
      label: "Add a way to contact you",
      section: "personal",
      weight: 5,
      done: has(profile.contactEmail) || has(profile.phone),
    },
    {
      id: "role",
      label: "Add your current role",
      section: "professional",
      weight: 10,
      done: has(profile.currentDesignation) && has(profile.currentOrganization),
    },
    {
      id: "pro-summary",
      label: "Add a professional summary",
      section: "professional",
      weight: 5,
      done: has(profile.professionalSummary),
    },
    {
      id: "employment",
      label: "Add employment history",
      section: "professional",
      weight: 5,
      done: n("employment") > 0,
    },
    {
      id: "education",
      label: "Add education",
      section: "education",
      weight: 10,
      done: n("education") > 0,
    },
    {
      id: "skills",
      label: "Add skills",
      section: "skills",
      weight: 10,
      done: n("skill") > 0,
    },
    {
      id: "projects",
      label: "Add a project",
      section: "projects",
      weight: 5,
      done: n("project") > 0,
    },
    {
      id: "social",
      label: "Add a social or web link",
      section: "social",
      weight: 5,
      done: n("social_link") > 0,
    },
  ];
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  const done = items.reduce((sum, i) => sum + (i.done ? i.weight : 0), 0);
  return { percent: Math.round((done / total) * 100), items };
}
