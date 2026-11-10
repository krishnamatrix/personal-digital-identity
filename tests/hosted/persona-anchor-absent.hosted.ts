import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabasePersonaRepository } from "@/lib/db/queries/personas";
import {
  PROFILE_FIELD_KEYS,
  STARTER_SECTIONS,
} from "@/domains/personas/persona-constants";
import type { NormalizedPersonaCreate } from "@/domains/personas/persona-types";
import { folioneDbOptions, type FolioneClient } from "../../src/lib/db/schema";

/**
 * HOSTED ACCOUNT-ANCHOR "ABSENT" BRANCH (M3D Task 1).
 *
 * Needs a third, DEDICATED development test user ("C") whose public.accounts row
 * does not exist. Folioone cannot create Auth users and the app role cannot delete
 * an anchor, so the developer provides C and removes its anchor afterwards with
 * docs/sql/milestone-3c/anchor-test-cleanup.sql (reviewed, run manually).
 *
 *   FOLIOONE_RLS_USER_C_EMAIL / FOLIOONE_RLS_USER_C_PASSWORD  (in .env.local)
 *   FOLIOONE_PERSONA_ANCHOR_TEST=1
 *   pnpm test:persona-anchor
 *
 * The test refuses to run when C already has an anchor (it would prove nothing)
 * and never touches users A or B except to prove they cannot see C's data.
 * Only the anon key and the users' own sessions are used.
 */

const ORIGINAL_ENVIRONMENT = { ...process.env };
(process.env as Record<string, string | undefined>).NODE_ENV = "development";
loadEnvConfig(process.cwd(), true);
const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "FOLIOONE_RLS_USER_A_EMAIL",
  "FOLIOONE_RLS_USER_A_PASSWORD",
  "FOLIOONE_RLS_USER_C_EMAIL",
  "FOLIOONE_RLS_USER_C_PASSWORD",
  "FOLIOONE_PERSONA_ANCHOR_TEST",
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
const ready =
  process.env.FOLIOONE_PERSONA_ANCHOR_TEST === "1" &&
  Boolean(
    url &&
      anon &&
      process.env.FOLIOONE_RLS_USER_A_EMAIL &&
      process.env.FOLIOONE_RLS_USER_A_PASSWORD &&
      process.env.FOLIOONE_RLS_USER_C_EMAIL &&
      process.env.FOLIOONE_RLS_USER_C_PASSWORD,
  );

const bounded: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(15_000) });

async function signIn(email: string, password: string) {
  const client: FolioneClient = createClient(url!, anon!, {
    db: folioneDbOptions,
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: bounded },
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
    repo: new SupabasePersonaRepository(async () => ({ client, userId })),
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

describe.skipIf(!ready)(
  "account anchor absent branch (dedicated user C)",
  () => {
    it("creates the anchor, the Persona, 7 selections, 9 sections and 1 revision atomically; a failed create leaves nothing; A and C cannot see each other", async () => {
      const a = await signIn(
        process.env.FOLIOONE_RLS_USER_A_EMAIL!,
        process.env.FOLIOONE_RLS_USER_A_PASSWORD!,
      );
      const c = await signIn(
        process.env.FOLIOONE_RLS_USER_C_EMAIL!,
        process.env.FOLIOONE_RLS_USER_C_PASSWORD!,
      );
      expect(c.userId, "C must be a different user from A").not.toBe(a.userId);

      const anchor = async (who: typeof c) =>
        (await who.client.from("accounts").select("id").eq("id", c.userId))
          .data ?? [];
      const personaCount = async () =>
        (
          await c.client
            .from("personas")
            .select("id", { count: "exact", head: true })
        ).count;

      // Precondition: genuinely absent. Not satisfied -> fail loudly, never pass vacuously.
      expect(
        await anchor(c),
        "PRECONDITION: C already has an accounts row. Run docs/sql/milestone-3c/anchor-test-cleanup.sql (reviewed) or use a fresh user.",
      ).toHaveLength(0);
      expect(await personaCount()).toBe(0);

      // (1) A failed create must not leave a partial anchor or Persona.
      const bad = config(`Anchor ${tag} bad`);
      bad.overrides = [{ fieldKey: "website_url", value: "not-a-url" }];
      await expect(
        c.repo.createWithConfiguration(c.userId, bad),
      ).rejects.toMatchObject({
        code: "constraint",
      });
      expect(
        await anchor(c),
        "failed create left an anchor behind",
      ).toHaveLength(0);
      expect(await personaCount()).toBe(0);

      // (2) A real create through the actual RPC creates the anchor in the same transaction.
      const created = await c.repo.createWithConfiguration(
        c.userId,
        config(`Anchor ${tag} ok`),
      );
      try {
        expect(await anchor(c)).toEqual([{ id: c.userId }]);
        // Every child table has persona_id (not every table has id), and a failed
        // query must fail the test with its error instead of yielding a null count.
        const count = async (table: string) => {
          const r = await c.client
            .from(table)
            .select("persona_id", { count: "exact", head: true })
            .eq("persona_id", created.id);
          expect(
            r.error,
            `${table} count query failed (HTTP ${r.status})`,
          ).toBeNull();
          return r.count;
        };
        expect(created.selections).toHaveLength(7);
        expect(await count("persona_profile_field_selections")).toBe(7);
        expect(await count("persona_sections")).toBe(9);
        const revisions = await c.client
          .from("persona_revisions")
          .select("revision_number,actor_id")
          .eq("persona_id", created.id);
        expect(revisions.data).toEqual([
          { revision_number: 1, actor_id: c.userId },
        ]);

        // (3) Isolation both ways.
        expect(await a.repo.get(a.userId, created.id)).toBeNull();
        expect(
          (await a.client.from("accounts").select("id").eq("id", c.userId))
            .data,
        ).toEqual([]);
        expect(
          (await a.client.from("personas").select("id").eq("id", created.id))
            .data,
        ).toEqual([]);
        // The adapter never honours another account id: it rejects before any request.
        await expect(c.repo.get(a.userId, created.id)).rejects.toMatchObject({
          code: "not_found",
        });
      } finally {
        // Remove what the app role may remove. The anchor itself stays until
        // anchor-test-cleanup.sql is run by the developer.
        const archived = await c.repo.setLifecycle(
          c.userId,
          created.id,
          created.version,
          "archived",
        );
        await c.repo.delete(c.userId, created.id, archived.version);
      }
      console.info(
        "[persona-anchor-absent] absent branch exercised for user C; anchor remains until anchor-test-cleanup.sql is run",
      );
    });
  },
);
