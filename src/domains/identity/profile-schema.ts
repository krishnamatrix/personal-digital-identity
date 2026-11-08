import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

const optionalUrl = z
  .url()
  .refine(
    (value) => value.startsWith("https://") || value.startsWith("http://"),
    {
      message: "Use an http or https URL.",
    },
  )
  .nullable()
  .optional();

export const profileInputSchema = z
  .object({
    displayName: optionalText(120),
    headline: optionalText(180),
    summary: optionalText(2000),
    location: optionalText(160),
    websiteUrl: optionalUrl,
    linkedinUrl: optionalUrl,
    githubUrl: optionalUrl,
  })
  .strict();

export type ProfileInput = z.infer<typeof profileInputSchema>;

export const profileSchema = z.object({
  accountId: z.uuid(),
  displayName: z.string().nullable(),
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  location: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  githubUrl: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type IdentityProfile = z.infer<typeof profileSchema>;
