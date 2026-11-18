import { readFileSync } from "node:fs";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FieldControl, type FieldValue } from "@/app/profile/field-controls";
import { MonthPicker, monthLabel } from "@/components/ui/month-picker";
import type { FieldDef } from "@/domains/identity/entry-kinds";

// jsdom lacks the pointer-capture and scrolling APIs Radix Select calls.
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => {},
  releasePointerCapture: () => {},
  scrollIntoView: () => {},
});

function Harness({
  field,
  initial,
}: {
  field: FieldDef;
  initial?: FieldValue;
}) {
  const [value, setValue] = useState<FieldValue>(initial);
  return (
    <>
      <FieldControl
        field={field}
        idPrefix="t"
        value={value}
        onChange={setValue}
      />
      <output data-testid="value">{String(value ?? "")}</output>
    </>
  );
}

describe("workspace dropdown (no native <select>)", () => {
  const field: FieldDef = {
    key: "proficiency",
    label: "Proficiency",
    type: "select",
    options: [
      { value: "Native", label: "Native" },
      { value: "Fluent", label: "Fluent" },
    ],
  };

  it("opens our own menu and picks an option", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness field={field} />);
    expect(container.querySelector("select:not([aria-hidden])")).toBeNull();
    const trigger = screen.getByRole("combobox", { name: "Proficiency" });
    expect(trigger).toHaveTextContent("Select…");
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Fluent" }));
    expect(screen.getByTestId("value")).toHaveTextContent("Fluent");
    expect(trigger).toHaveTextContent("Fluent");
  });

  it("lets an optional choice be cleared", async () => {
    const user = userEvent.setup();
    render(<Harness field={field} initial="Native" />);
    await user.click(screen.getByRole("combobox", { name: "Proficiency" }));
    await user.click(
      await screen.findByRole("option", { name: "Clear selection" }),
    );
    expect(screen.getByTestId("value")).toHaveTextContent("");
  });
});

describe("month picker (no native <input type=month>)", () => {
  const field: FieldDef = { key: "startDate", label: "Start", type: "month" };

  it("shows the month in words and picks another month and year", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness field={field} initial="2024-03" />);
    expect(container.querySelector('input[type="month"]')).toBeNull();
    const trigger = screen.getByRole("button", { name: "Start" });
    expect(trigger).toHaveTextContent("March 2024");
    await user.click(trigger);
    await user.click(
      await screen.findByRole("menuitem", { name: "Previous year" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "July 2023" }));
    expect(screen.getByTestId("value")).toHaveTextContent("2023-07");

    expect(trigger).toHaveTextContent("July 2023");
    await user.click(trigger);
    await user.click(
      await screen.findByRole("menuitem", { name: /choose another year/ }),
    );
    await user.click(screen.getByRole("menuitem", { name: "2019" }));
    await user.click(screen.getByRole("menuitem", { name: "January 2019" }));
    expect(screen.getByTestId("value")).toHaveTextContent("2019-01");
  });

  it("clears to an empty value and shows the placeholder", async () => {
    const user = userEvent.setup();
    let value = "2024-03";
    const { rerender } = render(
      <MonthPicker value={value} onChange={(v) => (value = v)} />,
    );
    await user.click(screen.getByRole("button", { name: /March 2024/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Clear" }));
    expect(value).toBe("");
    rerender(<MonthPicker value={value} onChange={(v) => (value = v)} />);
    expect(
      screen.getByRole("button", { name: "Select month" }),
    ).toBeInTheDocument();
  });

  it("formats YYYY-MM and ignores anything else", () => {
    expect(monthLabel("2026-11")).toBe("November 2026");
    expect(monthLabel("2026-13")).toBe("");
  });
});

it("no native selects or month/date inputs remain in the app", () => {
  const files = [
    "src/app/profile/field-controls.tsx",
    "src/app/articles/page.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    expect(source, file).not.toMatch(
      /<select\b|type="(month|date|datetime-local)"/,
    );
  }
});
