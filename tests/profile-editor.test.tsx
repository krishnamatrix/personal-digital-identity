import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfileEditor } from "@/app/profile/profile-editor";

vi.mock("@/app/profile/actions", () => ({
  saveProfileAction: async (state: unknown) => state,
}));

describe("ProfileEditor", () => {
  it("shows private profile fields and the private-by-default message", () => {
    render(
      <ProfileEditor
        profile={{
          displayName: "Alex Morgan",
          headline: null,
          summary: null,
          location: null,
          websiteUrl: null,
          linkedinUrl: null,
          githubUrl: null,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Your profile" })).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("Alex Morgan");
    expect(screen.getByLabelText("Professional headline")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Private by default. Saving does not publish or share this information.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeVisible();
  });
});
