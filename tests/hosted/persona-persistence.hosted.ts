import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabasePersonaRepository } from "@/domains/personas/persona-supabase-repository";
import {
  describePersonaRepositoryContract,
  type ContractWorld,
} from "../helpers/persona-repository-contract";
import {
  PROFILE_FIELD_KEYS,
  STARTER_SECTIONS,
} from "@/domains/personas/persona-constants";
import type { NormalizedPersonaCreate } from "@/domains/personas/persona-types";
import { folioneDbOptions, type FolioneClient } from "../../src/lib/db-schema";

/**
 * HOSTED PERSONA PERSISTENCE SUITE (M3C). AUTHORED, NOT EXECUTED.
 *
 * Runs against the hosted DEVELOPMENT Supabase project with real Auth sessions
 * and PostgREST, as two independent test users. It uses only the public URL, the
 * anon key and the two dedicated RLS test accounts: no service-role key, no
 * database URL, no administrative connection.
 *
 * It must NOT run until docs/sql/milestone-3c has been approved, executed and
 * verified (verify-catalog.sql) and a stage approval is given. A guard enforces
 * that: set FOLIOONE_PERSONA_SQL_EXECUTED=1 only after that has happened.
 *
 *   pnpm test:persona-db
 *
 * It creates only newly named test Personas and removes them afterwards. It reads
 * (never writes) the test user's Master Identity profile to prove it is unchanged.
 */

const ORIGINAL_ENVIRONMENT = { ...process.env };
const mutableEnvironment = process.env as Record<string, string | undefined>;
mutableEnvironment.NODE_ENV = "development";
loadEnvConfig(process.cwd(), true);
const ALLOWED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "FOLIOONE_RLS_USER_A_EMAIL",
  "FOLIOONE_RLS_USER_A_PASSWORD",
  "FOLIOONE_RLS_USER_B_EMAIL",
  "FOLIOONE_RLS_USER_B_PASSWORD",
  "FOLIOONE_PERSONA_SQL_EXECUTED",
  "FOLIOONE_PERSONA_004_EXECUTED",
] as const;
const loaded = Object.fromEntries(
  ALLOWED.map((key) => [key, process.env[key]]),
);
for (const key of Object.keys(process.env)) {
  if (!Object.prototype.hasOwnProperty.call(ORIGINAL_ENVIRONMENT, key))
    delete process.env[key];
}
Object.assign(process.env, ORIGINAL_ENVIRONMENT);
for (const key of ALLOWED) {
  if (!ORIGINAL_ENVIRONMENT[key] && loaded[key]) process.env[key] = loaded[key];
}

// Set only after 004 (stale-version SQLSTATE PT409) has been executed: until then a
// stale version signals 40001, which never returns through PostgREST.
const staleVersionDeployed = process.env.FOLIOONE_PERSONA_004_EXECUTED === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const emailA = process.env.FOLIOONE_RLS_USER_A_EMAIL;
const passwordA = process.env.FOLIOONE_RLS_USER_A_PASSWORD;
const emailB = process.env.FOLIOONE_RLS_USER_B_EMAIL;
const passwordB = process.env.FOLIOONE_RLS_USER_B_PASSWORD;
const ready =
  process.env.FOLIOONE_PERSONA_SQL_EXECUTED === "1" &&
  Boolean(url && anonKey && emailA && passwordA && emailB && passwordB);

type Actor = {
  client: FolioneClient;
  userId: string;
  token: string;
  repo: SupabasePersonaRepository;
};

/** Every request is bounded: a hung call fails in 15 s instead of consuming the test timeout. */
const boundedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(15_000) });

async function signIn(email: string, password: string): Promise<Actor> {
  const client = createClient(url!, anonKey!, {
    db: folioneDbOptions,
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: boundedFetch },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user || !data.session)
    throw new Error("Test user sign-in failed");
  const userId = data.user.id;
  return {
    client,
    userId,
    token: data.session.access_token,
    repo: new SupabasePersonaRepository(async () => ({ client, userId })),
  };
}

/** A signed-in actor whose PostgREST requests are recorded (method + path only). */
async function signInRecording(email: string, password: string) {
  const requests: { method: string; path: string }[] = [];
  const recordingFetch: typeof fetch = async (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method =
      init?.method ??
      (typeof input === "object" && "method" in input ? input.method : "GET");
    requests.push({
      method: method.toUpperCase(),
      path: new URL(href).pathname,
    });
    return boundedFetch(input, init);
  };
  const client = createClient(url!, anonKey!, {
    db: folioneDbOptions,
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: recordingFetch },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) throw new Error("Test user sign-in failed");
  const userId = data.user.id;
  const rest = () => requests.filter((r) => r.path.startsWith("/rest/v1/"));
  return {
    client,
    userId,
    repo: new SupabasePersonaRepository(async () => ({ client, userId })),
    rest,
    reset: () => {
      requests.length = 0;
    },
  };
}

const tag = Date.now().toString(36);
const config = (name: string): NormalizedPersonaCreate => ({
  metadata: { name, description: null, audience: null, purpose: null },
  selections: PROFILE_FIELD_KEYS.map((fieldKey, position) => ({
    fieldKey,
    isIncluded: false,
    isHighlighted: false,
    position,
  })),
  overrides: [],
  sections: STARTER_SECTIONS.map((s, position) => ({
    sectionKey: s.key,
    label: null,
    isVisible: false,
    position,
  })),
  makeDefault: false,
});

let worldPromise: Promise<{ a: Actor; b: Actor }> | undefined;
const world = () =>
  (worldPromise ??= (async () => ({
    a: await signIn(emailA!, passwordA!),
    b: await signIn(emailB!, passwordB!),
  }))());

// The shared contract, against the real database through the real adapter.
if (ready) {
  describePersonaRepositoryContract(
    "Supabase adapter (hosted)",
    async (): Promise<ContractWorld> => {
      const { a, b } = await world();
      return {
        a: { repo: a.repo, accountId: a.userId },
        b: { repo: b.repo, accountId: b.userId },
      };
    },
    { staleVersionDeployed },
  );
}

describe.skipIf(!ready)("hosted persona security and integrity", () => {
  const cleanup: { actor: Actor; id: string }[] = [];
  let a: Actor;
  let b: Actor;
  let aPersonaId: string;
  let identityBefore: unknown;

  const readIdentity = async (actor: Actor) =>
    (
      await actor.client
        .from("identity_profiles")
        .select("*")
        .eq("account_id", actor.userId)
        .maybeSingle()
    ).data;

  beforeAll(async () => {
    ({ a, b } = await world());
    identityBefore = await readIdentity(a);
    const base = config(`Hosted ${tag} A`);
    // An override and a visible section so EVERY child table has an owner row to
    // prove isolation against (an empty table would make the check vacuous).
    base.overrides = [{ fieldKey: "headline", value: "Owner-only wording" }];
    const persona = await a.repo.createWithConfiguration(a.userId, base);
    aPersonaId = persona.id;
    cleanup.push({ actor: a, id: persona.id });
  });

  afterAll(async () => {
    for (const { actor, id } of cleanup) {
      try {
        let p = await actor.repo.get(actor.userId, id);
        if (!p) continue;
        if (p.status === "active")
          p = await actor.repo.setLifecycle(
            actor.userId,
            id,
            p.version,
            "archived",
          );
        await actor.repo.delete(actor.userId, id, p.version);
      } catch {
        // best-effort
      }
    }
  });

  it("rejects direct table writes by the owner (only approved RPCs may write)", async () => {
    const insert = await a.client
      .from("personas")
      .insert({ account_id: a.userId, name: `Direct ${tag}` });
    expect(insert.error?.code).toBe("42501");
    const update = await a.client
      .from("personas")
      .update({ name: "Direct rename" })
      .eq("id", aPersonaId)
      .select();
    expect(
      update.error?.code === "42501" || (update.data ?? []).length === 0,
    ).toBe(true);
    const del = await a.client
      .from("personas")
      .delete()
      .eq("id", aPersonaId)
      .select();
    expect(del.error?.code === "42501" || (del.data ?? []).length === 0).toBe(
      true,
    );
    const sectionInsert = await a.client.from("persona_sections").insert({
      persona_id: aPersonaId,
      account_id: a.userId,
      section_key: "x",
      position: 99,
    });
    expect(sectionInsert.error?.code).toBe("42501");
    const revisionInsert = await a.client.from("persona_revisions").insert({
      persona_id: aPersonaId,
      account_id: a.userId,
      actor_id: a.userId,
      revision_number: 999,
      event_type: "updated",
      configuration_payload: {},
    });
    expect(revisionInsert.error?.code).toBe("42501");
    const revisionUpdate = await a.client
      .from("persona_revisions")
      .update({ event_type: "created" })
      .eq("persona_id", aPersonaId)
      .select();
    expect(
      revisionUpdate.error?.code === "42501" ||
        (revisionUpdate.data ?? []).length === 0,
    ).toBe(true);
    const revisionDelete = await a.client
      .from("persona_revisions")
      .delete()
      .eq("persona_id", aPersonaId)
      .select();
    expect(
      revisionDelete.error?.code === "42501" ||
        (revisionDelete.data ?? []).length === 0,
    ).toBe(true);
    const intact = await a.repo.get(a.userId, aPersonaId);
    expect(intact).toMatchObject({
      name: `Hosted ${tag} A`,
      version: 1,
      revisionCount: 1,
    });
  });

  it("B cannot read A's rows in any Persona table", async () => {
    for (const table of [
      "personas",
      "persona_sections",
      "persona_profile_field_selections",
      "persona_profile_overrides",
      "persona_revisions",
    ] as const) {
      const column = table === "personas" ? "id" : "persona_id";
      const own = await a.client.from(table).select("*").eq(column, aPersonaId);
      expect((own.data ?? []).length, `${table} (owner)`).toBeGreaterThan(0);
      const foreign = await b.client
        .from(table)
        .select("*")
        .eq(column, aPersonaId);
      expect(foreign.data ?? [], `${table} (other user)`).toEqual([]);
    }
  });

  it("B cannot write A's rows directly, nor insert rows owned by A", async () => {
    const update = await b.client
      .from("personas")
      .update({ name: "Hijacked" })
      .eq("id", aPersonaId)
      .select();
    expect(
      update.error?.code === "42501" || (update.data ?? []).length === 0,
    ).toBe(true);
    const del = await b.client
      .from("personas")
      .delete()
      .eq("id", aPersonaId)
      .select();
    expect(del.error?.code === "42501" || (del.data ?? []).length === 0).toBe(
      true,
    );
    const forged = await b.client
      .from("personas")
      .insert({ account_id: a.userId, name: `Forged ${tag}` });
    expect(forged.error?.code).toBe("42501");
    expect(await a.repo.get(a.userId, aPersonaId)).toMatchObject({
      name: `Hosted ${tag} A`,
      version: 1,
    });
  });

  it("B's RPC calls on A's Persona fail as not found, and change nothing", async () => {
    const attempts = await Promise.all([
      b.client.rpc("persona_set_lifecycle", {
        p_persona_id: aPersonaId,
        p_expected_version: 1,
        p_status: "archived",
      }),
      b.client.rpc("persona_update_metadata", {
        p_persona_id: aPersonaId,
        p_expected_version: 1,
        p_name: "x",
        p_slug: null,
        p_description: null,
        p_audience: null,
        p_purpose: null,
      }),
      b.client.rpc("persona_delete", {
        p_persona_id: aPersonaId,
        p_expected_version: 1,
      }),
      b.client.rpc("persona_duplicate", {
        p_source_persona_id: aPersonaId,
        p_new_name: `Stolen ${tag}`,
      }),
      b.client.rpc("persona_apply_profile_field_changes", {
        p_persona_id: aPersonaId,
        p_expected_version: 1,
        p_changes: [{ field_key: "headline", is_included: true }],
      }),
    ]);
    for (const attempt of attempts) expect(attempt.error?.code).toBe("P0002");
    expect(await a.repo.get(a.userId, aPersonaId)).toMatchObject({
      status: "active",
      version: 1,
    });
  });

  it("anonymous requests can neither read nor call anything", async () => {
    const anon = createClient(url!, anonKey!, {
      db: folioneDbOptions,
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const table of ["personas", "persona_revisions"] as const) {
      const read = await anon.from(table).select("id");
      expect(
        read.error?.code === "42501" || (read.data ?? []).length === 0,
        table,
      ).toBe(true);
    }
    const rpc = await anon.rpc("persona_delete", {
      p_persona_id: aPersonaId,
      p_expected_version: 1,
    });
    expect(rpc.error?.code).toBe("42501");
    const gate = await anon.rpc("persona_write_rpc_context");
    expect(gate.error?.code).toBe("42501");
  });

  it("GraphQL fails closed: NO write path exists (STOP AND REPORT if any does)", async () => {
    // Approved condition: GraphQL must fail closed. If any Persona row or change is
    // produced through GraphQL, this test fails with an explicit STOP message and
    // the finding must be reported before anything else is done. An unexposed
    // mutation type is INCONCLUSIVE (logged), never reported as a pass.
    const endpoint = `${url}/graphql/v1`;
    const headers = {
      "content-type": "application/json",
      apikey: anonKey!,
      authorization: `Bearer ${a.token}`,
    };
    const post = async (query: string) =>
      (
        await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({ query }),
        })
      ).json() as Promise<{
        data?: Record<string, unknown> | null;
        errors?: unknown[];
      }>;
    const stop = (what: string) => {
      throw new Error(
        `STOP AND REPORT: GraphQL produced an unauthorized Persona write path (${what}). Do not proceed.`,
      );
    };

    // Classification (M3D): when the extension is not installed, the endpoint says so
    // for every role, and there is no GraphQL schema to mutate. That is evidence about
    // the CURRENT state only; verify-catalog.sql 6b confirms it from the catalog.
    const anonProbe = await (
      await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: anonKey! },
        body: JSON.stringify({ query: "{ __schema { queryType { name } } }" }),
      })
    ).json();
    const authProbe = await post("{ __schema { queryType { name } } }");
    const disabled = (r: unknown) =>
      JSON.stringify(r).includes("pg_graphql extension is not enabled");
    if (disabled(anonProbe) && disabled(authProbe)) {
      console.info(
        "[persona-persistence] GraphQL: VERIFIED SAFE at runtime (pg_graphql not enabled; anon and authenticated both refused). Catalog confirmation: verify-catalog.sql 6b.",
      );
      return;
    }

    const introspect = await post(
      '{ __type(name: "Mutation") { fields { name } } }',
    );
    const fields = (
      (
        introspect.data as
          | { __type?: { fields?: { name: string }[] } }
          | null
          | undefined
      )?.__type?.fields ?? []
    ).map((f) => f.name);
    const personaFields = fields.filter((f) => /persona/i.test(f));
    const before = await a.repo.get(a.userId, aPersonaId);
    const marker = `GraphQL bypass ${tag}`;

    // (1) Table mutations, if reflected.
    if (fields.includes("insertIntoPersonasCollection")) {
      const attempt = await post(
        `mutation { insertIntoPersonasCollection(objects: [{ accountId: "${a.userId}", name: "${marker}" }]) { affectedCount } }`,
      );
      const affected =
        (
          attempt.data as {
            insertIntoPersonasCollection?: { affectedCount: number };
          } | null
        )?.insertIntoPersonasCollection?.affectedCount ?? 0;
      if (affected > 0) stop("insertIntoPersonasCollection affected rows");
    }
    if (fields.includes("updatePersonasCollection")) {
      const attempt = await post(
        `mutation { updatePersonasCollection(set: { name: "${marker}" }, filter: { id: { eq: "${aPersonaId}" } }) { affectedCount } }`,
      );
      const affected =
        (
          attempt.data as {
            updatePersonasCollection?: { affectedCount: number };
          } | null
        )?.updatePersonasCollection?.affectedCount ?? 0;
      if (affected > 0) stop("updatePersonasCollection affected rows");
    }
    if (fields.includes("deleteFromPersonasCollection")) {
      const attempt = await post(
        `mutation { deleteFromPersonasCollection(filter: { id: { eq: "${aPersonaId}" } }) { affectedCount } }`,
      );
      const affected =
        (
          attempt.data as {
            deleteFromPersonasCollection?: { affectedCount: number };
          } | null
        )?.deleteFromPersonasCollection?.affectedCount ?? 0;
      if (affected > 0) stop("deleteFromPersonasCollection affected rows");
    }
    // (2) Persona functions exposed as GraphQL mutations (arguments are best effort;
    //     whatever the syntax, the invariant below must hold).
    if (fields.includes("personaSetLifecycle")) {
      await post(
        `mutation { personaSetLifecycle(pPersonaId: "${aPersonaId}", pExpectedVersion: 1, pStatus: "archived") }`,
      );
    }
    if (fields.includes("personaUpdateMetadata")) {
      await post(
        `mutation { personaUpdateMetadata(pPersonaId: "${aPersonaId}", pExpectedVersion: 1, pName: "${marker}", pSlug: null, pDescription: null, pAudience: null, pPurpose: null) }`,
      );
    }
    if (fields.includes("personaDelete")) {
      await post(
        `mutation { personaDelete(pPersonaId: "${aPersonaId}", pExpectedVersion: 1) }`,
      );
    }

    // The invariant, whatever the schema exposes: nothing changed.
    const after = await a.repo.get(a.userId, aPersonaId);
    if (JSON.stringify(after) !== JSON.stringify(before))
      stop("the test Persona changed");
    if ((await a.repo.list(a.userId)).some((p) => p.name === marker))
      stop("a Persona was created");

    if (fields.length === 0) {
      console.warn(
        "[persona-persistence] GraphQL Mutation type not visible: INCONCLUSIVE (not a pass). Review the GraphQL schema by hand.",
      );
    } else if (
      personaFields.length === 0 &&
      !fields.some((f) => /Personas/.test(f))
    ) {
      console.warn(
        "[persona-persistence] No Persona mutation fields are reflected in GraphQL.",
      );
    }
  });

  it("a failed create rolls back completely (no Persona, no revision)", async () => {
    const revisionsBefore = (
      await a.client
        .from("persona_revisions")
        .select("id", { count: "exact", head: true })
    ).count;
    const personasBefore = (await a.repo.list(a.userId)).length;
    const bad = config(`Hosted ${tag} bad`);
    bad.overrides = [{ fieldKey: "website_url", value: "not-a-url" }];
    await expect(
      a.repo.createWithConfiguration(a.userId, bad),
    ).rejects.toMatchObject({ code: "constraint" });
    expect((await a.repo.list(a.userId)).length).toBe(personasBefore);
    const revisionsAfter = (
      await a.client
        .from("persona_revisions")
        .select("id", { count: "exact", head: true })
    ).count;
    expect(revisionsAfter).toBe(revisionsBefore);
  });

  it("a failed batch rolls back every change in it", async () => {
    const p = await a.repo.createWithConfiguration(
      a.userId,
      config(`Hosted ${tag} batch`),
    );
    cleanup.push({ actor: a, id: p.id });
    await expect(
      a.repo.applyProfileFieldChanges(a.userId, p.id, 1, [
        { fieldKey: "display_name", isIncluded: true },
        {
          fieldKey: "website_url",
          override: { action: "set", value: "not-a-url" },
        },
      ]),
    ).rejects.toMatchObject({ code: "constraint" });
    const after = (await a.repo.get(a.userId, p.id))!;
    expect(after).toMatchObject({ version: 1, revisionCount: 1 });
    expect(after.selections.every((s) => !s.isIncluded)).toBe(true);
    expect(after.overrides).toEqual([]);
  });

  it("creation is complete: 7 selections, 9 sections, exactly one revision, and the returned state equals a fresh read", async () => {
    const p = await a.repo.createWithConfiguration(
      a.userId,
      config(`Hosted ${tag} complete`),
    );
    cleanup.push({ actor: a, id: p.id });
    const count = async (table: string) =>
      (
        await a.client
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq("persona_id", p.id)
      ).count;
    expect(await count("persona_profile_field_selections")).toBe(7);
    expect(await count("persona_sections")).toBe(9);
    expect(await count("persona_revisions")).toBe(1);
    expect(p).toMatchObject({ version: 1, revisionCount: 1 });
    expect(await a.repo.get(a.userId, p.id)).toEqual(p);
  });

  it("concurrent default switches leave exactly one default, no torn revisions, and consistent versions", async () => {
    const made = await Promise.all(
      [1, 2, 3, 4].map((n) =>
        a.repo.createWithConfiguration(
          a.userId,
          config(`Hosted ${tag} default ${n}`),
        ),
      ),
    );
    for (const p of made) cleanup.push({ actor: a, id: p.id });
    // Fire competing switches at once; each is one RPC (one transaction).
    await Promise.allSettled(
      made.map((p) => a.repo.setDefault(a.userId, p.id, p.version, true)),
    );
    const mine = (await a.repo.list(a.userId)).filter((p) =>
      made.some((m) => m.id === p.id),
    );
    expect(mine.filter((p) => p.isDefault)).toHaveLength(1);
    for (const p of mine) {
      const { data } = await a.client
        .from("persona_revisions")
        .select("revision_number")
        .eq("persona_id", p.id);
      const numbers = (data ?? [])
        .map((r) => Number(r.revision_number))
        .sort((x, y) => x - y);
      // A half-applied default change would show as a version without its revision.
      expect(numbers, p.name).toEqual(
        Array.from({ length: p.version }, (_, i) => i + 1),
      );
    }
  });

  it("permanent deletion purges only that Persona's revisions and children", async () => {
    const keep = await a.repo.createWithConfiguration(
      a.userId,
      config(`Hosted ${tag} keep`),
    );
    cleanup.push({ actor: a, id: keep.id });
    await a.repo.updateMetadata(a.userId, keep.id, 1, {
      name: keep.name,
      description: "kept",
      audience: null,
      purpose: null,
    });
    const gone = await a.repo.createWithConfiguration(
      a.userId,
      config(`Hosted ${tag} gone`),
    );
    const archived = await a.repo.setLifecycle(
      a.userId,
      gone.id,
      1,
      "archived",
    );
    await a.repo.delete(a.userId, gone.id, archived.version);

    for (const table of [
      "persona_revisions",
      "persona_sections",
      "persona_profile_field_selections",
      "persona_profile_overrides",
    ]) {
      const { count } = await a.client
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("persona_id", gone.id);
      expect(count, `${table} for the deleted Persona`).toBe(0);
    }
    expect(await a.repo.get(a.userId, keep.id)).toMatchObject({
      version: 2,
      revisionCount: 2,
    });
    const kept = await a.client
      .from("persona_revisions")
      .select("*", { count: "exact", head: true })
      .eq("persona_id", keep.id);
    expect(kept.count).toBe(2);
  });

  it("the read-only state builder returns only the caller's own Persona", async () => {
    const own = await a.client.rpc("persona_detail_json", {
      p_persona_id: aPersonaId,
    });
    expect((own.data as { id?: string } | null)?.id).toBe(aPersonaId);
    const foreign = await b.client.rpc("persona_detail_json", {
      p_persona_id: aPersonaId,
    });
    expect(foreign.data ?? null).toBeNull();
    const anon = createClient(url!, anonKey!, {
      db: folioneDbOptions,
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(
      (await anon.rpc("persona_detail_json", { p_persona_id: aPersonaId }))
        .error?.code,
    ).toBe("42501");
  });

  it("account anchor: created only when absent, and left untouched when present", async () => {
    const readAccount = async (actor: Actor) =>
      (
        await actor.client
          .from("accounts")
          .select("id,created_at,updated_at")
          .eq("id", actor.userId)
          .maybeSingle()
      ).data;
    const branches: string[] = [];
    for (const [label, actor] of [
      ["A", a],
      ["B", b],
    ] as const) {
      const before = await readAccount(actor);
      const p = await actor.repo.createWithConfiguration(
        actor.userId,
        config(`Hosted ${tag} anchor ${label}`),
      );
      cleanup.push({ actor, id: p.id });
      const after = await readAccount(actor);
      expect(
        after,
        `${label}: the account anchor must exist after a create`,
      ).not.toBeNull();
      expect(after!.id).toBe(actor.userId);
      if (before) {
        expect(after, `${label}: an existing anchor must be untouched`).toEqual(
          before,
        );
        branches.push(`${label}: present (left untouched)`);
      } else {
        branches.push(`${label}: ABSENT (created by the RPC)`);
      }
      // A second create must be a no-op for the anchor.
      const again = await actor.repo.createWithConfiguration(
        actor.userId,
        config(`Hosted ${tag} anchor ${label} 2`),
      );
      cleanup.push({ actor, id: again.id });
      expect(await readAccount(actor)).toEqual(after);
    }
    // Which branches ran is reported so a missing "absent" case is never mistaken for coverage.
    console.info(
      `[persona-persistence] account anchor branches exercised: ${branches.join("; ")}`,
    );
  });

  it("every operation uses its actual PostgREST path: POST /rest/v1/rpc/<name>, exactly one request, no table writes", async () => {
    const r = await signInRecording(emailA!, passwordA!);
    const expectOne = (method: string, path: string) => {
      const sent = r.rest();
      expect(sent, `${method} ${path}`).toEqual([{ method, path }]);
      r.reset();
    };
    const created = await r.repo.createWithConfiguration(
      r.userId,
      config(`Hosted ${tag} path`),
    );
    cleanup.push({ actor: a, id: created.id });
    expectOne("POST", "/rest/v1/rpc/persona_create_with_configuration");

    await r.repo.get(r.userId, created.id);
    expectOne("POST", "/rest/v1/rpc/persona_detail_json");
    await r.repo.list(r.userId);
    expectOne("GET", "/rest/v1/personas");

    const meta = {
      name: created.name,
      description: "p",
      audience: null,
      purpose: null,
    };
    const v2 = await r.repo.updateMetadata(r.userId, created.id, 1, meta);
    expectOne("POST", "/rest/v1/rpc/persona_update_metadata");
    const v3 = await r.repo.applyProfileFieldChanges(
      r.userId,
      created.id,
      v2.version,
      [{ fieldKey: "headline", isIncluded: true }],
    );
    expectOne("POST", "/rest/v1/rpc/persona_apply_profile_field_changes");
    const v4 = await r.repo.upsertSection(r.userId, created.id, v3.version, {
      sectionKey: "profile",
      label: "About",
      isVisible: true,
    });
    expectOne("POST", "/rest/v1/rpc/persona_upsert_section");
    const keys = v4.sections.map((x) => x.sectionKey);
    const v5 = await r.repo.reorderSections(r.userId, created.id, v4.version, [
      keys[1],
      keys[0],
      ...keys.slice(2),
    ]);
    expectOne("POST", "/rest/v1/rpc/persona_reorder_sections");
    const v6 = await r.repo.setDefault(r.userId, created.id, v5.version, true);
    expectOne("POST", "/rest/v1/rpc/persona_set_default");
    const copy = await r.repo.duplicate(
      r.userId,
      created.id,
      `Hosted ${tag} path copy`,
    );
    cleanup.push({ actor: a, id: copy.id });
    expectOne("POST", "/rest/v1/rpc/persona_duplicate");
    const v7 = await r.repo.setLifecycle(
      r.userId,
      created.id,
      v6.version,
      "archived",
    );
    expectOne("POST", "/rest/v1/rpc/persona_set_lifecycle");
    await r.repo.delete(r.userId, created.id, v7.version);
    expectOne("POST", "/rest/v1/rpc/persona_delete");
  });

  it("revisions are created for every mutation: one each, numbered with the version, with the caller as actor", async () => {
    const p = await a.repo.createWithConfiguration(
      a.userId,
      config(`Hosted ${tag} revisions`),
    );
    cleanup.push({ actor: a, id: p.id });
    await a.repo.setDefault(a.userId, p.id, 1, true);
    await a.repo.updateMetadata(a.userId, p.id, 2, {
      name: p.name,
      description: "d",
      audience: null,
      purpose: null,
    });
    await a.repo.applyProfileFieldChanges(a.userId, p.id, 3, [
      { fieldKey: "headline", isIncluded: true },
    ]);
    await a.repo.upsertSection(a.userId, p.id, 4, {
      sectionKey: "profile",
      label: "About",
      isVisible: true,
    });
    const detail = (await a.repo.get(a.userId, p.id))!;
    const keys = detail.sections.map((x) => x.sectionKey);
    await a.repo.reorderSections(a.userId, p.id, 5, [
      keys[1],
      keys[0],
      ...keys.slice(2),
    ]);
    const archived = await a.repo.setLifecycle(a.userId, p.id, 6, "archived");
    const restored = await a.repo.setLifecycle(
      a.userId,
      p.id,
      archived.version,
      "active",
    );
    expect(restored).toMatchObject({
      version: 8,
      revisionCount: 8,
      isDefault: false,
    });

    const { data } = await a.client
      .from("persona_revisions")
      .select(
        "revision_number,event_type,actor_id,account_id,configuration_payload",
      )
      .eq("persona_id", p.id)
      .order("revision_number", { ascending: true });
    const rows = data ?? [];
    expect(rows.map((r) => Number(r.revision_number))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(rows.map((r) => r.event_type)).toEqual([
      "created",
      "default_changed",
      "updated",
      "updated",
      "updated",
      "updated",
      "archived",
      "restored",
    ]);
    for (const row of rows) {
      expect(row.actor_id).toBe(a.userId);
      expect(row.account_id).toBe(a.userId);
      expect(typeof row.configuration_payload).toBe("object");
    }
    // A duplicate gets its own history, starting at 1 with the right event.
    const copy = await a.repo.duplicate(
      a.userId,
      p.id,
      `Hosted ${tag} revisions copy`,
    );
    cleanup.push({ actor: a, id: copy.id });
    const copyRevisions =
      (
        await a.client
          .from("persona_revisions")
          .select("revision_number,event_type")
          .eq("persona_id", copy.id)
      ).data ?? [];
    expect(
      copyRevisions.map((r) => [Number(r.revision_number), r.event_type]),
    ).toEqual([[1, "duplicated"]]);
  });

  it.skipIf(!staleVersionDeployed)(
    "a stale expected version is rejected promptly by the database with PT409, through the real RPC path",
    async () => {
      const p = await a.repo.createWithConfiguration(
        a.userId,
        config(`Hosted ${tag} stale`),
      );
      cleanup.push({ actor: a, id: p.id });
      const stale = await a.client.rpc("persona_update_metadata", {
        p_persona_id: p.id,
        p_expected_version: 999,
        p_name: p.name,
        p_slug: null,
        p_description: "stale",
        p_audience: null,
        p_purpose: null,
      });
      expect(stale.error?.code).toBe("PT409");
      expect(await a.repo.get(a.userId, p.id)).toMatchObject({
        version: 1,
        description: null,
        revisionCount: 1,
      });
    },
  );

  it("revision history is consistent for every Persona of the test users", async () => {
    for (const actor of [a, b]) {
      const personas = await actor.repo.list(actor.userId);
      for (const persona of personas) {
        const { data } = await actor.client
          .from("persona_revisions")
          .select("revision_number")
          .eq("persona_id", persona.id);
        const numbers = (data ?? [])
          .map((r) => Number(r.revision_number))
          .sort((x, y) => x - y);
        expect(numbers, persona.name).toEqual(
          Array.from({ length: persona.version }, (_, i) => i + 1),
        );
      }
    }
  });

  it("at most one active default per account", async () => {
    for (const actor of [a, b]) {
      expect(
        (await actor.repo.list(actor.userId)).filter(
          (p) => p.isDefault && p.status === "active",
        ).length,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("left Master Identity exactly as it was", async () => {
    expect(await readIdentity(a)).toEqual(identityBefore);
  });
});

describe.skipIf(ready)("hosted persona persistence (skipped)", () => {
  it("is skipped until the SQL is executed and FOLIOONE_PERSONA_SQL_EXECUTED=1 is set with test accounts configured", () => {
    expect(ready).toBe(false);
  });
});
