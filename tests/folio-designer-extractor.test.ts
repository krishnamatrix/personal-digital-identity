// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IdentityDesignContext } from "@/domains/folio-designer/identity-design-context";

const getAiConfigMock = vi.fn();
const generateChunkMock = vi.fn();

vi.mock("@/lib/ai/config", () => ({
  getAiConfiguration: () => getAiConfigMock(),
}));

vi.mock("@/lib/ai/openai-compatible", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/ai/openai-compatible")>();
  return {
    ...actual,
    generateTextCompletionChunk: (
      config: unknown,
      messages: unknown,
      options: unknown,
    ) => generateChunkMock(config, messages, options),
  };
});

import { extractFolioDesignerProposal } from "@/lib/ai/folio-designer-extractor";

const sampleIdentity: IdentityDesignContext = {
  name: "Jamie Chen",
  headline: "Product designer",
  professionalSummary: null,
  biographyExcerpt: null,
  location: null,
  industry: null,
  purpose: null,
  designation: null,
  organization: null,
  websiteUrl: null,
  linkedinUrl: null,
  githubUrl: null,
  visibleEntryCounts: {},
  highlights: {},
  articles: [],
  populatedFields: ["displayName", "headline"],
};

describe("extractFolioDesignerProposal ping-pong continuation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAiConfigMock.mockReturnValue({
      provider: "openai-compatible",
      providerName: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "main-model",
      fallbackModel: "fallback-model",
      apiKey: "test-key",
      responseFormat: "json_schema",
      endpoints: {
        chat: "https://openrouter.ai/api/v1/chat/completions",
        responses: "https://openrouter.ai/api/v1/responses",
        messages: "https://openrouter.ai/api/v1/messages",
        embeddings: "https://openrouter.ai/api/v1/embeddings",
      },
    });
  });

  it("alternates main -> fallback -> main when hitting output token limits", async () => {
    generateChunkMock
      .mockResolvedValueOnce({
        text: "<!DOCTYPE html><html><head><title>Jamie</title></head><body><main>Part 1",
        finishReason: "length",
      })
      .mockResolvedValueOnce({
        text: " Part 2",
        finishReason: "length",
      })
      .mockResolvedValueOnce({
        text: " Part 3</main></body></html>",
        finishReason: "stop",
      });

    const result = await extractFolioDesignerProposal(
      "Build a multi-link cinematic portfolio",
      sampleIdentity,
    );

    expect(generateChunkMock).toHaveBeenCalledTimes(3);
    expect(generateChunkMock.mock.calls[0]?.[2]?.model).toBe("main-model");
    expect(generateChunkMock.mock.calls[1]?.[2]?.model).toBe("fallback-model");
    expect(generateChunkMock.mock.calls[2]?.[2]?.model).toBe("main-model");
    expect(result.html).toContain("Part 1 Part 2 Part 3</main></body></html>");
    expect(result.title).toBe("Jamie");
  });
});
