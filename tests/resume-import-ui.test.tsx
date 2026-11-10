import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const action = vi.hoisted(() => vi.fn());
vi.mock("@/app/onboarding/actions", () => ({ importResumeAction: action }));

import { ResumeImport } from "@/app/onboarding/resume-import";

describe("ResumeImport", () => {
  it("rejects a non-resume file type before uploading", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<ResumeImport onImported={vi.fn()} />);
    await user.upload(
      screen.getByLabelText(/choose a file/i),
      new File(["hello"], "notes.txt", { type: "text/plain" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("PDF or Word");
    expect(
      screen.getByRole("button", { name: "Import resume" }),
    ).toBeDisabled();
    expect(action).not.toHaveBeenCalled();
  });

  it("uploads the chosen file and reports what was added", async () => {
    action.mockResolvedValue({
      ok: true,
      summary: {
        profileFields: ["headline", "location"],
        added: { employment: 3, skill: 8 },
        skipped: 0,
      },
      values: { headline: "Staff engineer" },
    });
    const onImported = vi.fn();
    const user = userEvent.setup();
    render(<ResumeImport onImported={onImported} />);
    await user.upload(
      screen.getByLabelText(/choose a file/i),
      new File(["%PDF-1.7"], "cv.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "Import resume" }));
    expect(
      await screen.findByText("Your resume has been added to your profile"),
    ).toBeInTheDocument();
    expect(screen.getByText("3 × employment history")).toBeInTheDocument();
    expect(onImported).toHaveBeenCalledWith({ headline: "Staff engineer" });
    expect((action.mock.calls[0]![0] as FormData).get("resume")).toBeInstanceOf(
      File,
    );
  });
});
