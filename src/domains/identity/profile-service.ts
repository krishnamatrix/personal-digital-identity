import "server-only";
import { createAuthenticatedClient } from "@/lib/supabase/server";
import {
  createEmptyProfile,
  ensureAccount,
  findProfile,
  updateProfile,
} from "@/domains/identity/profile-repository";
import { profileInputSchema } from "@/domains/identity/profile-schema";

export async function getOwnProfile() {
  const { client, user } = await createAuthenticatedClient();
  await ensureAccount(client, user.id);

  return (
    (await findProfile(client, user.id)) ??
    (await createEmptyProfile(client, user.id))
  );
}

export async function updateOwnProfile(input: unknown) {
  const parsed = profileInputSchema.parse(input);
  const { client, user } = await createAuthenticatedClient();

  await ensureAccount(client, user.id);
  await createEmptyProfile(client, user.id);
  return updateProfile(client, user.id, parsed);
}
