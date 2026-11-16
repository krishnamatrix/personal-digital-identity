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
  for (const name of [
    "provider",
    "endpoint",
    "api_key",
    "model",
    "response_format",
  ]) {
    vi.stubEnv(`llm_${name}`, "");
    vi.stubEnv(`LLM_${name.toUpperCase()}`, "");
  }
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("AI_BASE_URL", "");
  vi.stubEnv("AI_MODEL", "");
  vi.stubEnv("AI_API_KEY", "");
  vi.stubEnv("AI_RESPONSE_FORMAT", "");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

describe("extractResume (local OpenAI-compatible gateway)", () => {
  it("routes unified OpenAI settings through the configured chat endpoint", async () => {
    vi.stubEnv("llm_provider", "openai");
    vi.stubEnv("llm_model", "test-openai-model");
    vi.stubEnv("llm_api_key", "test-openai-key");
    fetchMock.mockResolvedValueOnce(
      geminiReply({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(empty) },
          },
        ],
      }),
    );
    await extractResume({ kind: "docx", text: "cv" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-openai-key");
    expect(JSON.parse(init.body).model).toBe("test-openai-model");
  });
  beforeEach(() => vi.stubEnv("AI_PROVIDER", "openai-compatible"));
  const reply = (content: unknown = empty, finish_reason = "stop") =>
    geminiReply({
      choices: [
        { finish_reason, message: { content: JSON.stringify(content) } },
      ],
    });

  it("enables import with auto and sends text/schema without a key or cloud fallback", async () => {
    expect(isResumeExtractionConfigured()).toBe(true);
    fetchMock.mockResolvedValueOnce(reply());
    await expect(
      extractResume({ kind: "docx", text: "A resume" }),
    ).resolves.toEqual(empty);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:31415/v1/chat/completions");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeDefined();
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("auto");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].content).toContain("<resume>\nA resume\n</resume>");
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true, name: "resume_extraction" },
    });
    expect(
      body.response_format.json_schema.schema.properties.profile,
    ).toBeDefined();
  });

  it("sends validated PDF input as file data and optional bearer auth", async () => {
    vi.stubEnv("AI_BASE_URL", "http://127.0.0.1:31415/v1/");
    vi.stubEnv("AI_API_KEY", "test-gateway-key");
    fetchMock.mockResolvedValueOnce(reply());
    await extractResume({ kind: "pdf", base64: "JVBERi0=" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("test-gateway-key");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-gateway-key",
    });
    expect(JSON.parse(String(init.body)).messages[1].content[0]).toEqual({
      type: "file",
      file: {
        filename: "resume.pdf",
        file_data: "data:application/pdf;base64,JVBERi0=",
      },
    });
  });

  it("supports explicit JSON mode while still validating the extraction", async () => {
    vi.stubEnv("AI_RESPONSE_FORMAT", "json_object");
    fetchMock.mockResolvedValueOnce(reply({}));
    await expect(
      extractResume({ kind: "docx", text: "cv" }),
    ).rejects.toMatchObject({ code: "no_output" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toEqual(
      { type: "json_object" },
    );
    expect(
      JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content,
    ).toContain('"professionalSummary"');
  });

  it.each([
    [{ choices: [] }, "ai_shape"],
    [
      { choices: [{ finish_reason: "length", message: { content: "{}" } }] },
      "max_tokens",
    ],
    [
      {
        choices: [
          { finish_reason: "stop", message: { refusal: "cannot comply" } },
        ],
      },
      "blocked",
    ],
    [
      { choices: [{ finish_reason: "content_filter", message: {} }] },
      "blocked",
    ],
    [
      {
        choices: [{ finish_reason: "stop", message: { content: "not JSON" } }],
      },
      "no_output",
    ],
    [
      { choices: [{ finish_reason: "stop", message: { content: "{}" } }] },
      "no_output",
    ],
  ])("rejects unusable gateway output with %s", async (body, code) => {
    fetchMock.mockResolvedValueOnce(geminiReply(body));
    await expect(
      extractResume({ kind: "docx", text: "cv" }),
    ).rejects.toMatchObject({ code });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps provider errors safe and does not retry another provider", async () => {
    fetchMock.mockResolvedValueOnce(
      geminiReply({ error: "private provider details" }, 401),
    );
    await expect(
      extractResume({ kind: "docx", text: "private text" }),
    ).rejects.toMatchObject({
      code: "ai_401",
      message:
        "We could not read your resume. Please try again, or skip this step.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRejectedValueOnce(new Error("private network error"));
    await expect(
      extractResume({ kind: "docx", text: "cv" }),
    ).rejects.toMatchObject({ code: "ai_network" });
  });

  it("does not send data for invalid configuration", async () => {
    vi.stubEnv("AI_BASE_URL", "bad-url");
    expect(isResumeExtractionConfigured()).toBe(false);
    await expect(
      extractResume({ kind: "docx", text: "cv" }),
    ).rejects.toBeInstanceOf(ResumeExtractionUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
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
  it("uses unified Google endpoint/model/key configuration", async () => {
    vi.stubEnv("llm_provider", "google");
    vi.stubEnv(
      "llm_endpoint",
      "https://generativelanguage.googleapis.com/v1beta/",
    );
    vi.stubEnv("llm_model", "test-google-model");
    vi.stubEnv("llm_api_key", "test-unified-key");
    fetchMock.mockResolvedValueOnce(
      geminiReply({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(empty) }] },
          },
        ],
      }),
    );
    await extractResume({ kind: "docx", text: "cv" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/test-google-model:generateContent",
    );
    expect(fetchMock.mock.calls[0][1].headers["x-goog-api-key"]).toBe(
      "test-unified-key",
    );
  });
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
