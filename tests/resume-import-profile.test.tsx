import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => vi.fn());
vi.mock("@/app/onboarding/actions", () => ({ importResumeAction: action }));

import { ResumeImportPanel } from "@/app/profile/resume-import-panel";

const pdf = () => new File(["%PDF-1.7"], "cv.pdf", { type: "application/pdf" });

beforeEach(() => {
  action.mockReset();
  window.localStorage.clear();
});

describe("resume import from the profile", () => {
  it("suggests it prominently when the profile has no work or studies yet", async () => {
    const user = userEvent.setup();
    render(
      <ResumeImportPanel
        suggest
        hasUnsavedChanges={false}
        onImported={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        "Skipped the resume step? Fill your profile in a minute",
      ),
    ).toBeInTheDocument();
    // Dismissing leaves a small button, and stays dismissed next time.
    await user.click(
      screen.getByRole("button", { name: "Hide this suggestion" }),
    );
    expect(
      screen.queryByText(/Skipped the resume step/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import from resume" }),
    ).toBeInTheDocument();
    expect(
      window.localStorage.getItem("folioone:resume-prompt-dismissed"),
    ).toBe("1");
  });

  it("is always available as a button on a filled-in profile", () => {
    render(
      <ResumeImportPanel
        suggest={false}
        hasUnsavedChanges={false}
        onImported={vi.fn()}
      />,
    );
    expect(
      screen.queryByText(/Skipped the resume step/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import from resume" }),
    ).toBeInTheDocument();
  });

  it("imports, says nothing existing changes, and refreshes the profile", async () => {
    action.mockResolvedValue({
      ok: true,
      summary: {
        profileFields: ["headline"],
        added: { education: 2 },
        skipped: 0,
      },
      values: {},
    });
    const onImported = vi.fn();
    const user = userEvent.setup();
    render(
      <ResumeImportPanel
        suggest
        hasUnsavedChanges={false}
        onImported={onImported}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Import resume" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "nothing you have already written changes",
    );
    await user.upload(screen.getByLabelText(/choose a file/i), pdf());
    await user.click(screen.getByRole("button", { name: "Import resume" }));
    expect(
      await screen.findByText("Your resume has been added to your profile"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 × education")).toBeInTheDocument();
    expect(screen.getByText(/Review the new entries/)).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it("asks to save unsaved edits first, so the import cannot discard them", async () => {
    const user = userEvent.setup();
    render(
      <ResumeImportPanel
        suggest={false}
        hasUnsavedChanges
        onImported={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Import from resume" }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Save your changes first",
    );
    expect(screen.queryByLabelText(/choose a file/i)).not.toBeInTheDocument();
  });

  it("shows errors from the server, like a file that is not a resume", async () => {
    action.mockResolvedValue({
      ok: false,
      message: "This does not look like a resume or CV.",
    });
    const user = userEvent.setup();
    render(
      <ResumeImportPanel
        suggest={false}
        hasUnsavedChanges={false}
        onImported={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Import from resume" }),
    );
    await user.upload(screen.getByLabelText(/choose a file/i), pdf());
    await user.click(screen.getByRole("button", { name: "Import resume" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "does not look like a resume",
    );
  });

  it("is offered on the profile page only with the AI provider, suggested when sparse", () => {
    const page = readFileSync("src/app/profile/page.tsx", "utf8");
    expect(page).toContain("enabled: isResumeExtractionConfigured()");
    expect(page).toMatch(
      /suggest:\s*!entries\.employment\?\.length && !entries\.education\?\.length/,
    );
    // The page re-reads the profile after an import.
    expect(readFileSync("src/app/onboarding/actions.ts", "utf8")).toContain(
      'revalidatePath("/profile")',
    );
  });
});
