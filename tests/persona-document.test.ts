// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  PERSONA_FILE_MAX_BYTES,
  PersonaFileError,
  readPersonaDocumentAsMarkdown,
  validatePersonaFile,
} from "@/domains/personas/persona-document";
import {
  hasAnyPersonaDetail,
  PERSONA_TYPE_REASON_MAX,
  sanitizePersonaExtraction,
} from "@/domains/personas/persona-extraction-schema";
import {
  PERSONA_LIMITS,
  PROFILE_FIELDS,
} from "@/domains/personas/persona-constants";
import { createPersonaInputSchema } from "@/domains/personas/persona-schema";

describe("validatePersonaFile & readPersonaDocumentAsMarkdown", () => {
  it("validates PDF signature and UTF-8 Markdown, then passes bytes to MarkItDown", async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
    const pdf = new File([pdfBytes], "brief.pdf", { type: "application/pdf" });
    const validated = await validatePersonaFile(pdf);
    expect(validated.extension).toBe(".pdf");

    const md = new File(["# Speaker Bio\n\nKeynote speaker."], "bio.md", {
      type: "text/markdown",
    });
    const converted = await readPersonaDocumentAsMarkdown(
      md,
      async (_bytes, ext) => `# Converted (${ext})\n\nKeynote speaker.`,
    );
    expect(converted).toBe("# Converted (.md)\n\nKeynote speaker.");
  });

  it("rejects empty, oversized, binary-as-text, and unsupported files", async () => {
    await expect(
      validatePersonaFile(new File([], "empty.txt")),
    ).rejects.toThrow(PersonaFileError);

    const big = new File([new Uint8Array(PERSONA_FILE_MAX_BYTES + 1)], "x.txt");
    await expect(validatePersonaFile(big)).rejects.toThrow(/5 MB/);

    const binaryAsTxt = new File([new Uint8Array([0x41, 0x00, 0x42])], "b.txt");
    await expect(validatePersonaFile(binaryAsTxt)).rejects.toThrow(/binary/i);

    const wrongExt = new File(["hello"], "image.png", { type: "image/png" });
    await expect(validatePersonaFile(wrongExt)).rejects.toThrow(/PDF/);
  });
});

describe("sanitizePersonaExtraction", () => {
  it("clamps extracted fields and allowlists/deduplicates suggestedSections", () => {
    const out = sanitizePersonaExtraction({
      personaType: "Founder",
      personaTypeReason: `  ${"R".repeat(260)}  `,
      name: `  ${"N".repeat(140)}  `,
      audience: "Seed\n\tinvestors",
      purpose: "  Fundraising  ",
      description: "D".repeat(600),
      displayName: "Ada Lovelace",
      headline: "H".repeat(250),
      summary: "S".repeat(2500),
      location: "London, UK",
      websiteUrl: "ada.example.com",
      linkedinUrl: "linkedin.com/in/ada",
      githubUrl: "javascript:alert(1)",
      suggestedSections: [
        "profile",
        "PROJECTS",
        "profile",
        "not_a_real_section",
        "articles",
      ],
      sectionContent: [
        {
          sectionKey: "experience",
          items: [
            {
              title: "Staff Engineer",
              subtitle: "Acme Corp",
              period: "2022 – Present",
              description: "Led distributed systems team.",
            },
          ],
        },
        {
          sectionKey: "unknown_section",
          items: [
            {
              title: "Ignored",
              subtitle: null,
              period: null,
              description: null,
            },
          ],
        },
      ],
    });

    expect(out.personaType).toBe("Founder");
    expect(out.personaTypeReason).toHaveLength(PERSONA_TYPE_REASON_MAX);
    expect(out.name).toHaveLength(PERSONA_LIMITS.name);
    expect(out.audience).toBe("Seed investors");
    expect(out.purpose).toBe("Fundraising");
    expect(out.description).toHaveLength(PERSONA_LIMITS.description);
    expect(out.displayName).toBe("Ada Lovelace");
    expect(out.headline).toHaveLength(PROFILE_FIELDS.headline.maxLength);
    expect(out.summary).toHaveLength(PROFILE_FIELDS.summary.maxLength);
    expect(out.location).toBe("London, UK");
    expect(out.websiteUrl).toBe("https://ada.example.com/");
    expect(out.linkedinUrl).toBe("https://linkedin.com/in/ada");
    expect(out.githubUrl).toBeNull();

    // Literal LLM string placeholders like "null" or "N/A" must normalize to null.
    const placeholder = sanitizePersonaExtraction({
      personaType: "Professional",
      personaTypeReason: "null",
      name: "Engineer",
      audience: "N/A",
      purpose: "None",
      description: "undefined",
      displayName: "Ada",
      headline: "Engineer",
      summary: null,
      location: "null",
      websiteUrl: "null",
      linkedinUrl: "none",
      githubUrl: "https://null/",
      suggestedSections: ["profile"],
      sectionContent: [
        {
          sectionKey: "education",
          items: [
            {
              title: "B.S.",
              subtitle: "null",
              period: "null",
              description: "N/A",
            },
          ],
        },
      ],
    });
    expect(placeholder.location).toBeNull();
    expect(placeholder.websiteUrl).toBeNull();
    expect(placeholder.linkedinUrl).toBeNull();
    expect(placeholder.githubUrl).toBeNull();
    expect(placeholder.sectionContent.education).toEqual([
      { title: "B.S.", subtitle: null, period: null, description: null },
    ]);
    expect(out.suggestedSections).toEqual([
      "profile",
      "projects",
      "articles",
      "experience",
    ]);
    expect(out.sectionContent).toEqual({
      experience: [
        {
          title: "Staff Engineer",
          subtitle: "Acme Corp",
          period: "2022 – Present",
          description: "Led distributed systems team.",
        },
      ],
    });
    expect(hasAnyPersonaDetail(out)).toBe(true);
  });

  it("accepts partial sectionContent maps in createPersonaInputSchema (Zod 4 record compatibility)", () => {
    const parsed = createPersonaInputSchema.parse({
      metadata: {
        name: "Principal AI Engineer",
        audience: null,
        purpose: null,
        description: null,
      },
      fields: [],
      sections: [{ sectionKey: "experience", label: null, isVisible: true }],
      sectionContent: {
        experience: [
          {
            title: "Principal Engineer",
            subtitle: "Acme",
            period: "2020 – Present",
            description: "Built AI systems.",
          },
        ],
      },
      makeDefault: false,
    });
    expect(parsed.sectionContent).toEqual({
      experience: [
        {
          title: "Principal Engineer",
          subtitle: "Acme",
          period: "2020 – Present",
          description: "Built AI systems.",
        },
      ],
    });
  });
});
