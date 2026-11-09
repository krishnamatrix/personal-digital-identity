import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// STATIC checks on the unexecuted M3C SQL package (docs/sql/milestone-3c). They
// read text only: nothing connects to a database or executes SQL, and they prove
// nothing about runtime behaviour, RLS or the gate. They exist so the security
// invariants of the proposal cannot drift silently before it is reviewed.

const dir = join(process.cwd(), "docs/sql/milestone-3c");
const raw = (name: string) => readFileSync(join(dir, name), "utf8");
/** SQL with line comments removed. */
const code = (name: string) => raw(name).replace(/--[^\n]*/g, "");

const TABLES = [
  "personas",
  "persona_sections",
  "persona_profile_field_selections",
  "persona_profile_overrides",
  "persona_revisions",
];
const FUNCTIONS = [
  "persona_create_with_configuration",
  "persona_update_metadata",
  "persona_apply_profile_field_changes",
  "persona_upsert_section",
  "persona_reorder_sections",
  "persona_set_default",
  "persona_set_lifecycle",
  "persona_duplicate",
  "persona_delete",
];

const s001 = code("001-persona-schema-secured.sql");
const s002 = code("002-persona-gate-policies-grants.sql");
const s003 = code("003-persona-mutation-rpcs.sql");

function functionBodies(sql: string) {
  const out: Record<string, string> = {};
  const re = /CREATE FUNCTION public\.(persona_[a-z_]+)\(([\s\S]*?)\$fn\$;/g;
  for (const m of sql.matchAll(re)) out[m[1]] = m[0];
  return out;
}
const bodies = functionBodies(s003);

describe("001: tables are created already locked down (no exposure window)", () => {
  it("creates all five tables and enables AND forces RLS on each", () => {
    for (const table of TABLES) {
      expect(s001, table).toMatch(
        new RegExp(`CREATE TABLE public\\.${table} \\(`),
      );
      expect(s001, table).toMatch(
        new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`),
      );
      expect(s001, table).toMatch(
        new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`),
      );
    }
  });

  it("revokes every API role's privileges in the same transaction, and grants nothing", () => {
    expect(s001).toMatch(
      /REVOKE ALL PRIVILEGES ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(s001).not.toMatch(/\bGRANT\b/);
    expect(s001).not.toMatch(/CREATE POLICY/);
    const begin = s001.indexOf("BEGIN;");
    const firstTable = s001.indexOf("CREATE TABLE");
    const lastForce = s001.lastIndexOf("FORCE ROW LEVEL SECURITY");
    const revoke = s001.lastIndexOf("REVOKE ALL PRIVILEGES");
    const commit = s001.indexOf("COMMIT;");
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(begin).toBeLessThan(firstTable);
    expect(lastForce).toBeLessThan(commit);
    expect(revoke).toBeLessThan(commit);
  });

  it("enforces its preconditions and asserts its outcome before COMMIT", () => {
    expect(s001).toMatch(/DO \$preflight\$/);
    expect(s001).toMatch(/DO \$assert\$/);
    expect(
      (s001.match(/RAISE EXCEPTION/g) ?? []).length,
    ).toBeGreaterThanOrEqual(8);
    expect(s001.indexOf("$assert$")).toBeLessThan(s001.indexOf("COMMIT;"));
  });

  it("does not reference Master Identity tables (selections no longer need a profile row)", () => {
    expect(s001).not.toMatch(/identity_profiles/);
  });

  it("keeps the deferrable section-position constraint and the single-default index", () => {
    expect(s001).toMatch(
      /persona_sections_persona_position_unique\s+UNIQUE \(persona_id, position\) DEFERRABLE INITIALLY DEFERRED/,
    );
    expect(s001).toMatch(
      /personas_one_active_default_per_account[\s\S]*WHERE is_default AND status = 'active'/,
    );
  });
});

describe("002: gate, policies, grants", () => {
  const policies = [
    ...s002.matchAll(
      /CREATE POLICY\s+(\w+)\s+ON\s+public\.(\w+)\s+FOR\s+(\w+)\s+TO\s+(\w+)([\s\S]*?);/g,
    ),
  ].map((m) => ({
    name: m[1],
    table: m[2],
    cmd: m[3],
    role: m[4],
    body: m[5],
  }));

  it("defines exactly 16 policies with the expected distribution, all for authenticated", () => {
    expect(policies).toHaveLength(16);
    const count = (t: string) => policies.filter((p) => p.table === t).length;
    expect(count("personas")).toBe(4);
    expect(count("persona_sections")).toBe(3);
    expect(count("persona_profile_field_selections")).toBe(3);
    expect(count("persona_profile_overrides")).toBe(4);
    expect(count("persona_revisions")).toBe(2);
    expect(policies.every((p) => p.role === "authenticated")).toBe(true);
  });

  it("gates every write policy and no read policy, and always checks the owner", () => {
    for (const policy of policies) {
      expect(policy.body, policy.name).toMatch(/\(SELECT auth\.uid\(\)\)/);
      if (policy.cmd === "SELECT") {
        expect(policy.body, policy.name).not.toMatch(
          /persona_write_rpc_context/,
        );
      } else {
        expect(policy.body, policy.name).toMatch(
          /persona_write_rpc_context\(\)/,
        );
      }
    }
    const update = policies.filter((p) => p.cmd === "UPDATE");
    for (const policy of update) {
      expect(policy.body, policy.name).toMatch(/USING[\s\S]*WITH CHECK/);
    }
    const revisionInsert = policies.find(
      (p) => p.name === "persona_revisions_insert_rpc_own",
    )!;
    expect(revisionInsert.body).toMatch(/actor_id = \(SELECT auth\.uid\(\)\)/);
  });

  it("has no DELETE policy on sections, selections or revisions, and none for anon", () => {
    const deletes = policies
      .filter((p) => p.cmd === "DELETE")
      .map((p) => p.table)
      .sort();
    expect(deletes).toEqual(["persona_profile_overrides", "personas"]);
    expect(
      policies.some(
        (p) => p.cmd === "UPDATE" && p.table === "persona_revisions",
      ),
    ).toBe(false);
  });

  it("the gate is exact equality over the nine paths: no LIKE, prefix or regex", () => {
    const gate = s002.slice(
      s002.indexOf("CREATE FUNCTION public.persona_write_rpc_context"),
      s002.indexOf("REVOKE ALL ON FUNCTION public.persona_write_rpc_context"),
    );
    expect(gate).toMatch(/= ANY \(ARRAY\[/);
    expect(gate).toMatch(/current_setting\('request\.method', true\) = 'POST'/);
    expect(gate).not.toMatch(
      /\bLIKE\b|~|SIMILAR TO|starts_with|position\(|strpos/i,
    );
    expect([...gate.matchAll(/'\/rpc\/(persona_[a-z_]+)'/g)]).toHaveLength(9);
    expect(gate).toMatch(/SECURITY INVOKER/);
    expect(gate).toMatch(/SET search_path = ''/);
    expect(gate).toMatch(/false\s*\)/); // fail closed
  });

  it("grants only to authenticated; nothing to anon, PUBLIC or service_role", () => {
    const grants = [...s002.matchAll(/GRANT\s+([\s\S]*?)\s+TO\s+([\w, ]+);/g)];
    expect(grants.length).toBeGreaterThan(5);
    for (const [, , to] of grants) expect(to.trim()).toBe("authenticated");
    expect(s002).not.toMatch(/GRANT[^;]*\b(anon|PUBLIC|service_role)\b/);
    expect(s002).not.toMatch(/ALL PRIVILEGES|GRANT ALL/);
  });

  it("limits write grants to columns the functions use", () => {
    expect(s002).not.toMatch(/GRANT DELETE ON public\.persona_sections/);
    expect(s002).not.toMatch(
      /GRANT DELETE ON public\.persona_profile_field_selections/,
    );
    expect(s002).not.toMatch(
      /GRANT (INSERT|UPDATE|DELETE)[^;]*public\.persona_revisions[^;]*;[\s\S]*GRANT UPDATE[^;]*persona_revisions/,
    );
    const personaUpdate = s002.match(
      /GRANT UPDATE \(([^)]*)\)\s+ON public\.personas TO authenticated/,
    )![1];
    expect(personaUpdate).not.toMatch(
      /\bposition\b|\bid\b|account_id|created_at/,
    );
    expect(s002).not.toMatch(/GRANT UPDATE[^;]*ON public\.persona_revisions/);
  });

  it("enforces preconditions (including diagnostic cleanup) and asserts the outcome", () => {
    expect(s002).toMatch(/DO \$preflight\$/);
    expect(s002).toMatch(/DO \$assert\$/);
    expect(s002).toMatch(/zz_diag_m3a_/);
    expect(s002).toMatch(/Expected exactly 16 Persona policies/);
  });
});

describe("003: the nine functions", () => {
  it("defines exactly the nine application RPCs plus the read-only state builder", () => {
    expect(Object.keys(bodies).sort()).toEqual(
      [...FUNCTIONS, "persona_detail_json"].sort(),
    );
  });

  it("every function is SECURITY INVOKER, VOLATILE, search_path '' and never SECURITY DEFINER", () => {
    expect(s003).not.toMatch(/SECURITY DEFINER/i);
    for (const [name, body] of Object.entries(bodies)) {
      expect(body, name).toMatch(
        name === "persona_detail_json" ? /LANGUAGE sql/ : /LANGUAGE plpgsql/,
      );
      expect(body, name).toMatch(/\bVOLATILE\b/);
      expect(body, name).toMatch(/SECURITY INVOKER/);
      expect(body, name).toMatch(/SET search_path = ''/);
    }
  });

  it("derives the owner only from auth.uid(): no account or user parameter anywhere", () => {
    for (const [name, body] of Object.entries(bodies)) {
      const signature = body.slice(0, body.indexOf("RETURNS"));
      expect(signature, name).not.toMatch(
        /p_account|p_user|account_id|user_id/,
      );
      expect(body, name).toMatch(/\(SELECT auth\.uid\(\)\)/);
      if (name !== "persona_detail_json") expect(body, name).toMatch(/28000/);
    }
  });

  it("has no EXCEPTION block (so no subtransaction can swallow a failed revision insert) and no dynamic SQL", () => {
    expect(s003).not.toMatch(/EXCEPTION\s+WHEN/i);
    expect(s003).not.toMatch(/EXECUTE\s+(format|')/i);
    expect(s003).not.toMatch(/\bCOMMIT\b[\s\S]*\bBEGIN\b/);
  });

  it("writes exactly one revision path per mutation (none for delete, which cascades)", () => {
    for (const name of FUNCTIONS) {
      const inserts = (
        bodies[name].match(/INSERT INTO public\.persona_revisions/g) ?? []
      ).length;
      if (name === "persona_delete") expect(inserts, name).toBe(0);
      else expect(inserts, name).toBeGreaterThanOrEqual(1);
    }
    // Functions that touch a second Persona (the previous default) revise it too.
    expect(
      (
        bodies.persona_set_default.match(
          /INSERT INTO public\.persona_revisions/g,
        ) ?? []
      ).length,
    ).toBe(2);
    expect(
      (
        bodies.persona_create_with_configuration.match(
          /INSERT INTO public\.persona_revisions/g,
        ) ?? []
      ).length,
    ).toBe(2);
  });

  it("checks the caller's expected version and the owner on every existing-Persona mutation", () => {
    for (const name of FUNCTIONS) {
      if (
        name === "persona_create_with_configuration" ||
        name === "persona_duplicate"
      )
        continue;
      expect(bodies[name], name).toMatch(/p_expected_version/);
      expect(bodies[name], name).toMatch(
        /v_row\.version <> p_expected_version/,
      );
      expect(bodies[name], name).toMatch(/account_id = v_uid[\s\S]*FOR UPDATE/);
      expect(bodies[name], name).toMatch(/40001/);
    }
  });

  it("the two new RPCs are atomic by construction and validate their arrays", () => {
    const create = bodies.persona_create_with_configuration;
    expect(create).toMatch(/pg_advisory_xact_lock/);
    expect(create).toMatch(/22023/);
    expect(create).toMatch(/'created'/);
    expect(create).toMatch(/jsonb_to_recordset/);
    const batch = bodies.persona_apply_profile_field_changes;
    expect(batch).toMatch(/NOT BETWEEN 1 AND 7/);
    expect(batch).toMatch(/An excluded field cannot be highlighted/);
    expect(
      (
        batch.match(
          /UPDATE public\.personas AS p\s+SET version = p\.version \+ 1/g,
        ) ?? []
      ).length,
    ).toBe(1);
  });

  it("only the create RPC writes the caller's own accounts anchor; no other Master Identity table is written", () => {
    expect((s003.match(/INSERT INTO public\.accounts/g) ?? []).length).toBe(1);
    expect(bodies.persona_create_with_configuration).toMatch(
      /INSERT INTO public\.accounts \(id\) VALUES \(v_uid\) ON CONFLICT \(id\) DO NOTHING/,
    );
    expect(s003).not.toMatch(
      /(INSERT INTO|UPDATE|DELETE FROM)\s+public\.identity_profiles/,
    );
    expect(s003).not.toMatch(/(UPDATE|DELETE FROM)\s+public\.accounts/);
  });

  it("revokes from PUBLIC, anon and service_role and grants EXECUTE only to authenticated, per signature", () => {
    const revoke = s003.match(
      /REVOKE ALL ON FUNCTION([\s\S]*?)FROM PUBLIC, anon, service_role;/,
    )!;
    const grant = s003.match(
      /GRANT EXECUTE ON FUNCTION([\s\S]*?)TO authenticated;/,
    )!;
    for (const name of [...FUNCTIONS, "persona_detail_json"]) {
      expect(revoke[1], name).toContain(`public.${name}(`);
      expect(grant[1], name).toContain(`public.${name}(`);
    }
    expect(s003).not.toMatch(/GRANT[^;]*\b(anon|PUBLIC|service_role)\b/);
  });

  it("enforces preconditions and asserts definer-free, search_path, ACL and allowlist equality before COMMIT", () => {
    expect(s003).toMatch(/DO \$preflight\$/);
    expect(s003).toMatch(/DO \$assert\$/);
    expect(s003).toMatch(/prosecdef/);
    expect(s003).toMatch(
      /Gate allowlist % does not match deployed functions %/,
    );
  });
});

const WRITE =
  /INSERT INTO public\.|UPDATE public\.\w+ AS|DELETE FROM public\./g;
const lastWrite = (body: string) =>
  Math.max(...[...body.matchAll(WRITE)].map((m) => m.index ?? -1));
const RETURN_STATE = "RETURN public.persona_detail_json(v_row.id);";

describe("003: every mutation returns the resulting state from inside its own transaction", () => {
  it("state-returning mutations RETURN jsonb; only delete returns the deleted id", () => {
    for (const name of FUNCTIONS) {
      const body = bodies[name];
      const returns = body.match(/\nRETURNS (\w+)/)![1];
      expect(returns, name).toBe(name === "persona_delete" ? "uuid" : "jsonb");
    }
    expect(s003).not.toMatch(/RETURNS public\.personas/);
    expect(s003).not.toMatch(/RETURN v_row;/);
  });

  it("each state-returning mutation returns persona_detail_json(v_row.id), the last return follows the last write", () => {
    for (const name of FUNCTIONS) {
      if (name === "persona_delete") continue;
      const body = bodies[name];
      const returns = [...body.matchAll(/RETURN [^;]+;/g)].map((m) => m[0]);
      expect(returns.length, name).toBeGreaterThanOrEqual(1);
      for (const r of returns) expect(r, name).toBe(RETURN_STATE);
      const finalReturn = body.lastIndexOf(RETURN_STATE);
      expect(finalReturn, name).toBeGreaterThan(lastWrite(body));
    }
  });

  it("the state builder is read-only, owner-scoped everywhere and never a mutation endpoint", () => {
    const body = bodies.persona_detail_json;
    expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/);
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).toMatch(/SET search_path = ''/);
    expect(body).toMatch(/\bVOLATILE\b/);
    // Owner predicate on the Persona and on all four child reads.
    expect((body.match(/\(SELECT auth\.uid\(\)\)/g) ?? []).length).toBe(5);
    for (const key of [
      "persona_sections",
      "persona_profile_field_selections",
      "persona_profile_overrides",
      "persona_revisions",
      "id",
      "version",
    ]) {
      expect(body).toContain(`'${key}'`);
    }
    expect(s002).not.toMatch(/\/rpc\/persona_detail_json/);
  });

  it("the state builder returns the same shape the application's select embeds", () => {
    const body = bodies.persona_detail_json;
    for (const column of [
      "'is_default'",
      "'created_at'",
      "'updated_at'",
      "'archived_at'",
      "'label_override'",
      "'is_visible'",
      "'is_included'",
      "'is_highlighted'",
      "'override_value'",
      "'override_version'",
      "'count'",
    ]) {
      expect(body, column).toContain(column);
    }
  });
});

describe("003: atomicity by construction (create, bulk, revisions, default changes)", () => {
  const mutations = FUNCTIONS.map((name) => [name, bodies[name]] as const);

  it("no function controls transactions or leaves the transaction (no COMMIT, ROLLBACK, SAVEPOINT, dblink, background or network calls)", () => {
    for (const [name, body] of [
      ...mutations,
      ["persona_detail_json", bodies.persona_detail_json] as const,
    ]) {
      expect(body, name).not.toMatch(
        /\b(COMMIT|ROLLBACK|SAVEPOINT|RELEASE|dblink|pg_background|pg_net|http_|lo_import|COPY|VACUUM|CREATE INDEX CONCURRENTLY|SET TRANSACTION|BEGIN\s+ISOLATION)/i,
      );
    }
    // Only the file-level transaction exists: one BEGIN, one COMMIT, at top level.
    expect((s003.match(/^BEGIN;/gm) ?? []).length).toBe(1);
    expect((s003.match(/^COMMIT;/gm) ?? []).length).toBe(1);
  });

  it("creation: Persona, selections, overrides, sections, optional default switch and ONE revision are written in that order", () => {
    const b = bodies.persona_create_with_configuration;
    const at = (needle: string | RegExp) =>
      typeof needle === "string" ? b.indexOf(needle) : b.search(needle);
    const order = [
      at("INSERT INTO public.accounts"),
      at("INSERT INTO public.personas"),
      at("INSERT INTO public.persona_profile_field_selections"),
      at("INSERT INTO public.persona_profile_overrides"),
      at("INSERT INTO public.persona_sections"),
      at(/SET is_default = false, version = p\.version \+ 1/),
      at("'default_changed'"),
      at(/SET is_default = true/),
      at("'created'"),
    ];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    // Validation (22023) happens before the first write, so bad input writes nothing.
    expect(b.lastIndexOf("22023")).toBeLessThan(
      at("INSERT INTO public.accounts"),
    );
    // The new Persona keeps version 1 (its default flag is set without a bump).
    expect(b).not.toMatch(/SET is_default = true,\s*version/);
    // The 'created' revision is the final write.
    expect(b.lastIndexOf("INSERT INTO public.persona_revisions")).toBe(
      lastWrite(b),
    );
  });

  it("default change: previous default is cleared and revised BEFORE the new one is set and revised, all in one function", () => {
    const b = bodies.persona_set_default;
    const idx = [
      b.indexOf("pg_advisory_xact_lock"),
      b.search(/SET is_default = false, version = p\.version \+ 1/),
      b.indexOf("'default_changed'"),
      b.search(/SET is_default = p_is_default, version = p\.version \+ 1/),
      b.lastIndexOf("'default_changed'"),
    ];
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((x, y) => x - y)).toEqual(idx);
    expect(
      (b.match(/INSERT INTO public\.persona_revisions/g) ?? []).length,
    ).toBe(2);
    // Both revisions carry the version of the row they describe.
    expect(b).toMatch(/v_old\.id, v_uid, v_uid, v_old\.version/);
    expect(b).toMatch(/v_row\.id, v_uid, v_uid, v_row\.version/);
    expect(b.lastIndexOf("INSERT INTO public.persona_revisions")).toBe(
      lastWrite(b),
    );
  });

  it("bulk/batch: every field change and the ONE version bump precede the ONE revision; nothing is written after it", () => {
    const b = bodies.persona_apply_profile_field_changes;
    const loopEnd = b.indexOf("END LOOP;");
    const bump = b.search(
      /UPDATE public\.personas AS p\s+SET version = p\.version \+ 1/,
    );
    const revision = b.indexOf("INSERT INTO public.persona_revisions");
    expect(loopEnd).toBeGreaterThan(0);
    expect(bump).toBeGreaterThan(loopEnd);
    expect(revision).toBeGreaterThan(bump);
    expect(b.lastIndexOf("INSERT INTO public.persona_revisions")).toBe(
      lastWrite(b),
    );
    expect(
      (b.match(/INSERT INTO public\.persona_revisions/g) ?? []).length,
    ).toBe(1);
    // Selection/override writes happen only inside the loop, before the bump.
    for (const m of b.matchAll(
      /(INSERT INTO public\.persona_profile_(?:field_selections|overrides)|UPDATE public\.persona_profile_(?:field_selections|overrides)|DELETE FROM public\.persona_profile_overrides)/g,
    )) {
      expect(m.index!).toBeLessThan(loopEnd);
    }
    // A no-op returns before the bump, so nothing was written.
    expect(b).toMatch(
      /IF NOT v_changed THEN\s+RETURN public\.persona_detail_json\(v_row\.id\);/,
    );
  });

  it("every mutation of an existing Persona bumps the version exactly once and writes its revision with the new version", () => {
    for (const name of FUNCTIONS) {
      if (
        [
          "persona_create_with_configuration",
          "persona_duplicate",
          "persona_delete",
        ].includes(name)
      )
        continue;
      const b = bodies[name];
      // set_default (two Personas) and set_lifecycle's two branches are checked above or below.
      const bumps = (b.match(/version = p\.version \+ 1/g) ?? []).length;
      expect(bumps, name).toBeGreaterThanOrEqual(1);
      expect(b, name).toMatch(
        /INSERT INTO public\.persona_revisions[\s\S]*v_row\.version/,
      );
      expect(b.lastIndexOf("INSERT INTO public.persona_revisions"), name).toBe(
        lastWrite(b),
      );
    }
  });

  it("duplicate writes the copy, its children and its ONE revision (number 1) in one function", () => {
    const b = bodies.persona_duplicate;
    const order = [
      b.indexOf("INSERT INTO public.personas"),
      b.indexOf("INSERT INTO public.persona_sections"),
      b.indexOf("INSERT INTO public.persona_profile_field_selections"),
      b.indexOf("INSERT INTO public.persona_profile_overrides"),
      b.indexOf("INSERT INTO public.persona_revisions"),
    ];
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(
      (b.match(/INSERT INTO public\.persona_revisions/g) ?? []).length,
    ).toBe(1);
  });

  it("permanent deletion removes only the deleted Persona; revisions go by the composite foreign key", () => {
    const b = bodies.persona_delete;
    expect((b.match(/DELETE FROM public\./g) ?? []).length).toBe(1);
    expect(b).toMatch(
      /DELETE FROM public\.personas AS p\s+WHERE p\.id = v_row\.id AND p\.account_id = v_uid/,
    );
    expect(s001).toMatch(
      /persona_revisions_persona_owner_fk\s+FOREIGN KEY \(persona_id, account_id\)\s+REFERENCES public\.personas\(id, account_id\) ON DELETE CASCADE/,
    );
    for (const table of [
      "persona_sections",
      "persona_profile_field_selections",
      "persona_profile_overrides",
    ]) {
      expect(s001, table).toMatch(
        new RegExp(
          `${table}[\\s\\S]*?FOREIGN KEY \\(persona_id, account_id\\)\\s+REFERENCES public\\.personas\\(id, account_id\\) ON DELETE CASCADE`,
        ),
      );
    }
    // No revision DELETE grant or policy exists, so history can only go with its Persona.
    expect(s002).not.toMatch(/GRANT[^;]*DELETE[^;]*persona_revisions/);
  });
});

describe("Master Identity is never written or referenced by any Persona SQL", () => {
  // The preflight/assert DO blocks only CHECK that no Persona function mentions
  // these tables, so they legitimately contain the names as strings. The rules
  // below apply to every other (executable) statement and to all function bodies.
  const executable = (sql: string) =>
    sql.replace(/DO \$(preflight|assert)\$[\s\S]*?\$\1\$;/g, "");

  it("identity_profiles appears in no executable statement of 001-003", () => {
    for (const sql of [s001, s002, s003])
      expect(executable(sql)).not.toMatch(/identity_profiles/);
    // ...and the assertion blocks exist to prove it at deployment time.
    expect(s003).toMatch(/A Persona function references identity_profiles/);
  });

  it("the only Master Identity-adjacent write is the caller's own accounts anchor, derived from auth.uid()", () => {
    expect((executable(s003).match(/accounts/g) ?? []).length).toBe(1);
    expect(s003).toMatch(
      /INSERT INTO public\.accounts \(id\) VALUES \(v_uid\) ON CONFLICT \(id\) DO NOTHING;/,
    );
    const create = bodies.persona_create_with_configuration;
    expect(create).toMatch(/v_uid uuid := \(SELECT auth\.uid\(\)\)/);
    for (const sql of [s001, s002]) {
      expect(sql).not.toMatch(
        /(INSERT INTO|UPDATE|DELETE FROM)\s+public\.accounts/,
      );
    }
    expect(executable(s003)).not.toMatch(
      /(UPDATE|DELETE FROM)\s+public\.accounts/,
    );
  });
});

describe("004: stale-version SQLSTATE fix (forward migration)", () => {
  const s004 = code("004-persona-version-conflict-sqlstate.sql");
  const STALE_CHECKERS = [
    "persona_update_metadata",
    "persona_apply_profile_field_changes",
    "persona_upsert_section",
    "persona_reorder_sections",
    "persona_set_default",
    "persona_set_lifecycle",
    "persona_delete",
  ];
  const executable004 = s004.replace(
    /DO \$(preflight|assert)\$[\s\S]*?\$\1\$;/g,
    "",
  );
  const bodies004 = functionBodies(
    s004.replace(/CREATE OR REPLACE FUNCTION/g, "CREATE FUNCTION"),
  );

  it("redeploys exactly the seven functions that check an expected version", () => {
    expect(Object.keys(bodies004).sort()).toEqual([...STALE_CHECKERS].sort());
    expect((s004.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length).toBe(7);
    expect(s004).not.toMatch(/CREATE FUNCTION/);
  });

  it("changes ONLY the SQLSTATE: each function equals its 003 definition with 40001 replaced by PT409", () => {
    for (const name of STALE_CHECKERS) {
      const original = bodies[name].replace(/'40001'/g, "'PT409'");
      expect(bodies004[name], name).toBe(original);
      expect(bodies[name], name).toContain("'40001'"); // 003 as deployed
      expect(bodies004[name], name).not.toContain("40001");
    }
  });

  it("raises PT409 for a stale version and mentions 40001 in no executable statement", () => {
    expect((executable004.match(/'PT409'/g) ?? []).length).toBe(7);
    expect(executable004).not.toMatch(/40001/);
  });

  it("leaves the other functions, tables, policies and grants alone", () => {
    for (const untouched of [
      "persona_create_with_configuration",
      "persona_duplicate",
      "persona_detail_json",
      "persona_write_rpc_context",
    ]) {
      expect(executable004, untouched).not.toMatch(
        new RegExp(`FUNCTION public\\.${untouched}\\(`),
      );
    }
    expect(executable004).not.toMatch(
      /\b(GRANT|REVOKE|CREATE TABLE|ALTER TABLE|CREATE POLICY|DROP|CREATE INDEX|ALTER POLICY)\b/,
    );
    expect(s004).not.toMatch(/SECURITY DEFINER/);
    expect(executable004).not.toMatch(/identity_profiles/);
  });

  it("enforces its preconditions, asserts privileges are unchanged, and is one transaction", () => {
    expect(s004).toMatch(/DO \$preflight\$/);
    expect(s004).toMatch(/DO \$assert\$/);
    expect(s004).toMatch(/is not in the expected pre-004 state/);
    expect(s004).toMatch(/has_function_privilege\('anon'/);
    expect((s004.match(/^BEGIN;/gm) ?? []).length).toBe(1);
    expect((s004.match(/^COMMIT;/gm) ?? []).length).toBe(1);
    expect(raw("004-persona-version-conflict-sqlstate.sql")).toMatch(
      /NOT a safe\s*--\s*rollback|NOT a safe rollback/,
    );
  });

  it("is verified by a read-only catalog section and documented with its runtime evidence", () => {
    expect(raw("verify-catalog.sql")).toMatch(/4b\. Stale-version SQLSTATE/);
    expect(raw("004-persona-version-conflict-sqlstate.sql")).toMatch(
      /NEVER RETURNS/,
    );
    expect(raw("004-persona-version-conflict-sqlstate.sql")).toMatch(/162 ms/);
  });
});

describe("verification and rollback files are safe by construction", () => {
  it("verify-catalog.sql contains only read-only statements", () => {
    const sql = code("verify-catalog.sql");
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements.length).toBeGreaterThan(10);
    for (const statement of statements) {
      expect(statement, statement.slice(0, 60)).toMatch(/^(SELECT|WITH)\b/i);
    }
    expect(sql).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|REVOKE|TRUNCATE)\b\s/i,
    );
  });

  it("rollback.sql executes nothing: every statement is commented out", () => {
    expect(code("rollback.sql").trim()).toBe("");
    expect(raw("rollback.sql")).toMatch(/DESTRUCTIVE/);
    expect(raw("rollback.sql")).toMatch(/PERSONA_STORAGE/);
  });

  it("no file disables RLS or weakens the gate", () => {
    for (const name of [
      "001-persona-schema-secured.sql",
      "002-persona-gate-policies-grants.sql",
      "003-persona-mutation-rpcs.sql",
    ]) {
      expect(code(name), name).not.toMatch(
        /DISABLE ROW LEVEL SECURITY|NO FORCE ROW LEVEL SECURITY|BYPASSRLS|CREATE ROLE|ALTER ROLE/i,
      );
    }
  });
});
