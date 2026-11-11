import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Sign out</button>,
}));

import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { Dashboard } from "@/components/workspace/dashboard";
import {
  WORKSPACE_FALLBACK_NAME,
  resolveViewerName,
} from "@/domains/identity/viewer-name";

describe("resolveViewerName", () => {
  const user = {
    email: "priya.n@example.com",
    user_metadata: { full_name: "Priya Natarajan" },
  };

  it("prefers the profile's display name, then its full name", () => {
    expect(
      resolveViewerName(
        { displayName: "Priya N", fullName: "Priya Natarajan" },
        user,
      ),
    ).toBe("Priya N");
    expect(
      resolveViewerName(
        { displayName: "  ", fullName: "Priya Natarajan" },
        user,
      ),
    ).toBe("Priya Natarajan");
  });

  it("falls back to the sign-up name when the profile cannot be read", () => {
    expect(resolveViewerName(null, user)).toBe("Priya Natarajan");
  });

  it("then to the email's local part, then a neutral label", () => {
    expect(resolveViewerName(null, { email: "priya.n@example.com" })).toBe(
      "priya.n",
    );
    expect(resolveViewerName(null, {})).toBe(WORKSPACE_FALLBACK_NAME);
  });
});

describe("workspace chrome", () => {
  it("shows the signed-in person, never a sample name", () => {
    render(
      <WorkspaceFrame viewer={{ name: "Priya Natarajan" }}>
        <Dashboard
          viewer={{
            name: "Priya Natarajan",
            headline: "Data lead",
            isPro: false,
          }}
        />
      </WorkspaceFrame>,
    );
    expect(screen.getAllByText("Priya Natarajan").length).toBeGreaterThan(1);
    expect(screen.getAllByText("PN").length).toBeGreaterThan(0);
    expect(screen.getByText("Data lead")).toBeInTheDocument();
    expect(screen.queryByText(/Alex Morgan/)).toBeNull();
  });

  it("uses a neutral label when nobody is known", () => {
    render(<WorkspaceFrame>content</WorkspaceFrame>);
    expect(screen.getAllByText(WORKSPACE_FALLBACK_NAME).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText(/Alex Morgan/)).toBeNull();
  });
});
