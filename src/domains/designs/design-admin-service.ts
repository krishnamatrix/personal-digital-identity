import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  deleteDesignTemplate,
  findDesignTemplate,
  getAuthenticatedDb,
  insertDesignTemplate,
  insertDesignVersion,
  isPlatformAdmin,
  listDesignTemplates,
  listDesignVersions,
  updateDesignTemplate,
  type DesignTemplateRow,
} from "@/lib/db/query";
import { TEMPLATES, templateSpec } from "@/domains/website/templates";
import { CARD_DESIGNS, cardDesign } from "@/domains/cards/card-designs";
import { THEMES } from "@/domains/website/config";
import {
  CARD_DESIGN_CATEGORIES,
  DESIGN_SURFACES,
  WEBSITE_CATEGORIES,
  cardSpecFrom,
  designIdFrom,
  designIdSchema,
  specSchemaFor,
  websiteSpecFrom,
  type CardSpec,
  type DesignSurface,
  type WebsiteSpec,
} from "./design-spec";
import { designProblems, type DesignProblem } from "./design-checks";
import { generateDesign, isDesignAiAvailable } from "@/lib/ai/design-generator";

/**
 * Folio Designer (M14) for platform admins. Every function checks the caller is in
 * platform_admins (and RLS checks again on every row). Built-in designs are read-only; a
 * designer design is a draft until published, and each change is a new immutable version.
 */

export class NotPlatformAdminError extends Error {
  constructor() {
    super("This area is for Folioone platform admins.");
    this.name = "NotPlatformAdminError";
  }
}
export class DesignNotFoundError extends Error {
  constructor() {
    super("That design was not found.");
    this.name = "DesignNotFoundError";
  }
}
export class DesignNotReadyError extends Error {
  constructor(readonly problems: DesignProblem[]) {
    super(
      problems.length
        ? "Fix the readability problems before publishing."
        : "Save a version of this design first.",
    );
    this.name = "DesignNotReadyError";
  }
}

async function requireAdmin() {
  const session = await getAuthenticatedDb();
  if (!(await isPlatformAdmin(session.client, session.user.id)))
    throw new NotPlatformAdminError();
  return session;
}

/** For pages: is the signed-in person a platform admin? (Never throws for "no".) */
export async function currentUserIsAdmin(): Promise<boolean> {
  try {
    await requireAdmin();
    return true;
  } catch (error) {
    if (error instanceof NotPlatformAdminError) return false;
    throw error;
  }
}

export const surfaceSchema = z.enum(DESIGN_SURFACES);

/** Code designs an admin can start from (the 20 templates; the card designs). */
export function starterDesigns(surface: DesignSurface) {
  return surface === "website"
    ? TEMPLATES.map((t) => ({ id: t.id, label: t.label }))
    : CARD_DESIGNS.map((d) => ({ id: d.id, label: d.label }));
}

function starterSpec(
  surface: DesignSurface,
  from?: string,
): WebsiteSpec | CardSpec {
  if (surface === "website")
    return websiteSpecFrom(templateSpec(from ?? "") ?? TEMPLATES[0]);
  return cardSpecFrom(cardDesign(from ?? ""));
}

export type AdminVersion = {
  version: number;
  spec: WebsiteSpec | CardSpec | null;
  prompt: string | null;
  origin: "manual" | "ai";
  createdAt: string;
  problems: DesignProblem[];
};

export type AdminDesign = DesignTemplateRow & { versions: AdminVersion[] };

export async function listAdminDesigns(surface: DesignSurface) {
  const { client } = await requireAdmin();
  const rows = await listDesignTemplates(client, {
    surface,
    source: "designer",
  });
  return {
    designs: rows,
    builtInCount: surface === "website" ? THEMES.length : CARD_DESIGNS.length,
    aiAvailable: isDesignAiAvailable(),
  };
}

export async function getAdminDesign(
  surface: DesignSurface,
  id: string,
): Promise<AdminDesign | null> {
  if (!designIdSchema.safeParse(id).success) return null;
  const { client } = await requireAdmin();
  const row = await findDesignTemplate(client, surface, id);
  if (!row || row.source !== "designer") return null;
  const versions = await listDesignVersions(client, surface, id);
  const schema = specSchemaFor(surface);
  return {
    ...row,
    versions: versions.map((v) => {
      const spec = schema.safeParse(v.spec);
      return {
        version: v.version,
        spec: spec.success ? spec.data : null,
        prompt: v.prompt,
        origin: v.origin,
        createdAt: v.createdAt.toISOString(),
        problems: spec.success ? designProblems(surface, spec.data) : [],
      };
    }),
  };
}

const metaSchema = (surface: DesignSurface) =>
  z.object({
    label: z.string().trim().min(1).max(60),
    category: z.enum(
      surface === "website" ? WEBSITE_CATEGORIES : CARD_DESIGN_CATEGORIES,
    ),
    blurb: z.string().trim().max(300),
    tier: z.enum(["free", "pro"]),
  });

const createSchema = z.object({
  surface: surfaceSchema,
  label: z.string().trim().max(60).default(""),
  category: z.string().trim().max(30),
  tier: z.enum(["free", "pro"]),
  startFrom: z.string().trim().max(48).optional(),
  prompt: z.string().trim().max(2000).default(""),
});

function newId(label: string) {
  return `${designIdFrom(label)}-${randomBytes(3).toString("hex")}`;
}

/** Creates a draft design with version 1: from a prompt (AI), or a copy of a code design. */
export async function createDesign(
  input: unknown,
): Promise<{ surface: DesignSurface; id: string; problems: DesignProblem[] }> {
  const data = createSchema.parse(input);
  const { client } = await requireAdmin();
  const base = starterSpec(data.surface, data.startFrom);
  let spec = base;
  let label = data.label;
  let blurb = "";
  let problems: DesignProblem[] = [];
  let origin: "manual" | "ai" = "manual";
  if (data.prompt) {
    const generated = await generateDesign(
      data.surface,
      data.prompt,
      data.startFrom ? base : null,
    );
    spec = generated.spec;
    label ||= generated.name;
    blurb = generated.blurb;
    problems = generated.problems;
    origin = "ai";
  } else {
    problems = designProblems(data.surface, spec);
  }
  if (!label) label = "Untitled design";
  const meta = metaSchema(data.surface).parse({
    label,
    category: data.category,
    blurb,
    tier: data.tier,
  });
  const id = newId(meta.label);
  await insertDesignTemplate(client, { surface: data.surface, id, ...meta });
  await insertDesignVersion(client, {
    surface: data.surface,
    templateId: id,
    version: 1,
    spec,
    prompt: data.prompt || null,
    origin,
  });
  return { surface: data.surface, id, problems };
}

async function nextVersion(
  client: Awaited<ReturnType<typeof requireAdmin>>["client"],
  surface: DesignSurface,
  id: string,
) {
  const row = await findDesignTemplate(client, surface, id);
  if (!row || row.source !== "designer") throw new DesignNotFoundError();
  const versions = await listDesignVersions(client, surface, id);
  return (versions[0]?.version ?? 0) + 1;
}

/** Saves the editor's spec as a new version (validated by the schema; problems reported). */
export async function saveDesignVersion(
  surface: DesignSurface,
  id: string,
  rawSpec: unknown,
): Promise<{ version: number; problems: DesignProblem[] }> {
  const spec = specSchemaFor(surface).parse(rawSpec);
  const { client } = await requireAdmin();
  const version = await nextVersion(client, surface, id);
  await insertDesignVersion(client, {
    surface,
    templateId: id,
    version,
    spec,
    prompt: null,
    origin: "manual",
  });
  return { version, problems: designProblems(surface, spec) };
}

/** Prompt -> a new AI version, starting from `fromVersion` (or the newest) of this design. */
export async function generateDesignVersion(
  surface: DesignSurface,
  id: string,
  prompt: string,
  fromSpec: unknown,
): Promise<{ version: number; problems: DesignProblem[] }> {
  const text = z.string().trim().min(3).max(2000).parse(prompt);
  const base = specSchemaFor(surface).safeParse(fromSpec);
  const { client } = await requireAdmin();
  const version = await nextVersion(client, surface, id);
  const generated = await generateDesign(
    surface,
    text,
    base.success ? base.data : null,
  );
  await insertDesignVersion(client, {
    surface,
    templateId: id,
    version,
    spec: generated.spec,
    prompt: text,
    origin: "ai",
  });
  return { version, problems: generated.problems };
}

export async function updateDesignDetails(
  surface: DesignSurface,
  id: string,
  input: unknown,
): Promise<DesignTemplateRow> {
  const meta = metaSchema(surface).parse(input);
  const { client } = await requireAdmin();
  return updateDesignTemplate(client, surface, id, meta);
}

/** Makes `version` the live version (first publish or an update). Blocked by any problem. */
export async function publishDesign(
  surface: DesignSurface,
  id: string,
  version: number,
): Promise<DesignTemplateRow> {
  const design = await getAdminDesign(surface, id);
  if (!design) throw new DesignNotFoundError();
  const chosen = design.versions.find((v) => v.version === version);
  if (!chosen?.spec) throw new DesignNotReadyError([]);
  if (chosen.problems.length) throw new DesignNotReadyError(chosen.problems);
  const { client } = await requireAdmin();
  return updateDesignTemplate(client, surface, id, {
    status: "published",
    current_version: version,
  });
}

/** Retired: no longer offered; sites and cards that use it keep it. Restore re-publishes it. */
export async function setDesignRetired(
  surface: DesignSurface,
  id: string,
  retired: boolean,
): Promise<DesignTemplateRow> {
  const { client } = await requireAdmin();
  const row = await findDesignTemplate(client, surface, id);
  if (!row || row.source !== "designer") throw new DesignNotFoundError();
  return updateDesignTemplate(client, surface, id, {
    status: retired ? "retired" : "published",
  });
}

/** Only a design that was never published can be deleted (with its versions). */
export async function deleteDraftDesign(
  surface: DesignSurface,
  id: string,
): Promise<void> {
  const { client } = await requireAdmin();
  if (!(await deleteDesignTemplate(client, surface, id)))
    throw new DesignNotFoundError();
}
