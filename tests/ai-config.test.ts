// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigurationError, getAiConfiguration } from "@/lib/ai/config";

beforeEach(() => {
  for (const key of [
    "AI_PROVIDER",
    "AI_BASE_URL",
    "AI_MODEL",
    "AI_API_KEY",
    "AI_RESPONSE_FORMAT",
    "GEMINI_API_KEY",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    ...["provider", "endpoint", "model", "api_key", "response_format"].flatMap(
      (name) => [`llm_${name}`, `LLM_${name.toUpperCase()}`],
    ),
  ])
    vi.stubEnv(key, "");
});
afterEach(() => vi.unstubAllEnvs());

describe("server AI configuration", () => {
  it("does not activate AI without configured provider or Gemini key", () => {
    expect(getAiConfiguration()).toBeNull();
  });
  it("preserves legacy Gemini when no provider override exists", () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    expect(getAiConfiguration()).toMatchObject({
      provider: "gemini",
      apiKey: "test-gemini-key",
    });
  });
  it("uses the supplied local base and auto model without requiring a key", () => {
    vi.stubEnv("AI_PROVIDER", "openai-compatible");
    expect(getAiConfiguration()).toMatchObject({
      provider: "openai-compatible",
      model: "auto",
      apiKey: undefined,
      endpoints: {
        chat: "http://127.0.0.1:31415/v1/chat/completions",
        responses: "http://127.0.0.1:31415/v1/responses",
        messages: "http://127.0.0.1:31415/v1/messages",
        embeddings: "http://127.0.0.1:31415/v1/embeddings",
      },
    });
  });
  it("normalizes trailing slashes and supports an explicit model and key", () => {
    vi.stubEnv("AI_PROVIDER", "openai-compatible");
    vi.stubEnv("AI_BASE_URL", "http://127.0.0.1:31415/v1///");
    vi.stubEnv("AI_MODEL", " test-model ");
    vi.stubEnv("AI_API_KEY", " test-gateway-key ");
    expect(getAiConfiguration()).toMatchObject({
      model: "test-model",
      apiKey: "test-gateway-key",
      endpoints: { chat: "http://127.0.0.1:31415/v1/chat/completions" },
    });
  });
  it.each([
    "file:///tmp/ai",
    "ftp://localhost/v1",
    "http://user:secret@localhost/v1",
    "http://localhost/v1?key=secret",
    "http://localhost/v1#fragment",
    "bad-url",
  ])("rejects unsafe/malformed base %s", (base) => {
    vi.stubEnv("AI_PROVIDER", "openai-compatible");
    vi.stubEnv("AI_BASE_URL", base);
    expect(() => getAiConfiguration()).toThrow(AiConfigurationError);
  });
  it("rejects unknown provider/format values", () => {
    vi.stubEnv("AI_PROVIDER", "unknown");
    expect(() => getAiConfiguration()).toThrow(AiConfigurationError);
    vi.stubEnv("AI_PROVIDER", "openai-compatible");
    vi.stubEnv("AI_RESPONSE_FORMAT", "unknown");
    expect(() => getAiConfiguration()).toThrow(AiConfigurationError);
  });
});

describe("unified LLM provider settings", () => {
  it.each(["llm", "LLM"])(
    "supports %s settings for local with legacy key fallback",
    (prefix) => {
      const key = (suffix: string) =>
        prefix === "LLM" ? `LLM_${suffix.toUpperCase()}` : `llm_${suffix}`;
      vi.stubEnv(key("provider"), "local");
      vi.stubEnv(key("endpoint"), "http://127.0.0.1:31415/v1/");
      vi.stubEnv(key("model"), "auto");
      vi.stubEnv("AI_API_KEY", "legacy-local-key");
      expect(getAiConfiguration()).toMatchObject({
        providerName: "local",
        model: "auto",
        apiKey: "legacy-local-key",
        endpoints: { chat: "http://127.0.0.1:31415/v1/chat/completions" },
      });
    },
  );
  it("uses Google endpoint/model/key and ignores stale local settings", () => {
    vi.stubEnv("llm_provider", "google");
    vi.stubEnv("llm_model", "test-google-model");
    vi.stubEnv("llm_api_key", "test-google-key");
    vi.stubEnv("AI_BASE_URL", "http://127.0.0.1:31415/v1");
    vi.stubEnv("AI_API_KEY", "old-local-key");
    vi.stubEnv("AI_MODEL", "auto");
    expect(getAiConfiguration()).toMatchObject({
      provider: "gemini",
      model: "test-google-model",
      apiKey: "test-google-key",
      endpoint:
        "https://generativelanguage.googleapis.com/v1beta/models/test-google-model:generateContent",
    });
  });
  it("configures OpenAI with its base URL, explicit model and own key", () => {
    vi.stubEnv("llm_provider", "openai");
    vi.stubEnv("llm_model", "test-openai-model");
    vi.stubEnv("llm_api_key", "test-openai-key");
    vi.stubEnv("AI_PROVIDER", "openai-compatible");
    vi.stubEnv("AI_BASE_URL", "http://127.0.0.1:31415/v1");
    expect(getAiConfiguration()).toMatchObject({
      providerName: "openai",
      model: "test-openai-model",
      apiKey: "test-openai-key",
      endpoints: { chat: "https://api.openai.com/v1/chat/completions" },
    });
  });
  it("does not reuse local credentials for cloud providers", () => {
    vi.stubEnv("AI_API_KEY", "old-local-key");
    vi.stubEnv("llm_provider", "google");
    expect(getAiConfiguration()).toBeNull();
    vi.stubEnv("llm_provider", "openai");
    vi.stubEnv("llm_model", "test-model");
    expect(getAiConfiguration()).toBeNull();
  });
  it("requires an OpenAI model and honors lowercase over uppercase and legacy aliases", () => {
    vi.stubEnv("llm_provider", "openai");
    expect(() => getAiConfiguration()).toThrow(AiConfigurationError);
    vi.stubEnv("llm_provider", "local");
    vi.stubEnv("LLM_PROVIDER", "google");
    vi.stubEnv("AI_PROVIDER", "unknown");
    expect(getAiConfiguration()).toMatchObject({ providerName: "local" });
  });
  it("configures OpenRouter with its default endpoint, model, and API key", () => {
    vi.stubEnv("llm_provider", "openrouter");
    vi.stubEnv("AI_API_KEY", "old-local-key");
    expect(getAiConfiguration()).toBeNull();

    vi.stubEnv("OPENROUTER_API_KEY", "or-test-key");
    expect(getAiConfiguration()).toMatchObject({
      provider: "openai-compatible",
      providerName: "openrouter",
      model: "openrouter/auto",
      apiKey: "or-test-key",
      endpoints: { chat: "https://openrouter.ai/api/v1/chat/completions" },
    });

    vi.stubEnv("llm_model", "anthropic/claude-sonnet-4");
    vi.stubEnv("llm_fallback_model", "google/gemini-2.5-pro");
    vi.stubEnv("llm_api_key", "or-preferred-key");
    expect(getAiConfiguration()).toMatchObject({
      providerName: "openrouter",
      model: "anthropic/claude-sonnet-4",
      fallbackModel: "google/gemini-2.5-pro",
      apiKey: "or-preferred-key",
    });
  });
});
