import { readFileSync } from "node:fs";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState, useTransition } from "react";

const linkStatus = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: () => ({ pending: linkStatus.pending }) };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/profile" }));
vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => null,
}));

import { Button } from "@/components/ui/button";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";

/** Two buttons sharing one pending flag, like Publish / Unpublish on a screen. */
function Screen({ action }: { action: () => Promise<void> }) {
  const [pending, start] = useTransition();
  const [, setDialog] = useState(false);
  return (
    <>
      <Button
        pending={pending}
        disabled={pending}
        onClick={() => start(action)}
      >
        Publish
      </Button>
      <Button
        pending={pending}
        disabled={pending}
        onClick={() => setDialog(true)}
      >
        Unpublish
      </Button>
    </>
  );
}

afterEach(() => {
  linkStatus.pending = false;
  vi.useRealTimers();
});

describe("busy orbit on buttons", () => {
  it("shows only on the button whose click started the server call, then clears", async () => {
    let finish!: () => void;
    const action = () => new Promise<void>((resolve) => (finish = resolve));
    render(<Screen action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));

    const publish = screen.getByRole("button", { name: "Publish" });
    const unpublish = screen.getByRole("button", { name: "Unpublish" });
    expect(publish).toHaveAttribute("data-busy");
    expect(publish).toHaveAttribute("aria-busy", "true");
    expect(publish.querySelector(".busy-orbit")).not.toBeNull();
    expect(unpublish).not.toHaveAttribute("data-busy");
    expect(unpublish).toBeDisabled();

    await act(async () => finish());
    expect(publish).not.toHaveAttribute("data-busy");
    expect(publish.querySelector(".busy-orbit")).toBeNull();
  });

  it("a click that never starts a call does not light up a later call", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finish!: () => void;
    const action = () => new Promise<void>((resolve) => (finish = resolve));
    render(<Screen action={action} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: "Unpublish" }));
    await act(async () => vi.advanceTimersByTime(1000));
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(
      screen.getByRole("button", { name: "Unpublish" }),
    ).not.toHaveAttribute("data-busy");
    expect(screen.getByRole("button", { name: "Publish" })).toHaveAttribute(
      "data-busy",
    );
    await act(async () => finish());
  });

  it("busy forces the orbit on", () => {
    render(<Button busy>Pay</Button>);
    expect(screen.getByRole("button", { name: "Pay" })).toHaveAttribute(
      "data-busy",
    );
  });
});

describe("busy orbit on sidebar links", () => {
  it("appears inside a link while its page is loading", () => {
    linkStatus.pending = true;
    render(<WorkspaceFrame>content</WorkspaceFrame>);
    const nav = screen.getByRole("navigation", {
      name: "Workspace navigation",
    });
    const website = nav.querySelector('a[href="/website"]')!;
    expect(website.classList.contains("busy-surface")).toBe(true);
    expect(website.querySelector(".busy-orbit")).not.toBeNull();
  });

  it("is absent when nothing is loading", () => {
    render(<WorkspaceFrame>content</WorkspaceFrame>);
    expect(document.querySelector(".busy-orbit")).toBeNull();
  });
});

describe("busy orbit styles", () => {
  const css = readFileSync("src/styles/globals.css", "utf8");
  it("turns the element white, moves a dot along the border, and respects reduced motion", () => {
    expect(css).toMatch(
      /\.busy-surface:has\(> \.busy-orbit\),\s*\[data-busy\] \{[^}]*background: var\(--card\)/,
    );
    expect(css).toMatch(/offset-path: inset\(0 round var\(--busy-radius/);
    expect(css).toMatch(/@keyframes busy-orbit[\s\S]*offset-distance: 100%/);
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)[\s\S]*\.busy-orbit::before \{\s*animation: none/,
    );
  });
});
