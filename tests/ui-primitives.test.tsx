import { act, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LiveRegions, useAnnouncer } from "@/components/ui/live-region";
import { Switch } from "@/components/ui/switch";

describe("Switch", () => {
  it("is a keyboard-operable named switch with checked state", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch aria-label="Include Headline" onChange={onChange} />);
    const control = screen.getByRole("switch", { name: "Include Headline" });
    expect(control).not.toBeChecked();
    control.focus();
    await user.keyboard(" ");
    expect(control).toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("can be disabled", () => {
    render(<Switch aria-label="Highlight" disabled />);
    expect(screen.getByRole("switch")).toBeDisabled();
  });
});

describe("live announcements", () => {
  it("exposes polite and assertive regions", () => {
    render(
      <LiveRegions
        announcements={{ polite: "Saved", assertive: "Conflict" }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByRole("alert")).toHaveTextContent("Conflict");
  });

  it("re-announces an identical message", () => {
    const { result } = renderHook(() => useAnnouncer());
    act(() => result.current.announce("Saved"));
    const first = result.current.announcements.polite;
    act(() => result.current.announce("Saved"));
    expect(result.current.announcements.polite).not.toBe(first);
    expect(result.current.announcements.polite.replace("​", "")).toBe("Saved");
  });
});

describe("ConfirmDialog", () => {
  it("is a labelled dialog with Cancel and a danger confirm that runs once", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete it?"
        description="This cannot be undone."
        confirmLabel="Delete permanently"
        tone="danger"
        onConfirm={onConfirm}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Delete it?" });
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
    expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
    const confirm = screen.getByRole("button", { name: "Delete permanently" });
    expect(confirm.className).toMatch(/bg-danger/);
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables both actions while pending and when confirmation is not allowed", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Apply"
        description="d"
        confirmLabel="Apply"
        pending
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});

describe("danger token", () => {
  it("gives destructive buttons the semantic danger classes", () => {
    render(
      <>
        <Button variant="destructive">Delete</Button>
        <Button variant="destructive-outline">Delete…</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Delete" }).className).toMatch(
      /bg-danger/,
    );
    expect(screen.getByRole("button", { name: "Delete…" }).className).toMatch(
      /text-danger/,
    );
  });
});

describe("ConfirmDialog focus management", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open it
        </button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Sure?"
          description="d"
          confirmLabel="Yes"
          onConfirm={() => setOpen(false)}
        />
      </>
    );
  }

  it("moves focus into the dialog and returns it to the opener on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open it" });
    await user.click(opener);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });

  it("returns focus to the opener after Cancel too", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open it" });
    await user.click(opener);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(opener).toHaveFocus();
  });
});
