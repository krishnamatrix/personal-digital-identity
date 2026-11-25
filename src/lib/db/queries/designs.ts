import "server-only";
import type { FolioneClient } from "@/lib/db/schema";
import { AuthorizationError } from "@/lib/supabase/server";
import type { DesignSurface } from "@/domains/designs/design-spec";
import { DesignUnavailableError } from "@/domains/designs/design-errors";

/**
 * Folio Designer (M14): platform admins, design templates and their immutable versions
 * (docs/sql/milestone-14/001-design-templates.sql). RLS decides what each caller sees: drafts
 * and every version only for admins; published / retired designs and the spec of their current
 * version for everyone signed in. Specs come back as `unknown` and are validated by the caller.
 */

export class DesignsNotInstalledError extends Error {
  constructor() {
    super("Folio Designer is being set up.");
    this.name = "DesignsNotInstalledError";
  }
}
export class DesignConflictError extends Error {
  constructor(readonly reason?: string) {
    super("Someone else changed this design. Reload and try again.");
    this.name = "DesignConflictError";
  }
}
export class DesignPersistenceError extends Error {
  readonly code?: string;
  constructor(code?: string) {
    super("We could not save the design. Please try again.");
    this.name = "DesignPersistenceError";
    this.code = code;
  }
}

const NOT_INSTALLED = new Set(["42P01", "PGRST205", "PGRST200", "42883"]);

function mapError(error: { code?: string; message?: string }): Error {
  if (error.code && NOT_INSTALLED.has(error.code))
    return new DesignsNotInstalledError();
  if (error.code === "23505" || error.code === "PT409")
    return new DesignConflictError(error.message);
  if (error.code === "PT422") return new DesignUnavailableError();
  if (
    error.code === "42501" ||
    error.code === "PGRST301" ||
    error.code === "23514"
  )
    return new AuthorizationError();
  return new DesignPersistenceError(error.code);
}

export type DesignTier = "free" | "pro";
export type DesignStatus = "draft" | "published" | "retired";

export type DesignTemplateRow = {
  surface: DesignSurface;
  id: string;
  source: "builtin" | "designer";
  label: string;
  category: string;
  blurb: string;
  tier: DesignTier;
  status: DesignStatus;
  currentVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
};

export type DesignVersionRow = {
  surface: DesignSurface;
  templateId: string;
  version: number;
  spec: unknown;
  prompt: string | null;
  origin: "manual" | "ai";
  createdAt: Date;
};

const TEMPLATE_COLUMNS =
  "surface,id,source,label,category,blurb,tier,status,current_version,created_at,updated_at,published_at";
const VERSION_COLUMNS =
  "surface,template_id,version,spec,prompt,origin,created_at";

function toTemplate(r: Record<string, unknown>): DesignTemplateRow {
  return {
    surface: r.surface === "card" ? "card" : "website",
    id: String(r.id),
    source: r.source === "builtin" ? "builtin" : "designer",
    label: String(r.label),
    category: String(r.category),
    blurb: String(r.blurb ?? ""),
    tier: r.tier === "free" ? "free" : "pro",
    status:
      r.status === "published" || r.status === "retired" ? r.status : "draft",
    currentVersion:
      typeof r.current_version === "number" ? r.current_version : null,
    createdAt: new Date(String(r.created_at)),
    updatedAt: new Date(String(r.updated_at)),
    publishedAt: r.published_at ? new Date(String(r.published_at)) : null,
  };
}

function toVersion(r: Record<string, unknown>): DesignVersionRow {
  return {
    surface: r.surface === "card" ? "card" : "website",
    templateId: String(r.template_id),
    version: Number(r.version),
    spec: r.spec,
    prompt: typeof r.prompt === "string" ? r.prompt : null,
    origin: r.origin === "ai" ? "ai" : "manual",
    createdAt: new Date(String(r.created_at)),
  };
}

/** Is the signed-in caller a platform admin? False when M14 is not installed yet. */
export async function isPlatformAdmin(
  client: FolioneClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("platform_admins")
    .select("account_id")
    .eq("account_id", userId)
    .maybeSingle();
  if (error) {
    if (error.code && NOT_INSTALLED.has(error.code)) return false;
    throw mapError(error);
  }
  return Boolean(data);
}

/** Designs the caller may see (RLS), optionally narrowed to a surface, source and statuses. */
export async function listDesignTemplates(
  client: FolioneClient,
  filter: {
    surface?: DesignSurface;
    source?: "builtin" | "designer";
    statuses?: DesignStatus[];
  } = {},
): Promise<DesignTemplateRow[]> {
  let query = client.from("design_templates").select(TEMPLATE_COLUMNS);
  if (filter.surface) query = query.eq("surface", filter.surface);
  if (filter.source) query = query.eq("source", filter.source);
  if (filter.statuses) query = query.in("status", filter.statuses);
  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw mapError(error);
  return (data ?? []).map((r) => toTemplate(r as Record<string, unknown>));
}

export async function findDesignTemplate(
  client: FolioneClient,
  surface: DesignSurface,
  id: string,
): Promise<DesignTemplateRow | null> {
  const { data, error } = await client
    .from("design_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("surface", surface)
    .eq("id", id)
    .maybeSingle();
  if (error) throw mapError(error);
  return data ? toTemplate(data as Record<string, unknown>) : null;
}

/** Version rows the caller may see for one design, newest first. */
export async function listDesignVersions(
  client: FolioneClient,
  surface: DesignSurface,
  id: string,
): Promise<DesignVersionRow[]> {
  const { data, error } = await client
    .from("design_template_versions")
    .select(VERSION_COLUMNS)
    .eq("surface", surface)
    .eq("template_id", id)
    .order("version", { ascending: false })
    .limit(200);
  if (error) throw mapError(error);
  return (data ?? []).map((r) => toVersion(r as Record<string, unknown>));
}

export async function findDesignVersion(
  client: FolioneClient,
  surface: DesignSurface,
  id: string,
  version: number,
): Promise<DesignVersionRow | null> {
  const { data, error } = await client
    .from("design_template_versions")
    .select(VERSION_COLUMNS)
    .eq("surface", surface)
    .eq("template_id", id)
    .eq("version", version)
    .maybeSingle();
  if (error) throw mapError(error);
  return data ? toVersion(data as Record<string, unknown>) : null;
}

/**
 * Specs of the CURRENT version of several designs in one round trip. RLS lets a non-admin
 * see only current versions of live designs; the version filter keeps admins to them too.
 */
export async function listCurrentDesignVersions(
  client: FolioneClient,
  surface: DesignSurface,
  designs: { id: string; version: number }[],
): Promise<DesignVersionRow[]> {
  if (designs.length === 0) return [];
  const { data, error } = await client
    .from("design_template_versions")
    .select(VERSION_COLUMNS)
    .eq("surface", surface)
    .in(
      "template_id",
      designs.map((d) => d.id),
    )
    .in("version", [...new Set(designs.map((d) => d.version))])
    .limit(1000);
  if (error) throw mapError(error);
  const wanted = new Map(designs.map((d) => [d.id, d.version]));
  return (data ?? [])
    .map((r) => toVersion(r as Record<string, unknown>))
    .filter((v) => wanted.get(v.templateId) === v.version);
}

export async function insertDesignTemplate(
  client: FolioneClient,
  row: {
    surface: DesignSurface;
    id: string;
    label: string;
    category: string;
    blurb: string;
    tier: DesignTier;
  },
): Promise<void> {
  const { error } = await client.from("design_templates").insert(row);
  if (error) throw mapError(error);
}

export async function updateDesignTemplate(
  client: FolioneClient,
  surface: DesignSurface,
  id: string,
  patch: Partial<{
    label: string;
    category: string;
    blurb: string;
    tier: DesignTier;
    status: DesignStatus;
    current_version: number;
  }>,
): Promise<DesignTemplateRow> {
  const { data, error } = await client
    .from("design_templates")
    .update(patch)
    .eq("surface", surface)
    .eq("id", id)
    .select(TEMPLATE_COLUMNS)
    .maybeSingle();
  if (error) throw mapError(error);
  if (!data) throw new AuthorizationError();
  return toTemplate(data as Record<string, unknown>);
}

/** Appends version `version` (the trigger insists on max + 1, so a race fails with a conflict). */
export async function insertDesignVersion(
  client: FolioneClient,
  row: {
    surface: DesignSurface;
    templateId: string;
    version: number;
    spec: unknown;
    prompt: string | null;
    origin: "manual" | "ai";
  },
): Promise<void> {
  const { error } = await client.from("design_template_versions").insert({
    surface: row.surface,
    template_id: row.templateId,
    version: row.version,
    spec: row.spec,
    prompt: row.prompt,
    origin: row.origin,
  });
  if (error) throw mapError(error);
}

/** Deletes a design that was never published (its versions go with it). */
export async function deleteDesignTemplate(
  client: FolioneClient,
  surface: DesignSurface,
  id: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("design_templates")
    .delete()
    .eq("surface", surface)
    .eq("id", id)
    .select("id");
  if (error) throw mapError(error);
  return (data ?? []).length > 0;
}
