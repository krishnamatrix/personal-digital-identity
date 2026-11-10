/** Shared (client + server) description of the onboarding wizard. */
export const ONBOARDING_STEP_COUNT = 7;

export const ONBOARDING_STEPS = [
  { step: 1, title: "Welcome", fields: [] },
  {
    step: 2,
    title: "About you",
    fields: ["fullName", "displayName", "headline"],
  },
  {
    step: 3,
    title: "Professional introduction",
    fields: [
      "currentDesignation",
      "currentOrganization",
      "industry",
      "professionalSummary",
    ],
  },
  { step: 4, title: "Profile image", fields: ["profileImageUrl"] },
  {
    step: 5,
    title: "Location & contact",
    fields: ["location", "contactEmail", "phone", "websiteUrl"],
  },
  { step: 6, title: "Your purpose", fields: ["primaryPurpose"] },
  { step: 7, title: "Review", fields: [] },
] as const;

export type OnboardingField =
  (typeof ONBOARDING_STEPS)[number]["fields"][number];

export function fieldsForStep(step: number): readonly string[] {
  return ONBOARDING_STEPS.find((s) => s.step === step)?.fields ?? [];
}
