import type { FieldDef } from "@/domains/identity/entry-kinds";

/** Profile-column sections. Each field's key is a profile property (see profileInputSchema). */
export const PROFILE_SECTIONS: Record<
  "personal" | "professional",
  { label: string; saveLabel: string; fields: readonly FieldDef[] }
> = {
  personal: {
    label: "Personal",
    saveLabel: "Save profile",
    fields: [
      { key: "fullName", label: "Full name", type: "text", max: 120 },
      { key: "displayName", label: "Display name", type: "text", max: 120 },
      {
        key: "headline",
        label: "Professional headline",
        type: "text",
        max: 180,
        placeholder: "Product designer and thoughtful builder",
      },
      { key: "summary", label: "Biography", type: "textarea", max: 2000 },
      { key: "coverImageUrl", label: "Cover image URL", type: "url" },
      { key: "location", label: "Location", type: "text", max: 160 },
      { key: "contactEmail", label: "Contact email", type: "email" },
      { key: "phone", label: "Phone", type: "tel", max: 40 },
      { key: "websiteUrl", label: "Personal website", type: "url" },
    ],
  },
  professional: {
    label: "Professional",
    saveLabel: "Save professional details",
    fields: [
      {
        key: "currentDesignation",
        label: "Current designation",
        type: "text",
        max: 160,
      },
      {
        key: "currentOrganization",
        label: "Current organization",
        type: "text",
        max: 160,
      },
      { key: "industry", label: "Industry", type: "text", max: 120 },
      {
        key: "professionalSummary",
        label: "Professional summary",
        type: "textarea",
        max: 2000,
      },
    ],
  },
};

export const PROFILE_SECTION_FIELDS: Record<string, readonly string[]> =
  Object.fromEntries(
    Object.entries(PROFILE_SECTIONS).map(([id, s]) => [
      id,
      s.fields.map((f) => f.key),
    ]),
  );
