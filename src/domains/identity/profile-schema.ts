import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

const optionalUrl = z
  .url()
  .max(2000)
  .refine(
    (value) => value.startsWith("https://") || value.startsWith("http://"),
    {
      message: "Use an http or https URL.",
    },
  )
  .nullable()
  .optional();

export const PRIMARY_PURPOSES = [
  { value: "job_search", label: "Find a job or new opportunities" },
  { value: "freelance", label: "Win freelance or consulting clients" },
  { value: "networking", label: "Network and build connections" },
  { value: "portfolio", label: "Showcase my work and portfolio" },
  { value: "personal_brand", label: "Build my personal brand" },
  { value: "other", label: "Something else" },
] as const;

const purposeValues = PRIMARY_PURPOSES.map((p) => p.value) as [
  string,
  ...string[],
];

export const profileInputSchema = z
  .object({
    displayName: optionalText(120),
    fullName: optionalText(120),
    headline: optionalText(180),
    summary: optionalText(2000),
    location: optionalText(160),
    websiteUrl: optionalUrl,
    linkedinUrl: optionalUrl,
    githubUrl: optionalUrl,
    profileImageUrl: optionalUrl,
    coverImageUrl: optionalUrl,
    contactEmail: z.email().max(254).nullable().optional(),
    phone: z
      .string()
      .trim()
      .max(40)
      .regex(/^[+()\d\s.-]*$/, "Use digits, spaces and + ( ) - . only.")
      .nullable()
      .optional(),
    currentDesignation: optionalText(160),
    currentOrganization: optionalText(160),
    industry: optionalText(120),
    professionalSummary: optionalText(2000),
    primaryPurpose: z.enum(purposeValues).nullable().optional(),
    onboardingStep: z.number().int().min(1).max(7).optional(),
    onboardingCompletedAt: z.iso.datetime().nullable().optional(),
  })
  .strict();

export type ProfileInput = z.infer<typeof profileInputSchema>;

const nullableText = z.string().nullable();

export const profileSchema = z.object({
  accountId: z.uuid(),
  displayName: nullableText,
  fullName: nullableText,
  headline: nullableText,
  summary: nullableText,
  location: nullableText,
  websiteUrl: nullableText,
  linkedinUrl: nullableText,
  githubUrl: nullableText,
  profileImageUrl: nullableText,
  coverImageUrl: nullableText,
  contactEmail: nullableText,
  phone: nullableText,
  currentDesignation: nullableText,
  currentOrganization: nullableText,
  industry: nullableText,
  professionalSummary: nullableText,
  primaryPurpose: nullableText,
  onboardingStep: z.number().int().min(1).max(7),
  onboardingCompletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type IdentityProfile = z.infer<typeof profileSchema>;
