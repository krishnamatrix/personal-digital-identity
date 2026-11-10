import { z } from "zod";

/**
 * The PUBLISHED representation. This is the only thing the public site reads. It is built by
 * build-published.ts from My Identity + the website draft, stored as jsonb, and re-validated
 * (untrusted) on every public render.
 */
const text = (max: number) => z.string().max(max);
const httpUrl = z
  .string()
  .max(2000)
  .refine((v) => /^https?:\/\/[^\s]+$/.test(v), "http(s) URL required");
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const heading = text(60);

export const publishedSectionSchema = z.discriminatedUnion("id", [
  z.object({
    id: z.literal("about"),
    heading,
    paragraphs: z.array(text(2000)).max(4),
  }),
  z.object({
    id: z.literal("experience"),
    heading,
    items: z
      .array(
        z.object({
          title: text(160),
          organization: text(160),
          location: text(160).optional(),
          start: month.optional(),
          end: month.optional(),
          current: z.boolean().optional(),
          description: text(2000).optional(),
        }),
      )
      .max(30),
  }),
  z.object({
    id: z.literal("education"),
    heading,
    items: z
      .array(
        z.object({
          institution: text(200),
          qualification: text(160).optional(),
          specialization: text(160).optional(),
          start: month.optional(),
          end: month.optional(),
          description: text(2000).optional(),
        }),
      )
      .max(20),
  }),
  z.object({
    id: z.literal("skills"),
    heading,
    groups: z
      .array(
        z.object({
          category: text(100).optional(),
          skills: z
            .array(
              z.object({ name: text(100), description: text(1000).optional() }),
            )
            .max(100),
        }),
      )
      .max(40),
  }),
  z.object({
    id: z.literal("projects"),
    heading,
    items: z
      .array(
        z.object({
          name: text(160),
          role: text(160).optional(),
          description: text(2000).optional(),
          technologies: z.array(text(60)).max(20).optional(),
          url: httpUrl.optional(),
          images: z.array(httpUrl).max(6).optional(),
        }),
      )
      .max(30),
  }),
  z.object({
    id: z.literal("articles"),
    heading,
    /** Listing as approved at publish time. The public page lists the live snapshot rows. */
    items: z
      .array(
        z.object({
          slug: text(80),
          title: text(200),
          excerpt: text(400).optional(),
          coverUrl: httpUrl.optional(),
          category: text(60).optional(),
          publishedAt: z.string().max(40),
          readingMinutes: z.number().int().min(0).max(1000),
          /** Article version at publish time, so later edits show as unpublished changes. */
          rev: z.number().int().min(1),
          /** Added at render time for the public page; never stored. */
          href: text(300).optional(),
        }),
      )
      .max(50),
  }),
  z.object({
    id: z.literal("achievements"),
    heading,
    items: z
      .array(
        z.object({
          title: text(160),
          date: month.optional(),
          description: text(1000).optional(),
        }),
      )
      .max(50),
  }),
  z.object({
    id: z.literal("certifications"),
    heading,
    items: z
      .array(
        z.object({
          name: text(160),
          issuer: text(160).optional(),
          date: month.optional(),
          url: httpUrl.optional(),
        }),
      )
      .max(50),
  }),
  z.object({
    id: z.literal("social"),
    heading,
    items: z
      .array(z.object({ platform: text(40), label: text(80), url: httpUrl }))
      .max(30),
  }),
  z.object({
    id: z.literal("contact"),
    heading,
    email: z.string().max(254).optional(),
    phone: text(40).optional(),
    website: httpUrl.optional(),
  }),
]);

export const publishedContentSchema = z.object({
  version: z.literal(1),
  person: z.object({
    name: text(120),
    headline: text(180).optional(),
    role: text(330).optional(),
    location: text(160).optional(),
    shortBio: text(400).optional(),
    imageUrl: httpUrl.optional(),
    coverUrl: httpUrl.optional(),
    /** mailto target for the hero's contact action; present only if the owner opted in. */
    contactEmail: z.string().max(254).optional(),
  }),
  sections: z.array(publishedSectionSchema).max(12),
});

export type PublishedContent = z.infer<typeof publishedContentSchema>;
export type PublishedSection = z.infer<typeof publishedSectionSchema>;
export type SectionOf<I extends PublishedSection["id"]> = Extract<
  PublishedSection,
  { id: I }
>;
