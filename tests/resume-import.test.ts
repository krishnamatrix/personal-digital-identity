// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuthenticatedClient: vi.fn(),
  ensureAccount: vi.fn(),
  findProfile: vi.fn(),
  createEmptyProfile: vi.fn(),
  updateProfile: vi.fn(),
  listEntries: vi.fn(),
  replaceEntries: vi.fn(),
  extractResume: vi.fn(),
  extractRawText: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => {
  class AuthenticationRequiredError extends Error {}
  return {
    createAuthenticatedClient: mocks.createAuthenticatedClient,
    AuthenticationRequiredError,
    AuthorizationError: class extends Error {},
  };
});
vi.mock("@/lib/db/queries/identity", () => ({
  ensureAccount: mocks.ensureAccount,
  findProfile: mocks.findProfile,
  createEmptyProfile: mocks.createEmptyProfile,
  updateProfile: mocks.updateProfile,
}));
vi.mock("@/lib/db/queries/entries", () => ({
  listEntries: mocks.listEntries,
  replaceEntries: mocks.replaceEntries,
}));
vi.mock("@/lib/db/queries/website", () => ({}));
vi.mock("@/lib/db/queries/articles", () => ({}));
vi.mock("@/lib/db/queries/personas", () => ({}));
vi.mock("@/lib/ai/resume-extractor", () => ({
  extractResume: mocks.extractResume,
}));
vi.mock("mammoth", () => ({
  default: { extractRawText: mocks.extractRawText },
}));

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  resumeExtractionSchema,
  type ResumeExtraction,
} from "@/domains/identity/resume-import/resume-extraction-schema";
import { mapResumeToIdentity } from "@/domains/identity/resume-import/resume-mapping";
import {
  readResumeFile,
  ResumeFileError,
} from "@/domains/identity/resume-import/resume-file";
import {
  importResume,
  NotAResumeError,
} from "@/domains/identity/resume-import/resume-import-service";
import type { IdentityProfile } from "@/domains/identity/profile-schema";

const userId = "0f00b3c8-7ea4-42ad-a544-4d62d1a42f54";

function emptyProfile(overrides: Partial<IdentityProfile> = {}) {
  return {
    accountId: userId,
    displayName: null,
    fullName: null,
    headline: null,
    summary: null,
    location: null,
    websiteUrl: null,
    linkedinUrl: null,
    githubUrl: null,
    profileImageUrl: null,
    coverImageUrl: null,
    contactEmail: null,
    phone: null,
    currentDesignation: null,
    currentOrganization: null,
    industry: null,
    professionalSummary: null,
    primaryPurpose: null,
    onboardingStep: 1,
    onboardingCompletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } satisfies IdentityProfile;
}

function extraction(
  overrides: Partial<ResumeExtraction> = {},
): ResumeExtraction {
  return {
    isResume: true,
    profile: {
      fullName: "Priya Raman",
      headline: "Staff engineer",
      professionalSummary: "I build reliable payment systems.",
      currentDesignation: "Staff Engineer",
      currentOrganization: "Ledgerly",
      industry: "Fintech",
      location: "Chennai, India",
      contactEmail: "not-an-email",
      phone: "+91 98400 00000",
      websiteUrl: null,
    },
    employment: [
      {
        title: "Staff Engineer",
        organization: "Ledgerly",
        location: null,
        startDate: "2021-04",
        endDate: "2024-01",
        isCurrent: true,
        description: "x".repeat(2500),
      },
      {
        title: null,
        organization: "Nameless Co",
        location: null,
        startDate: null,
        endDate: null,
        isCurrent: false,
        description: null,
      },
    ],
    education: [],
    skill: [
      { name: "TypeScript", category: "Languages" },
      { name: "  typescript ", category: "languages" },
      { name: "Kafka", category: null },
    ],
    project: [],
    social_link: [
      { platform: "github", url: "https://github.com/priya" },
      { platform: "linkedin", url: "not a url" },
    ],
    achievement: [],
    certification: [],
    language: [{ name: "Tamil", proficiency: "Native" }],
    interest: [],
    ...overrides,
  };
}

let ids = 0;
const nextId = () =>
  `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;

describe("mapResumeToIdentity", () => {
  beforeEach(() => {
    ids = 0;
  });

  it("fills only empty profile fields, and drops an invalid value without blocking the rest", () => {
    const plan = mapResumeToIdentity(
      extraction(),
      emptyProfile({ fullName: "Priya R." }),
      {},
      nextId,
    );
    expect(plan.profilePatch.fullName).toBeUndefined(); // the person's own value wins
    expect(plan.profilePatch.headline).toBe("Staff engineer");
    expect(plan.profilePatch.contactEmail).toBeUndefined(); // invalid email skipped
    expect(plan.profilePatch.phone).toBe("+91 98400 00000");
    expect(plan.summary.profileFields).not.toContain("contactEmail");
  });

  it("validates entries with the editor's schema, de-duplicates and keeps long text by cutting it", () => {
    const plan = mapResumeToIdentity(extraction(), emptyProfile(), {}, nextId);
    const jobs = plan.entries.employment!;
    expect(jobs).toHaveLength(1); // the untitled role fails validation
    expect(jobs[0]!.data.isCurrent).toBe(true);
    expect(jobs[0]!.data.endDate).toBeUndefined(); // current role: no end date
    expect(String(jobs[0]!.data.description)).toHaveLength(2000);
    expect(plan.entries.skill!.map((s) => s.data.name)).toEqual([
      "TypeScript",
      "Kafka",
    ]);
    expect(plan.entries.social_link!.map((s) => s.data.platform)).toEqual([
      "github",
    ]);
    expect(plan.summary.skipped).toBe(2);
    expect(jobs.every((j) => j.isVisible)).toBe(true);
  });

  it("appends after existing items and never re-adds one the person already has", () => {
    const existing = {
      skill: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          isVisible: false,
          data: { name: "Kafka" },
        },
      ],
    };
    const plan = mapResumeToIdentity(
      extraction(),
      emptyProfile(),
      existing,
      nextId,
    );
    expect(plan.entries.skill!.map((s) => s.data.name)).toEqual([
      "Kafka",
      "TypeScript",
    ]);
    expect(plan.entries.skill![0]!.isVisible).toBe(false); // untouched
    expect(plan.summary.added.skill).toBe(1);
  });

  it("stops at the section maximum", () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      name: `Skill ${i}`,
      category: null,
    }));
    const plan = mapResumeToIdentity(
      extraction({ skill: many }),
      emptyProfile(),
      {},
      nextId,
    );
    expect(plan.entries.skill).toHaveLength(100);
  });
});

describe("resume extraction schema", () => {
  it("converts to a strict structured-output JSON schema", () => {
    const format = betaZodOutputFormat(resumeExtractionSchema);
    const schema = format.schema as {
      additionalProperties?: boolean;
      required?: string[];
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(
      expect.arrayContaining(["isResume", "profile", "employment", "skill"]),
    );
  });
});

describe("readResumeFile", () => {
  const pdfBytes = new TextEncoder().encode("%PDF-1.7\n...");
  const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

  it("accepts a PDF by name and content signature", async () => {
    const doc = await readResumeFile(new File([pdfBytes], "cv.pdf"));
    expect(doc.kind).toBe("pdf");
  });

  it("reads a DOCX as text", async () => {
    mocks.extractRawText.mockResolvedValue({ value: "Priya\n\n\n\nEngineer" });
    const doc = await readResumeFile(new File([zipBytes], "cv.docx"));
    expect(doc).toEqual({ kind: "docx", text: "Priya\n\nEngineer" });
  });

  it("rejects a file whose content does not match its name, and other types", async () => {
    await expect(
      readResumeFile(new File([zipBytes], "cv.pdf")),
    ).rejects.toBeInstanceOf(ResumeFileError);
    await expect(
      readResumeFile(new File([pdfBytes], "cv.txt")),
    ).rejects.toBeInstanceOf(ResumeFileError);
  });

  it("rejects empty and oversized files", async () => {
    await expect(readResumeFile(new File([], "cv.pdf"))).rejects.toThrow(
      "empty",
    );
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(pdfBytes);
    await expect(readResumeFile(new File([big], "cv.pdf"))).rejects.toThrow(
      "5 MB",
    );
  });
});

describe("importResume", () => {
  const client = { from: vi.fn() };
  const pdf = () => new File([new TextEncoder().encode("%PDF-1.7")], "cv.pdf");

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthenticatedClient.mockResolvedValue({
      client,
      user: { id: userId },
    });
    mocks.findProfile.mockResolvedValue(emptyProfile());
    mocks.listEntries.mockResolvedValue([]);
    mocks.updateProfile.mockImplementation(async (_c, _u, patch) => ({
      ...emptyProfile(),
      ...patch,
    }));
    mocks.extractResume.mockResolvedValue(extraction());
  });

  it("verifies the session before reading the file or calling Claude", async () => {
    mocks.createAuthenticatedClient.mockRejectedValue(new Error("signed out"));
    await expect(importResume(pdf())).rejects.toThrow("signed out");
    expect(mocks.extractResume).not.toHaveBeenCalled();
  });

  it("saves the new entries and fills empty profile fields for the verified user only", async () => {
    const result = await importResume(pdf());
    const kinds = mocks.replaceEntries.mock.calls.map((c) => c[2]);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "employment",
        "skill",
        "social_link",
        "language",
      ]),
    );
    for (const call of mocks.replaceEntries.mock.calls) {
      expect(call[1]).toBe(userId);
    }
    const patch = mocks.updateProfile.mock.calls[0]![2];
    expect(patch).toMatchObject({
      headline: "Staff engineer",
      githubUrl: "https://github.com/priya",
    });
    expect(result.profile.headline).toBe("Staff engineer");
  });

  it("refuses a document that is not a resume, without writing anything", async () => {
    mocks.extractResume.mockResolvedValue(extraction({ isResume: false }));
    await expect(importResume(pdf())).rejects.toBeInstanceOf(NotAResumeError);
    expect(mocks.replaceEntries).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });
});
