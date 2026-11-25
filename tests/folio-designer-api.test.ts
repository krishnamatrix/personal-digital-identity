// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import {
  FolioDesignerFailedError,
  FolioDesignerUnavailableError,
} from "@/lib/ai/folio-designer-extractor";

const generateMock = vi.fn();

vi.mock("@/domains/folio-designer/folio-designer-service", () => ({
  generateFolioDesignerProposal: (prompt: unknown) => generateMock(prompt),
}));

import { POST as generatePost } from "@/app/api/llm/folio-designer/route";

const sampleProposal = {
  html: "<!DOCTYPE html><html><head><title>Jamie</title></head><body><h1>Jamie</h1></body></html>",
  title: "Jamie",
  identityFieldsUsed: ["displayName", "headline"] as const,
  generatedAt: new Date().toISOString(),
};

describe("POST /api/llm/folio-designer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid prompt", async () => {
    generateMock.mockRejectedValueOnce(new ZodError([]));
    const res = await generatePost(
      new Request("http://localhost/api/llm/folio-designer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "short" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 401 when unauthenticated", async () => {
    generateMock.mockRejectedValueOnce(new AuthenticationRequiredError());
    const res = await generatePost(
      new Request("http://localhost/api/llm/folio-designer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "a".repeat(24) }),
      }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("unauthenticated");
  });

  it("returns 200 with standalone HTML design proposal", async () => {
    generateMock.mockResolvedValueOnce({ proposal: sampleProposal });
    const res = await generatePost(
      new Request("http://localhost/api/llm/folio-designer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "a".repeat(30) }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, data: sampleProposal });
  });

  it("returns 503 when AI unavailable", async () => {
    generateMock.mockRejectedValueOnce(new FolioDesignerUnavailableError());
    const res = await generatePost(
      new Request("http://localhost/api/llm/folio-designer", {
        method: "POST",
        body: JSON.stringify({ prompt: "a".repeat(30) }),
      }),
    );
    expect(res.status).toBe(503);
  });

  it("returns 422 when generation fails", async () => {
    generateMock.mockRejectedValueOnce(new FolioDesignerFailedError("no_output"));
    const res = await generatePost(
      new Request("http://localhost/api/llm/folio-designer", {
        method: "POST",
        body: JSON.stringify({ prompt: "a".repeat(30) }),
      }),
    );
    expect(res.status).toBe(422);
  });
});
