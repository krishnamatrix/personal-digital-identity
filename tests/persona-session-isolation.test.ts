import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercises the REAL runtime wiring and server actions. Only the Supabase
// session and the PostgREST client are faked, so identity can be proven to come
// from the verified session and so every database call the code makes is recorded.

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

const session = vi.hoisted(() => ({
  user: null as { id: string } | null,
  calls: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => {
  class AuthenticationRequiredError extends Error {}
  class AuthorizationError extends Error {}
  function builder(table: string) {
    const record = (method: string) => session.calls.push(`${table}.${method}`);
    const chain: Record<string, unknown> = {};
    for (const method of [
      "select",
      "eq",
      "insert",
      "update",
      "upsert",
      "delete",
    ]) {
      chain[method] = () => {
        record(method);
        return chain;
      };
    }
    chain.maybeSingle = async () => {
      record("maybeSingle");
      return {
        data: {
          account_id: session.user!.id,
          display_name: "Alex Morgan",
          headline: "Product leader",
          summary: "Summary",
          location: null,
          website_url: null,
          linkedin_url: null,
          github_url: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        error: null,
      };
    };
    return chain;
  }
  const client = {
    from: (table: string) => builder(table),
    rpc: (name: string) => {
      session.calls.push(`rpc.${name}`);
      return Promise.resolve({ data: null, error: null });
    },
  };
  return {
    AuthenticationRequiredError,
    AuthorizationError,
    createAuthenticatedClient: async () => {
      if (!session.user) throw new AuthenticationRequiredError();
      return { client, user: session.user };
    },
  };
});

import * as actions from "@/app/personas/actions";
import { createFlowInput } from "./helpers/persona-fixtures";

const asUser = (id: string | null) => {
  session.user = id ? { id } : null;
};

beforeEach(() => {
  (
    globalThis as { __folioonePersonaFixture?: unknown }
  ).__folioonePersonaFixture = undefined;
  session.calls = [];
  asUser(null);
});
afterEach(() => asUser(null));

async function createAsA() {
  asUser(USER_A);
  const result = await actions.createPersonaAction(
    createFlowInput({
      name: "Founder",
      included: ["headline"],
      visibleSections: ["profile"],
      makeDefault: true,
    }),
  );
  if (!result.ok) throw new Error("setup failed");
  return result.data.persona;
}

describe("identity comes from the verified session, never from the request", () => {
  it("rejects every action when there is no authenticated session", async () => {
    const results = await Promise.all([
      actions.createPersonaAction(createFlowInput()),
      actions.reloadPersonaAction("x"),
      actions.updatePersonaDetailsAction("x", 1, { name: "n" }),
      actions.applyFieldChangesAction("x", 1, [
        { fieldKey: "headline", isIncluded: true },
      ]),
      actions.moveFieldAction("x", 1, "headline", "up"),
      actions.previewBulkActionAction("x", 1, {
        category: "profile",
        kind: "include_all",
      }),
      actions.applyBulkActionAction("x", 1, {
        category: "profile",
        kind: "include_all",
      }),
      actions.saveSectionAction("x", 1, {
        sectionKey: "profile",
        label: null,
        isVisible: true,
      }),
      actions.moveSectionAction("x", 1, "profile", "down"),
      actions.setDefaultAction("x", 1, true),
      actions.setLifecycleAction("x", 1, "archived"),
      actions.duplicatePersonaAction("x", "Copy"),
      actions.deletePersonaAction("x", 1),
    ]);
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, code: "unauthenticated" });
    }
    expect(session.calls).toEqual([]);
  });

  it("a Persona created by A is invisible and untouchable to B through the real actions", async () => {
    const mine = await createAsA();
    const id = mine.id;
    asUser(USER_B);

    const attempts = [
      actions.reloadPersonaAction(id),
      actions.updatePersonaDetailsAction(id, 1, { name: "Hijacked" }),
      actions.applyFieldChangesAction(id, 1, [
        { fieldKey: "summary", isIncluded: true },
      ]),
      actions.moveFieldAction(id, 1, "headline", "up"),
      actions.previewBulkActionAction(id, 1, {
        category: "profile",
        kind: "include_all",
      }),
      actions.applyBulkActionAction(id, 1, {
        category: "profile",
        kind: "include_all",
      }),
      actions.saveSectionAction(id, 1, {
        sectionKey: "skills",
        label: null,
        isVisible: true,
      }),
      actions.moveSectionAction(id, 1, "experience", "up"),
      actions.setDefaultAction(id, 1, false),
      actions.setLifecycleAction(id, 1, "archived"),
      actions.setLifecycleAction(id, 1, "active"),
      actions.duplicatePersonaAction(id, "Stolen"),
      actions.deletePersonaAction(id, 1),
    ];
    for (const result of await Promise.all(attempts)) {
      expect(result).toMatchObject({ ok: false, code: "not_found" });
    }

    asUser(USER_A);
    const after = await actions.reloadPersonaAction(id);
    expect(after.ok && after.data.persona).toEqual(mine);
  });

  it("B's own Personas are separate from A's in the same process", async () => {
    const mine = await createAsA();
    asUser(USER_B);
    const theirs = await actions.createPersonaAction(
      createFlowInput({ name: "Founder", makeDefault: true }),
    );
    expect(theirs.ok).toBe(true);
    asUser(USER_A);
    const stillMine = await actions.reloadPersonaAction(mine.id);
    expect(stillMine.ok && stillMine.data.persona.isDefault).toBe(true);
    expect(stillMine.ok && stillMine.data.persona.version).toBe(1);
  });

  it("ignores any account identifier smuggled into action arguments", async () => {
    asUser(USER_B);
    const result = await actions.createPersonaAction({
      ...createFlowInput({ name: "Injected" }),
      accountId: USER_A,
      account_id: USER_A,
      userId: USER_A,
    });
    expect(result.ok).toBe(true);
    asUser(USER_A);
    const own = await actions.reloadPersonaAction(
      result.ok ? result.data.persona.id : "",
    );
    expect(own).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("Persona operations only read My Identity and never touch the database for Persona data", () => {
  it("runs the whole lifecycle with only a read-only identity_profiles select", async () => {
    asUser(USER_A);
    const created = await actions.createPersonaAction(
      createFlowInput({ included: ["headline"], visibleSections: ["profile"] }),
    );
    if (!created.ok) throw new Error("setup");
    const id = created.data.persona.id;
    await actions.applyFieldChangesAction(id, 1, [
      { fieldKey: "headline", override: { action: "set", value: "CEO" } },
    ]);
    await actions.applyBulkActionAction(id, 2, {
      category: "profile",
      kind: "include_all",
    });
    await actions.moveFieldAction(id, 3, "summary", "up");
    await actions.setDefaultAction(id, 4, true);
    const dup = await actions.duplicatePersonaAction(id, "Copy");
    const arch = await actions.setLifecycleAction(id, 5, "archived");
    await actions.setLifecycleAction(
      id,
      arch.ok ? arch.data.persona.version : 0,
      "active",
    );
    const second = await actions.setLifecycleAction(id, 7, "archived");
    await actions.deletePersonaAction(
      id,
      second.ok ? second.data.persona.version : 0,
    );
    await actions.reloadPersonaAction(dup.ok ? dup.data.persona.id : "");

    expect(session.calls.length).toBeGreaterThan(0);
    // Only the read path of the existing identity lookup: no writes, no RPC,
    // and never any Persona table.
    expect(new Set(session.calls)).toEqual(
      new Set([
        "identity_profiles.select",
        "identity_profiles.eq",
        "identity_profiles.maybeSingle",
      ]),
    );
    expect(
      session.calls.some((c) =>
        /persona|insert|update|upsert|delete|rpc\./i.test(c),
      ),
    ).toBe(false);
  });
});
