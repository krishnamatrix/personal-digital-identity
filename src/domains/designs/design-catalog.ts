import "server-only";
import type { FolioneClient } from "@/lib/db/schema";
import {
  DesignsNotInstalledError,
  findDesignTemplate,
  findDesignVersion,
  listCurrentDesignVersions,
  listDesignTemplates,
  type DesignTemplateRow,
} from "@/lib/db/query";
import { isProCardDesign, isProWebsiteTheme } from "@/domains/billing/plans";
import { THEMES, isThemeId } from "@/domains/website/config";
import { templateSpec, type TemplateSpec } from "@/domains/website/templates";
import {
  CARD_DESIGNS,
  isBuiltInCardDesign,
  type CardDesign,
} from "@/domains/cards/card-designs";
import {
  cardSpecSchema,
  toCardDesign,
  toTemplateSpec,
  websiteSpecSchema,
  type CardDesignOption,
  type PinnedCardDesign,
  type PinnedWebsiteDesign,
  type WebsiteDesignOption,
} from "./design-spec";

export type { CardDesignOption, WebsiteDesignOption };
import { logLoadError } from "@/lib/server-log";

/**
 * Every design a person can choose: the code designs (drawn by the app, tiers in plans.ts),
 * then published Folio Designer designs from the database, each with the spec of its current
 * version. If M14 is not installed yet, only the code designs are offered.
 */

async function designerRows(
  client: FolioneClient,
  surface: "website" | "card",
  keep?: string,
) {
  try {
    const rows = await listDesignTemplates(client, {
      surface,
      source: "designer",
      statuses: ["published", "retired"],
    });
    const shown = rows.filter(
      (r) =>
        r.currentVersion !== null &&
        (r.status === "published" || r.id === keep),
    );
    const versions = await listCurrentDesignVersions(
      client,
      surface,
      shown.map((r) => ({ id: r.id, version: r.currentVersion! })),
    );
    const spec = new Map(versions.map((v) => [v.templateId, v.spec]));
    return shown
      .map((row) => ({ row, spec: spec.get(row.id) }))
      .filter((x) => x.spec !== undefined)
      .sort((a, b) => a.row.label.localeCompare(b.row.label));
  } catch (error) {
    if (!(error instanceof DesignsNotInstalledError))
      logLoadError(`design-catalog:${surface}`, error);
    return [];
  }
}

export async function listWebsiteDesigns(
  client: FolioneClient,
  keep?: string,
): Promise<WebsiteDesignOption[]> {
  const builtIn: WebsiteDesignOption[] = THEMES.map((t) => ({
    id: t.id,
    label: t.label,
    category: t.category,
    blurb: t.blurb,
    pro: isProWebsiteTheme(t.id),
    source: "builtin",
  }));
  const designer: WebsiteDesignOption[] = [];
  for (const { row, spec } of await designerRows(client, "website", keep)) {
    const parsed = websiteSpecSchema.safeParse(spec);
    if (!parsed.success) continue;
    designer.push({
      id: row.id,
      label: row.label,
      category: row.category,
      blurb: row.blurb,
      pro: row.tier === "pro",
      source: "designer",
      retired: row.status === "retired" || undefined,
      spec: toTemplateSpec(row, parsed.data),
    });
  }
  return [...builtIn, ...designer];
}

export async function listCardDesigns(
  client: FolioneClient,
  keep?: string,
): Promise<CardDesignOption[]> {
  const builtIn: CardDesignOption[] = CARD_DESIGNS.map((d) => ({
    ...d,
    pro: isProCardDesign(d.id),
    source: "builtin",
  }));
  const designer: CardDesignOption[] = [];
  for (const { row, spec } of await designerRows(client, "card", keep)) {
    const parsed = cardSpecSchema.safeParse(spec);
    if (!parsed.success) continue;
    designer.push({
      ...toCardDesign(row, parsed.data),
      pro: row.tier === "pro",
      source: "designer",
      retired: row.status === "retired" || undefined,
    });
  }
  return [...builtIn, ...designer];
}

export type ResolvedWebsiteDesign =
  | { source: "builtin"; id: string; pro: boolean; status: "published" }
  | {
      source: "designer";
      id: string;
      pro: boolean;
      status: "published" | "retired";
      pin: PinnedWebsiteDesign;
      spec: TemplateSpec;
    };

export type ResolvedCardDesign =
  | {
      source: "builtin";
      id: string;
      pro: boolean;
      status: "published";
      design: CardDesign;
    }
  | {
      source: "designer";
      id: string;
      pro: boolean;
      status: "published" | "retired";
      pin: PinnedCardDesign;
      design: CardDesign;
    };

async function liveDesigner(
  client: FolioneClient,
  surface: "website" | "card",
  id: string,
): Promise<{ row: DesignTemplateRow; spec: unknown } | null> {
  let row: DesignTemplateRow | null;
  try {
    row = await findDesignTemplate(client, surface, id);
  } catch (error) {
    if (error instanceof DesignsNotInstalledError) return null;
    throw error;
  }
  if (
    !row ||
    row.source !== "designer" ||
    row.status === "draft" ||
    row.currentVersion === null
  )
    return null;
  const version = await findDesignVersion(
    client,
    surface,
    id,
    row.currentVersion,
  );
  return version ? { row, spec: version.spec } : null;
}

/** The design behind a website theme id, or null if it does not exist / is not visible. */
export async function resolveWebsiteDesign(
  client: FolioneClient,
  id: string,
): Promise<ResolvedWebsiteDesign | null> {
  if (isThemeId(id))
    return {
      source: "builtin",
      id,
      pro: isProWebsiteTheme(id),
      status: "published",
    };
  if (templateSpec(id)) return null;
  const live = await liveDesigner(client, "website", id);
  if (!live) return null;
  const spec = websiteSpecSchema.safeParse(live.spec);
  if (!spec.success) return null;
  return {
    source: "designer",
    id,
    pro: live.row.tier === "pro",
    status: live.row.status as "published" | "retired",
    pin: { id, version: live.row.currentVersion!, spec: spec.data },
    spec: toTemplateSpec(live.row, spec.data),
  };
}

export async function resolveCardDesign(
  client: FolioneClient,
  id: string,
): Promise<ResolvedCardDesign | null> {
  if (isBuiltInCardDesign(id))
    return {
      source: "builtin",
      id,
      pro: isProCardDesign(id),
      status: "published",
      design: CARD_DESIGNS.find((d) => d.id === id)!,
    };
  const live = await liveDesigner(client, "card", id);
  if (!live) return null;
  const spec = cardSpecSchema.safeParse(live.spec);
  if (!spec.success) return null;
  return {
    source: "designer",
    id,
    pro: live.row.tier === "pro",
    status: live.row.status as "published" | "retired",
    pin: { id, version: live.row.currentVersion!, spec: spec.data },
    design: toCardDesign(live.row, spec.data),
  };
}
