import "server-only";
import type { FolioneClient } from "@/lib/db/schema";
import { AuthorizationError } from "@/lib/supabase/server";
import {
  profileSchema,
  type IdentityProfile,
  type ProfileInput,
} from "@/domains/identity/profile-schema";

const PROFILE_COLUMNS =
  "account_id,display_name,full_name,headline,summary,location,website_url,linkedin_url,github_url,profile_image_url,cover_image_url,contact_email,phone,current_designation,current_organization,industry,professional_summary,primary_purpose,onboarding_step,onboarding_completed_at,created_at,updated_at";

const CANONICAL_PERSONA_COLUMNS =
  "display_name,headline,summary,location,website_url,linkedin_url,github_url";

type QueryClient = FolioneClient;

const viewerProfileSchema = profileSchema.pick({
  displayName: true,
  fullName: true,
  headline: true,
});

export type ViewerProfile = Pick<
  IdentityProfile,
  "displayName" | "fullName" | "headline"
>;

/**
 * Workspace chrome must not depend on the full M4 onboarding/contact schema.
 * Preserve the saved full name on upgraded schemas; on a missing-column error,
 * try the baseline fields once. This compatibility read never creates a profile
 * or relaxes the schema requirements for profile editing.
 */
export async function findViewerProfile(
  client: QueryClient,
  verifiedUserId: string,
): Promise<ViewerProfile | null> {
  let { data, error } = await client
    .from("identity_profiles")
    .select("display_name,full_name,headline")
    .eq("account_id", verifiedUserId)
    .maybeSingle();

  if (error?.code === "42703" || error?.code === "PGRST204") {
    ({ data, error } = await client
      .from("identity_profiles")
      .select("display_name,headline")
      .eq("account_id", verifiedUserId)
      .maybeSingle());
  }

  if (error) throw mapProfileError(error);
  return data
    ? viewerProfileSchema.parse({
        displayName: data.display_name,
        fullName: data.full_name ?? null,
        headline: data.headline,
      })
    : null;
}

/**
 * Read-only lookup of the seven baseline identity columns used by Personas.
 * Selects only the M2 baseline columns so Persona flows work across both M2
 * and expanded M4+ schemas without failing on missing optional columns.
 */
export async function findCanonicalProfile(
  client: QueryClient,
  verifiedUserId: string,
): Promise<{
  displayName: string | null;
  headline: string | null;
  summary: string | null;
  location: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
} | null> {
  const { data, error } = await client
    .from("identity_profiles")
    .select(CANONICAL_PERSONA_COLUMNS)
    .eq("account_id", verifiedUserId)
    .maybeSingle();

  if (error) throw mapProfileError(error);
  if (!data) return null;
  return {
    displayName: data.display_name ?? null,
    headline: data.headline ?? null,
    summary: data.summary ?? null,
    location: data.location ?? null,
    websiteUrl: data.website_url ?? null,
    linkedinUrl: data.linkedin_url ?? null,
    githubUrl: data.github_url ?? null,
  };
}

export class ProfilePersistenceError extends Error {
  /** PostgREST / Postgres error code, kept for logs only (never shown to users). */
  readonly code?: string;
  constructor(code?: string) {
    super("We could not save or load your profile. Please try again.");
    this.name = "ProfilePersistenceError";
    this.code = code;
  }
}

export class ProfileNotFoundError extends Error {
  constructor() {
    super("Your profile could not be found. Reload the page and try again.");
    this.name = "ProfileNotFoundError";
  }
}

export async function ensureAccount(
  client: QueryClient,
  verifiedUserId: string,
) {
  const { error } = await client
    .from("accounts")
    .insert({ id: verifiedUserId });

  if (error && error.code !== "23505") {
    throw mapProfileError(error);
  }
}

export async function findProfile(
  client: QueryClient,
  verifiedUserId: string,
): Promise<IdentityProfile | null> {
  const { data, error } = await client
    .from("identity_profiles")
    .select(PROFILE_COLUMNS)
    .eq("account_id", verifiedUserId)
    .maybeSingle();

  if (error) throw mapProfileError(error);
  return data ? parseProfile(data) : null;
}

export async function createEmptyProfile(
  client: QueryClient,
  verifiedUserId: string,
): Promise<IdentityProfile> {
  const { data, error } = await client
    .from("identity_profiles")
    .insert({ account_id: verifiedUserId })
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (error?.code === "23505") {
    const existing = await findProfile(client, verifiedUserId);
    if (existing) return existing;
  } else if (error) {
    throw mapProfileError(error);
  } else if (data) {
    return parseProfile(data);
  }

  throw new ProfileNotFoundError();
}

export async function updateProfile(
  client: QueryClient,
  verifiedUserId: string,
  input: ProfileInput,
): Promise<IdentityProfile> {
  const updates = Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [toDatabaseColumn(key), value]),
  );

  if (Object.keys(updates).length === 0) {
    const existing = await findProfile(client, verifiedUserId);
    if (existing) return existing;
    throw new ProfileNotFoundError();
  }

  const { data, error } = await client
    .from("identity_profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("account_id", verifiedUserId)
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (error) throw mapProfileError(error);
  if (!data) throw new ProfileNotFoundError();
  return parseProfile(data);
}

function toDatabaseColumn(key: string): string {
  return key.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

function parseProfile(data: Record<string, unknown>): IdentityProfile {
  return profileSchema.parse({
    accountId: data.account_id,
    displayName: data.display_name,
    fullName: data.full_name,
    headline: data.headline,
    summary: data.summary,
    location: data.location,
    websiteUrl: data.website_url,
    linkedinUrl: data.linkedin_url,
    githubUrl: data.github_url,
    profileImageUrl: data.profile_image_url,
    coverImageUrl: data.cover_image_url,
    contactEmail: data.contact_email,
    phone: data.phone,
    currentDesignation: data.current_designation,
    currentOrganization: data.current_organization,
    industry: data.industry,
    professionalSummary: data.professional_summary,
    primaryPurpose: data.primary_purpose,
    onboardingStep: data.onboarding_step,
    onboardingCompletedAt: data.onboarding_completed_at
      ? new Date(String(data.onboarding_completed_at))
      : null,
    createdAt: new Date(String(data.created_at)),
    updatedAt: new Date(String(data.updated_at)),
  });
}

function mapProfileError(error: { code?: string }): Error {
  if (error.code === "42501" || error.code === "PGRST301") {
    return new AuthorizationError();
  }
  return new ProfilePersistenceError(error.code);
}
