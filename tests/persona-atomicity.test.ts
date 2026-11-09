import { describe, expect, it } from "vitest";
import { InMemoryPersonaRepository } from "@/domains/personas/persona-memory-repository";
import {
  ACCOUNT_A,
  makeClock,
  makeIds,
  normalizedCreate,
} from "./helpers/persona-fixtures";

// Atomicity of the repository CONTRACT, verified by failure injection: a failure
// at the revision insert (the LAST step of every mutation) must leave NO part of
// the mutation behind. This exercises the fixture adapter's copy-on-write
// transactions. The same properties are asserted for PostgreSQL by construction
// (tests/persona-sql-package.test.ts) and at runtime by the hosted suite
// (tests/hosted/persona-persistence.hosted.ts); this file proves neither.

type Hook = (event: string, personaId: string) => void;

function world() {
  const clock = makeClock();
  const state: { hook: Hook } = { hook: () => {} };
  const repo = new InMemoryPersonaRepository({
    now: clock.now,
    newId: makeIds(),
    beforeRevisionInsert: (event, personaId) => state.hook(event, personaId),
  });
  const failOn =
    (predicate: (event: string, personaId: string, n: number) => boolean) =>
    () => {
      let n = 0;
      state.hook = (event, personaId) => {
        n += 1;
        if (predicate(event, personaId, n)) throw new Error("revision failed");
      };
    };
  const heal = () => {
    state.hook = () => {};
  };
  return { repo, failOn, heal };
}

const snapshot = async (repo: InMemoryPersonaRepository) =>
  JSON.stringify(await repo.list(ACCOUNT_A));

describe("atomicity: creation", () => {
  it("a failed revision insert leaves no Persona, no children and no default change", async () => {
    const { repo, failOn, heal } = world();
    const first = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({ makeDefault: true }, "First"),
    );
    const before = await snapshot(repo);

    failOn((event) => event === "created")();
    const input = normalizedCreate({ makeDefault: true }, "Second");
    input.selections[1] = { ...input.selections[1], isIncluded: true };
    input.overrides = [{ fieldKey: "headline", value: "CEO" }];
    input.sections[0] = { ...input.sections[0], isVisible: true };
    await expect(
      repo.createWithConfiguration(ACCOUNT_A, input),
    ).rejects.toThrow("revision failed");

    // Nothing of the failed create survives, including the default it would have taken.
    expect(await snapshot(repo)).toBe(before);
    expect(await repo.get(ACCOUNT_A, first.id)).toMatchObject({
      isDefault: true,
      version: 1,
      revisionCount: 1,
    });

    heal();
    await expect(
      repo.createWithConfiguration(ACCOUNT_A, input),
    ).resolves.toMatchObject({ version: 1, isDefault: true });
  });

  it("a failure while revising the replaced default also undoes the whole create", async () => {
    const { repo, failOn } = world();
    await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({ makeDefault: true }, "First"),
    );
    const before = await snapshot(repo);
    failOn((event) => event === "default_changed")();
    await expect(
      repo.createWithConfiguration(
        ACCOUNT_A,
        normalizedCreate({ makeDefault: true }, "Second"),
      ),
    ).rejects.toThrow("revision failed");
    expect(await snapshot(repo)).toBe(before);
  });

  it("invalid configuration rejects before anything is written", async () => {
    const { repo } = world();
    const bad = normalizedCreate({}, "Bad");
    bad.overrides = [{ fieldKey: "website_url", value: "not-a-url" }];
    await expect(
      repo.createWithConfiguration(ACCOUNT_A, bad),
    ).rejects.toMatchObject({ code: "constraint" });
    expect(await repo.list(ACCOUNT_A)).toEqual([]);
  });
});

describe("atomicity: bulk (batch) field changes", () => {
  it("a failed revision undoes EVERY field change, override and the version bump", async () => {
    const { repo, failOn, heal } = world();
    const p = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "P"),
    );
    await repo.applyProfileFieldChanges(ACCOUNT_A, p.id, 1, [
      { fieldKey: "summary", override: { action: "set", value: "Old" } },
    ]);
    const before = await snapshot(repo);

    failOn((event) => event === "updated")();
    await expect(
      repo.applyProfileFieldChanges(ACCOUNT_A, p.id, 2, [
        { fieldKey: "display_name", isIncluded: true },
        { fieldKey: "headline", isIncluded: true, isHighlighted: true },
        { fieldKey: "summary", override: { action: "reset" } },
        { fieldKey: "location", override: { action: "set", value: "Lisbon" } },
      ]),
    ).rejects.toThrow("revision failed");
    expect(await snapshot(repo)).toBe(before);

    heal();
    const ok = await repo.applyProfileFieldChanges(ACCOUNT_A, p.id, 2, [
      { fieldKey: "display_name", isIncluded: true },
      { fieldKey: "summary", override: { action: "reset" } },
    ]);
    expect(ok).toMatchObject({ version: 3, revisionCount: 3 });
  });

  it("an invalid entry anywhere in the batch rejects the entire batch", async () => {
    const { repo } = world();
    const p = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "P"),
    );
    const before = await snapshot(repo);
    await expect(
      repo.applyProfileFieldChanges(ACCOUNT_A, p.id, 1, [
        { fieldKey: "display_name", isIncluded: true },
        { fieldKey: "headline", isIncluded: true },
        { fieldKey: "location", isHighlighted: true },
      ]),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(await snapshot(repo)).toBe(before);
  });
});

describe("atomicity: default changes", () => {
  it("failing the NEW default's revision restores the previous default untouched", async () => {
    const { repo, failOn, heal } = world();
    const a = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "A"),
    );
    const b = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "B"),
    );
    const a2 = await repo.setDefault(ACCOUNT_A, a.id, 1, true);
    const before = await snapshot(repo);

    // set_default writes two revisions: the replaced default, then the new one.
    failOn((event, _id, n) => event === "default_changed" && n === 2)();
    await expect(repo.setDefault(ACCOUNT_A, b.id, 1, true)).rejects.toThrow(
      "revision failed",
    );
    expect(await snapshot(repo)).toBe(before);
    const stillA = (await repo.get(ACCOUNT_A, a.id))!;
    expect(stillA).toMatchObject({
      isDefault: true,
      version: a2.version,
      revisionCount: a2.revisionCount,
    });
    expect(await repo.get(ACCOUNT_A, b.id)).toMatchObject({
      isDefault: false,
      version: 1,
      revisionCount: 1,
    });

    heal();
    const done = await repo.setDefault(ACCOUNT_A, b.id, 1, true);
    expect(done.isDefault).toBe(true);
    expect(
      (await repo.list(ACCOUNT_A)).filter((p) => p.isDefault),
    ).toHaveLength(1);
  });

  it("failing the REPLACED default's revision leaves both Personas as they were", async () => {
    const { repo, failOn } = world();
    const a = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "A"),
    );
    const b = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "B"),
    );
    await repo.setDefault(ACCOUNT_A, a.id, 1, true);
    const before = await snapshot(repo);
    failOn((event, _id, n) => event === "default_changed" && n === 1)();
    await expect(repo.setDefault(ACCOUNT_A, b.id, 1, true)).rejects.toThrow(
      "revision failed",
    );
    expect(await snapshot(repo)).toBe(before);
  });

  it("archiving the default with a failed revision keeps it active and default", async () => {
    const { repo, failOn } = world();
    const a = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({ makeDefault: true }, "A"),
    );
    const before = await snapshot(repo);
    failOn((event) => event === "archived")();
    await expect(
      repo.setLifecycle(ACCOUNT_A, a.id, 1, "archived"),
    ).rejects.toThrow("revision failed");
    expect(await snapshot(repo)).toBe(before);
    expect(await repo.get(ACCOUNT_A, a.id)).toMatchObject({
      status: "active",
      isDefault: true,
      archivedAt: null,
    });
  });
});

describe("atomicity: revisions stay consistent with versions", () => {
  it("every committed mutation has exactly one revision, numbered with the new version", async () => {
    const { repo } = world();
    const p = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "P"),
    );
    await repo.updateMetadata(ACCOUNT_A, p.id, 1, {
      name: "P",
      description: "d",
      audience: null,
      purpose: null,
    });
    await repo.applyProfileFieldChanges(ACCOUNT_A, p.id, 2, [
      { fieldKey: "headline", isIncluded: true },
    ]);
    await repo.upsertSection(ACCOUNT_A, p.id, 3, {
      sectionKey: "profile",
      label: "About",
      isVisible: true,
    });
    const keys = (await repo.get(ACCOUNT_A, p.id))!.sections.map(
      (s) => s.sectionKey,
    );
    await repo.reorderSections(ACCOUNT_A, p.id, 4, [
      keys[1],
      keys[0],
      ...keys.slice(2),
    ]);
    await repo.setDefault(ACCOUNT_A, p.id, 5, true);
    await repo.setLifecycle(ACCOUNT_A, p.id, 6, "archived");
    const end = (await repo.get(ACCOUNT_A, p.id))!;
    expect(end.version).toBe(7);
    expect(end.revisionCount).toBe(7);
  });

  it("no-ops and rejected requests add no revision and no version", async () => {
    const { repo } = world();
    const p = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "P"),
    );
    await repo.updateMetadata(ACCOUNT_A, p.id, 1, {
      name: "P",
      description: null,
      audience: null,
      purpose: null,
    });
    await repo.applyProfileFieldChanges(ACCOUNT_A, p.id, 1, [
      { fieldKey: "headline", isIncluded: false },
    ]);
    await expect(
      repo.updateMetadata(ACCOUNT_A, p.id, 9, {
        name: "x",
        description: null,
        audience: null,
        purpose: null,
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    expect(await repo.get(ACCOUNT_A, p.id)).toMatchObject({
      version: 1,
      revisionCount: 1,
    });
  });

  it("deleting a Persona purges only its own revisions", async () => {
    const { repo } = world();
    const keep = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "Keep"),
    );
    await repo.updateMetadata(ACCOUNT_A, keep.id, 1, {
      name: "Keep",
      description: "x",
      audience: null,
      purpose: null,
    });
    const gone = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "Gone"),
    );
    const archived = await repo.setLifecycle(ACCOUNT_A, gone.id, 1, "archived");
    await repo.delete(ACCOUNT_A, gone.id, archived.version);
    expect(await repo.get(ACCOUNT_A, gone.id)).toBeNull();
    expect(await repo.get(ACCOUNT_A, keep.id)).toMatchObject({
      version: 2,
      revisionCount: 2,
    });
  });
});
