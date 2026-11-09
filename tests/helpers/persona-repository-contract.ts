import { afterAll, describe, expect, it } from "vitest";
import {
  PROFILE_FIELD_KEYS,
  STARTER_SECTIONS,
} from "@/domains/personas/persona-constants";
import type { PersonaRepository } from "@/domains/personas/persona-repository";
import type {
  NormalizedPersonaCreate,
  PersonaDetail,
} from "@/domains/personas/persona-types";

export type ContractSubject = { repo: PersonaRepository; accountId: string };
export type ContractWorld = { a: ContractSubject; b: ContractSubject };

/**
 * The repository contract, written only against the PersonaRepository interface so
 * the SAME assertions run against the in-memory fixture (unit tests) and the
 * Supabase adapter (hosted tests, which need the SQL executed and an explicit stage
 * approval). Subject `a` and `b` are two independent users. Names are unique per run
 * so the suite is safe on a persistent database, and every Persona it creates is
 * archived and deleted afterwards.
 */
export function describePersonaRepositoryContract(
  label: string,
  getWorld: () => ContractWorld | Promise<ContractWorld>,
  options: {
    /**
     * False only against a database where a stale version still signals SQLSTATE
     * 40001 (docs/sql/milestone-3c/003 as first deployed): PostgREST never returns
     * such a request, so those tests are reported BLOCKED until 004 is executed.
     */
    staleVersionDeployed?: boolean;
  } = {},
) {
  const staleVersionDeployed = options.staleVersionDeployed ?? true;
  const tag = Date.now().toString(36);
  let counter = 0;
  const name = (base = "Contract") => `${base} ${tag}-${++counter}`;
  const created: { subject: ContractSubject; id: string }[] = [];

  const config = (
    patch: Partial<NormalizedPersonaCreate> = {},
    n = name(),
  ): NormalizedPersonaCreate => ({
    metadata: { name: n, description: null, audience: null, purpose: null },
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
    ...patch,
  });
  const make = async (
    s: ContractSubject,
    patch: Partial<NormalizedPersonaCreate> = {},
    n?: string,
  ) => {
    const persona = await s.repo.createWithConfiguration(
      s.accountId,
      config(patch, n),
    );
    created.push({ subject: s, id: persona.id });
    return persona;
  };
  const clearDefault = async (s: ContractSubject) => {
    for (const p of await s.repo.list(s.accountId)) {
      if (p.isDefault)
        await s.repo.setDefault(s.accountId, p.id, p.version, false);
    }
  };
  /**
   * The state a mutation RETURNS (for the Supabase adapter: built by the RPC
   * inside its own transaction) must equal what a fresh read returns, so the
   * application never needs a second request and never sees a stale view.
   */
  const consistent = async (s: ContractSubject, returned: PersonaDetail) =>
    expect(await s.repo.get(s.accountId, returned.id)).toEqual(returned);
  const reject = (promise: Promise<unknown>, code: string) =>
    expect(promise).rejects.toMatchObject({ code });

  describe(`PersonaRepository contract: ${label}`, () => {
    afterAll(async () => {
      for (const { subject, id } of created) {
        try {
          let p = await subject.repo.get(subject.accountId, id);
          if (!p) continue;
          if (p.status === "active")
            p = await subject.repo.setLifecycle(
              subject.accountId,
              id,
              p.version,
              "archived",
            );
          await subject.repo.delete(subject.accountId, id, p.version);
        } catch {
          // best-effort cleanup
        }
      }
    });

    it("creates the complete configuration atomically at version 1 with one revision", async () => {
      const { a } = await getWorld();
      const input = config();
      input.selections[1] = {
        ...input.selections[1],
        isIncluded: true,
        isHighlighted: true,
      };
      input.overrides = [{ fieldKey: "headline", value: "Founder & CEO" }];
      input.sections[0] = {
        ...input.sections[0],
        isVisible: true,
        label: "About me",
      };
      const persona = await a.repo.createWithConfiguration(a.accountId, input);
      created.push({ subject: a, id: persona.id });
      expect(persona).toMatchObject({
        status: "active",
        isDefault: false,
        version: 1,
        revisionCount: 1,
      });
      expect(persona.selections).toHaveLength(7);
      expect(
        persona.selections.find((s) => s.fieldKey === "headline"),
      ).toMatchObject({ isIncluded: true, isHighlighted: true });
      expect(persona.overrides).toMatchObject([
        { fieldKey: "headline", value: "Founder & CEO" },
      ]);
      expect(persona.sections).toHaveLength(9);
      expect(
        persona.sections.find((s) => s.sectionKey === "profile"),
      ).toMatchObject({ isVisible: true, label: "About me" });
      const reread = await a.repo.get(a.accountId, persona.id);
      expect(reread).toEqual(persona);
    });

    it("rejects an invalid create without leaving a partial Persona", async () => {
      const { a } = await getWorld();
      const before = (await a.repo.list(a.accountId)).length;
      const bad = config();
      bad.overrides = [
        { fieldKey: "website_url", value: "javascript:alert(1)" },
      ];
      await expect(
        a.repo.createWithConfiguration(a.accountId, bad),
      ).rejects.toBeTruthy();
      expect((await a.repo.list(a.accountId)).length).toBe(before);
    });

    it("makes a new Persona the single default and revises the one it replaces", async () => {
      const { a } = await getWorld();
      await clearDefault(a);
      const first = await make(a, { makeDefault: true });
      expect(first).toMatchObject({ isDefault: true, version: 1 });
      const second = await make(a, { makeDefault: true });
      expect(second).toMatchObject({ isDefault: true, version: 1 });
      const previous = (await a.repo.get(a.accountId, first.id))!;
      expect(previous).toMatchObject({
        isDefault: false,
        version: 2,
        revisionCount: 2,
      });
      expect(
        (await a.repo.list(a.accountId)).filter((p) => p.isDefault),
      ).toHaveLength(1);
      await clearDefault(a);
    });

    it("refuses a duplicate active name, case-insensitively, creating nothing", async () => {
      const { a } = await getWorld();
      const n = name("Dup");
      await make(a, {}, n);
      const before = (await a.repo.list(a.accountId)).length;
      await reject(
        a.repo.createWithConfiguration(
          a.accountId,
          config({}, n.toUpperCase()),
        ),
        "duplicate",
      );
      expect((await a.repo.list(a.accountId)).length).toBe(before);
    });

    it("bumps the version and writes one revision per change; a no-op changes nothing", async () => {
      const { a } = await getWorld();
      const p = await make(a);
      const meta = {
        name: p.name,
        description: "Pitching",
        audience: null,
        purpose: null,
      };
      const updated = await a.repo.updateMetadata(a.accountId, p.id, 1, meta);
      expect(updated).toMatchObject({
        version: 2,
        revisionCount: 2,
        description: "Pitching",
      });
      const same = await a.repo.updateMetadata(a.accountId, p.id, 2, meta);
      expect(same).toMatchObject({ version: 2, revisionCount: 2 });
    });

    it.skipIf(!staleVersionDeployed)(
      "never overwrites silently: a stale version conflicts and changes nothing",
      async () => {
        const { a } = await getWorld();
        const p = await make(a);
        await a.repo.updateMetadata(a.accountId, p.id, 1, {
          name: p.name,
          description: "first",
          audience: null,
          purpose: null,
        });
        await reject(
          a.repo.updateMetadata(a.accountId, p.id, 1, {
            name: p.name,
            description: "stale",
            audience: null,
            purpose: null,
          }),
          "version_conflict",
        );
        expect(await a.repo.get(a.accountId, p.id)).toMatchObject({
          description: "first",
          version: 2,
        });
      },
    );

    it("applies several field changes as ONE bump and ONE revision, all or nothing", async () => {
      const { a } = await getWorld();
      const p = await make(a);
      const done = await a.repo.applyProfileFieldChanges(a.accountId, p.id, 1, [
        { fieldKey: "display_name", isIncluded: true },
        { fieldKey: "headline", isIncluded: true, isHighlighted: true },
        { fieldKey: "summary", isIncluded: true },
      ]);
      expect(done).toMatchObject({ version: 2, revisionCount: 2 });
      expect(done.selections.filter((s) => s.isIncluded)).toHaveLength(3);
      await consistent(a, done);

      await reject(
        a.repo.applyProfileFieldChanges(a.accountId, p.id, 2, [
          { fieldKey: "display_name", isIncluded: false },
          { fieldKey: "location", isHighlighted: true },
        ]),
        "invalid_input",
      );
      const after = (await a.repo.get(a.accountId, p.id))!;
      expect(after).toMatchObject({ version: 2, revisionCount: 2 });
      expect(
        after.selections.find((s) => s.fieldKey === "display_name")!.isIncluded,
      ).toBe(true);

      const noop = await a.repo.applyProfileFieldChanges(a.accountId, p.id, 2, [
        { fieldKey: "location", isIncluded: false },
      ]);
      expect(noop).toMatchObject({ version: 2, revisionCount: 2 });
    });

    it("distinguishes a set override, an intentional blank, and a reset", async () => {
      const { a } = await getWorld();
      const p = await make(a);
      const set = await a.repo.applyProfileFieldChanges(a.accountId, p.id, 1, [
        { fieldKey: "headline", override: { action: "set", value: "CEO" } },
      ]);
      expect(set.overrides).toMatchObject([
        { fieldKey: "headline", value: "CEO", version: 1 },
      ]);
      const blank = await a.repo.applyProfileFieldChanges(
        a.accountId,
        p.id,
        2,
        [{ fieldKey: "headline", override: { action: "set", value: null } }],
      );
      expect(blank.overrides).toMatchObject([
        { fieldKey: "headline", value: null, version: 2 },
      ]);
      const reset = await a.repo.applyProfileFieldChanges(
        a.accountId,
        p.id,
        3,
        [{ fieldKey: "headline", override: { action: "reset" } }],
      );
      expect(reset.overrides).toEqual([]);
      expect(reset.version).toBe(4);
      await consistent(a, reset);
    });

    it("upserts and reorders sections atomically, rejecting a wrong key set", async () => {
      const { a } = await getWorld();
      const p = await make(a);
      const shown = await a.repo.upsertSection(a.accountId, p.id, 1, {
        sectionKey: "profile",
        label: "About",
        isVisible: true,
      });
      expect(
        shown.sections.find((s) => s.sectionKey === "profile"),
      ).toMatchObject({ label: "About", isVisible: true });
      await consistent(a, shown);
      const keys = shown.sections.map((s) => s.sectionKey);
      const swapped = [keys[1], keys[0], ...keys.slice(2)];
      const reordered = await a.repo.reorderSections(
        a.accountId,
        p.id,
        2,
        swapped,
      );
      expect(reordered.sections.map((s) => s.sectionKey)).toEqual(swapped);
      expect(reordered.version).toBe(3);
      await consistent(a, reordered);
      await reject(
        a.repo.reorderSections(a.accountId, p.id, 3, keys.slice(1)),
        "invalid_input",
      );
      await reject(
        a.repo.reorderSections(a.accountId, p.id, 3, [
          ...keys.slice(1),
          "unknown",
        ]),
        "invalid_input",
      );
      expect((await a.repo.get(a.accountId, p.id))!.version).toBe(3);
    });

    it("manages default, archive and restore with the documented rules", async () => {
      const { a } = await getWorld();
      await clearDefault(a);
      const one = await make(a);
      const two = await make(a);
      const d1 = await a.repo.setDefault(a.accountId, one.id, 1, true);
      const d2 = await a.repo.setDefault(a.accountId, two.id, 1, true);
      expect(d2.isDefault).toBe(true);
      await consistent(a, d2);
      expect(await a.repo.get(a.accountId, one.id)).toMatchObject({
        isDefault: false,
        version: d1.version + 1,
      });
      expect(
        (await a.repo.list(a.accountId)).filter((p) => p.isDefault),
      ).toHaveLength(1);

      const archived = await a.repo.setLifecycle(
        a.accountId,
        two.id,
        d2.version,
        "archived",
      );
      expect(archived).toMatchObject({ status: "archived", isDefault: false });
      await consistent(a, archived);
      expect(archived.archivedAt).not.toBeNull();
      await reject(
        a.repo.setDefault(a.accountId, two.id, archived.version, true),
        "invalid_state",
      );
      await reject(
        a.repo.updateMetadata(a.accountId, two.id, archived.version, {
          name: "x",
          description: null,
          audience: null,
          purpose: null,
        }),
        "invalid_state",
      );
      const restored = await a.repo.setLifecycle(
        a.accountId,
        two.id,
        archived.version,
        "active",
      );
      expect(restored).toMatchObject({
        status: "active",
        isDefault: false,
        archivedAt: null,
      });
      await clearDefault(a);
    });

    it("duplicates configuration into a new non-default Persona and leaves the source alone", async () => {
      const { a } = await getWorld();
      const input = config();
      input.selections[2] = { ...input.selections[2], isIncluded: true };
      input.overrides = [{ fieldKey: "summary", value: "Custom" }];
      const source = await make(a, input);
      const copy = await a.repo.duplicate(a.accountId, source.id, name("Copy"));
      created.push({ subject: a, id: copy.id });
      expect(copy).toMatchObject({
        status: "active",
        isDefault: false,
        version: 1,
        revisionCount: 1,
      });
      expect(copy.overrides).toMatchObject([
        { fieldKey: "summary", value: "Custom", version: 1 },
      ]);
      expect(copy.selections.filter((s) => s.isIncluded)).toHaveLength(1);
      await consistent(a, copy);
      expect(await a.repo.get(a.accountId, source.id)).toMatchObject({
        version: 1,
        revisionCount: 1,
      });
    });

    it.skipIf(!staleVersionDeployed)(
      "deletes only archived Personas with the expected version, removing their configuration",
      async () => {
        const { a } = await getWorld();
        const keep = await make(a);
        const p = await make(a);
        await reject(a.repo.delete(a.accountId, p.id, 1), "invalid_state");
        const archived = await a.repo.setLifecycle(
          a.accountId,
          p.id,
          1,
          "archived",
        );
        await reject(a.repo.delete(a.accountId, p.id, 1), "version_conflict");
        await expect(
          a.repo.delete(a.accountId, p.id, archived.version),
        ).resolves.toBe(p.id);
        expect(await a.repo.get(a.accountId, p.id)).toBeNull();
        expect((await a.repo.list(a.accountId)).map((x) => x.id)).not.toContain(
          p.id,
        );
        expect(await a.repo.get(a.accountId, keep.id)).toMatchObject({
          version: 1,
        });
      },
    );

    it("isolates accounts: B cannot see or change A's Persona, even with its id", async () => {
      const { a, b } = await getWorld();
      const mine = await make(a, { makeDefault: false });
      const before = (await a.repo.get(a.accountId, mine.id)) as PersonaDetail;
      expect(await b.repo.get(b.accountId, mine.id)).toBeNull();
      expect((await b.repo.list(b.accountId)).map((p) => p.id)).not.toContain(
        mine.id,
      );
      const meta = {
        name: "Hijacked",
        description: null,
        audience: null,
        purpose: null,
      };
      // Thunks: each attempt starts only when awaited, so no rejection is ever
      // left unobserved while an earlier attempt is still being awaited.
      const attempts: (() => Promise<unknown>)[] = [
        () => b.repo.updateMetadata(b.accountId, mine.id, 1, meta),
        () =>
          b.repo.applyProfileFieldChanges(b.accountId, mine.id, 1, [
            { fieldKey: "headline", isIncluded: true },
          ]),
        () =>
          b.repo.upsertSection(b.accountId, mine.id, 1, {
            sectionKey: "skills",
            label: null,
            isVisible: true,
          }),
        () =>
          b.repo.reorderSections(
            b.accountId,
            mine.id,
            1,
            before.sections.map((s) => s.sectionKey).reverse(),
          ),
        () => b.repo.setDefault(b.accountId, mine.id, 1, true),
        () => b.repo.setLifecycle(b.accountId, mine.id, 1, "archived"),
        () => b.repo.duplicate(b.accountId, mine.id, name("Stolen")),
        () => b.repo.delete(b.accountId, mine.id, 1),
      ];
      for (const attempt of attempts) await reject(attempt(), "not_found");
      expect(await a.repo.get(a.accountId, mine.id)).toEqual(before);
    });

    it("keeps defaults and names independent per account", async () => {
      const { a, b } = await getWorld();
      await clearDefault(a);
      await clearDefault(b);
      const n = name("Shared");
      const pa = await make(a, { makeDefault: true }, n);
      const pb = await make(b, { makeDefault: true }, n);
      expect(await a.repo.get(a.accountId, pa.id)).toMatchObject({
        isDefault: true,
        version: 1,
      });
      expect(pb.isDefault).toBe(true);
      await clearDefault(a);
      await clearDefault(b);
    });

    it.skipIf(!staleVersionDeployed)(
      "lets exactly one of two concurrent edits from the same version win",
      async () => {
        const { a } = await getWorld();
        const p = await make(a);
        const edit = (suffix: string) =>
          a.repo.updateMetadata(a.accountId, p.id, 1, {
            name: p.name,
            description: suffix,
            audience: null,
            purpose: null,
          });
        const results = await Promise.allSettled([edit("one"), edit("two")]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const failed = results.find(
          (r) => r.status === "rejected",
        ) as PromiseRejectedResult;
        expect(failed.reason).toMatchObject({ code: "version_conflict" });
        expect(await a.repo.get(a.accountId, p.id)).toMatchObject({
          version: 2,
          revisionCount: 2,
        });
      },
    );
  });
}
