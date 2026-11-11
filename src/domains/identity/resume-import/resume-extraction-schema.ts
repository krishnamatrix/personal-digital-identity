import { z } from "zod";
import { SOCIAL_PLATFORMS } from "@/domains/identity/entry-kinds";

/**
 * Shape the model must return when reading a resume (sent as the structured-output format).
 *
 * Deliberately loose: every field is required-but-nullable (what structured outputs needs)
 * and carries no length, URL or date constraints. The model's output is untrusted input, so
 * the real rules are applied afterwards by `mapResumeToIdentity`, using the same Zod
 * schemas the profile editor uses. Field names match the entry-kind registry keys, so an
 * item maps onto a Master Identity entry without translation.
 */
const text = z.string().nullable();
const month = z
  .string()
  .nullable()
  .describe("YYYY-MM. Use -01 when only the year is known. null if absent.");

const platformValues = SOCIAL_PLATFORMS.map((p) => p.value) as [
  string,
  ...string[],
];

export const resumeExtractionSchema = z.object({
  isResume: z
    .boolean()
    .describe(
      "false when the document is not a resume or CV; leave everything else empty then.",
    ),
  profile: z.object({
    fullName: text,
    headline: text.describe(
      "A short professional headline, e.g. 'Senior product designer'. From the resume only.",
    ),
    professionalSummary: text.describe(
      "The resume's own summary/profile paragraph, lightly cleaned. Do not invent one.",
    ),
    currentDesignation: text.describe(
      "Job title of the current or latest role.",
    ),
    currentOrganization: text.describe(
      "Organization of the current or latest role.",
    ),
    industry: text,
    location: text.describe("City, Country of the person, if stated."),
    contactEmail: text,
    phone: text,
    websiteUrl: text.describe("Personal website URL (not LinkedIn/GitHub)."),
  }),
  employment: z.array(
    z.object({
      title: text,
      organization: text,
      location: text,
      startDate: month,
      endDate: month,
      isCurrent: z.boolean(),
      description: text.describe(
        "Responsibilities and achievements for this role, as plain text lines.",
      ),
    }),
  ),
  education: z.array(
    z.object({
      institution: text,
      qualification: text,
      specialization: text,
      startDate: month,
      endDate: month,
      description: text,
    }),
  ),
  skill: z.array(z.object({ name: text, category: text })),
  project: z.array(
    z.object({
      name: text,
      role: text,
      url: text,
      description: text,
      technologies: z.array(z.string()),
    }),
  ),
  social_link: z.array(
    z.object({
      platform: z.enum(platformValues),
      url: text,
    }),
  ),
  achievement: z.array(
    z.object({ title: text, date: month, description: text }),
  ),
  certification: z.array(
    z.object({ name: text, issuer: text, date: month, url: text }),
  ),
  language: z.array(
    z.object({
      name: text,
      proficiency: z
        .enum(["Native", "Fluent", "Professional", "Conversational", "Basic"])
        .nullable(),
    }),
  ),
  interest: z.array(z.object({ name: text })),
});

export type ResumeExtraction = z.infer<typeof resumeExtractionSchema>;
