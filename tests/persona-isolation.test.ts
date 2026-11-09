import { describe, expect, it } from "vitest";
import {
  ACCOUNT_A,
  ACCOUNT_B,
  createFlowInput,
  makeService,
  newRepo,
  normalizedCreate,
} from "./helpers/persona-fixtures";

// Two different users against ONE repository instance, as in production where a
// single process-wide fixture serves every signed-in user. Every operation User
// B attempts on User A's Persona, using its real id, must fail exactly as if the
// Persona did not exist, and must leave User A's data byte-for-byte unchanged.

async function world() {
  const repo = newRepo().repo;
  const a = makeService({ repo, accountId: ACCOUNT_A });
  const b = makeService({ repo, accountId: ACCOUNT_B });
  const mine = await a.service.create(
    createFlowInput({
      name: "Founder",
      included: ["headline", "summary"],
      visibleSections: ["profile"],
      overrides: { headline: "CEO" },
      makeDefault: true,
    }),
  );
  return { repo, a, b, id: mine.persona.id };
}

describe("two-user isolation on one repository instance (service level)", () => {
  it("User B cannot read User A's Persona, even knowing its id", async () => {
    const { a, b, id } = await world();
    expect((await b.service.list("all")).personas).toEqual([]);
    expect((await b.service.list("all")).counts).toEqual({
      active: 0,
      archived: 0,
    });
    await expect(b.service.getEditorData(id)).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await a.service.list("all")).personas).toHaveLength(1);
  });

  it("every mutation by User B fails as not_found and changes nothing for User A", async () => {
    const { a, b, id } = await world();
    const before = await a.service.getEditorData(id);

    const attempts: Record<string, () => Promise<unknown>> = {
      updateDetails: () => b.service.updateDetails(id, 1, { name: "Hijacked" }),
      applyFieldChanges: () =>
        b.service.applyFieldChanges(id, 1, [
          { fieldKey: "location", isIncluded: true },
        ]),
      moveField: () => b.service.moveField(id, 1, "headline", "up"),
      previewBulk: () =>
        b.service.previewBulkAction(id, 1, {
          category: "profile",
          kind: "include_all",
        }),
      applyBulk: () =>
        b.service.applyBulkAction(id, 1, {
          category: "profile",
          kind: "exclude_all",
        }),
      saveSection: () =>
        b.service.saveSection(id, 1, {
          sectionKey: "skills",
          label: null,
          isVisible: true,
        }),
      moveSection: () => b.service.moveSection(id, 1, "experience", "up"),
      setDefaultOff: () => b.service.setDefault(id, 1, false),
      setDefaultOn: () => b.service.setDefault(id, 1, true),
      archive: () => b.service.setLifecycle(id, 1, "archived"),
      restore: () => b.service.setLifecycle(id, 1, "active"),
      duplicate: () => b.service.duplicate(id, "Stolen copy"),
      remove: () => b.service.remove(id, 1),
    };
    for (const [name, attempt] of Object.entries(attempts)) {
      await expect(attempt(), name).rejects.toMatchObject({
        code: "not_found",
      });
    }

    expect(await a.service.getEditorData(id)).toEqual(before);
    expect((await b.service.list("all")).personas).toEqual([]);
  });

  it("User B cannot restore or delete User A's archived Persona", async () => {
    const { a, b, id } = await world();
    const archived = await a.service.setLifecycle(id, 1, "archived");
    const v = archived.persona.version;
    await expect(b.service.setLifecycle(id, v, "active")).rejects.toMatchObject(
      { code: "not_found" },
    );
    await expect(b.service.remove(id, v)).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await a.service.getEditorData(id)).persona).toMatchObject({
      status: "archived",
      version: v,
    });
  });

  it("a foreign id is indistinguishable from a missing id (no existence oracle)", async () => {
    const { b, id } = await world();
    const foreign = await b.service.getEditorData(id).catch((e) => e);
    const missing = await b.service
      .getEditorData("does-not-exist")
      .catch((e) => e);
    expect([foreign.code, foreign.message]).toEqual([
      missing.code,
      missing.message,
    ]);
    const foreignWrite = await b.service
      .setLifecycle(id, 1, "archived")
      .catch((e) => e);
    const missingWrite = await b.service
      .setLifecycle("does-not-exist", 1, "archived")
      .catch((e) => e);
    expect([foreignWrite.code, foreignWrite.message]).toEqual([
      missingWrite.code,
      missingWrite.message,
    ]);
  });

  it("defaults are per account: B's default neither clears nor is blocked by A's", async () => {
    const { a, b, id } = await world();
    const theirs = await b.service.create(
      createFlowInput({ name: "Speaker", makeDefault: true }),
    );
    expect(theirs.persona.isDefault).toBe(true);
    const mine = (await a.service.getEditorData(id)).persona;
    expect(mine).toMatchObject({
      isDefault: true,
      version: 1,
      revisionCount: 1,
    });
    // B switching its own default leaves A untouched too.
    const second = await b.service.create(createFlowInput({ name: "Advisor" }));
    await b.service.setDefault(second.persona.id, 1, true);
    expect((await a.service.getEditorData(id)).persona.isDefault).toBe(true);
    expect(
      (await a.service.list("all")).personas.filter((p) => p.isDefault),
    ).toHaveLength(1);
  });

  it("the same Persona name can exist in both accounts independently", async () => {
    const { b } = await world();
    await expect(
      b.service.create(createFlowInput({ name: "Founder" })),
    ).resolves.toBeTruthy();
  });

  it("a payload naming another account is ignored: the Persona belongs to the session user", async () => {
    const { a, b } = await world();
    const injected = {
      ...createFlowInput({ name: "Injected" }),
      accountId: ACCOUNT_A,
      account_id: ACCOUNT_A,
      userId: ACCOUNT_A,
    };
    const created = await b.service.create(injected);
    expect((await b.service.list("all")).personas.map((p) => p.id)).toContain(
      created.persona.id,
    );
    expect(
      (await a.service.list("all")).personas.map((p) => p.name),
    ).not.toContain("Injected");
  });
});

describe("two-user isolation at the repository (raw account id)", () => {
  it("no repository method can reach another account's data", async () => {
    const { repo } = newRepo();
    const mine = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({ makeDefault: true }),
    );
    const before = await repo.get(ACCOUNT_A, mine.id);

    expect(await repo.list(ACCOUNT_B)).toEqual([]);
    expect(await repo.get(ACCOUNT_B, mine.id)).toBeNull();
    const meta = {
      name: "x",
      description: null,
      audience: null,
      purpose: null,
    };
    const calls: Promise<unknown>[] = [
      repo.updateMetadata(ACCOUNT_B, mine.id, 1, meta),
      repo.applyProfileFieldChanges(ACCOUNT_B, mine.id, 1, [
        { fieldKey: "headline", isIncluded: true },
      ]),
      repo.upsertSection(ACCOUNT_B, mine.id, 1, {
        sectionKey: "profile",
        label: null,
        isVisible: true,
      }),
      repo.reorderSections(
        ACCOUNT_B,
        mine.id,
        1,
        mine.sections.map((s) => s.sectionKey).reverse(),
      ),
      repo.setDefault(ACCOUNT_B, mine.id, 1, false),
      repo.setLifecycle(ACCOUNT_B, mine.id, 1, "archived"),
      repo.duplicate(ACCOUNT_B, mine.id, "Copy"),
      repo.delete(ACCOUNT_B, mine.id, 1),
    ];
    for (const call of calls)
      await expect(call).rejects.toMatchObject({ code: "not_found" });

    expect(await repo.get(ACCOUNT_A, mine.id)).toEqual(before);
    expect(await repo.list(ACCOUNT_B)).toEqual([]);
  });

  it("returned objects are copies: mutating them cannot corrupt stored state or another account", async () => {
    const { repo } = newRepo();
    const mine = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate(),
    );
    mine.name = "tampered";
    mine.selections[0].isIncluded = true;
    (await repo.list(ACCOUNT_A))[0].sections.length = 0;
    const stored = (await repo.get(ACCOUNT_A, mine.id))!;
    expect(stored.name).toBe("Founder");
    expect(stored.selections[0].isIncluded).toBe(false);
    expect(stored.sections).toHaveLength(9);
  });
});
