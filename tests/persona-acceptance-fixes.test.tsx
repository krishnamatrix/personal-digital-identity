import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ service: null as unknown }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/personas",
}));
vi.mock("@/domains/personas/persona-runtime", () => ({
  getPersonaService: () => holder.service,
}));

import { reloadPersonaAction } from "@/app/personas/actions";
import { PersonaCreateFlow } from "@/app/personas/persona-create-flow";
import { PersonaPreview } from "@/app/personas/persona-preview";
import { initialsOf } from "@/app/personas/persona-ui";
import {
  PersonaError,
  isPersonaError,
} from "@/domains/personas/persona-errors";
import { resolvePersona } from "@/domains/personas/persona-resolver";
import {
  CANONICAL,
  makeService,
  normalizedCreate,
} from "./helpers/persona-fixtures";

beforeEach(() => {
  holder.service = makeService().service;
});

describe("error mapping survives a reloaded module instance", () => {
  // The fixture lives on globalThis and outlives hot reloads, so an error it
  // throws can come from an older copy of the PersonaError class.
  const lookalike = (code: string) =>
    Object.assign(new Error("old instance"), { name: "PersonaError", code });

  it("recognises PersonaError by shape as well as by class", () => {
    expect(isPersonaError(new PersonaError("not_found", "x"))).toBe(true);
    expect(isPersonaError(lookalike("version_conflict"))).toBe(true);
    expect(isPersonaError(new Error("plain"))).toBe(false);
    expect(
      isPersonaError(Object.assign(new Error("x"), { name: "PersonaError" })),
    ).toBe(false);
    expect(isPersonaError(null)).toBe(false);
    expect(isPersonaError("PersonaError")).toBe(false);
  });

  it("maps a lookalike conflict to a version_conflict result, not 'unknown'", async () => {
    holder.service = {
      getEditorData: async () => {
        throw lookalike("version_conflict");
      },
    };
    expect(await reloadPersonaAction("x")).toMatchObject({
      ok: false,
      code: "version_conflict",
    });
  });

  it("logs unexpected failures server-side and returns only a generic message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    holder.service = {
      getEditorData: async () => {
        throw new Error("connection string postgres://secret");
      },
    };
    const result = await reloadPersonaAction("x");
    expect(result).toMatchObject({ ok: false, code: "unknown" });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("monogram initials", () => {
  it.each([
    ["Alex Morgan", "AM"],
    ["Product Leader", "PL"],
    ["Founder", "F"],
    ["Founder (copy)", "F"],
    ["Founder 20056", "F"],
    ["Founder 20056 (copy)", "F"],
    ["Studio Morgan (copy)", "SM"],
    ["  ", ""],
    ["(copy)", ""],
  ])("%s -> %s", (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});

describe("preview wording", () => {
  function preview(includedCount: number) {
    const base = normalizedCreate();
    const selections = base.selections.map((s, i) => ({
      ...s,
      isIncluded: i < includedCount,
    }));
    return resolvePersona(
      { selections, overrides: [], sections: base.sections },
      CANONICAL,
    );
  }

  it("uses the singular for exactly one excluded field", () => {
    render(<PersonaPreview preview={preview(6)} personaName="P" />);
    expect(screen.getByText("Not shown (1 field)")).toBeVisible();
  });

  it("uses the plural otherwise", () => {
    render(<PersonaPreview preview={preview(5)} personaName="P" />);
    expect(screen.getByText("Not shown (2 fields)")).toBeVisible();
  });
});

describe("create review wording", () => {
  it("says '1 section shown' (singular) and '2 sections shown' (plural)", async () => {
    const user = userEvent.setup();
    render(
      <PersonaCreateFlow
        canonical={CANONICAL}
        canonicalAvailable
        storageKind="in-memory-fixture"
        starter="Founder"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(
      screen.getByRole("switch", { name: "Show Profile section" }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/1 section shown/)).toBeVisible();
    expect(screen.queryByText(/1 sections shown/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(
      screen.getByRole("switch", { name: "Show Skills section" }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/2 sections shown/)).toBeVisible();
  });
});
