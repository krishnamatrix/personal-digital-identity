// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { PersonaFileError } from "@/domains/personas/persona-document";
import {
  MarkItDownConversionError,
  MarkItDownUnavailableError,
} from "@/lib/ai/markitdown";
import {
  PersonaExtractionFailedError,
  PersonaExtractionUnavailableError,
} from "@/lib/ai/persona-extractor";

const loadCanonicalMock = vi.fn();
const readAsMarkdownMock = vi.fn();
const extractDetailsMock = vi.fn();

vi.mock("@/domains/personas/persona-runtime", () => ({
  getPersonaService: () => ({
    loadCanonicalForCreate: () => loadCanonicalMock(),
  }),
}));

vi.mock("@/domains/personas/persona-document", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/domains/personas/persona-document")
    >();
  return {
    ...actual,
    readPersonaDocumentAsMarkdown: (file: File) => readAsMarkdownMock(file),
  };
});

vi.mock("@/lib/ai/persona-extractor", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/ai/persona-extractor")>();
  return {
    ...actual,
    extractPersonaDetailsFromMarkdown: (md: string) => extractDetailsMock(md),
  };
});

import { POST } from "@/app/api/llm/persona-document/route";

function formRequest(file?: File) {
  const form = new FormData();
  if (file) form.set("file", file);
  return new Request("http://localhost:3000/api/llm/persona-document", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/llm/persona-document", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadCanonicalMock.mockResolvedValue({
      canonical: {},
      canonicalAvailable: true,
    });
  });

  it("returns 401 before invoking MarkItDown or LLM when unauthenticated", async () => {
    loadCanonicalMock.mockRejectedValueOnce(new AuthenticationRequiredError());
    const res = await POST(
      formRequest(new File(["hello"], "bio.txt", { type: "text/plain" })),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      ok: false,
      code: "unauthenticated",
      message: "Sign in to upload Persona details.",
    });
    expect(readAsMarkdownMock).not.toHaveBeenCalled();
    expect(extractDetailsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when file is missing or fails file validation", async () => {
    const missing = await POST(formRequest());
    expect(missing.status).toBe(400);
    expect((await missing.json()).code).toBe("invalid_file");

    readAsMarkdownMock.mockRejectedValueOnce(
      new PersonaFileError("Upload a file of 5 MB or less."),
    );
    const invalid = await POST(
      formRequest(new File(["x"], "big.pdf", { type: "application/pdf" })),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      ok: false,
      code: "invalid_file",
      message: "Upload a file of 5 MB or less.",
    });
    expect(extractDetailsMock).not.toHaveBeenCalled();
  });

  it("returns 503 when MarkItDown or LLM provider is unavailable", async () => {
    readAsMarkdownMock.mockRejectedValueOnce(new MarkItDownUnavailableError());
    const noMd = await POST(
      formRequest(new File(["x"], "bio.txt", { type: "text/plain" })),
    );
    expect(noMd.status).toBe(503);
    expect((await noMd.json()).code).toBe("unavailable");

    readAsMarkdownMock.mockResolvedValueOnce("# Bio");
    extractDetailsMock.mockRejectedValueOnce(
      new PersonaExtractionUnavailableError(),
    );
    const noLlm = await POST(
      formRequest(new File(["x"], "bio.txt", { type: "text/plain" })),
    );
    expect(noLlm.status).toBe(503);
    expect((await noLlm.json()).code).toBe("unavailable");
  });

  it("returns 422 when conversion or LLM extraction fails", async () => {
    readAsMarkdownMock.mockRejectedValueOnce(
      new MarkItDownConversionError("No readable text was found."),
    );
    const emptyMd = await POST(
      formRequest(new File(["x"], "scan.pdf", { type: "application/pdf" })),
    );
    expect(emptyMd.status).toBe(422);
    expect((await emptyMd.json()).code).toBe("extraction_failed");

    readAsMarkdownMock.mockResolvedValueOnce("# Bio");
    extractDetailsMock.mockRejectedValueOnce(
      new PersonaExtractionFailedError("no_output"),
    );
    const badLlm = await POST(
      formRequest(new File(["x"], "bio.txt", { type: "text/plain" })),
    );
    expect(badLlm.status).toBe(422);
    expect((await badLlm.json()).code).toBe("extraction_failed");
  });

  it("returns 200 no-store with classified Persona type and screen model on success", async () => {
    readAsMarkdownMock.mockResolvedValueOnce("# Speaker Bio\n\nKeynote talks.");
    const payload = {
      personaType: "Speaker",
      personaTypeReason: "Focuses on conference talks and keynote sessions.",
      name: "Conference Speaker",
      audience: "Event organizers",
      purpose: "Keynote invitations",
      description: "Focused on analytical computing talks.",
      headline: "Keynote Speaker",
      summary: "Experienced conference speaker.",
      suggestedSections: ["profile", "publications"],
      sectionContent: {
        publications: [
          {
            title: "Symbolic Computation Keynote",
            subtitle: "World Computing Conf",
            period: "2026",
            description: "Opening keynote talk.",
          },
        ],
      },
    };
    extractDetailsMock.mockResolvedValueOnce(payload);

    const res = await POST(
      formRequest(new File(["bio"], "speaker.txt", { type: "text/plain" })),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, data: payload });
    expect(extractDetailsMock).toHaveBeenCalledWith(
      "# Speaker Bio\n\nKeynote talks.",
    );
  });
});
