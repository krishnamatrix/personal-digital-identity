// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  extractResume,
  isResumeExtractionConfigured,
  ResumeExtractionFailedError,
  ResumeExtractionUnavailableError,
  toGeminiSchema,
} from "@/lib/ai/resume-extractor";
import { resumeExtractionSchema } from "@/domains/identity/resume-import/resume-extraction-schema";

const empty = {
  isResume: true,
  profile: {
    fullName: "Priya Raman",
    headline: null,
    professionalSummary: null,
    currentDesignation: null,
    currentOrganization: null,
    industry: null,
    location: null,
    contactEmail: null,
    phone: null,
    websiteUrl: null,
  },
  employment: [],
  education: [],
  skill: [],
  project: [],
  social_link: [],
  achievement: [],
  certification: [],
  language: [{ name: "Tamil", proficiency: null }],
  interest: [],
};

function geminiReply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Gemini response schema", () => {
  const schema = toGeminiSchema(z.toJSONSchema(resumeExtractionSchema)) as {
    $schema?: string;
    additionalProperties?: boolean;
    required?: string[];
    properties: Record<string, { properties?: Record<string, unknown> }>;
  };

  it("is strict and drops the $schema marker", () => {
    expect(schema.$schema).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(
      expect.arrayContaining(["isResume", "profile", "employment", "skill"]),
    );
  });

  it("writes nullable fields as type arrays, not anyOf", () => {
    expect(JSON.stringify(schema)).not.toContain("anyOf");
    expect(schema.properties.profile.properties?.fullName).toEqual({
      type: ["string", "null"],
    });
    const language = (
      schema.properties.language as unknown as {
        items: { properties: { proficiency: { enum: unknown[] } } };
      }
    ).items.properties.proficiency;
    expect(language.enum).toContain(null);
  });
});

describe("extractResume (Gemini)", () => {
  it("is unavailable without GEMINI_API_KEY", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(isResumeExtractionConfigured()).toBe(false);
    await expect(
      extractResume({ kind: "docx", text: "cv" }),
    ).rejects.toBeInstanceOf(ResumeExtractionUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the PDF inline with the key in a header and parses the JSON", async () => {
    fetchMock.mockResolvedValue(
      geminiReply({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(empty) }] },
          },
        ],
      }),
    );
    const result = await extractResume({ kind: "pdf", base64: "JVBERi0=" });
    expect(result.profile.fullName).toBe("Priya Raman");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    );
    expect(url).not.toContain("key=");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "test-key",
    );
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].inlineData).toEqual({
      mimeType: "application/pdf",
      data: "JVBERi0=",
    });
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema).toBeDefined();
  });

  it.each([
    [{ promptFeedback: { blockReason: "SAFETY" } }, "blocked"],
    [{ candidates: [{ finishReason: "MAX_TOKENS" }] }, "max_tokens"],
    [{ candidates: [{ finishReason: "SAFETY" }] }, "blocked"],
    [
      {
        candidates: [
          { finishReason: "STOP", content: { parts: [{ text: "{}" }] } },
        ],
      },
      "no_output",
    ],
  ])("refuses unusable replies (%j)", async (reply, code) => {
    fetchMock.mockResolvedValue(geminiReply(reply));
    const error = await extractResume({ kind: "docx", text: "cv" }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ResumeExtractionFailedError);
    expect((error as ResumeExtractionFailedError).code).toBe(code);
  });

  it("maps HTTP and network failures to a failed extraction", async () => {
    fetchMock.mockResolvedValueOnce(geminiReply({ error: {} }, 429));
    await expect(
      extractResume({ kind: "docx", text: "cv" }),
    ).rejects.toMatchObject({ code: "gemini_429" });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(
      extractResume({ kind: "docx", text: "cv" }),
    ).rejects.toMatchObject({ code: "gemini_network" });
  });
});
