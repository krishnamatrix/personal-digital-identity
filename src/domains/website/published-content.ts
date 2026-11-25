import { z } from "zod";
import { publishedIntroSchema } from "@/domains/intro/intro-video";
import { pinnedWebsiteDesignSchema } from "@/domains/designs/design-spec";

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
    id: z.literal("featured"),
    heading,
    items: z
      .array(
        z.object({
          title: text(200),
          url: httpUrl,
          platform: text(40),
          platformLabel: text(60),
          mediaType: z.enum([
            "post",
            "video",
            "article",
            "podcast",
            "talk",
            "other",
          ]),
          date: month.optional(),
          summary: text(400).optional(),
          thumbnailUrl: httpUrl.optional(),
          /** Set for YouTube links: the page shows a click-to-play player. */
          youtubeId: z
            .string()
            .regex(/^[A-Za-z0-9_-]{11}$/)
            .optional(),
          headline: z.boolean().optional(),
        }),
      )
      .max(24),
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
    id: z.literal("booking"),
    heading,
    provider: z.enum(["calendly", "cal", "google", "other"]),
    providerLabel: text(40),
    url: httpUrl,
    /** Present only for providers that support embedding; loaded after a click. */
    embedUrl: httpUrl.optional(),
    title: text(80),
    description: text(300).optional(),
  }),
  z.object({
    id: z.literal("contact"),
    heading,
    email: z.string().max(254).optional(),
    phone: text(40).optional(),
    website: httpUrl.optional(),
  }),
]);

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Links page (/<slug>/links). Scheduling is applied when the page is rendered. */
export const publishedLinksSchema = z.object({
  buttonStyle: z.enum(["filled", "outline", "soft"]),
  socials: z
    .array(z.object({ platform: text(40), label: text(80), url: httpUrl }))
    .max(30),
  items: z
    .array(
      z.object({
        kind: z.enum([
          "custom",
          "social",
          "featured",
          "article",
          "website",
          "booking",
        ]),
        title: text(100),
        /** Absolute link, or a site-relative one for "website" / "article" (resolved on render). */
        url: httpUrl.optional(),
        articleSlug: text(80).optional(),
        platform: text(40).optional(),
        thumbnailUrl: httpUrl.optional(),
        highlight: z.boolean().optional(),
        startsOn: day.optional(),
        endsOn: day.optional(),
      }),
    )
    .max(50),
});
export type PublishedLinks = z.infer<typeof publishedLinksSchema>;

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
    /** The owner's recorded video intro (M13), shown from the hero photo. */
    intro: publishedIntroSchema.optional(),
  }),
  sections: z.array(publishedSectionSchema).max(13),
  /** Present only when the owner switched the links page on. */
  links: publishedLinksSchema.optional(),
  /**
   * A Folio Designer design (M14), pinned at publish time: its version and an exact copy of its
   * spec, so later edits to the design never change a live site until the owner republishes.
   * Absent for the code designs.
   */
  design: pinnedWebsiteDesignSchema.optional(),
});

export type PublishedContent = z.infer<typeof publishedContentSchema>;
export type PublishedSection = z.infer<typeof publishedSectionSchema>;
export type SectionOf<I extends PublishedSection["id"]> = Extract<
  PublishedSection,
  { id: I }
>;
