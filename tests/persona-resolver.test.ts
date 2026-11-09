import { describe, expect, it } from "vitest";
import { resolvePersona } from "@/domains/personas/persona-resolver";
import { CANONICAL, normalizedCreate } from "./helpers/persona-fixtures";

function config(patch: Partial<ReturnType<typeof normalizedCreate>> = {}) {
  const base = normalizedCreate(patch);
  return {
    selections: base.selections,
    overrides: base.overrides.map((o) => ({ ...o, version: 1 })),
    sections: base.sections,
  };
}

describe("resolvePersona", () => {
  it("shows nothing and explains why when no field is included", () => {
    const result = resolvePersona(config(), CANONICAL);
    expect(result.fields).toEqual([]);
    expect(result.counts.excluded).toBe(7);
    expect(result.notices[0]).toMatch(/No My Identity fields are included/);
  });

  it("uses the current My Identity value when there is no override", () => {
    const c = config();
    c.selections[1] = { ...c.selections[1], isIncluded: true };
    const field = resolvePersona(c, CANONICAL).fields[0];
    expect(field).toMatchObject({
      fieldKey: "headline",
      value: "Product leader",
      provenance: "identity",
    });
    // A canonical change is reflected immediately: nothing was copied.
    const changed = resolvePersona(c, { ...CANONICAL, headline: "Founder" });
    expect(changed.fields[0].value).toBe("Founder");
  });

  it("prefers a Persona-specific override and marks its provenance", () => {
    const c = config();
    c.selections[1] = { ...c.selections[1], isIncluded: true };
    c.overrides = [{ fieldKey: "headline", value: "CEO", version: 1 }];
    const changed = resolvePersona(c, { ...CANONICAL, headline: "Founder" });
    expect(changed.fields[0]).toMatchObject({
      value: "CEO",
      provenance: "persona",
    });
    expect(changed.counts.overridden).toBe(1);
  });

  it("distinguishes an intentionally blank override from an empty canonical value", () => {
    const c = config();
    c.selections[1] = { ...c.selections[1], isIncluded: true };
    c.selections[5] = { ...c.selections[5], isIncluded: true };
    c.overrides = [{ fieldKey: "headline", value: null, version: 1 }];
    const result = resolvePersona(c, CANONICAL);
    const headline = result.fields.find((f) => f.fieldKey === "headline")!;
    const linkedin = result.fields.find((f) => f.fieldKey === "linkedin_url")!;
    expect(headline).toMatchObject({ value: null, provenance: "blank" });
    expect(linkedin).toMatchObject({ value: null, provenance: "empty" });
  });

  it("orders included fields by position and carries highlights", () => {
    const c = config();
    c.selections = c.selections.map((s) =>
      s.fieldKey === "summary"
        ? { ...s, isIncluded: true, isHighlighted: true, position: 0 }
        : s.fieldKey === "display_name"
          ? { ...s, isIncluded: true, position: 1 }
          : { ...s, position: s.position + 2 },
    );
    const result = resolvePersona(c, CANONICAL);
    expect(result.fields.map((f) => f.fieldKey)).toEqual([
      "summary",
      "display_name",
    ]);
    expect(result.fields[0].isHighlighted).toBe(true);
  });

  it("warns when included fields sit in a hidden Profile section", () => {
    const c = config();
    c.selections[0] = { ...c.selections[0], isIncluded: true };
    expect(resolvePersona(c, CANONICAL).notices[0]).toMatch(
      /Profile section is hidden/,
    );
    c.sections = c.sections.map((s) =>
      s.sectionKey === "profile" ? { ...s, isVisible: true } : s,
    );
    const shown = resolvePersona(c, CANONICAL);
    expect(shown.notices).toEqual([]);
    expect(
      shown.sections.find((s) => s.sectionKey === "profile")!.fields,
    ).toHaveLength(1);
  });

  it("applies a section label override without changing the default label", () => {
    const c = config();
    c.sections = c.sections.map((s) =>
      s.sectionKey === "profile"
        ? { ...s, label: "About me", isVisible: true }
        : s,
    );
    const section = resolvePersona(c, CANONICAL).sections.find(
      (s) => s.sectionKey === "profile",
    )!;
    expect(section).toMatchObject({
      label: "About me",
      defaultLabel: "Profile",
    });
  });
});
