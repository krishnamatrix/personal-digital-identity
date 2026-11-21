import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalProfile } from "@/domains/personas/persona-types";

const pushMock = vi.fn();
const createPersonaMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/app/personas/actions", () => ({
  createPersonaAction: (...args: unknown[]) => createPersonaMock(...args),
}));

import { PersonaCreateFlow } from "@/app/personas/persona-create-flow";

const CANONICAL: CanonicalProfile = {
  displayName: "Ada Lovelace",
  headline: "Mathematician",
  summary: "Canonical summary",
  location: "London",
  websiteUrl: "https://ada.example.com",
  linkedinUrl: null,
  githubUrl: null,
};

describe("PersonaCreateFlow upload button", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls POST /api/llm/persona-document, shows detected Persona type, prefills Steps 1-2, and does not auto-create", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          personaType: "Speaker",
          personaTypeReason:
            "Highlights keynote sessions and conference appearances.",
          name: "Conference Speaker",
          audience: "Event organizers",
          purpose: "Keynote invitations",
          description: "Focused on analytical computing talks.",
          headline: "Keynote Speaker on Symbolic Computation",
          summary: "Tailored speaker bio.",
          suggestedSections: ["profile", "publications"],
          sectionContent: {
            experience: [
              {
                title: "Principal Mathematician",
                subtitle: "Analytical Engine Lab",
                period: "1842 – Present",
                description: "Designed mechanical computation tables.",
              },
            ],
            skills: [
              {
                title: "Mathematics",
                subtitle: null,
                period: null,
                description: "Calculus, Symbolic Logic",
              },
            ],
          },
        },
      }),
    });

    render(
      <PersonaCreateFlow
        canonical={CANONICAL}
        canonicalAvailable
        storageKind="fixture"
        uploadEnabled
      />,
    );

    const fileInput = screen.getByLabelText("Upload persona details file");
    const file = new File(["Speaker notes"], "speaker.txt", {
      type: "text/plain",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toHaveValue("Conference Speaker");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/llm/persona-document",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByText("Detected type: Speaker")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Highlights keynote sessions and conference appearances.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Audience (optional)")).toHaveValue(
      "Event organizers",
    );
    expect(screen.getByLabelText("Purpose (optional)")).toHaveValue(
      "Keynote invitations",
    );
    expect(screen.getByLabelText("Description (optional)")).toHaveValue(
      "Focused on analytical computing talks.",
    );
    expect(createPersonaMock).not.toHaveBeenCalled();

    // Advance to Step 2 and verify suggested + extracted sections were prefilled.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Show Profile section")).toBeChecked();
    expect(screen.getByLabelText("Show Publications section")).toBeChecked();
    expect(screen.getByLabelText("Show Experience section")).toBeChecked();
    expect(screen.getByLabelText("Show Skills section")).toBeChecked();
    expect(screen.getByLabelText("Show Education section")).not.toBeChecked();

    // Advance to Step 4 (Review) and verify extracted section items render in PersonaPreview.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Principal Mathematician")).toBeInTheDocument();
    expect(
      screen.getByText("Designed mechanical computation tables."),
    ).toBeInTheDocument();
    expect(screen.getByText("Calculus, Symbolic Logic")).toBeInTheDocument();
  });

  it("rejects unsupported file types client-side without calling fetch", () => {
    render(
      <PersonaCreateFlow
        canonical={CANONICAL}
        canonicalAvailable
        storageKind="fixture"
        uploadEnabled
      />,
    );

    const fileInput = screen.getByLabelText("Upload persona details file");
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["img"], "photo.png", { type: "image/png" })],
      },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Could not upload persona details/i),
    ).toBeInTheDocument();
  });

  it("preserves existing typed fields when the API returns an error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        ok: false,
        code: "unavailable",
        message:
          "Document conversion (markitdown) is not available in this environment.",
      }),
    });

    render(
      <PersonaCreateFlow
        canonical={CANONICAL}
        canonicalAvailable
        storageKind="fixture"
        uploadEnabled
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "My Existing Name" },
    });

    const fileInput = screen.getByLabelText("Upload persona details file");
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["notes"], "notes.txt", { type: "text/plain" })],
      },
    });

    await waitFor(() => {
      expect(
        screen.getAllByText(/markitdown.*not available/i).length,
      ).toBeGreaterThan(0);
    });
    expect(screen.getByLabelText("Name")).toHaveValue("My Existing Name");
  });

  it("shows intuitive progress messages while processing an upload", async () => {
    let resolveFetch!: (value: unknown) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(
      <PersonaCreateFlow
        canonical={CANONICAL}
        canonicalAvailable
        storageKind="fixture"
        uploadEnabled
      />,
    );

    const fileInput = screen.getByLabelText("Upload persona details file");
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["bio"], "resume.pdf", { type: "application/pdf" })],
      },
    });

    const progress = await screen.findByTestId("persona-upload-progress");
    expect(progress).toHaveTextContent(/Reading your document/i);
    expect(progress).toHaveTextContent(/resume\.pdf/i);
    expect(progress).toHaveTextContent(/Nothing is saved automatically/i);

    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          personaType: "Professional",
          personaTypeReason: null,
          name: "Professional",
          audience: null,
          purpose: null,
          description: null,
          headline: null,
          summary: null,
          suggestedSections: ["profile"],
          sectionContent: {},
        },
      }),
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId("persona-upload-progress"),
      ).not.toBeInTheDocument();
    });
  });

  it("shows a disabled upload button and honest message when AI upload is unavailable", () => {
    render(
      <PersonaCreateFlow
        canonical={CANONICAL}
        canonicalAvailable
        storageKind="fixture"
        uploadEnabled={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: /upload persona details/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/AI document upload is not configured right now/i),
    ).toBeInTheDocument();
  });
});
