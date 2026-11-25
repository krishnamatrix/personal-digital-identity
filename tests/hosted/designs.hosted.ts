import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  DesignConflictError,
  deleteDesignTemplate,
  findDesignVersion,
  insertDesignTemplate,
  insertDesignVersion,
  isPlatformAdmin,
  listDesignTemplates,
  updateDesignTemplate,
} from "@/lib/db/queries/designs";
import {
  createSite,
  findLiveBySlug,
  findSite,
  publish,
  saveDraft,
} from "@/lib/db/queries/website";
import {
  createCard,
  findLiveCardBySlug,
  publishCard,
} from "@/lib/db/queries/cards";
import { ensureAccount } from "@/lib/db/queries/identity";
import { ProRequiredError } from "@/domains/billing/plans";
import { DesignUnavailableError } from "@/domains/designs/design-errors";
import {
  cardSpecFrom,
  websiteSpecFrom,
  type CardSpec,
  type WebsiteSpec,
} from "@/domains/designs/design-spec";
import { SAMPLE_SITE } from "@/domains/designs/sample-content";
import { SAMPLE_CARD } from "@/domains/cards/card-content";
import { TEMPLATES } from "@/domains/website/templates";
import { CARD_DESIGNS } from "@/domains/cards/card-designs";
import { defaultConfig } from "@/domains/website/config";
import { defaultCardConfig } from "@/domains/cards/card-config";
import { AuthorizationError } from "@/lib/supabase/server";
import { folioneDbOptions, type FolioneClient } from "../../src/lib/db/schema";
import { setLocalAdmin, setLocalPro } from "../helpers/local-psql";

/**
 * LOCAL Supabase only (run by `pnpm validate`): the Folio Designer tables (M14) against real
 * Postgres + PostgREST and real Auth, through the app's own query modules. Two throwaway
 * accounts: a platform admin (granted here with psql) and an ordinary Free account.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const adminWho = {
  email: process.env.FOLIOONE_DESIGN_ADMIN_EMAIL!,
  password: process.env.FOLIOONE_DESIGN_ADMIN_PASSWORD!,
};
const userWho = {
  email: process.env.FOLIOONE_DESIGN_USER_EMAIL!,
  password: process.env.FOLIOONE_DESIGN_USER_PASSWORD!,
};
const ready = Boolean(
  url &&
    anonKey &&
    adminWho.email &&
    userWho.email &&
    process.env.FOLIOONE_LOCAL_DB_CONTAINER,
);
const options = {
  db: folioneDbOptions,
  auth: { persistSession: false, autoRefreshToken: false },
};

async function session(who: { email: string; password: string }) {
  const client: FolioneClient = createClient(url, anonKey, options);
  const { data, error } = await client.auth.signInWithPassword(who);
  if (error || !data.user) throw new Error(`sign-in failed for ${who.email}`);
  await ensureAccount(client, data.user.id);
  return { client, id: data.user.id };
}

const tag = Date.now().toString(36);
const siteDesign = `harbour-${tag}`;
const draftDesign = `draft-only-${tag}`;
const cardId = `night-${tag}`;
const v1: WebsiteSpec = websiteSpecFrom(TEMPLATES[0]);
const v2: WebsiteSpec = {
  ...v1,
  layout: "sidebar",
  palette: { ...v1.palette, accent: "#1f4d3a" },
};
const cardSpec: CardSpec = cardSpecFrom(CARD_DESIGNS[0]);

describe.skipIf(!ready)("Folio Designer on the local stack", () => {
  let admin: Awaited<ReturnType<typeof session>>;
  let user: Awaited<ReturnType<typeof session>>;

  beforeAll(async () => {
    admin = await session(adminWho);
    user = await session(userWho);
    setLocalAdmin(userWho.email, false);
    setLocalPro(userWho.email, null);
  });

  it("refuses design writes from anyone who is not a platform admin", async () => {
    expect(await isPlatformAdmin(admin.client, admin.id)).toBe(false);
    await expect(
      insertDesignTemplate(admin.client, {
        surface: "website",
        id: siteDesign,
        label: "Harbour",
        category: "Minimal",
        blurb: "",
        tier: "pro",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    setLocalAdmin(adminWho.email, true);
    expect(await isPlatformAdmin(admin.client, admin.id)).toBe(true);
    expect(await isPlatformAdmin(user.client, user.id)).toBe(false);
  });

  it("lets an admin create designs with strictly numbered, immutable versions", async () => {
    for (const [id, label] of [
      [siteDesign, "Harbour"],
      [draftDesign, "Draft only"],
    ] as const)
      await insertDesignTemplate(admin.client, {
        surface: "website",
        id,
        label,
        category: "Minimal",
        blurb: "Calm.",
        tier: "pro",
      });
    // Version numbers must be 1, 2, 3, ... (the trigger refuses gaps).
    await expect(
      insertDesignVersion(admin.client, {
        surface: "website",
        templateId: siteDesign,
        version: 2,
        spec: v1,
        prompt: null,
        origin: "manual",
      }),
    ).rejects.toBeInstanceOf(DesignConflictError);
    await insertDesignVersion(admin.client, {
      surface: "website",
      templateId: siteDesign,
      version: 1,
      spec: v1,
      prompt: "calm harbour",
      origin: "ai",
    });
    await insertDesignVersion(admin.client, {
      surface: "website",
      templateId: draftDesign,
      version: 1,
      spec: v1,
      prompt: null,
      origin: "manual",
    });
    // A version that does not exist cannot be made live.
    await expect(
      updateDesignTemplate(admin.client, "website", siteDesign, {
        status: "published",
        current_version: 7,
      }),
    ).rejects.toBeInstanceOf(DesignConflictError);
    const live = await updateDesignTemplate(
      admin.client,
      "website",
      siteDesign,
      { status: "published", current_version: 1 },
    );
    expect(live.publishedAt).not.toBeNull();
    // No API role may change or delete a version row.
    const { error: upd } = await admin.client
      .from("design_template_versions")
      .update({ prompt: "rewritten" })
      .eq("template_id", siteDesign);
    expect(upd?.code).toBe("42501");
    // Built-in designs are read-only, even for admins.
    await expect(
      updateDesignTemplate(admin.client, "website", "professional", {
        tier: "pro",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    // A published design never goes back to draft.
    await expect(
      updateDesignTemplate(admin.client, "website", siteDesign, {
        status: "draft",
      }),
    ).rejects.toBeInstanceOf(DesignConflictError);
  });

  it("shows ordinary users only live designs and only their current version", async () => {
    const seen = await listDesignTemplates(user.client, {
      surface: "website",
      source: "designer",
    });
    expect(seen.map((d) => d.id)).toContain(siteDesign);
    expect(seen.map((d) => d.id)).not.toContain(draftDesign);
    const builtIns = await listDesignTemplates(user.client, {
      surface: "website",
      source: "builtin",
    });
    expect(builtIns).toHaveLength(23);
    expect(
      await findDesignVersion(user.client, "website", siteDesign, 1),
    ).not.toBeNull();
    await insertDesignVersion(admin.client, {
      surface: "website",
      templateId: siteDesign,
      version: 2,
      spec: v2,
      prompt: "sidebar, green",
      origin: "ai",
    });
    // v2 exists but is not live: invisible to users.
    expect(
      await findDesignVersion(user.client, "website", siteDesign, 2),
    ).toBeNull();
    expect(
      await findDesignVersion(user.client, "website", draftDesign, 1),
    ).toBeNull();
  });

  it("gates choosing and publishing a designer design (draft, PRO, exact pinned spec)", async () => {
    const slug = `site-${tag}`;
    await createSite(user.client, user.id, slug, defaultConfig());
    await expect(
      saveDraft(user.client, user.id, draftDesign, defaultConfig()),
    ).rejects.toBeInstanceOf(DesignUnavailableError);
    await expect(
      saveDraft(user.client, user.id, `nothing-${tag}`, defaultConfig()),
    ).rejects.toBeInstanceOf(DesignUnavailableError);
    await expect(
      saveDraft(user.client, user.id, siteDesign, defaultConfig()),
    ).rejects.toBeInstanceOf(ProRequiredError);
    setLocalPro(userWho.email, "30 days");
    await saveDraft(user.client, user.id, siteDesign, defaultConfig());
    expect((await findSite(user.client, user.id))?.theme).toBe(siteDesign);

    const args = (design?: unknown) => ({
      theme: siteDesign,
      title: "Jordan Avery",
      description: null,
      content: { ...SAMPLE_SITE, ...(design ? { design } : {}) } as never,
      articleIds: [],
    });
    // Missing pin, a hand-made spec, or a stale version are all refused.
    await expect(publish(user.client, args())).rejects.toBeInstanceOf(
      DesignUnavailableError,
    );
    await expect(
      publish(
        user.client,
        args({
          id: siteDesign,
          version: 1,
          spec: { ...v1, palette: { ...v1.palette, bg: "#ff00ff" } },
        }),
      ),
    ).rejects.toBeInstanceOf(DesignUnavailableError);
    await publish(user.client, args({ id: siteDesign, version: 1, spec: v1 }));
    const live = await findLiveBySlug(user.client, slug);
    expect(live?.theme).toBe(siteDesign);
    expect(live?.content.design).toEqual({
      id: siteDesign,
      version: 1,
      spec: v1,
    });
    // A code design can never carry a pin.
    await expect(
      publish(user.client, {
        ...args({ id: siteDesign, version: 1, spec: v1 }),
        theme: "professional",
      }),
    ).rejects.toBeInstanceOf(DesignUnavailableError);
  });

  it("keeps retired designs on sites that use them, and pins move only on republish", async () => {
    await updateDesignTemplate(admin.client, "website", siteDesign, {
      status: "retired",
    });
    const slug = `site-${tag}`;
    // The owner can still republish with the retired design...
    await publish(user.client, {
      theme: siteDesign,
      title: "Jordan Avery",
      description: null,
      content: {
        ...SAMPLE_SITE,
        design: { id: siteDesign, version: 1, spec: v1 },
      },
      articleIds: [],
    });
    // ...but nobody can newly choose it.
    setLocalPro(adminWho.email, "30 days");
    await createSite(admin.client, admin.id, `admin-${tag}`, defaultConfig());
    await expect(
      saveDraft(admin.client, admin.id, siteDesign, defaultConfig()),
    ).rejects.toBeInstanceOf(DesignUnavailableError);

    // Version 2 goes live: the published site still shows version 1 until republished.
    await updateDesignTemplate(admin.client, "website", siteDesign, {
      status: "published",
      current_version: 2,
    });
    expect(
      (await findLiveBySlug(user.client, slug))?.content.design?.version,
    ).toBe(1);
    await expect(
      publish(user.client, {
        theme: siteDesign,
        title: "Jordan Avery",
        description: null,
        content: {
          ...SAMPLE_SITE,
          design: { id: siteDesign, version: 1, spec: v1 },
        },
        articleIds: [],
      }),
    ).rejects.toBeInstanceOf(DesignUnavailableError);
    await publish(user.client, {
      theme: siteDesign,
      title: "Jordan Avery",
      description: null,
      content: {
        ...SAMPLE_SITE,
        design: { id: siteDesign, version: 2, spec: v2 },
      },
      articleIds: [],
    });
    expect(
      (await findLiveBySlug(user.client, slug))?.content.design?.version,
    ).toBe(2);
  });

  it("does the same for digital card designs", async () => {
    await insertDesignTemplate(admin.client, {
      surface: "card",
      id: cardId,
      label: "Night",
      category: "Creative",
      blurb: "",
      tier: "free",
    });
    await insertDesignVersion(admin.client, {
      surface: "card",
      templateId: cardId,
      version: 1,
      spec: cardSpec,
      prompt: null,
      origin: "manual",
    });
    await updateDesignTemplate(admin.client, "card", cardId, {
      status: "published",
      current_version: 1,
    });
    setLocalPro(userWho.email, null);
    const slug = `card-${tag}`;
    await createCard(
      user.client,
      user.id,
      { ...defaultCardConfig(), design: cardId },
      slug,
    );
    await publishCard(user.client, {
      type: "professional",
      design: cardId,
      content: {
        ...SAMPLE_CARD,
        design: { id: cardId, version: 1, spec: cardSpec },
      },
    });
    const live = await findLiveCardBySlug(user.client, slug);
    expect(live?.design).toBe(cardId);
    expect(live?.content.design?.spec).toEqual(cardSpec);
  });

  it("deletes only never-published drafts", async () => {
    expect(
      await deleteDesignTemplate(admin.client, "website", siteDesign),
    ).toBe(false);
    expect(
      await deleteDesignTemplate(admin.client, "website", draftDesign),
    ).toBe(true);
    expect(await deleteDesignTemplate(user.client, "card", cardId)).toBe(false);
  });
});
