import type { FolioneClient } from "@/lib/db-schema";
import { AuthorizationError } from "@/lib/supabase/server";
import {
  profileSchema,
  type IdentityProfile,
  type ProfileInput,
} from "@/domains/identity/profile-schema";

const PROFILE_COLUMNS =
  "account_id,display_name,headline,summary,location,website_url,linkedin_url,github_url,created_at,updated_at";

type QueryClient = FolioneClient;

export class ProfilePersistenceError extends Error {
  constructor() {
    super("We could not save or load your profile. Please try again.");
    this.name = "ProfilePersistenceError";
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
    headline: data.headline,
    summary: data.summary,
    location: data.location,
    websiteUrl: data.website_url,
    linkedinUrl: data.linkedin_url,
    githubUrl: data.github_url,
    createdAt: new Date(String(data.created_at)),
    updatedAt: new Date(String(data.updated_at)),
  });
}

function mapProfileError(error: { code?: string }): Error {
  if (error.code === "42501" || error.code === "PGRST301") {
    return new AuthorizationError();
  }
  return new ProfilePersistenceError();
}
