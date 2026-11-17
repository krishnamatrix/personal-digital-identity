import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const path = vi.hoisted(() => ({ value: "/personas/abc" }));
vi.mock("next/navigation", () => ({
  usePathname: () => path.value,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Sign out</button>,
}));

import { WorkspaceFrame } from "@/components/workspace/workspace-frame";

describe("WorkspaceShell navigation", () => {
  it("lists only working destinations, with real hrefs", () => {
    path.value = "/personas/abc";
    render(<WorkspaceFrame>content</WorkspaceFrame>);
    const nav = screen.getByRole("navigation", {
      name: "Workspace navigation",
    });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["Overview", "/"],
      ["Profile", "/profile"],
      ["Articles & Thoughts", "/articles"],
      ["My Website", "/website"],
      ["Digital Cards", "/cards"],
      ["Insights", "/insights"],
      ["Personas", "/personas"],
      ["Social & Web Profiles", "/profile?section=social"],
      ["Featured Posts", "/profile?section=featured"],
    ]);
    expect(links.every((l) => l.getAttribute("href") !== "#")).toBe(true);
  });

  it("keeps out-of-scope destinations out of the active navigation", () => {
    render(<WorkspaceFrame>content</WorkspaceFrame>);
    const nav = screen.getByRole("navigation", {
      name: "Workspace navigation",
    });
    for (const label of [
      "Portfolio",
      "CV Studio",
      "AI Assistant",
      "Connected Accounts",
      "Privacy & Sharing",
      "Experience",
    ]) {
      expect(within(nav).queryByText(label)).toBeNull();
    }
  });

  it("marks the current page, including nested Persona routes", () => {
    path.value = "/personas/abc";
    render(<WorkspaceFrame>content</WorkspaceFrame>);
    expect(screen.getByRole("link", { name: "Personas" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("reflects the current section in the breadcrumb", () => {
    path.value = "/profile";
    render(<WorkspaceFrame>content</WorkspaceFrame>);
    expect(screen.getByText("My workspace").parentElement).toHaveTextContent(
      "Profile",
    );
  });
});
