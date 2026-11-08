import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dashboard } from "@/components/workspace/dashboard";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

describe("workspace smoke tests", () => {
  it("renders identity overview and portfolio preview", () => {
    render(<Dashboard />);
    expect(
      screen.getByRole("heading", { name: "Good morning, Alex." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Portfolio preview")).toBeInTheDocument();
    expect(screen.getByText("Your personas")).toBeInTheDocument();
  });

  it("renders a shared design-system badge", () => {
    render(<Badge>Private</Badge>);
    expect(screen.getAllByText("Private")).toHaveLength(1);
  });

  it("merges conflicting utility classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
