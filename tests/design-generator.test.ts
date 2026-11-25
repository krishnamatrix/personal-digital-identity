// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DesignAiError,
  generateDesign,
  isDesignAiAvailable,
} from "@/lib/ai/design-generator";
import { websiteSpecFrom, cardSpecFrom } from "@/domains/designs/design-spec";
import { TEMPLATES } from "@/domains/website/templates";
import { CARD_DESIGNS } from "@/domains/cards/card-designs";

const spec = websiteSpecFrom(TEMPLATES[0]);
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const gemini = (out: unknown) =>
  json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(out) }] },
      },
    ],
  });
const chat = (out: unknown) =>
  json({
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(out) } },
    ],
  });

beforeEach(() => {
  for (const name of [
    "provider",
    "endpoint",
    "api_key",
    "model",
    "fallback_model",
    "response_format",
  ]) {
    vi.stubEnv(`llm_${name}`, "");
    vi.stubEnv(`LLM_${name.toUpperCase()}`, "");
  }
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("AI_BASE_URL", "");
  vi.stubEnv("AI_MODEL", "");
  vi.stubEnv("AI_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("llm_fallback_model", "none");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

describe("Folio Designer AI", () => {
  it("asks Gemini for a design spec (data only) and validates the answer", async () => {
    fetchMock.mockResolvedValueOnce(
      gemini({ name: "Harbour", blurb: "Calm.", spec }),
    );
    const out = await generateDesign("website", "calm and blue", null);
    expect(out).toMatchObject({
      name: "Harbour",
      blurb: "Calm.",
      spec,
      problems: [],
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(":generateContent");
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction.parts[0].text).toMatch(
      /You do not write code/,
    );
    expect(body.contents[0].parts[0].text).toContain(
      "<request>\ncalm and blue\n</request>",
    );
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("sends the current design when refining", async () => {
    fetchMock.mockResolvedValueOnce(gemini({ name: "H", blurb: "", spec }));
    await generateDesign("website", "warmer", spec);
    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    );
    expect(body.contents[0].parts[0].text).toContain(JSON.stringify(spec));
  });

  it("repairs unreadable colours once, and reports what is still wrong", async () => {
    const grey = { ...spec, palette: { ...spec.palette, ink: "#cccccc" } };
    fetchMock
      .mockResolvedValueOnce(gemini({ name: "Fog", blurb: "", spec: grey }))
      .mockResolvedValueOnce(gemini({ name: "Fog", blurb: "", spec }));
    const fixed = await generateDesign("website", "foggy", null);
    expect(fixed.problems).toEqual([]);
    expect(fixed.spec).toEqual(spec);
    const repair = JSON.parse(
      String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body),
    );
    expect(repair.contents[0].parts[0].text).toMatch(
      /failed these readability checks/,
    );

    fetchMock
      .mockResolvedValueOnce(gemini({ name: "Fog", blurb: "", spec: grey }))
      .mockResolvedValueOnce(gemini({ name: "Fog", blurb: "", spec: grey }));
    const still = await generateDesign("website", "foggy", null);
    expect(still.problems.length).toBeGreaterThan(0);
  });

  it("rejects anything that is not a valid spec (after one retry)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        gemini({ name: "X", blurb: "", spec: { ...spec, css: "x" } }),
      )
      .mockResolvedValueOnce(
        gemini({ name: "X", blurb: "", spec: { layout: "nope" } }),
      );
    await expect(generateDesign("website", "x", null)).rejects.toMatchObject({
      code: "invalid_output",
    });
  });

  it("works through an OpenAI-compatible gateway such as FreeLLMAPI", async () => {
    vi.stubEnv("LLM_PROVIDER", "FREELLMAPI");
    const card = cardSpecFrom(CARD_DESIGNS[0]);
    fetchMock.mockResolvedValueOnce(
      chat({ name: "Ink", blurb: "Bold.", spec: card }),
    );
    const out = await generateDesign("card", "inky", null);
    expect(out.spec).toEqual(card);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:31415/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.response_format.json_schema.name).toBe("folio_design");
  });

  it("says when no AI is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(isDesignAiAvailable()).toBe(false);
    await expect(generateDesign("website", "x", null)).rejects.toBeInstanceOf(
      DesignAiError,
    );
  });
});
