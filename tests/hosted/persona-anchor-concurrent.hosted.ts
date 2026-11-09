import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabasePersonaRepository } from "@/domains/personas/persona-supabase-repository";
import {
  PROFILE_FIELD_KEYS,
  STARTER_SECTIONS,
} from "@/domains/personas/persona-constants";
import type { NormalizedPersonaCreate } from "@/domains/personas/persona-types";
import { folioneDbOptions, type FolioneClient } from "../../src/lib/db-schema";

/**
 * HOSTED CONCURRENT CREATION (M3E Task 1) on the dedicated disposable user "C".
 *
 * Contract under test (docs/sql/milestone-3c/003, persona_create_with_configuration):
 *  - A per-account advisory transaction lock (pg_advisory_xact_lock) serialises
 *    creates for one account BEFORE the account-anchor insert, so racing creates
 *    cannot race the anchor insert (ON CONFLICT DO NOTHING) or the position.
 *  - Distinct names: both succeed; positions are 0 and 1; each is version 1 with
 *    exactly one 'created' revision numbered 1; 7 selections and 9 sections each.
 *  - Same name: exactly one succeeds; the other is rejected as "duplicate"
 *    (active-name unique index, 23505) and leaves nothing behind.
 *  - Both asking to be default: both succeed, exactly one active default remains;
 *    the displaced Persona is version 2 with a 'default_changed' revision 2.
 *
 * Scenario 1 is the FIRST-TIME race: it requires C to have NO accounts row (the
 * test fails loudly otherwise). Scenarios 2 and 3 race creates on the now-existing
 * anchor and are labelled as such. Run docs/sql/milestone-3c/anchor-test-cleanup.sql
 * (reviewed, developer-run) before every run; this test cannot delete the anchor.
 *
 *   FOLIOONE_PERSONA_CONCURRENCY_TEST=1 pnpm test:persona-concurrency
 *
 * Only the anon key and C's own session are used. Cleanup removes only the
 * Personas this test created (name prefix + tag) in C's own account.
 */

const ORIGINAL_ENVIRONMENT = { ...process.env };
(process.env as Record<string, string | undefined>).NODE_ENV = "development";
loadEnvConfig(process.cwd(), true);
const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "FOLIOONE_RLS_USER_A_EMAIL",
  "FOLIOONE_RLS_USER_A_PASSWORD",
  "FOLIOONE_RLS_USER_B_EMAIL",
  "FOLIOONE_RLS_USER_C_EMAIL",
  "FOLIOONE_RLS_USER_C_PASSWORD",
  "FOLIOONE_PERSONA_CONCURRENCY_TEST",
] as const;
const loaded = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
for (const key of Object.keys(process.env)) {
  if (!Object.prototype.hasOwnProperty.call(ORIGINAL_ENVIRONMENT, key))
    delete process.env[key];
}
Object.assign(process.env, ORIGINAL_ENVIRONMENT);
for (const k of KEYS)
  if (!ORIGINAL_ENVIRONMENT[k] && loaded[k]) process.env[k] = loaded[k];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const emailC = process.env.FOLIOONE_RLS_USER_C_EMAIL;
const ready =
  process.env.FOLIOONE_PERSONA_CONCURRENCY_TEST === "1" &&
  Boolean(
    url &&
      anon &&
      emailC &&
      process.env.FOLIOONE_RLS_USER_C_PASSWORD &&
      process.env.FOLIOONE_RLS_USER_A_EMAIL &&
      process.env.FOLIOONE_RLS_USER_A_PASSWORD,
  );

type Span = { path: string; start: number; end: number };

async function signIn(email: string, password: string) {
  const spans: Span[] = [];
  const timed: typeof fetch = async (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const span: Span = {
      path: new URL(href).pathname,
      start: performance.now(),
      end: 0,
    };
    try {
      return await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(30_000),
      });
    } finally {
      span.end = performance.now();
      spans.push(span);
    }
  };
  const client: FolioneClient = createClient(url!, anon!, {
    db: folioneDbOptions,
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: timed },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) throw new Error("Test user sign-in failed");
  const userId = data.user.id;
  return {
    client,
    userId,
    spans,
    repo: new SupabasePersonaRepository(async () => ({ client, userId })),
  };
}

const tag = Date.now().toString(36);
const config = (
  name: string,
  makeDefault = false,
): NormalizedPersonaCreate => ({
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
  makeDefault,
});

describe.skipIf(!ready)(
  "concurrent creates for one user (disposable user C)",
  () => {
    it("first-time race, same session: both succeed, one anchor, no partial or torn state; then name and default races", async () => {
      const c = await signIn(
        process.env.FOLIOONE_RLS_USER_C_EMAIL!,
        process.env.FOLIOONE_RLS_USER_C_PASSWORD!,
      );
      const a = await signIn(
        process.env.FOLIOONE_RLS_USER_A_EMAIL!,
        process.env.FOLIOONE_RLS_USER_A_PASSWORD!,
      );
      // Cleanup is restricted to C and to Personas carrying this run's tag.
      expect(c.userId).not.toBe(a.userId);
      expect(emailC).not.toBe(process.env.FOLIOONE_RLS_USER_A_EMAIL);
      expect(emailC).not.toBe(process.env.FOLIOONE_RLS_USER_B_EMAIL);
      const prefix = `Concurrent ${tag}`;

      const read = async (error: (m: string) => never) => {
        const personas = await c.client
          .from("personas")
          .select("id,name,status,is_default,version,position,account_id")
          .like("name", `${prefix}%`)
          .order("position");
        if (personas.error) error(`personas: ${personas.error.message}`);
        return personas.data ?? [];
      };
      const fail = (m: string): never => {
        throw new Error(m);
      };
      const children = async (id: string) => {
        const count = async (t: string) => {
          const r = await c.client
            .from(t)
            .select("persona_id", { count: "exact", head: true })
            .eq("persona_id", id);
          expect(r.error, `${t} count (HTTP ${r.status})`).toBeNull();
          return r.count;
        };
        const rev = await c.client
          .from("persona_revisions")
          .select("revision_number,event_type,actor_id")
          .eq("persona_id", id)
          .order("revision_number");
        expect(rev.error).toBeNull();
        return {
          selections: await count("persona_profile_field_selections"),
          sections: await count("persona_sections"),
          revisions: rev.data ?? [],
        };
      };
      const anchors = async () =>
        (await c.client.from("accounts").select("id")).data ?? [];

      // Race two creates through the same session; report whether they overlapped.
      const race = async (inputs: NormalizedPersonaCreate[]) => {
        c.spans.length = 0;
        const results = await Promise.allSettled(
          inputs.map((i) => c.repo.createWithConfiguration(c.userId, i)),
        );
        const rpc = c.spans.filter((s) =>
          s.path.includes("/rpc/persona_create"),
        );
        const overlapped =
          rpc.length === 2 &&
          Math.max(rpc[0].start, rpc[1].start) <
            Math.min(rpc[0].end, rpc[1].end);
        return { results, overlapped, requests: rpc.length };
      };

      try {
        // ---- Scenario 1: FIRST-TIME race (anchor absent) -----------------------
        expect(
          await anchors(),
          "PRECONDITION: C already has an accounts row. Run anchor-test-cleanup.sql first.",
        ).toHaveLength(0);
        expect(await read(fail)).toHaveLength(0);

        const first = await race([
          config(`${prefix} one`),
          config(`${prefix} two`),
        ]);
        expect(first.requests).toBe(2);
        expect(first.results.map((r) => r.status)).toEqual([
          "fulfilled",
          "fulfilled",
        ]);
        expect(await anchors()).toEqual([{ id: c.userId }]);
        const s1 = await read(fail);
        expect(s1).toHaveLength(2);
        expect(s1.map((p) => p.position)).toEqual([0, 1]); // serialised, no duplicate position
        expect(new Set(s1.map((p) => p.name)).size).toBe(2);
        for (const p of s1) {
          expect(p).toMatchObject({
            account_id: c.userId,
            status: "active",
            is_default: false,
            version: 1,
          });
          const ch = await children(p.id);
          expect(ch.selections).toBe(7);
          expect(ch.sections).toBe(9);
          expect(ch.revisions).toEqual([
            { revision_number: 1, event_type: "created", actor_id: c.userId },
          ]);
        }
        // Each call returned the state of its own Persona.
        const returned = first.results.map((r) =>
          r.status === "fulfilled" ? r.value : null,
        );
        expect(returned.map((p) => p?.id).sort()).toEqual(
          s1.map((p) => p.id).sort(),
        );
        console.info(
          `[persona-concurrency] scenario 1 (first-time, distinct names): both created, positions 0/1, requests overlapped=${first.overlapped}`,
        );

        // ---- Scenario 2: same name, anchor now present --------------------------
        const dup = await race([
          config(`${prefix} same`),
          config(`${prefix} same`),
        ]);
        const outcomes = dup.results.map((r) => r.status).sort();
        expect(outcomes).toEqual(["fulfilled", "rejected"]);
        const loser = dup.results.find((r) => r.status === "rejected") as
          | PromiseRejectedResult
          | undefined;
        expect(loser?.reason).toMatchObject({ code: "duplicate" });
        const same = (await read(fail)).filter(
          (p) => p.name === `${prefix} same`,
        );
        expect(same).toHaveLength(1);
        expect((await children(same[0].id)).revisions).toHaveLength(1);
        expect(await anchors()).toHaveLength(1);
        console.info(
          `[persona-concurrency] scenario 2 (same name, anchor present): one created, one duplicate; overlapped=${dup.overlapped}`,
        );

        // ---- Scenario 3: both ask to be default, anchor present ------------------
        const def = await race([
          config(`${prefix} def1`, true),
          config(`${prefix} def2`, true),
        ]);
        expect(def.results.map((r) => r.status)).toEqual([
          "fulfilled",
          "fulfilled",
        ]);
        const all = await read(fail);
        const pair = all.filter((p) => /def[12]$/.test(p.name));
        expect(pair).toHaveLength(2);
        expect(all.filter((p) => p.is_default)).toHaveLength(1);
        const winner = pair.find((p) => p.is_default)!;
        const displaced = pair.find((p) => !p.is_default)!;
        expect(winner.version).toBe(1);
        expect(displaced.version).toBe(2);
        expect(
          (await children(winner.id)).revisions.map((r) => r.event_type),
        ).toEqual(["created"]);
        expect(
          (await children(displaced.id)).revisions.map((r) => [
            r.revision_number,
            r.event_type,
          ]),
        ).toEqual([
          [1, "created"],
          [2, "default_changed"],
        ]);
        console.info(
          `[persona-concurrency] scenario 3 (both default): one default remains; displaced is v2; overlapped=${def.overlapped}`,
        );

        // ---- Independent isolation check -----------------------------------------
        expect(
          (
            await a.client
              .from("personas")
              .select("id")
              .like("name", `${prefix}%`)
          ).data,
        ).toEqual([]);
      } finally {
        // Remove only this run's Personas, in C's own account, via the approved RPC path.
        const mine = await c.client
          .from("personas")
          .select("id")
          .like("name", `${prefix}%`);
        for (const row of mine.data ?? []) {
          const current = await c.repo.get(c.userId, row.id);
          if (!current) continue;
          const archived =
            current.status === "archived"
              ? current
              : await c.repo.setLifecycle(
                  c.userId,
                  row.id,
                  current.version,
                  "archived",
                );
          await c.repo.delete(c.userId, row.id, archived.version);
        }
        const left = await c.client
          .from("personas")
          .select("id")
          .like("name", `${prefix}%`);
        expect(left.data).toEqual([]);
      }
    });
  },
);
