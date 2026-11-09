import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ service: null as unknown }));
vi.mock("@/domains/personas/persona-runtime", () => ({
  getPersonaService: () => {
    if (holder.service instanceof Error) throw holder.service;
    return holder.service;
  },
}));

import {
  applyFieldChangesAction,
  createPersonaAction,
  deletePersonaAction,
  setLifecycleAction,
} from "@/app/personas/actions";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { createFlowInput, makeService } from "./helpers/persona-fixtures";

beforeEach(() => {
  holder.service = makeService().service;
});

describe("persona server actions", () => {
  it("returns data on success", async () => {
    const result = await createPersonaAction(createFlowInput());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.persona.version).toBe(1);
  });

  it("maps validation errors to field errors", async () => {
    const result = await createPersonaAction(createFlowInput({ name: "" }));
    expect(result).toMatchObject({
      ok: false,
      code: "invalid_input",
      fieldErrors: { name: expect.any(Array) },
    });
  });

  it("maps a stale version to a version_conflict result and changes nothing", async () => {
    const created = await createPersonaAction(
      createFlowInput({ included: ["headline"] }),
    );
    if (!created.ok) throw new Error("setup");
    const id = created.data.persona.id;
    await applyFieldChangesAction(id, 1, [
      { fieldKey: "summary", isIncluded: true },
    ]);
    const stale = await applyFieldChangesAction(id, 1, [
      { fieldKey: "location", isIncluded: true },
    ]);
    expect(stale).toMatchObject({ ok: false, code: "version_conflict" });
  });

  it("refuses to delete an active Persona", async () => {
    const created = await createPersonaAction(createFlowInput());
    if (!created.ok) throw new Error("setup");
    expect(await deletePersonaAction(created.data.persona.id, 1)).toMatchObject(
      { ok: false, code: "invalid_state" },
    );
    const archived = await setLifecycleAction(
      created.data.persona.id,
      1,
      "archived",
    );
    if (!archived.ok) throw new Error("setup");
    expect(
      await deletePersonaAction(
        created.data.persona.id,
        archived.data.persona.version,
      ),
    ).toEqual({ ok: true, data: created.data.persona.id });
  });

  it("reports unauthenticated users without leaking details", async () => {
    holder.service = new AuthenticationRequiredError();
    expect(await createPersonaAction(createFlowInput())).toMatchObject({
      ok: false,
      code: "unauthenticated",
    });
  });

  it("hides unexpected failures behind a generic message", async () => {
    holder.service = new Error("connection string postgres://secret");
    const result = await createPersonaAction(createFlowInput());
    expect(result).toMatchObject({ ok: false, code: "unknown" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
