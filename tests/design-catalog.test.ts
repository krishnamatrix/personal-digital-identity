// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  listDesignTemplates: vi.fn(),
  listCurrentDesignVersions: vi.fn(),
  findDesignTemplate: vi.fn(),
  findDesignVersion: vi.fn(),
  listDesignVersions: vi.fn(),
  insertDesignTemplate: vi.fn(),
  insertDesignVersion: vi.fn(),
  updateDesignTemplate: vi.fn(),
  deleteDesignTemplate: vi.fn(),
  isPlatformAdmin: vi.fn(),
  getAuthenticatedDb: vi.fn(),
}));
vi.mock("@/lib/db/query", async () => ({
  ...(await vi.importActual("@/lib/db/queries/designs")),
  ...db,
}));
vi.mock("@/lib/server-log", () => ({ logLoadError: vi.fn() }));

import {
  listWebsiteDesigns,
  resolveCardDesign,
  resolveWebsiteDesign,
} from "@/domains/designs/design-catalog";
import {
  createDesign,
  DesignNotReadyError,
  NotPlatformAdminError,
  publishDesign,
  saveDesignVersion,
} from "@/domains/designs/design-admin-service";
import { DesignsNotInstalledError } from "@/lib/db/queries/designs";
import { cardSpecFrom, websiteSpecFrom } from "@/domains/designs/design-spec";
import { TEMPLATES } from "@/domains/website/templates";
import { CARD_DESIGNS } from "@/domains/cards/card-designs";
import { THEMES } from "@/domains/website/config";

const client = {} as never;
const spec = websiteSpecFrom(TEMPLATES[0]);
const row = (over: Record<string, unknown> = {}) => ({
  surface: "website",
  id: "harbour-1a2b3c",
  source: "designer",
  label: "Harbour",
  category: "Minimal",
  blurb: "Calm.",
  tier: "pro",
  status: "published",
  currentVersion: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: new Date(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.getAuthenticatedDb.mockResolvedValue({ client, user: { id: "admin" } });
  db.isPlatformAdmin.mockResolvedValue(true);
});

describe("design catalog", () => {
  it("lists the code designs, then live designer designs with their current spec", async () => {
    db.listDesignTemplates.mockResolvedValue([
      row(),
      row({ id: "broken-1", label: "Broken", currentVersion: 1 }),
      row({ id: "old-1", label: "Old", status: "retired", currentVersion: 1 }),
    ]);
    db.listCurrentDesignVersions.mockImplementation(
      async (
        _c: unknown,
        _s: unknown,
        wanted: { id: string; version: number }[],
      ) =>
        wanted.map((w) => ({
          templateId: w.id,
          version: w.version,
          spec: w.id === "broken-1" ? { layout: "nope" } : spec,
        })),
    );
    const designs = await listWebsiteDesigns(client);
    expect(
      designs.slice(0, THEMES.length).every((d) => d.source === "builtin"),
    ).toBe(true);
    const designer = designs.filter((d) => d.source === "designer");
    // Broken specs are skipped; retired ones are not offered.
    expect(designer.map((d) => d.id)).toEqual(["harbour-1a2b3c"]);
    expect(designer[0]).toMatchObject({ pro: true, label: "Harbour" });
    expect(designer[0]!.spec?.palette).toEqual(spec.palette);
    // ...unless it is the one this site already uses.
    const kept = await listWebsiteDesigns(client, "old-1");
    expect(kept.find((d) => d.id === "old-1")).toMatchObject({ retired: true });
  });

  it("falls back to the code designs before M14 is installed", async () => {
    db.listDesignTemplates.mockRejectedValue(new DesignsNotInstalledError());
    const designs = await listWebsiteDesigns(client);
    expect(designs).toHaveLength(THEMES.length);
  });

  it("resolves a design id to a code design or a pinned designer version", async () => {
    expect(await resolveWebsiteDesign(client, "noir")).toMatchObject({
      source: "builtin",
      pro: true,
    });
    expect(await resolveWebsiteDesign(client, "professional")).toMatchObject({
      pro: false,
    });
    db.findDesignTemplate.mockResolvedValue(row());
    db.findDesignVersion.mockResolvedValue({ version: 2, spec });
    expect(await resolveWebsiteDesign(client, "harbour-1a2b3c")).toMatchObject({
      source: "designer",
      status: "published",
      pin: { id: "harbour-1a2b3c", version: 2, spec },
    });
    db.findDesignTemplate.mockResolvedValue(row({ status: "draft" }));
    expect(await resolveWebsiteDesign(client, "harbour-1a2b3c")).toBeNull();
    db.findDesignTemplate.mockResolvedValue(null);
    expect(await resolveWebsiteDesign(client, "nothing-1")).toBeNull();
    const card = cardSpecFrom(CARD_DESIGNS[0]);
    db.findDesignTemplate.mockResolvedValue(
      row({ surface: "card", category: "Social" }),
    );
    db.findDesignVersion.mockResolvedValue({ version: 2, spec: card });
    expect(await resolveCardDesign(client, "night-1")).toMatchObject({
      source: "designer",
      design: { emboss: card.emboss, category: "Social" },
    });
  });
});

describe("design admin service", () => {
  it("refuses everyone who is not a platform admin", async () => {
    db.isPlatformAdmin.mockResolvedValue(false);
    await expect(
      createDesign({
        surface: "website",
        label: "X",
        category: "Bold",
        tier: "pro",
      }),
    ).rejects.toBeInstanceOf(NotPlatformAdminError);
    expect(db.insertDesignTemplate).not.toHaveBeenCalled();
  });

  it("creates a draft from a code starter without AI, as version 1", async () => {
    const made = await createDesign({
      surface: "website",
      label: "Quiet Harbour",
      category: "Minimal",
      tier: "free",
      startFrom: "noir",
    });
    expect(made.id).toMatch(/^quiet-harbour-[0-9a-f]{6}$/);
    expect(db.insertDesignTemplate).toHaveBeenCalledWith(client, {
      surface: "website",
      id: made.id,
      label: "Quiet Harbour",
      category: "Minimal",
      blurb: "",
      tier: "free",
    });
    const version = db.insertDesignVersion.mock.calls[0]![1];
    expect(version).toMatchObject({
      version: 1,
      origin: "manual",
      prompt: null,
    });
    expect(version.spec.palette).toEqual(
      TEMPLATES.find((t) => t.id === "noir")!.palette,
    );
  });

  it("numbers saved versions and blocks publishing an unreadable one", async () => {
    db.findDesignTemplate.mockResolvedValue(
      row({ status: "draft", currentVersion: null }),
    );
    db.listDesignVersions.mockResolvedValue([
      { version: 3, spec, createdAt: new Date() },
    ]);
    const saved = await saveDesignVersion("website", "harbour-1a2b3c", spec);
    expect(saved.version).toBe(4);
    const grey = { ...spec, palette: { ...spec.palette, ink: "#dddddd" } };
    db.listDesignVersions.mockResolvedValue([
      {
        version: 1,
        spec: grey,
        prompt: null,
        origin: "manual",
        createdAt: new Date(),
      },
    ]);
    await expect(
      publishDesign("website", "harbour-1a2b3c", 1),
    ).rejects.toBeInstanceOf(DesignNotReadyError);
    expect(db.updateDesignTemplate).not.toHaveBeenCalled();
    db.listDesignVersions.mockResolvedValue([
      {
        version: 1,
        spec,
        prompt: null,
        origin: "manual",
        createdAt: new Date(),
      },
    ]);
    db.updateDesignTemplate.mockResolvedValue(row());
    await publishDesign("website", "harbour-1a2b3c", 1);
    expect(db.updateDesignTemplate).toHaveBeenCalledWith(
      client,
      "website",
      "harbour-1a2b3c",
      { status: "published", current_version: 1 },
    );
  });
});
