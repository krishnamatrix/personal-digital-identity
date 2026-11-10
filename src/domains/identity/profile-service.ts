import "server-only";
import { getAuthenticatedDb } from "@/lib/db/query";
import {
  createEmptyProfile,
  ensureAccount,
  findProfile,
  updateProfile,
} from "@/lib/db/query";
import { profileInputSchema } from "@/domains/identity/profile-schema";
import {
  fieldsForStep,
  ONBOARDING_STEP_COUNT,
} from "@/domains/identity/onboarding-steps";

export async function getOwnProfile() {
  const { client, user } = await getAuthenticatedDb();
  await ensureAccount(client, user.id);

  return (
    (await findProfile(client, user.id)) ??
    (await createEmptyProfile(client, user.id))
  );
}

export async function updateOwnProfile(input: unknown) {
  const parsed = profileInputSchema.parse(input);
  const { client, user } = await getAuthenticatedDb();

  await ensureAccount(client, user.id);
  await createEmptyProfile(client, user.id);
  return updateProfile(client, user.id, parsed);
}

/** Profile plus the name given at sign-up, used to pre-fill the first onboarding step. */
export async function getOnboardingContext() {
  const { client, user } = await getAuthenticatedDb();
  await ensureAccount(client, user.id);
  const profile =
    (await findProfile(client, user.id)) ??
    (await createEmptyProfile(client, user.id));
  const meta = user.user_metadata as { full_name?: unknown } | null;
  const signupName =
    typeof meta?.full_name === "string" ? meta.full_name.slice(0, 120) : null;
  return { profile, signupName };
}

/**
 * Saves one onboarding step and advances the resume pointer. Only the fields that belong to
 * the step are accepted; progress never moves backwards.
 */
export async function saveOnboardingStep(
  step: number,
  values: Record<string, unknown>,
) {
  if (!Number.isInteger(step) || step < 1 || step > ONBOARDING_STEP_COUNT) {
    throw new RangeError("Unknown onboarding step.");
  }
  const allowed = new Set(fieldsForStep(step));
  const picked = Object.fromEntries(
    Object.entries(values).filter(([key]) => allowed.has(key)),
  );
  const { client, user } = await getAuthenticatedDb();
  await ensureAccount(client, user.id);
  const current =
    (await findProfile(client, user.id)) ??
    (await createEmptyProfile(client, user.id));
  const next = Math.min(ONBOARDING_STEP_COUNT, step + 1);
  const parsed = profileInputSchema.parse({
    ...picked,
    onboardingStep: Math.max(current.onboardingStep, next),
  });
  return updateProfile(client, user.id, parsed);
}

export async function completeOnboarding() {
  const { client, user } = await getAuthenticatedDb();
  await ensureAccount(client, user.id);
  await createEmptyProfile(client, user.id);
  return updateProfile(client, user.id, {
    onboardingStep: ONBOARDING_STEP_COUNT,
    onboardingCompletedAt: new Date().toISOString(),
  });
}
