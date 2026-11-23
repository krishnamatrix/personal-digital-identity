import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VideoStudio } from "@/components/video-studio/studio";

describe("intro studio review flow", () => {
  it("does not allow generation without a portrait and consent", () => {
    render(<VideoStudio />);
    fireEvent.click(screen.getByRole("button", { name: /3 Voice & consent/ }));
    expect(
      screen.getByRole("button", { name: "Create demo video" }),
    ).toBeDisabled();
    expect(screen.getByRole("option", { name: /Live avatar/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      screen.getByRole("button", { name: "Create demo video" }),
    ).toBeDisabled();
  });
  it("prepares a reviewed extractive script and clears approval on editing", () => {
    render(<VideoStudio />);
    fireEvent.click(screen.getByRole("button", { name: /2 Your story/ }));
    fireEvent.change(screen.getByLabelText("Résumé text"), {
      target: {
        value:
          "Jamie Chen\nProduct designer building accessible tools for people and helping engineering teams make useful products.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Prepare draft" }));
    expect(
      (screen.getByLabelText("Your introduction") as HTMLTextAreaElement).value,
    ).toContain("Product designer");
    fireEvent.click(screen.getByRole("button", { name: /3 Voice & consent/ }));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /2 Your story/ }));
    fireEvent.change(screen.getByLabelText("Your introduction"), {
      target: { value: "a new script" },
    });
    fireEvent.click(screen.getByRole("button", { name: /3 Voice & consent/ }));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("reset clears session-only résumé input", () => {
    render(<VideoStudio />);
    fireEvent.click(screen.getByRole("button", { name: /2 Your story/ }));
    fireEvent.change(screen.getByLabelText("Résumé text"), {
      target: { value: "private résumé text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    fireEvent.click(screen.getByRole("button", { name: /2 Your story/ }));
    expect(screen.getByLabelText("Résumé text")).toHaveValue("");
  });
});
