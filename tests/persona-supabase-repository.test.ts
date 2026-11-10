import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PersonaPersistenceError,
  mapPersonaDbError,
} from "@/domains/personas/persona-db-errors";
import { PersonaError } from "@/domains/personas/persona-errors";
import {
  PERSONA_READ_RPC,
  PERSONA_RPC,
  SupabasePersonaRepository,
} from "@/lib/db/queries/personas";
import { normalizedCreate } from "./helpers/persona-fixtures";
import {
  OTHER,
  PERSONA,
  USER,
  createFakePostgrest,
  dbRow,
} from "./helpers/fake-postgrest";

// Adapter tests against a RECORDING FAKE client. They verify request shapes,
// session-derived ownership, response mapping and error mapping. They do not
// connect to Supabase and prove nothing about the database, RLS or the gate.

function setup(
  rpc: Parameters<typeof createFakePostgrest>[0]["rpc"] = {},
  rows: Record<string, unknown>[] = [dbRow()],
) {
  // persona_detail_json is owner-scoped in the database (it returns NULL for a
  // missing or foreign Persona); emulate only that contract, nothing more.
  const detail = (params: Record<string, unknown>) => ({
    data:
      rows.find(
        (row) => row.id === params.p_persona_id && row.account_id === USER,
      ) ?? null,
  });
  const fake = createFakePostgrest({
    userId: USER,
    rows,
    rpc: { [PERSONA_READ_RPC.detail]: detail, ...rpc },
  });
  const repo = new SupabasePersonaRepository(async () => fake.session);
  return { ...fake, repo };
}
type RpcMap = NonNullable<Parameters<typeof createFakePostgrest>[0]["rpc"]>;
const returnsRow = () => ({ data: dbRow() });
const allRpcs = (): RpcMap => ({
  ...(Object.fromEntries(
    Object.values(PERSONA_RPC).map((name) => [name, returnsRow]),
  ) as RpcMap),
  [PERSONA_RPC.delete]: () => ({ data: PERSONA }),
});
const rpcCalls = (calls: ReturnType<typeof setup>["calls"]) =>
  calls.filter((c) => c.kind === "rpc");

describe("session-derived ownership", () => {
  it("is the PostgREST adapter", () => {
    expect(setup().repo.kind).toBe("postgrest");
  });

  it("treats any account id other than the verified session user as not found, without touching the database", async () => {
    const { repo, calls } = setup();
    const meta = {
      name: "x",
      description: null,
      audience: null,
      purpose: null,
    };
    const attempts = [
      repo.list(OTHER),
      repo.get(OTHER, PERSONA),
      repo.createWithConfiguration(OTHER, normalizedCreate()),
      repo.updateMetadata(OTHER, PERSONA, 1, meta),
      repo.applyProfileFieldChanges(OTHER, PERSONA, 1, [
        { fieldKey: "headline", isIncluded: true },
      ]),
      repo.upsertSection(OTHER, PERSONA, 1, {
        sectionKey: "profile",
        label: null,
        isVisible: true,
      }),
      repo.reorderSections(OTHER, PERSONA, 1, ["profile"]),
      repo.setDefault(OTHER, PERSONA, 1, true),
      repo.setLifecycle(OTHER, PERSONA, 1, "archived"),
      repo.duplicate(OTHER, PERSONA, "Copy"),
      repo.delete(OTHER, PERSONA, 1),
    ];
    for (const attempt of attempts)
      await expect(attempt).rejects.toMatchObject({ code: "not_found" });
    expect(calls).toEqual([]);
  });

  it("scopes reads by the session user: list filters explicitly, detail uses the owner-scoped RPC", async () => {
    const { repo, calls } = setup();
    await repo.list(USER);
    await repo.get(USER, PERSONA);
    expect(calls).toHaveLength(2);
    const [list, detail] = calls;
    // list: one PostgREST select of personas, filtered by the verified user.
    expect(list).toMatchObject({
      kind: "select",
      table: "personas",
      filters: { account_id: USER },
    });
    // detail: persona_detail_json with ONLY the Persona id (no account parameter);
    // the function scopes by auth.uid() itself.
    expect(detail).toEqual({
      kind: "rpc",
      name: PERSONA_READ_RPC.detail,
      params: { p_persona_id: PERSONA },
    });
  });

  it("the read helper is not a mutation: it is never one of the gate-allowlisted RPCs", () => {
    expect(Object.values(PERSONA_RPC)).not.toContain(PERSONA_READ_RPC.detail);
  });

  it("never returns another account's row even if the backend handed one back", async () => {
    const { repo } = setup({}, [dbRow({ account_id: OTHER })]);
    // The fake applies the account_id filter, so the foreign row is not returned.
    expect(await repo.list(USER)).toEqual([]);
    expect(await repo.get(USER, PERSONA)).toBeNull();
  });

  it("treats a malformed id as missing without a database call", async () => {
    const { repo, calls } = setup();
    expect(await repo.get(USER, "not-a-uuid")).toBeNull();
    await expect(
      repo.setLifecycle(USER, "'; drop table x;--", 1, "archived"),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(repo.delete(USER, "1", 1)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(calls).toEqual([]);
  });
});

describe("one mutation = one RPC, with the documented parameters", () => {
  const meta = {
    name: "Founder",
    description: "d",
    audience: null,
    purpose: "p",
  };

  it("maps every repository operation to exactly ONE request: one RPC, no second read", async () => {
    const { repo, calls } = setup(allRpcs());

    await repo.createWithConfiguration(
      USER,
      normalizedCreate({ makeDefault: true }),
    );
    await repo.updateMetadata(USER, PERSONA, 1, meta);
    await repo.applyProfileFieldChanges(USER, PERSONA, 1, [
      { fieldKey: "headline", isIncluded: true },
    ]);
    await repo.upsertSection(USER, PERSONA, 1, {
      sectionKey: "profile",
      label: "About",
      isVisible: true,
    });
    await repo.reorderSections(USER, PERSONA, 1, ["profile", "experience"]);
    await repo.setDefault(USER, PERSONA, 1, true);
    await repo.setLifecycle(USER, PERSONA, 1, "archived");
    await repo.duplicate(USER, PERSONA, "Copy");
    await expect(repo.delete(USER, PERSONA, 1)).resolves.toBe(PERSONA);

    expect(rpcCalls(calls).map((c) => c.kind === "rpc" && c.name)).toEqual([
      PERSONA_RPC.createWithConfiguration,
      PERSONA_RPC.updateMetadata,
      PERSONA_RPC.applyProfileFieldChanges,
      PERSONA_RPC.upsertSection,
      PERSONA_RPC.reorderSections,
      PERSONA_RPC.setDefault,
      PERSONA_RPC.setLifecycle,
      PERSONA_RPC.duplicate,
      PERSONA_RPC.delete,
    ]);
    // The RPC returns the resulting state, so a mutation is never followed by a
    // read: nine operations, nine requests, zero selects.
    expect(calls).toHaveLength(9);
    expect(calls.filter((c) => c.kind === "select")).toHaveLength(0);
  });

  it("returns exactly the state the RPC returned from its own transaction (version, revisions, children)", async () => {
    const committed = dbRow({
      version: 7,
      is_default: true,
      persona_revisions: [{ count: 7 }],
      persona_profile_overrides: [],
    });
    const { repo, calls } = setup({
      [PERSONA_RPC.setDefault]: () => ({ data: committed }),
    });
    const result = await repo.setDefault(USER, PERSONA, 6, true);
    expect(result).toMatchObject({
      id: PERSONA,
      version: 7,
      isDefault: true,
      revisionCount: 7,
      overrides: [],
    });
    expect(result.sections.map((s) => s.sectionKey)).toEqual([
      "profile",
      "experience",
    ]);
    expect(calls).toHaveLength(1);
  });

  it("makes a single request even for create, bulk changes and duplicate", async () => {
    const { repo, calls } = setup(allRpcs());
    await repo.createWithConfiguration(USER, normalizedCreate());
    await repo.applyProfileFieldChanges(USER, PERSONA, 1, [
      { fieldKey: "summary", isIncluded: true },
      { fieldKey: "headline", override: { action: "reset" } },
    ]);
    await repo.duplicate(USER, PERSONA, "Copy");
    expect(calls.map((c) => c.kind)).toEqual(["rpc", "rpc", "rpc"]);
  });

  it("sends the complete create configuration in one call, with no account parameter", async () => {
    const { repo, calls } = setup({
      [PERSONA_RPC.createWithConfiguration]: returnsRow,
    });
    const input = normalizedCreate({ makeDefault: true });
    input.selections[1] = {
      ...input.selections[1],
      isIncluded: true,
      isHighlighted: true,
    };
    input.overrides = [{ fieldKey: "headline", value: null }];
    input.sections[0] = {
      ...input.sections[0],
      isVisible: true,
      label: "About",
    };
    await repo.createWithConfiguration(USER, input);
    const call = rpcCalls(calls)[0];
    if (call.kind !== "rpc") throw new Error("unreachable");
    expect(call.params).toMatchObject({
      p_name: "Founder",
      p_make_default: true,
      p_overrides: [{ field_key: "headline", value: null }],
    });
    expect((call.params.p_fields as unknown[]).length).toBe(7);
    expect((call.params.p_fields as Record<string, unknown>[])[1]).toEqual({
      field_key: "headline",
      is_included: true,
      is_highlighted: true,
      position: 1,
    });
    expect((call.params.p_sections as unknown[]).length).toBe(9);
    expect((call.params.p_sections as Record<string, unknown>[])[0]).toEqual({
      section_key: "profile",
      label: "About",
      is_visible: true,
      position: 0,
    });
  });

  it("encodes batch changes so omitted keys stay omitted, blanks are explicit and resets carry no value", async () => {
    const { repo, calls } = setup({
      [PERSONA_RPC.applyProfileFieldChanges]: returnsRow,
    });
    await repo.applyProfileFieldChanges(USER, PERSONA, 4, [
      { fieldKey: "display_name", isIncluded: false },
      { fieldKey: "headline", override: { action: "set", value: null } },
      { fieldKey: "summary", override: { action: "set", value: "Custom" } },
      { fieldKey: "location", override: { action: "reset" } },
      { fieldKey: "website_url", position: 3 },
    ]);
    const call = rpcCalls(calls)[0];
    if (call.kind !== "rpc") throw new Error("unreachable");
    expect(call.params.p_expected_version).toBe(4);
    expect(call.params.p_changes).toEqual([
      {
        field_key: "display_name",
        is_included: false,
        override_action: "keep",
      },
      { field_key: "headline", override_action: "set", override_value: null },
      {
        field_key: "summary",
        override_action: "set",
        override_value: "Custom",
      },
      { field_key: "location", override_action: "reset" },
      { field_key: "website_url", position: 3, override_action: "keep" },
    ]);
  });

  it("never sends an owner or account parameter on any call", async () => {
    const { repo, calls } = setup(allRpcs());
    await repo.updateMetadata(USER, PERSONA, 1, meta);
    await repo.duplicate(USER, PERSONA, "Copy");
    await repo.delete(USER, PERSONA, 1);
    for (const call of rpcCalls(calls)) {
      if (call.kind !== "rpc") continue;
      expect(Object.keys(call.params).join(" ")).not.toMatch(
        /account|user|owner/,
      );
      expect(JSON.stringify(call.params)).not.toContain(USER);
    }
  });

  it("sends exactly the parameters each SQL function declares (names cross-checked against 003)", async () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "docs/sql/milestone-3c/003-persona-mutation-rpcs.sql",
      ),
      "utf8",
    );
    const declared: Record<string, { all: string[]; required: string[] }> = {};
    for (const m of sql.matchAll(
      /CREATE FUNCTION public\.(persona_[a-z_]+)\(([^)]*)\)\s*\nRETURNS/g,
    )) {
      const params = m[2]
        .split(/,\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      declared[m[1]] = {
        all: params.map((p) => p.split(/\s+/)[0]),
        required: params
          .filter((p) => !/\bDEFAULT\b/i.test(p))
          .map((p) => p.split(/\s+/)[0]),
      };
    }
    // persona_detail_json is the read-only state builder the RPCs call; the
    // repository never calls it directly and it is not a mutation.
    expect(declared.persona_detail_json).toBeDefined();
    delete declared.persona_detail_json;
    expect(Object.keys(declared).sort()).toEqual(
      Object.values(PERSONA_RPC).sort(),
    );

    const { repo, calls } = setup(allRpcs());
    await repo.createWithConfiguration(USER, normalizedCreate());
    await repo.updateMetadata(USER, PERSONA, 1, meta);
    await repo.applyProfileFieldChanges(USER, PERSONA, 1, [
      { fieldKey: "headline", isIncluded: true },
    ]);
    await repo.upsertSection(USER, PERSONA, 1, {
      sectionKey: "profile",
      label: null,
      isVisible: true,
    });
    await repo.reorderSections(USER, PERSONA, 1, ["profile"]);
    await repo.setDefault(USER, PERSONA, 1, false);
    await repo.setLifecycle(USER, PERSONA, 1, "active");
    await repo.duplicate(USER, PERSONA, "Copy");
    await repo.delete(USER, PERSONA, 1);

    for (const call of rpcCalls(calls)) {
      if (call.kind !== "rpc") continue;
      const sent = Object.keys(call.params);
      const spec = declared[call.name];
      expect(spec, call.name).toBeDefined();
      for (const key of sent)
        expect(spec.all, `${call.name} sends unknown ${key}`).toContain(key);
      for (const key of spec.required)
        expect(sent, `${call.name} omits ${key}`).toContain(key);
    }
  });
});

describe("response mapping", () => {
  it("maps a row with embedded children to a PersonaDetail", async () => {
    const { repo } = setup();
    const detail = (await repo.get(USER, PERSONA))!;
    expect(detail).toMatchObject({
      id: PERSONA,
      name: "Founder",
      status: "active",
      isDefault: false,
      version: 1,
      revisionCount: 3,
      audience: "Investors",
      archivedAt: null,
    });
    expect(detail.createdAt).toBe("2026-11-09T09:00:00.000Z");
    expect(detail.updatedAt).toBe("2026-11-09T09:00:00.123Z");
    expect(detail.selections.map((s) => s.fieldKey)).toEqual([
      "display_name",
      "headline",
    ]);
    expect(detail.sections.map((s) => [s.sectionKey, s.label])).toEqual([
      ["profile", "About me"],
      ["experience", null],
    ]);
    expect(detail.overrides).toEqual([
      { fieldKey: "headline", value: null, version: 2 },
    ]);
  });

  it("returns null for a missing Persona and an empty list for none", async () => {
    const { repo } = setup({}, []);
    expect(await repo.get(USER, PERSONA)).toBeNull();
    expect(await repo.list(USER)).toEqual([]);
  });

  it("treats an unexpected response shape as a persistence failure that leaks nothing", async () => {
    const { repo } = setup({}, [
      { id: PERSONA, account_id: USER, name: 42, secret: "row data" },
    ]);
    const failure = await repo.get(USER, PERSONA).catch((e) => e);
    expect(failure).toBeInstanceOf(PersonaPersistenceError);
    expect(String(failure.message)).not.toMatch(/row data|secret|42/);
  });

  it("treats an RPC that returns no state as a persistence failure", async () => {
    const { repo } = setup({
      [PERSONA_RPC.setDefault]: () => ({ data: null }),
    });
    await expect(repo.setDefault(USER, PERSONA, 1, true)).rejects.toMatchObject(
      { code: "response" },
    );
  });

  it("does not leak database content from a malformed RPC state", async () => {
    const { repo } = setup({
      [PERSONA_RPC.setDefault]: () => ({
        data: { id: PERSONA, name: 42, secret: "row data" },
      }),
    });
    const failure = await repo
      .setDefault(USER, PERSONA, 1, true)
      .catch((e) => e);
    expect(failure).toBeInstanceOf(PersonaPersistenceError);
    expect(String(failure.message)).not.toMatch(/row data|secret|42/);
  });

  it("rejects a malformed RPC response", async () => {
    const { repo } = setup({
      [PERSONA_RPC.setDefault]: () => ({ data: "nope" }),
    });
    await expect(
      repo.setDefault(USER, PERSONA, 1, true),
    ).rejects.toBeInstanceOf(PersonaPersistenceError);
  });
});

describe("database error mapping (SQLSTATE -> stable domain errors)", () => {
  const code = (e: Error) =>
    e instanceof PersonaError
      ? e.code
      : `persistence:${(e as PersonaPersistenceError).code}`;

  it.each([
    ["28000", undefined, "unauthenticated"],
    ["P0002", undefined, "not_found"],
    ["PT409", undefined, "version_conflict"],
    ["40001", undefined, "version_conflict"],
    ["55000", "Persona is archived", "invalid_state"],
    [
      "55000",
      "Persona must be archived before it can be deleted",
      "invalid_state",
    ],
    ["22023", "Persona name is required", "invalid_input"],
    ["22P02", 'invalid input syntax for type uuid: "x"', "invalid_input"],
    ["23503", "violates foreign key", "dependency"],
    ["23514", "violates check constraint", "constraint"],
    [
      "23505",
      'duplicate key value violates unique constraint "personas_account_active_name_unique"',
      "duplicate",
    ],
    [
      "23505",
      'duplicate key value violates unique constraint "personas_account_slug_unique"',
      "duplicate",
    ],
  ])("%s (%s) -> %s", (sqlstate, message, expected) => {
    expect(code(mapPersonaDbError({ code: sqlstate, message }))).toBe(expected);
  });

  it("distinguishes archived-state messages", () => {
    expect(
      mapPersonaDbError({ code: "55000", message: "Persona is archived" })
        .message,
    ).toMatch(/read-only/);
    expect(
      mapPersonaDbError({
        code: "55000",
        message: "Persona must be archived before it can be deleted",
      }).message,
    ).toMatch(/Archive this Persona/);
  });

  it("maps a duplicate name to a field error on name", () => {
    const error = mapPersonaDbError({
      code: "23505",
      message:
        'violates unique constraint "personas_account_active_name_unique"',
    }) as PersonaError;
    expect(error.fieldErrors).toEqual({ name: [expect.any(String)] });
  });

  it("treats integrity-class unique violations and unmapped codes as persistence failures with only a code", () => {
    for (const [sqlstate, message] of [
      [
        "23505",
        'violates unique constraint "persona_revisions_persona_number_unique"',
      ],
      [
        "23505",
        'violates unique constraint "persona_sections_persona_position_unique"',
      ],
      [
        "42501",
        'new row violates row-level security policy for table "personas"',
      ],
      ["PGRST202", "Could not find the function public.persona_delete"],
      ["42883", "function does not exist"],
      [undefined, "network"],
    ] as const) {
      const error = mapPersonaDbError({
        code: sqlstate,
        message,
        details: "Key (account_id)=(secret)",
      });
      expect(error, `${sqlstate}`).toBeInstanceOf(PersonaPersistenceError);
      expect(error.message).toMatch(/^Persona persistence failed \(/);
      expect(error.message).not.toMatch(
        /row-level|function|secret|violates|network/i,
      );
    }
  });

  it("surfaces mapped errors through repository calls", async () => {
    const { repo } = setup({
      [PERSONA_RPC.updateMetadata]: () => ({
        error: {
          code: "40001",
          message: "Persona was changed by another request",
        },
      }),
      [PERSONA_RPC.delete]: () => ({
        error: {
          code: "55000",
          message: "Persona must be archived before it can be deleted",
        },
      }),
      [PERSONA_RPC.duplicate]: () => ({
        error: {
          code: "23505",
          message: 'unique constraint "personas_account_active_name_unique"',
        },
      }),
    });
    await expect(
      repo.updateMetadata(USER, PERSONA, 1, {
        name: "x",
        description: null,
        audience: null,
        purpose: null,
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await expect(repo.delete(USER, PERSONA, 1)).rejects.toMatchObject({
      code: "invalid_state",
    });
    await expect(repo.duplicate(USER, PERSONA, "Copy")).rejects.toMatchObject({
      code: "duplicate",
    });
  });

  it("maps read errors too", async () => {
    const fake = createFakePostgrest({
      userId: USER,
      selectError: {
        code: "42501",
        message: "permission denied for table personas",
      },
    });
    const repo = new SupabasePersonaRepository(async () => fake.session);
    await expect(repo.list(USER)).rejects.toBeInstanceOf(
      PersonaPersistenceError,
    );
  });
});

describe("detail reads through persona_detail_json", () => {
  it("returns null when the function returns NULL (missing or not the caller's)", async () => {
    const { repo } = setup({}, []);
    expect(await repo.get(USER, PERSONA)).toBeNull();
    // A row owned by someone else is invisible to the owner-scoped function.
    const foreign = setup({}, [dbRow({ account_id: OTHER })]);
    expect(await foreign.repo.get(USER, PERSONA)).toBeNull();
  });

  it("maps the returned state and surfaces a read error as a mapped domain error", async () => {
    const ok = setup();
    expect(await ok.repo.get(USER, PERSONA)).toMatchObject({
      id: PERSONA,
      revisionCount: 3,
    });
    const failing = setup({
      [PERSONA_READ_RPC.detail]: () => ({
        error: {
          code: "42501",
          message: "permission denied for function persona_detail_json",
        },
      }),
    });
    const failure = await failing.repo.get(USER, PERSONA).catch((e) => e);
    expect(failure).toBeInstanceOf(PersonaPersistenceError);
    expect(failure.message).not.toMatch(/permission denied|function/i);
  });
});

describe("PostgREST JWT failures", () => {
  it.each(["PGRST301", "PGRST302", "PGRST303"])(
    "%s -> unauthenticated (the session lapsed mid-request)",
    (code) => {
      const error = mapPersonaDbError({
        code,
        message: "JWT expired",
      }) as PersonaError;
      expect(error).toBeInstanceOf(PersonaError);
      expect(error.code).toBe("unauthenticated");
      expect(error.message).toBe("Sign in to manage your Personas.");
      expect(error.message).not.toMatch(/JWT/);
    },
  );
});

describe("mutations are never retried", () => {
  const meta = { name: "x", description: null, audience: null, purpose: null };

  it("sends a mutation exactly once even when the response is an ambiguous server error", async () => {
    const { repo, calls } = setup({
      [PERSONA_RPC.updateMetadata]: () => ({
        error: {
          code: "57014",
          message: "canceling statement due to statement timeout",
        },
      }),
    });
    await expect(
      repo.updateMetadata(USER, PERSONA, 1, meta),
    ).rejects.toBeInstanceOf(PersonaPersistenceError);
    expect(calls.filter((c) => c.kind === "rpc")).toHaveLength(1);
  });

  it("sends a mutation exactly once when the transport fails after the request may have committed", async () => {
    let attempts = 0;
    const session = {
      userId: USER,
      client: {
        from: () => {
          throw new Error("unused");
        },
        rpc: async () => {
          attempts += 1;
          throw new TypeError("fetch failed");
        },
      },
    };
    const repo = new SupabasePersonaRepository(async () => session as never);
    await expect(
      repo.createWithConfiguration(USER, normalizedCreate()),
    ).rejects.toThrow("fetch failed");
    await expect(
      repo.setLifecycle(USER, PERSONA, 1, "archived"),
    ).rejects.toThrow("fetch failed");
    await expect(repo.delete(USER, PERSONA, 1)).rejects.toThrow("fetch failed");
    // One attempt per call: nothing is retried, so nothing can be applied twice.
    expect(attempts).toBe(3);
  });

  it("the adapter and service contain no retry or backoff logic", () => {
    const sources = [
      "src/lib/db/queries/personas.ts",
      "src/domains/personas/persona-service.ts",
      "src/domains/personas/persona-db-errors.ts",
    ].map((f) =>
      readFileSync(join(process.cwd(), f), "utf8").replace(
        /\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm,
        "$1",
      ),
    );
    for (const source of sources)
      expect(source).not.toMatch(
        /\bretry\b|\bretries\b|backoff|setTimeout|attempt/i,
      );
  });
});
