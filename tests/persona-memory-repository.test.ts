import { describe, expect, it } from "vitest";
import { PersonaError } from "@/domains/personas/persona-errors";
import {
  ACCOUNT_A,
  ACCOUNT_B,
  newRepo,
  normalizedCreate,
} from "./helpers/persona-fixtures";

// These tests verify the IN-MEMORY FIXTURE ADAPTER's contract behaviour. They
// say nothing about the hosted database, RLS, or the request-path gate.

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("InMemoryPersonaRepository: creation", () => {
  it("creates an active, private, non-default Persona at version 1 with one revision", async () => {
    const { repo } = newRepo();
    const created = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate(),
    );
    expect(created).toMatchObject({
      status: "active",
      isDefault: false,
      version: 1,
      revisionCount: 1,
    });
    expect(created.selections.every((s) => !s.isIncluded)).toBe(true);
    expect(created.sections.every((s) => !s.isVisible)).toBe(true);
  });

  it("saves the whole configuration in one operation", async () => {
    const { repo } = newRepo();
    const input = normalizedCreate();
    input.selections[1] = { ...input.selections[1], isIncluded: true };
    input.overrides = [{ fieldKey: "headline", value: "Founder & CEO" }];
    input.sections[0] = { ...input.sections[0], isVisible: true };
    const created = await repo.createWithConfiguration(ACCOUNT_A, input);
    expect(created.version).toBe(1);
    expect(created.revisionCount).toBe(1);
    expect(created.overrides).toEqual([
      { fieldKey: "headline", value: "Founder & CEO", version: 1 },
    ]);
  });

  it("makes the new Persona the single default and clears the previous one atomically", async () => {
    const { repo } = newRepo();
    const first = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({ makeDefault: true }, "One"),
    );
    const second = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({ makeDefault: true }, "Two"),
    );
    const all = await repo.list(ACCOUNT_A);
    expect(all.filter((p) => p.isDefault).map((p) => p.id)).toEqual([
      second.id,
    ]);
    const previous = all.find((p) => p.id === first.id)!;
    expect(previous.version).toBe(2);
    expect(previous.revisionCount).toBe(2);
  });

  it("rejects a duplicate active name case-insensitively but allows reuse after archive", async () => {
    const { repo } = newRepo();
    const first = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "Founder"),
    );
    await expectCode(
      repo.createWithConfiguration(ACCOUNT_A, normalizedCreate({}, "FOUNDER")),
      "duplicate",
    );
    await repo.setLifecycle(ACCOUNT_A, first.id, first.version, "archived");
    await expect(
      repo.createWithConfiguration(ACCOUNT_A, normalizedCreate({}, "founder")),
    ).resolves.toMatchObject({ name: "founder" });
  });

  it("rolls back creation when the revision insert fails", async () => {
    const { repo } = newRepo({
      beforeRevisionInsert: () => {
        throw new Error("revision insert failed");
      },
    });
    await expect(
      repo.createWithConfiguration(ACCOUNT_A, normalizedCreate()),
    ).rejects.toThrow("revision insert failed");
    expect(await repo.list(ACCOUNT_A)).toEqual([]);
  });

  it("rejects an invalid highlight and an invalid override without partial writes", async () => {
    const { repo } = newRepo();
    const bad = normalizedCreate();
    bad.selections[0] = { ...bad.selections[0], isHighlighted: true };
    await expectCode(
      repo.createWithConfiguration(ACCOUNT_A, bad),
      "constraint",
    );
    const badUrl = normalizedCreate();
    badUrl.overrides = [
      { fieldKey: "website_url", value: "javascript:alert(1)" },
    ];
    await expectCode(
      repo.createWithConfiguration(ACCOUNT_A, badUrl),
      "constraint",
    );
    expect(await repo.list(ACCOUNT_A)).toEqual([]);
  });
});

describe("InMemoryPersonaRepository: versions, revisions and atomicity", () => {
  it("bumps the version and records exactly one revision per mutation", async () => {
    const { repo } = newRepo();
    const p = await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate());
    const updated = await repo.updateMetadata(ACCOUNT_A, p.id, 1, {
      name: "Founder",
      description: "Pitching",
      audience: null,
      purpose: null,
    });
    expect(updated.version).toBe(2);
    expect(updated.revisionCount).toBe(2);
  });

  it("treats an unchanged request as a no-op with no bump and no revision", async () => {
    const { repo } = newRepo();
    const p = await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate());
    const same = await repo.updateMetadata(ACCOUNT_A, p.id, 1, {
      name: p.name,
      description: null,
      audience: null,
      purpose: null,
    });
    expect(same.version).toBe(1);
    expect(same.revisionCount).toBe(1);
  });

  it("never overwrites silently: a stale version conflicts and changes nothing", async () => {
    const { repo } = newRepo();
    const p = await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate());
    await repo.updateMetadata(ACCOUNT_A, p.id, 1, {
      name: "Founder",
      description: "first",
      audience: null,
      purpose: null,
    });
    await expectCode(
      repo.updateMetadata(ACCOUNT_A, p.id, 1, {
        name: "Founder",
        description: "stale write",
        audience: null,
        purpose: null,
      }),
      "version_conflict",
    );
    const current = (await repo.get(ACCOUNT_A, p.id))!;
    expect(current.description).toBe("first");
    expect(current.version).toBe(2);
  });

  it("rolls back the whole mutation when the revision insert fails", async () => {
    let fail = false;
    const { repo } = newRepo({
      beforeRevisionInsert: () => {
        if (fail) throw new Error("revision insert failed");
      },
    });
    const p = await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate());
    fail = true;
    await expect(
      repo.updateMetadata(ACCOUNT_A, p.id, 1, {
        name: "Renamed",
        description: null,
        audience: null,
        purpose: null,
      }),
    ).rejects.toThrow("revision insert failed");
    const after = (await repo.get(ACCOUNT_A, p.id))!;
    expect(after).toMatchObject({
      name: "Founder",
      version: 1,
      revisionCount: 1,
    });
  });

  it("refuses edits to an archived Persona", async () => {
    const { repo } = newRepo();
    const p = await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate());
    const archived = await repo.setLifecycle(ACCOUNT_A, p.id, 1, "archived");
    await expectCode(
      repo.updateMetadata(ACCOUNT_A, p.id, archived.version, {
        name: "x",
        description: null,
        audience: null,
        purpose: null,
      }),
      "invalid_state",
    );
  });
});

describe("InMemoryPersonaRepository: field batches (atomic bulk and ordering)", () => {
  it("applies several fields as one version bump and one revision", async () => {
    const { repo } = newRepo();
    const p = await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate());
    const next = await repo.applyProfileFieldChanges(ACCOUNT_A, p.id, 1, [
      { fieldKey: "display_name", isIncluded: true },
      { fieldKey: "headline", isIncluded: true, isHighlighted: true },
      { fieldKey: "summary", isIncluded: true },
    ]);
    expect(next.version).toBe(2);
    expect(next.revisionCount).toBe(2);
    expect(next.selections.filter((s) => s.isIncluded)).toHaveLength(3);
  });

  it("is all-or-nothing: one invalid change rejects the whole batch", async () => {
    const { repo } = newRepo();
    const p = await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate());
    await expectCode(
      repo.applyProfileFieldChanges(ACCOUNT_A, p.id, 1, [
        { fieldKey: "display_name", isIncluded: true },
        { fieldKey: "location", isHighlighted: true }, // excluded -> invalid
      ]),
      "invalid_input",
    );
    const after = (await repo.get(ACCOUNT_A, p.id))!;
    expect(after.version).toBe(1);
    expect(after.selections.every((s) => !s.isIncluded)).toBe(true);
  });

  it("rejects an invalid override value without applying the other changes", async () => {
    const { repo } = newRepo();
    const p = await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate());
    await expectCode(
      repo.applyProfileFieldChanges(ACCOUNT_A, p.id, 1, [
        { fieldKey: "display_name", isIncluded: true },
        {
          fieldKey: "website_url",
          override: { action: "set", value: "not-a-url" },
        },
      ]),
      "constraint",
    );
    expect((await repo.get(ACCOUNT_A, p.id))!.version).toBe(1);
  });

  it("returns the row unchanged when nothing would change", async () => {
    const { repo } = newRepo();
    const p = await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate());
    const same = await repo.applyProfileFieldChanges(ACCOUNT_A, p.id, 1, [
      { fieldKey: "display_name", isIncluded: false },
    ]);
    expect(same.version).toBe(1);
    expect(same.revisionCount).toBe(1);
  });

  it("distinguishes set, intentional blank (NULL) and reset overrides", async () => {
    const { repo } = newRepo();
    const p = await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate());
    const set = await repo.applyProfileFieldChanges(ACCOUNT_A, p.id, 1, [
      { fieldKey: "headline", override: { action: "set", value: "Founder" } },
    ]);
    expect(set.overrides[0]).toMatchObject({ value: "Founder", version: 1 });
    const edited = await repo.applyProfileFieldChanges(ACCOUNT_A, p.id, 2, [
      { fieldKey: "headline", override: { action: "set", value: null } },
    ]);
    expect(edited.overrides[0]).toMatchObject({ value: null, version: 2 });
    const reset = await repo.applyProfileFieldChanges(ACCOUNT_A, p.id, 3, [
      { fieldKey: "headline", override: { action: "reset" } },
    ]);
    expect(reset.overrides).toEqual([]);
    expect(reset.version).toBe(4);
  });

  it("rejects an empty batch and repeated fields", async () => {
    const { repo } = newRepo();
    const p = await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate());
    await expectCode(
      repo.applyProfileFieldChanges(ACCOUNT_A, p.id, 1, []),
      "invalid_input",
    );
    await expectCode(
      repo.applyProfileFieldChanges(ACCOUNT_A, p.id, 1, [
        { fieldKey: "headline", isIncluded: true },
        { fieldKey: "headline", isIncluded: false },
      ]),
      "invalid_input",
    );
  });
});

describe("InMemoryPersonaRepository: sections", () => {
  it("reorders sections atomically and rejects an incomplete or foreign key set", async () => {
    const { repo } = newRepo();
    const p = await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate());
    const keys = p.sections.map((s) => s.sectionKey);
    const swapped = [keys[1], keys[0], ...keys.slice(2)];
    const next = await repo.reorderSections(ACCOUNT_A, p.id, 1, swapped);
    expect(next.sections.map((s) => s.sectionKey)).toEqual(swapped);
    expect(next.version).toBe(2);
    await expectCode(
      repo.reorderSections(ACCOUNT_A, p.id, 2, keys.slice(1)),
      "invalid_input",
    );
    await expectCode(
      repo.reorderSections(ACCOUNT_A, p.id, 2, [...keys.slice(1), "unknown"]),
      "invalid_input",
    );
    await expectCode(
      repo.reorderSections(ACCOUNT_A, p.id, 2, [
        keys[0],
        keys[0],
        ...keys.slice(2),
      ]),
      "invalid_input",
    );
  });

  it("returns a no-op for an unchanged order and unchanged section settings", async () => {
    const { repo } = newRepo();
    const p = await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate());
    const same = await repo.reorderSections(
      ACCOUNT_A,
      p.id,
      1,
      p.sections.map((s) => s.sectionKey),
    );
    expect(same.version).toBe(1);
    const unchanged = await repo.upsertSection(ACCOUNT_A, p.id, 1, {
      sectionKey: "profile",
      label: null,
      isVisible: false,
    });
    expect(unchanged.version).toBe(1);
  });

  it("shows, renames and hides a section with one revision each", async () => {
    const { repo } = newRepo();
    const p = await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate());
    const shown = await repo.upsertSection(ACCOUNT_A, p.id, 1, {
      sectionKey: "profile",
      label: "About me",
      isVisible: true,
    });
    expect(
      shown.sections.find((s) => s.sectionKey === "profile"),
    ).toMatchObject({
      label: "About me",
      isVisible: true,
    });
    expect(shown.revisionCount).toBe(2);
  });
});

describe("InMemoryPersonaRepository: default, archive, restore", () => {
  it("keeps at most one active default and revisions both changed Personas", async () => {
    const { repo } = newRepo();
    const a = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "A"),
    );
    const b = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "B"),
    );
    await repo.setDefault(ACCOUNT_A, a.id, 1, true);
    const switched = await repo.setDefault(ACCOUNT_A, b.id, 1, true);
    expect(switched.isDefault).toBe(true);
    const all = await repo.list(ACCOUNT_A);
    expect(all.filter((p) => p.isDefault)).toHaveLength(1);
    const old = all.find((p) => p.id === a.id)!;
    expect(old.isDefault).toBe(false);
    expect(old.version).toBe(3);
  });

  it("serializes competing set-default requests: exactly one default survives", async () => {
    const { repo } = newRepo();
    const a = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "A"),
    );
    const b = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "B"),
    );
    await Promise.all([
      repo.setDefault(ACCOUNT_A, a.id, 1, true),
      repo.setDefault(ACCOUNT_A, b.id, 1, true),
    ]);
    const defaults = (await repo.list(ACCOUNT_A)).filter((p) => p.isDefault);
    expect(defaults).toHaveLength(1);
  });

  it("allows no default and never promotes another Persona", async () => {
    const { repo } = newRepo();
    const a = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({ makeDefault: true }, "A"),
    );
    await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate({}, "B"));
    const archived = await repo.setLifecycle(
      ACCOUNT_A,
      a.id,
      a.version,
      "archived",
    );
    expect(archived.isDefault).toBe(false);
    expect((await repo.list(ACCOUNT_A)).some((p) => p.isDefault)).toBe(false);
  });

  it("restores as active and non-default, and refuses a name clash", async () => {
    const { repo } = newRepo();
    const a = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({ makeDefault: true }, "Founder"),
    );
    const archived = await repo.setLifecycle(
      ACCOUNT_A,
      a.id,
      a.version,
      "archived",
    );
    expect(archived.archivedAt).not.toBeNull();
    // Another active Persona now holds the name.
    await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "Founder"),
    );
    await expectCode(
      repo.setLifecycle(ACCOUNT_A, a.id, archived.version, "active"),
      "duplicate",
    );
    expect((await repo.get(ACCOUNT_A, a.id))!.status).toBe("archived");
  });

  it("restores cleanly when the name is free", async () => {
    const { repo } = newRepo();
    const a = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({ makeDefault: true }, "Founder"),
    );
    const archived = await repo.setLifecycle(
      ACCOUNT_A,
      a.id,
      a.version,
      "archived",
    );
    const restored = await repo.setLifecycle(
      ACCOUNT_A,
      a.id,
      archived.version,
      "active",
    );
    expect(restored).toMatchObject({
      status: "active",
      isDefault: false,
      archivedAt: null,
    });
  });

  it("does not let an archived Persona become the default", async () => {
    const { repo } = newRepo();
    const a = await repo.createWithConfiguration(ACCOUNT_A, normalizedCreate());
    const archived = await repo.setLifecycle(ACCOUNT_A, a.id, 1, "archived");
    await expectCode(
      repo.setDefault(ACCOUNT_A, a.id, archived.version, true),
      "invalid_state",
    );
  });
});

describe("InMemoryPersonaRepository: duplicate and delete", () => {
  it("duplicates configuration into a new active non-default Persona", async () => {
    const { repo } = newRepo();
    const input = normalizedCreate({ makeDefault: true }, "Founder");
    input.selections[1] = { ...input.selections[1], isIncluded: true };
    input.overrides = [{ fieldKey: "headline", value: "CEO" }];
    const source = await repo.createWithConfiguration(ACCOUNT_A, input);
    const copy = await repo.duplicate(ACCOUNT_A, source.id, "Founder (copy)");
    expect(copy).toMatchObject({
      status: "active",
      isDefault: false,
      version: 1,
      revisionCount: 1,
    });
    expect(copy.overrides).toEqual([
      { fieldKey: "headline", value: "CEO", version: 1 },
    ]);
    expect(copy.selections.filter((s) => s.isIncluded)).toHaveLength(1);
    const unchangedSource = (await repo.get(ACCOUNT_A, source.id))!;
    expect(unchangedSource.version).toBe(1);
    expect(unchangedSource.isDefault).toBe(true);
  });

  it("can duplicate an archived Persona and rejects a taken name", async () => {
    const { repo } = newRepo();
    const a = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "A"),
    );
    await repo.setLifecycle(ACCOUNT_A, a.id, 1, "archived");
    await expect(
      repo.duplicate(ACCOUNT_A, a.id, "A copy"),
    ).resolves.toBeTruthy();
    await expectCode(repo.duplicate(ACCOUNT_A, a.id, "a COPY"), "duplicate");
  });

  it("deletes only archived Personas, with the expected version", async () => {
    const { repo } = newRepo();
    const a = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "A"),
    );
    await expectCode(repo.delete(ACCOUNT_A, a.id, 1), "invalid_state");
    const archived = await repo.setLifecycle(ACCOUNT_A, a.id, 1, "archived");
    await expectCode(repo.delete(ACCOUNT_A, a.id, 1), "version_conflict");
    await expect(repo.delete(ACCOUNT_A, a.id, archived.version)).resolves.toBe(
      a.id,
    );
    expect(await repo.get(ACCOUNT_A, a.id)).toBeNull();
  });

  it("removes the Persona's own configuration and history but no other Persona", async () => {
    const { repo } = newRepo();
    const a = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "A"),
    );
    const b = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "B"),
    );
    const archived = await repo.setLifecycle(ACCOUNT_A, a.id, 1, "archived");
    await repo.delete(ACCOUNT_A, a.id, archived.version);
    expect((await repo.list(ACCOUNT_A)).map((p) => p.id)).toEqual([b.id]);
    expect((await repo.get(ACCOUNT_A, b.id))!.revisionCount).toBe(1);
  });

  it("handles create and delete interleaved without corrupting either", async () => {
    const { repo } = newRepo();
    const a = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate({}, "A"),
    );
    const archived = await repo.setLifecycle(ACCOUNT_A, a.id, 1, "archived");
    const [created, deleted] = await Promise.all([
      repo.createWithConfiguration(ACCOUNT_A, normalizedCreate({}, "B")),
      repo.delete(ACCOUNT_A, a.id, archived.version),
    ]);
    expect(deleted).toBe(a.id);
    expect((await repo.list(ACCOUNT_A)).map((p) => p.id)).toEqual([created.id]);
  });
});

describe("InMemoryPersonaRepository: account isolation", () => {
  it("never exposes or changes another account's Personas", async () => {
    const { repo } = newRepo();
    const mine = await repo.createWithConfiguration(
      ACCOUNT_A,
      normalizedCreate(),
    );
    expect(await repo.list(ACCOUNT_B)).toEqual([]);
    expect(await repo.get(ACCOUNT_B, mine.id)).toBeNull();
    await expectCode(
      repo.setLifecycle(ACCOUNT_B, mine.id, 1, "archived"),
      "not_found",
    );
    await expectCode(repo.delete(ACCOUNT_B, mine.id, 1), "not_found");
    await expectCode(repo.duplicate(ACCOUNT_B, mine.id, "Copy"), "not_found");
    expect((await repo.get(ACCOUNT_A, mine.id))!.status).toBe("active");
  });

  it("throws PersonaError instances carrying SQLSTATE-aligned codes", async () => {
    const { repo } = newRepo();
    await expect(
      repo.setDefault(ACCOUNT_A, "missing", 1, true),
    ).rejects.toBeInstanceOf(PersonaError);
  });
});
