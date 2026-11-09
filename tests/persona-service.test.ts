import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { zodFieldErrors } from "@/domains/personas/persona-schema";
import {
  ACCOUNT_A,
  ACCOUNT_B,
  CANONICAL,
  createFlowInput,
  makeService,
  newRepo,
} from "./helpers/persona-fixtures";

async function seed(included = ["display_name", "headline"]) {
  const ctx = makeService();
  const created = await ctx.service.create(
    createFlowInput({ included, visibleSections: ["profile"] }),
  );
  return { ...ctx, created };
}

describe("persona service: create flow as one operation", () => {
  it("persists metadata, fields, overrides and sections atomically at version 1", async () => {
    const { repo, service } = makeService();
    const result = await service.create(
      createFlowInput({
        included: ["display_name", "headline"],
        highlighted: ["headline"],
        overrides: { headline: "Founder & CEO" },
        visibleSections: ["profile"],
        makeDefault: true,
      }),
    );
    expect(result.persona).toMatchObject({
      version: 1,
      revisionCount: 1,
      isDefault: true,
      status: "active",
    });
    expect(result.persona.overrides).toEqual([
      { fieldKey: "headline", value: "Founder & CEO", version: 1 },
    ]);
    expect(result.preview.fields.map((f) => f.fieldKey)).toEqual([
      "display_name",
      "headline",
    ]);
    expect(await repo.list(ACCOUNT_A)).toHaveLength(1);
  });

  it("creates nothing when validation fails", async () => {
    const { repo, service } = makeService();
    await expect(
      service.create(createFlowInput({ name: "   " })),
    ).rejects.toBeInstanceOf(ZodError);
    expect(await repo.list(ACCOUNT_A)).toEqual([]);
  });

  it("reports field-level errors for name, highlight and override problems", async () => {
    const { service } = makeService();
    const noName = await service
      .create(createFlowInput({ name: "" }))
      .catch((e) => e);
    expect(zodFieldErrors(noName).name).toBeDefined();

    const input = createFlowInput({ included: [], highlighted: ["headline"] });
    const highlight = await service.create(input).catch((e) => e);
    expect(Object.keys(zodFieldErrors(highlight))[0]).toMatch(
      /fields\.1\.isHighlighted/,
    );

    const badUrl = await service
      .create(
        createFlowInput({
          included: ["website_url"],
          overrides: { website_url: "ftp://x" },
        }),
      )
      .catch((e) => e);
    expect(Object.values(zodFieldErrors(badUrl)).flat().join(" ")).toMatch(
      /http/,
    );
  });

  it("stores trimmed blank custom text as an intentional blank", async () => {
    const { service } = makeService();
    const result = await service.create(
      createFlowInput({
        included: ["headline"],
        overrides: { headline: "   " },
      }),
    );
    expect(result.persona.overrides[0].value).toBeNull();
    expect(result.preview.fields[0].provenance).toBe("blank");
  });

  it("starts every section hidden unless chosen", async () => {
    const { service } = makeService();
    const result = await service.create(
      createFlowInput({ visibleSections: ["skills"] }),
    );
    expect(
      result.persona.sections
        .filter((s) => s.isVisible)
        .map((s) => s.sectionKey),
    ).toEqual(["skills"]);
  });

  it("surfaces a duplicate name as a field error without creating", async () => {
    const { service } = makeService();
    await service.create(createFlowInput());
    await expect(
      service.create(createFlowInput({ name: "founder" })),
    ).rejects.toMatchObject({
      code: "duplicate",
      fieldErrors: { name: expect.any(Array) },
    });
    expect((await service.list("all")).personas).toHaveLength(1);
  });

  it("uses the verified account, never a client-supplied one", async () => {
    const repo = newRepo().repo;
    const a = makeService({ repo, accountId: ACCOUNT_A });
    const b = makeService({ repo, accountId: ACCOUNT_B });
    const input = { ...createFlowInput(), accountId: ACCOUNT_B } as unknown;
    await a.service.create(input);
    expect((await a.service.list("all")).personas).toHaveLength(1);
    expect((await b.service.list("all")).personas).toHaveLength(0);
  });
});

describe("persona service: Master Identity is read-only", () => {
  it("reads My Identity for previews and never alters it", async () => {
    const canonical = { ...CANONICAL };
    const snapshot = structuredClone(canonical);
    const loadCanonical = vi.fn(async () => canonical);
    const { service } = makeService({ loadCanonical });
    const created = await service.create(
      createFlowInput({
        included: ["headline"],
        overrides: { headline: "CEO" },
        visibleSections: ["profile"],
      }),
    );
    await service.applyFieldChanges(created.persona.id, 1, [
      { fieldKey: "headline", override: { action: "reset" } },
    ]);
    expect(loadCanonical).toHaveBeenCalled();
    expect(canonical).toEqual(snapshot);
  });

  it("still reports a successful change when My Identity cannot be read afterwards", async () => {
    const { service } = makeService({ failCanonical: true });
    const created = await service.create(createFlowInput());
    expect(created.canonicalAvailable).toBe(false);
    expect(created.persona.version).toBe(1);
    expect((await service.list("all")).personas).toHaveLength(1);
  });
});

describe("persona service: field changes, ordering and bulk actions", () => {
  it("moves a field with one atomic reorder and ignores moves past the ends", async () => {
    const { service, created } = await seed();
    const before = created.persona.selections.map((s) => s.fieldKey);
    const moved = await service.moveField(
      created.persona.id,
      1,
      "headline",
      "up",
    );
    expect(moved.persona.selections.map((s) => s.fieldKey).slice(0, 2)).toEqual(
      [before[1], before[0]],
    );
    expect(moved.persona.version).toBe(2);
    const atTop = await service.moveField(
      created.persona.id,
      2,
      "headline",
      "up",
    );
    expect(atTop.persona.version).toBe(2);
  });

  it("previews a bulk action without changing anything", async () => {
    const { service, created } = await seed();
    const summary = await service.previewBulkAction(created.persona.id, 1, {
      category: "profile",
      kind: "include_all",
    });
    expect(summary.affected).toHaveLength(5);
    expect(summary.unchangedCount).toBe(2);
    expect(
      (await service.getEditorData(created.persona.id)).persona.version,
    ).toBe(1);
  });

  it("applies a bulk action as one version bump and one revision", async () => {
    const { service, created } = await seed();
    const result = await service.applyBulkAction(created.persona.id, 1, {
      category: "profile",
      kind: "include_all",
    });
    expect(result.persona.version).toBe(2);
    expect(result.persona.revisionCount).toBe(2);
    expect(result.persona.selections.every((s) => s.isIncluded)).toBe(true);
  });

  it("clears highlights and resets overrides in bulk", async () => {
    const { service } = makeService();
    const created = await service.create(
      createFlowInput({
        included: ["headline", "summary"],
        highlighted: ["headline", "summary"],
        overrides: { headline: "A", summary: "B" },
      }),
    );
    const cleared = await service.applyBulkAction(created.persona.id, 1, {
      category: "profile",
      kind: "clear_highlights",
    });
    expect(cleared.persona.selections.some((s) => s.isHighlighted)).toBe(false);
    const reset = await service.applyBulkAction(created.persona.id, 2, {
      category: "profile",
      kind: "reset_overrides",
    });
    expect(reset.persona.overrides).toEqual([]);
    expect(reset.persona.version).toBe(3);
  });

  it("excluding everything also drops highlights", async () => {
    const { service } = makeService();
    const created = await service.create(
      createFlowInput({ included: ["headline"], highlighted: ["headline"] }),
    );
    const result = await service.applyBulkAction(created.persona.id, 1, {
      category: "profile",
      kind: "exclude_all",
    });
    expect(
      result.persona.selections.every((s) => !s.isIncluded && !s.isHighlighted),
    ).toBe(true);
  });

  it("makes a no-op bulk action change nothing", async () => {
    const { service, created } = await seed();
    const result = await service.applyBulkAction(created.persona.id, 1, {
      category: "profile",
      kind: "clear_highlights",
    });
    expect(result.persona.version).toBe(1);
  });

  it("refuses a bulk action planned against a stale version", async () => {
    const { service, created } = await seed();
    await service.updateDetails(created.persona.id, 1, {
      name: "Founder",
      description: "x",
    });
    await expect(
      service.previewBulkAction(created.persona.id, 1, {
        category: "profile",
        kind: "include_all",
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await expect(
      service.applyBulkAction(created.persona.id, 1, {
        category: "profile",
        kind: "include_all",
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    expect(
      (
        await service.getEditorData(created.persona.id)
      ).persona.selections.filter((s) => s.isIncluded),
    ).toHaveLength(2);
  });

  it("rejects unknown bulk categories and unknown fields", async () => {
    const { service, created } = await seed();
    await expect(
      service.previewBulkAction(created.persona.id, 1, {
        category: "experience",
        kind: "include_all",
      }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      service.applyFieldChanges(created.persona.id, 1, [
        { fieldKey: "ssn", isIncluded: true },
      ]),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("normalizes presentation text: blank becomes an intentional blank", async () => {
    const { service, created } = await seed();
    const set = await service.applyFieldChanges(created.persona.id, 1, [
      { fieldKey: "headline", override: { action: "set", value: "  " } },
    ]);
    expect(set.persona.overrides[0].value).toBeNull();
  });
});

describe("persona service: sections, lifecycle and listing", () => {
  it("moves sections and renames them, treating the default label as no override", async () => {
    const { service, created } = await seed();
    const moved = await service.moveSection(
      created.persona.id,
      1,
      "experience",
      "up",
    );
    expect(moved.persona.sections[0].sectionKey).toBe("experience");
    const renamed = await service.saveSection(created.persona.id, 2, {
      sectionKey: "profile",
      label: "About me",
      isVisible: true,
    });
    expect(
      renamed.persona.sections.find((s) => s.sectionKey === "profile")!.label,
    ).toBe("About me");
    const reverted = await service.saveSection(created.persona.id, 3, {
      sectionKey: "profile",
      label: "Profile",
      isVisible: true,
    });
    expect(
      reverted.persona.sections.find((s) => s.sectionKey === "profile")!.label,
    ).toBeNull();
  });

  it("rejects a section outside the starter set", async () => {
    const { service, created } = await seed();
    await expect(
      service.saveSection(created.persona.id, 1, {
        sectionKey: "secrets",
        label: null,
        isVisible: true,
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("archives, restores and deletes only in that order", async () => {
    const { service, created } = await seed();
    const id = created.persona.id;
    await expect(service.remove(id, 1)).rejects.toMatchObject({
      code: "invalid_state",
    });
    const archived = await service.setLifecycle(id, 1, "archived");
    await expect(
      service.setDefault(id, archived.persona.version, true),
    ).rejects.toMatchObject({ code: "invalid_state" });
    const restored = await service.setLifecycle(
      id,
      archived.persona.version,
      "active",
    );
    expect(restored.persona).toMatchObject({
      status: "active",
      isDefault: false,
    });
    const again = await service.setLifecycle(
      id,
      restored.persona.version,
      "archived",
    );
    await expect(service.remove(id, again.persona.version)).resolves.toBe(id);
    await expect(service.getEditorData(id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("duplicates with a new name", async () => {
    const { service, created } = await seed();
    const copy = await service.duplicate(created.persona.id, "Founder (copy)");
    expect(copy.persona.name).toBe("Founder (copy)");
    await expect(
      service.duplicate(created.persona.id, "  "),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("lists by filter with counts and a section preview", async () => {
    const { service, created } = await seed();
    const archived = await service.duplicate(created.persona.id, "Old");
    await service.setLifecycle(archived.persona.id, 1, "archived");
    const active = await service.list("active");
    expect(active.counts).toEqual({ active: 1, archived: 1 });
    expect(active.personas).toHaveLength(1);
    expect(active.personas[0]).toMatchObject({
      includedFieldCount: 2,
      visibleSectionLabels: ["Profile"],
    });
    expect(
      (await service.list("archived")).personas.map((p) => p.name),
    ).toEqual(["Old"]);
    expect((await service.list("all")).personas).toHaveLength(2);
  });

  it("keeps account data separate through the service", async () => {
    const repo = newRepo().repo;
    const a = makeService({ repo, accountId: ACCOUNT_A });
    const b = makeService({ repo, accountId: ACCOUNT_B });
    const created = await a.service.create(createFlowInput());
    await expect(
      b.service.getEditorData(created.persona.id),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      b.service.setLifecycle(created.persona.id, 1, "archived"),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects malformed ids and versions before touching storage", async () => {
    const { service } = makeService();
    await expect(service.getEditorData("")).rejects.toBeInstanceOf(ZodError);
    await expect(
      service.setLifecycle("p", 0, "archived"),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      service.setLifecycle("p", 1, "deleted"),
    ).rejects.toBeInstanceOf(ZodError);
  });
});
