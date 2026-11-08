import { loadEnvConfig } from "@next/env";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { afterAll, describe, expect, it, type TestContext } from "vitest";

const ORIGINAL_ENVIRONMENT = { ...process.env };
const mutableEnvironment = process.env as Record<string, string | undefined>;
mutableEnvironment.NODE_ENV = "development";
loadEnvConfig(process.cwd(), true);

const ALLOWED_ENVIRONMENT_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "FOLIOONE_RLS_USER_A_EMAIL",
  "FOLIOONE_RLS_USER_A_PASSWORD",
  "FOLIOONE_RLS_USER_B_EMAIL",
  "FOLIOONE_RLS_USER_B_PASSWORD",
] as const;

const loadedEnvironment = Object.fromEntries(
  ALLOWED_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
);

for (const key of Object.keys(process.env)) {
  if (!Object.prototype.hasOwnProperty.call(ORIGINAL_ENVIRONMENT, key)) {
    delete process.env[key];
  }
}
Object.assign(process.env, ORIGINAL_ENVIRONMENT);
for (const key of ALLOWED_ENVIRONMENT_KEYS) {
  if (!ORIGINAL_ENVIRONMENT[key] && loadedEnvironment[key]) {
    process.env[key] = loadedEnvironment[key];
  }
}

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const emailA = process.env.FOLIOONE_RLS_USER_A_EMAIL;
const passwordA = process.env.FOLIOONE_RLS_USER_A_PASSWORD;
const emailB = process.env.FOLIOONE_RLS_USER_B_EMAIL;
const passwordB = process.env.FOLIOONE_RLS_USER_B_PASSWORD;

const PROFILE_COLUMNS =
  "account_id,display_name,headline,summary,location,website_url,linkedin_url,github_url,created_at,updated_at";

type ProfileRow = {
  account_id: string;
  display_name: string | null;
  headline: string | null;
  summary: string | null;
  location: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  created_at: string;
  updated_at: string;
};

type AccountRow = { id: string; created_at: string; updated_at: string };
type UserSession = {
  alias: "User A" | "User B";
  client: SupabaseClient;
  user: User;
  account: AccountRow;
  profile: ProfileRow;
  accountCreated: boolean;
  profileCreated: boolean;
};
type HostedSessions = { a: UserSession; b: UserSession };

class SetupSkip extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupSkip";
  }
}

let sessionsPromise: Promise<HostedSessions> | undefined;
let authSkipReason: string | undefined;
let sessionsForCleanup: HostedSessions | undefined;

const missingConfiguration = [
  !projectUrl && "NEXT_PUBLIC_SUPABASE_URL",
  !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  !emailA && "FOLIOONE_RLS_USER_A_EMAIL",
  !passwordA && "FOLIOONE_RLS_USER_A_PASSWORD",
  !emailB && "FOLIOONE_RLS_USER_B_EMAIL",
  !passwordB && "FOLIOONE_RLS_USER_B_PASSWORD",
].filter((value): value is string => Boolean(value));

describe("Hosted Supabase two-user RLS isolation", () => {
  async function sessions(context: TestContext): Promise<HostedSessions> {
    if (missingConfiguration.length > 0) {
      context.skip(
        `Hosted RLS test skipped: missing configuration ${missingConfiguration.join(", ")}.`,
      );
    }
    if (authSkipReason) context.skip(authSkipReason);

    sessionsPromise ??= createHostedSessions();
    try {
      return await sessionsPromise;
    } catch (error) {
      if (error instanceof SetupSkip) {
        authSkipReason = error.message;
        context.skip(authSkipReason);
      }
      throw error;
    }
  }

  it("prepares each user's account and profile without replacing existing data", async (context) => {
    const { a, b } = await sessions(context);

    expect(a.account.id === a.user.id).toBe(true);
    expect(a.profile.account_id === a.user.id).toBe(true);
    expect(b.account.id === b.user.id).toBe(true);
    expect(b.profile.account_id === b.user.id).toBe(true);

    console.info(
      `Initialization ready: User A account ${a.accountCreated ? "created" : "already existed"}, profile ${a.profileCreated ? "created" : "already existed"}; User B account ${b.accountCreated ? "created" : "already existed"}, profile ${b.profileCreated ? "created" : "already existed"}.`,
    );
  });

  it("allows each authenticated user to read only their own records", async (context) => {
    const { a, b } = await sessions(context);
    const [accountsA, profilesA, accountsB, profilesB] = await Promise.all([
      a.client.from("accounts").select("id"),
      a.client.from("identity_profiles").select("account_id"),
      b.client.from("accounts").select("id"),
      b.client.from("identity_profiles").select("account_id"),
    ]);

    for (const result of [accountsA, profilesA, accountsB, profilesB]) {
      expect(result.error === null).toBe(true);
    }
    expect(
      accountsA.data?.length === 1 && accountsA.data[0].id === a.user.id,
    ).toBe(true);
    expect(
      profilesA.data?.length === 1 &&
        profilesA.data[0].account_id === a.user.id,
    ).toBe(true);
    expect(
      accountsB.data?.length === 1 && accountsB.data[0].id === b.user.id,
    ).toBe(true);
    expect(
      profilesB.data?.length === 1 &&
        profilesB.data[0].account_id === b.user.id,
    ).toBe(true);
    console.info(
      "Own-record reads passed: each authenticated user received exactly their own account and profile row.",
    );
  });

  it("returns no User B rows to User A for cross-user reads", async (context) => {
    const { a, b } = await sessions(context);
    const [account, profile] = await Promise.all([
      a.client.from("accounts").select("id").eq("id", b.user.id),
      a.client
        .from("identity_profiles")
        .select("account_id")
        .eq("account_id", b.user.id),
    ]);

    expect(account.error === null && account.data?.length === 0).toBe(true);
    expect(profile.error === null && profile.data?.length === 0).toBe(true);
    console.info(
      "Cross-user reads passed: User A received zero User B account and profile rows.",
    );
  });

  it("denies User A updates to User B and independently verifies the original profile", async (context) => {
    const { a, b } = await sessions(context);
    const original = await readOwnProfile(b.client, b.user.id, "User B");
    const marker = `RLS isolation probe ${Date.now()}`;
    let updateReturnedRows = false;

    try {
      const attempt = await a.client
        .from("identity_profiles")
        .update({ headline: marker, updated_at: new Date().toISOString() })
        .eq("account_id", b.user.id)
        .select("account_id");
      updateReturnedRows = (attempt.data?.length ?? 0) > 0;

      const observedByB = await readOwnProfile(b.client, b.user.id, "User B");
      expect(updateReturnedRows).toBe(false);
      expect(profilesEqual(original, observedByB)).toBe(true);
      console.info(
        `Cross-user update passed: ${attempt.error ? `rejected (${attempt.error.code ?? "error"})` : "returned zero rows"}; User B independently confirmed the original profile remained unchanged.`,
      );
    } finally {
      await restoreProfileIfChanged(b.client, b.user.id, original);
    }
  });

  it("rejects cross-user account and profile inserts without changing User B", async (context) => {
    const { a, b } = await sessions(context);
    const originalAccount = await readOwnAccount(b.client, b.user.id, "User B");
    const originalProfile = await readOwnProfile(b.client, b.user.id, "User B");

    const [accountAttempt, profileAttempt] = await Promise.all([
      a.client.from("accounts").insert({ id: b.user.id }).select("id"),
      a.client
        .from("identity_profiles")
        .insert({ account_id: b.user.id, headline: "RLS insert probe" })
        .select("account_id"),
    ]);

    expect(["42501", "23505"].includes(accountAttempt.error?.code ?? "")).toBe(
      true,
    );
    expect(["42501", "23505"].includes(profileAttempt.error?.code ?? "")).toBe(
      true,
    );

    const [accountAfter, profileAfter] = await Promise.all([
      readOwnAccount(b.client, b.user.id, "User B"),
      readOwnProfile(b.client, b.user.id, "User B"),
    ]);
    expect(accountsEqual(originalAccount, accountAfter)).toBe(true);
    expect(profilesEqual(originalProfile, profileAfter)).toBe(true);
    console.info(
      `Cross-user inserts passed: accounts ${describeInsertResult(accountAttempt.error?.code)}, identity_profiles ${describeInsertResult(profileAttempt.error?.code)}; User B's account and profile remained unchanged.`,
    );
  });

  it("denies anonymous reads and writes to private identity records", async (context) => {
    const { a, b } = await sessions(context);
    const anonymous = createClient(projectUrl!, anonKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "folioone-rls-anonymous-session",
      },
    });

    const [accountsRead, profilesRead] = await Promise.all([
      anonymous.from("accounts").select("id"),
      anonymous.from("identity_profiles").select("account_id"),
    ]);
    expect(readWasDenied(accountsRead)).toBe(true);
    expect(readWasDenied(profilesRead)).toBe(true);

    const [accountInsert, profileInsert] = await Promise.all([
      anonymous.from("accounts").insert({ id: a.user.id }).select("id"),
      anonymous
        .from("identity_profiles")
        .insert({ account_id: a.user.id, headline: "Anonymous RLS probe" })
        .select("account_id"),
    ]);
    expect(accountInsert.error?.code === "42501").toBe(true);
    expect(profileInsert.error?.code === "42501").toBe(true);

    const [accountAfter, profileAfter, bProfileAfter] = await Promise.all([
      readOwnAccount(a.client, a.user.id, "User A"),
      readOwnProfile(a.client, a.user.id, "User A"),
      readOwnProfile(b.client, b.user.id, "User B"),
    ]);
    expect(accountsEqual(a.account, accountAfter)).toBe(true);
    expect(profilesEqual(a.profile, profileAfter)).toBe(true);
    expect(profilesEqual(b.profile, bProfileAfter)).toBe(true);
    console.info(
      `Anonymous access passed: accounts read ${describeReadResult(accountsRead)}, profiles read ${describeReadResult(profilesRead)}; both writes were rejected with SQLSTATE 42501; both users' rows remained unchanged.`,
    );
  });

  it("keeps User A and User B sessions independent and cannot use altered IDs to cross the boundary", async (context) => {
    const { a, b } = await sessions(context);
    const [verifiedA, verifiedB] = await Promise.all([
      a.client.auth.getUser(),
      b.client.auth.getUser(),
    ]);

    expect(
      verifiedA.error === null && verifiedA.data.user?.id === a.user.id,
    ).toBe(true);
    expect(
      verifiedB.error === null && verifiedB.data.user?.id === b.user.id,
    ).toBe(true);

    const alteredIdRead = await a.client
      .from("identity_profiles")
      .select("account_id")
      .eq("account_id", b.user.id);
    expect(
      alteredIdRead.error === null && alteredIdRead.data?.length === 0,
    ).toBe(true);

    const signOutA = await a.client.auth.signOut({ scope: "local" });
    expect(signOutA.error === null).toBe(true);
    const [signedOutA, stillSignedInB, bOwnRows] = await Promise.all([
      a.client.auth.getUser(),
      b.client.auth.getUser(),
      b.client.from("identity_profiles").select("account_id"),
    ]);

    expect(signedOutA.data.user === null).toBe(true);
    expect(
      stillSignedInB.error === null &&
        stillSignedInB.data.user?.id === b.user.id,
    ).toBe(true);
    expect(
      bOwnRows.data?.length === 1 && bOwnRows.data[0].account_id === b.user.id,
    ).toBe(true);
    console.info(
      "Session separation passed: Auth verified distinct User A/User B sessions; signing out A left B authenticated and able to read B's own profile.",
    );
  });

  afterAll(async () => {
    if (!sessionsForCleanup) return;
    const [signOutA, signOutB] = await Promise.all([
      sessionsForCleanup.a.client.auth.signOut({ scope: "local" }),
      sessionsForCleanup.b.client.auth.signOut({ scope: "local" }),
    ]);
    if (signOutA.error) {
      throw new Error(
        `Test-session cleanup failed for User A (${signOutA.error.code ?? "unknown"}).`,
      );
    }
    if (signOutB.error) {
      throw new Error(
        `Test-session cleanup failed for User B (${signOutB.error.code ?? "unknown"}).`,
      );
    }
  });
});

async function createHostedSessions(): Promise<HostedSessions> {
  const clientA = createUserClient("user-a");
  const clientB = createUserClient("user-b");
  const userA = await signInAndVerify(clientA, emailA!, passwordA!, "User A");
  const userB = await signInAndVerify(clientB, emailB!, passwordB!, "User B");

  if (userA.id === userB.id) {
    throw new Error("Hosted RLS validation requires two distinct Auth users.");
  }

  const [a, b] = await Promise.all([
    initializeOwnIdentity(clientA, userA, "User A"),
    initializeOwnIdentity(clientB, userB, "User B"),
  ]);
  sessionsForCleanup = { a, b };
  return { a, b };
}

function createUserClient(alias: "user-a" | "user-b"): SupabaseClient {
  return createClient(projectUrl!, anonKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `folioone-rls-${alias}`,
    },
  });
}

async function signInAndVerify(
  client: SupabaseClient,
  email: string,
  password: string,
  alias: "User A" | "User B",
): Promise<User> {
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    if (
      ["invalid_credentials", "email_not_confirmed"].includes(
        signInError.code ?? "",
      )
    ) {
      throw new SetupSkip(
        `Hosted RLS test skipped: ${alias} could not authenticate. Confirm both dedicated users exist, their email addresses are confirmed, and their secure test credentials are current.`,
      );
    }
    throw new Error(
      `${alias} Supabase Auth request failed (${signInError.code ?? "unknown"}).`,
    );
  }

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new Error(
      `${alias} Auth session verification failed (${error?.code ?? "unknown"}).`,
    );
  }
  return data.user;
}

async function initializeOwnIdentity(
  client: SupabaseClient,
  user: User,
  alias: "User A" | "User B",
): Promise<UserSession> {
  const accountResult = await client
    .from("accounts")
    .insert({ id: user.id })
    .select("id,created_at,updated_at")
    .maybeSingle();

  let accountCreated = accountResult.error === null;
  if (accountResult.error?.code === "23505") accountCreated = false;
  else if (accountResult.error) {
    throw new Error(
      `${alias} account initialization failed (${accountResult.error.code}).`,
    );
  }

  const account = await readOwnAccount(client, user.id, alias);
  const existingProfile = await readOwnProfileMaybe(client, user.id, alias);
  let profile = existingProfile;
  let profileCreated = false;

  if (!profile) {
    const insertion = await client
      .from("identity_profiles")
      .insert({ account_id: user.id })
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (insertion.error?.code === "23505") {
      profile = await readOwnProfileMaybe(client, user.id, alias);
    } else if (insertion.error) {
      throw new Error(
        `${alias} profile initialization failed (${insertion.error.code}).`,
      );
    } else {
      profile = insertion.data as ProfileRow | null;
      profileCreated = Boolean(profile);
    }
  }

  if (!profile) {
    throw new Error(`${alias} profile initialization returned no own profile.`);
  }
  return {
    alias,
    client,
    user,
    account,
    profile,
    accountCreated,
    profileCreated,
  };
}

async function readOwnAccount(
  client: SupabaseClient,
  userId: string,
  alias: "User A" | "User B",
): Promise<AccountRow> {
  const { data, error } = await client
    .from("accounts")
    .select("id,created_at,updated_at")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) {
    throw new Error(
      `${alias} account read failed (${error?.code ?? "no row"}).`,
    );
  }
  return data as AccountRow;
}

async function readOwnProfileMaybe(
  client: SupabaseClient,
  userId: string,
  alias: "User A" | "User B",
): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from("identity_profiles")
    .select(PROFILE_COLUMNS)
    .eq("account_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`${alias} profile read failed (${error.code}).`);
  }
  return data as ProfileRow | null;
}

async function readOwnProfile(
  client: SupabaseClient,
  userId: string,
  alias: "User A" | "User B",
): Promise<ProfileRow> {
  const profile = await readOwnProfileMaybe(client, userId, alias);
  if (!profile) throw new Error(`${alias} profile read returned no own row.`);
  return profile;
}

async function restoreProfileIfChanged(
  client: SupabaseClient,
  userId: string,
  original: ProfileRow,
): Promise<void> {
  const current = await readOwnProfile(client, userId, "User B");
  const restoreHeadline = current.headline !== original.headline;
  const restoreUpdatedAt = current.updated_at !== original.updated_at;
  if (restoreHeadline || restoreUpdatedAt) {
    const patch: { headline?: string | null; updated_at?: string } = {};
    if (restoreHeadline) patch.headline = original.headline;
    if (restoreUpdatedAt) patch.updated_at = original.updated_at;
    const { error } = await client
      .from("identity_profiles")
      .update(patch)
      .eq("account_id", userId);
    if (error) {
      throw new Error(
        "Cleanup failed: User B's test profile fields headline/updated_at could not be restored using User B's authenticated session.",
      );
    }
  }

  const independentlyVerified = await readOwnProfile(client, userId, "User B");
  if (
    independentlyVerified.headline !== original.headline ||
    independentlyVerified.updated_at !== original.updated_at
  ) {
    throw new Error(
      "Cleanup failed: User B's test profile fields headline/updated_at could not be verified as restored using User B's authenticated session.",
    );
  }
}

function readWasDenied(result: {
  data: unknown[] | null;
  error: { code?: string } | null;
}): boolean {
  if (!result.error) return (result.data?.length ?? 0) === 0;
  return ["42501", "PGRST301"].includes(result.error.code ?? "");
}

function profilesEqual(left: ProfileRow, right: ProfileRow): boolean {
  return (
    left.account_id === right.account_id &&
    left.display_name === right.display_name &&
    left.headline === right.headline &&
    left.summary === right.summary &&
    left.location === right.location &&
    left.website_url === right.website_url &&
    left.linkedin_url === right.linkedin_url &&
    left.github_url === right.github_url &&
    left.created_at === right.created_at &&
    left.updated_at === right.updated_at
  );
}

function accountsEqual(left: AccountRow, right: AccountRow): boolean {
  return (
    left.id === right.id &&
    left.created_at === right.created_at &&
    left.updated_at === right.updated_at
  );
}

function describeInsertResult(code: string | undefined): string {
  if (code === "42501") return "RLS/privilege denied (42501)";
  if (code === "23505") return "blocked by existing-row uniqueness (23505)";
  return `unexpected denial (${code ?? "unknown"})`;
}

function describeReadResult(result: {
  data: unknown[] | null;
  error: { code?: string } | null;
}): string {
  return result.error
    ? `denied (${result.error.code ?? "error"})`
    : `${result.data?.length ?? 0} rows`;
}
