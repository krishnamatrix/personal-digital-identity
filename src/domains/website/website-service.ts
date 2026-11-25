import "server-only";
import { getAuthenticatedDb, getAnonymousDb } from "@/lib/db/query";
import { createEmptyProfile, ensureAccount, findProfile } from "@/lib/db/query";
import { listEntries, listPublishedArticles } from "@/lib/db/query";
import { hasActivePro } from "@/domains/billing/billing-service";
import { ProRequiredError } from "@/domains/billing/plans";
import {
  listWebsiteDesigns,
  resolveWebsiteDesign,
  type ResolvedWebsiteDesign,
} from "@/domains/designs/design-catalog";
import { DesignUnavailableError } from "@/domains/designs/design-errors";
import { designIdSchema } from "@/domains/designs/design-spec";
import type { PublishedContent } from "@/domains/website/published-content";
import { displayExcerpt } from "@/domains/articles/article-schema";
import type { EntryItem, EntryKind } from "@/domains/identity/entry-kinds";
import {
  defaultConfig,
  normalizeConfig,
  websiteConfigSchema,
  type ThemeId,
  type WebsiteStatus,
} from "@/domains/website/config";
import {
  buildPublishedContent,
  defaultSeo,
  publishProblems,
  selectedArticles,
  stableStringify,
  type IdentitySource,
  type PublishProblem,
} from "@/domains/website/build-published";
import {
  changeSlug,
  createSite,
  findLiveBySlug,
  findOwnSnapshot,
  findSite,
  isSlugLive,
  publish,
  saveDraft,
  unpublish,
  WebsitePersistenceError,
  WebsiteSlugTakenError,
  type SiteRow,
} from "@/lib/db/query";
import {
  normalizeSlug,
  validateSlug,
  type SlugProblem,
} from "@/domains/website/slug";
import { z } from "zod";
import {
  cleanupPublishedImages,
  ownerImageUrl,
  preparePublishedImage,
  publishedImageUrl,
} from "@/domains/media/profile-image-service";
import {
  cleanupPublishedIntro,
  loadIntroRow,
  preparePublishedIntro,
  previewIntroFor,
  publishedIntroFor,
} from "@/domains/intro/intro-video-service";

export type WebsiteState = {
  status: WebsiteStatus;
  site: SiteRow | null;
  source: IdentitySource;
  /** Published content differs from what publishing now would produce. */
  hasUnpublishedChanges: boolean;
  problems: PublishProblem[];
};

async function loadSource() {
  const { client, user } = await getAuthenticatedDb();
  await ensureAccount(client, user.id);
  const profile =
    (await findProfile(client, user.id)) ??
    (await createEmptyProfile(client, user.id));
  const stored = await listEntries(client, user.id);
  const entries: Partial<Record<EntryKind, EntryItem[]>> = {};
  for (const e of stored) {
    (entries[e.kind] ??= []).push({
      id: e.id,
      isVisible: e.isVisible,
      data: e.data,
    });
  }
  const articles = (await listPublishedArticles(client, user.id)).map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    excerpt: displayExcerpt(a),
    coverImageUrl: a.coverImageUrl,
    category: a.category,
    publishedAt: a.publishedAt,
    readingMinutes: a.readingMinutes,
    version: a.version,
  }));
  // Drafts are built with the photo's PUBLISHED url, so they compare equal to the snapshot.
  const sourceProfile = {
    ...profile,
    profileImageUrl: publishedImageUrl(
      user.id,
      profile.profileImageUrl,
      "website",
    ),
  };
  const introRow = await loadIntroRow(client, user.id);
  return {
    client,
    user,
    source: {
      profile: sourceProfile,
      entries,
      articles,
      intro: publishedIntroFor(user.id, introRow),
    } satisfies IdentitySource,
    profile,
    introRow,
  };
}

/** A Folio Designer design is pinned into the snapshot (id, version and an exact spec copy). */
function withDesign(
  content: PublishedContent,
  design: ResolvedWebsiteDesign | null,
): PublishedContent {
  return design?.source === "designer"
    ? { ...content, design: design.pin }
    : content;
}

export async function getWebsiteState(): Promise<
  WebsiteState & { profileName: string | null }
> {
  const { client, user, source, profile } = await loadSource();
  const site = await findSite(client, user.id);
  const config = site?.config ?? defaultConfig();
  const content = withDesign(
    buildPublishedContent(source, config),
    site ? await resolveWebsiteDesign(client, site.theme) : null,
  );
  const snapshot = site ? await findOwnSnapshot(client, user.id) : null;
  const hasUnpublishedChanges =
    site?.status === "published" && snapshot
      ? stableStringify({ t: site.theme, c: content }) !==
        stableStringify({ t: snapshot.theme, c: snapshot.content })
      : false;
  return {
    status: site ? site.status : "not_created",
    site,
    source,
    hasUnpublishedChanges,
    problems: publishProblems(content),
    profileName: profile.displayName || profile.fullName,
  };
}

export type SlugCheck =
  | { ok: true; state: "available" | "yours" }
  | { ok: false; state: "invalid"; problem: SlugProblem }
  | { ok: false; state: "taken" };

/**
 * Availability as far as RLS lets any user see: reserved/format rules, the caller's own slug,
 * and slugs of LIVE sites. A slug claimed by someone's unpublished draft is invisible here, so
 * the unique constraint remains the final authority when the address is saved.
 */
export async function checkSlug(input: string): Promise<SlugCheck> {
  const slug = normalizeSlug(input);
  const problem = validateSlug(slug);
  if (problem) return { ok: false, state: "invalid", problem };
  const { client, user } = await getAuthenticatedDb();
  const own = await findSite(client, user.id);
  if (own?.slug === slug) return { ok: true, state: "yours" };
  const anon = await getAnonymousDb();
  if (await isSlugLive(anon, slug)) return { ok: false, state: "taken" };
  return { ok: true, state: "available" };
}

export class InvalidSlugError extends Error {
  constructor(public problem: SlugProblem) {
    super(problem);
    this.name = "InvalidSlugError";
  }
}

/** Claims the first address (creating the website) or changes it (atomically for a live site). */
export async function saveSlug(input: string): Promise<SiteRow> {
  const slug = normalizeSlug(input);
  const problem = validateSlug(slug);
  if (problem) throw new InvalidSlugError(problem);
  const { client, user } = await getAuthenticatedDb();
  await ensureAccount(client, user.id);
  const existing = await findSite(client, user.id);
  if (!existing) return createSite(client, user.id, slug, defaultConfig());
  if (existing.slug !== slug) await changeSlug(client, user.id, slug);
  return (await findSite(client, user.id))!;
}

const draftSchema = z.object({
  theme: designIdSchema,
  config: websiteConfigSchema,
});

export async function saveWebsiteDraft(input: unknown): Promise<void> {
  const { theme, config } = draftSchema.parse(input);
  const { client, user } = await getAuthenticatedDb();
  const site = await findSite(client, user.id);
  if (site?.theme !== theme) {
    // Switching design: it must be available now, and a PRO design needs PRO. Keeping the
    // saved one (even if it has since been retired, or PRO lapsed) is allowed (same rule as SQL).
    const design = await resolveWebsiteDesign(client, theme);
    if (!design || design.status !== "published")
      throw new DesignUnavailableError();
    if (design.pro && !(await hasActivePro(client, user.id)))
      throw new ProRequiredError();
  }
  await saveDraft(client, user.id, theme as ThemeId, normalizeConfig(config));
}

/** Designs for the Design tab: the code designs and published Folio Designer designs. */
export async function getWebsiteDesignOptions(keep?: string) {
  const { client } = await getAuthenticatedDb();
  return listWebsiteDesigns(client, keep);
}

export class PublishBlockedError extends Error {
  constructor(public problems: PublishProblem[]) {
    super("Add the missing information before publishing.");
    this.name = "PublishBlockedError";
  }
}

/** Builds the snapshot from My Identity + the SAVED draft right now, and publishes it. */
export async function publishWebsite(): Promise<Date> {
  const { client, user, source, profile, introRow } = await loadSource();
  const site = await findSite(client, user.id);
  if (!site) throw new PublishBlockedError([]);
  const design = await resolveWebsiteDesign(client, site.theme);
  if (!design) throw new DesignUnavailableError();
  const content = withDesign(
    buildPublishedContent(source, site.config),
    design,
  );
  const problems = publishProblems(content);
  if (problems.length) throw new PublishBlockedError(problems);
  if (design.pro && !(await hasActivePro(client, user.id)))
    throw new ProRequiredError();
  if (content.person.imageUrl)
    await preparePublishedImage(
      client,
      user.id,
      profile.profileImageUrl,
      "website",
    );
  if (content.person.intro)
    await preparePublishedIntro(client, user.id, introRow);
  const seo = defaultSeo(content);
  const publishedAt = await publish(client, {
    theme: site.theme,
    title: (site.config.seo.title || seo.title).slice(0, 200),
    description: (site.config.seo.description || seo.description).slice(0, 400),
    content,
    articleIds: selectedArticles(source, site.config).map((a) => a.id),
  });
  await cleanupPublishedImages(
    client,
    user.id,
    "website",
    content.person.imageUrl,
  );
  await cleanupPublishedIntro(client, user.id, content.person.intro);
  return publishedAt;
}

export async function unpublishWebsite(): Promise<void> {
  const { client, user } = await getAuthenticatedDb();
  await unpublish(client);
  await cleanupPublishedImages(client, user.id, "website", null);
  await cleanupPublishedIntro(client, user.id, undefined);
}

/**
 * Content for the owner's preview: current My Identity + saved draft (never published by
 * viewing). `theme` previews another available design without saving it.
 */
export async function getPreview(theme?: string) {
  const { client, user, source, profile, introRow } = await loadSource();
  const site = await findSite(client, user.id);
  if (!site) return null;
  let shownTheme = site.theme;
  let design = await resolveWebsiteDesign(client, site.theme);
  if (
    theme &&
    theme !== site.theme &&
    designIdSchema.safeParse(theme).success
  ) {
    const other = await resolveWebsiteDesign(client, theme);
    if (other?.status === "published") {
      shownTheme = theme;
      design = other;
    }
  }
  const content = withDesign(
    buildPublishedContent(source, site.config),
    design,
  );
  if (content.person.intro) {
    const intro = await previewIntroFor(client, user.id, introRow);
    content.person = { ...content.person, intro };
    if (!intro) delete content.person.intro;
  }
  // The public copy only exists after publishing; the owner's preview uses a signed URL.
  if (content.person.imageUrl) {
    const shown = await ownerImageUrl(client, user.id, profile.profileImageUrl);
    content.person = { ...content.person, imageUrl: shown ?? undefined };
    if (!shown) delete content.person.imageUrl;
  }
  return { theme: shownTheme, content };
}

/**
 * The signed-in person's own content for previewing a design in the Folio Designer: their
 * saved website settings (or the defaults) over their current My Identity. Never published.
 */
export async function getOwnContentForDesignPreview(): Promise<PublishedContent> {
  const { client, user, source, profile } = await loadSource();
  const site = await findSite(client, user.id);
  const content = buildPublishedContent(
    source,
    site?.config ?? defaultConfig(),
  );
  if (content.person.imageUrl) {
    const shown = await ownerImageUrl(client, user.id, profile.profileImageUrl);
    content.person = { ...content.person, imageUrl: shown ?? undefined };
    if (!shown) delete content.person.imageUrl;
  }
  delete content.person.intro;
  return content;
}

/** Public read: anonymous client, live rows only. */
export async function getPublicSite(slug: string) {
  if (validateSlug(slug)) return null;
  const client = await getAnonymousDb();
  return findLiveBySlug(client, normalizeSlug(slug));
}

export { WebsitePersistenceError, WebsiteSlugTakenError };
