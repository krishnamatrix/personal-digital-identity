import { afterEach, describe, expect, it, vi } from "vitest";
import { didProvider } from "@/domains/video-studio/provider";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("D-ID adapter", () => {
  it("uploads the portrait then submits only the approved script and selected voice", async () => {
    vi.stubEnv("VIDEO_POC_LIVE_ENABLED", "true");
    vi.stubEnv("DID_API_KEY", "synthetic-test-key");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://images.d-id.com/portrait.png" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "talk-1" }),
      });
    vi.stubGlobal("fetch", fetcher);
    const image = new File(["test"], "portrait.png", { type: "image/png" });
    expect(
      await didProvider.create({
        image,
        script: "approved script",
        voice: "en-US-JennyNeural",
        consent: true,
        requestId: "request",
      }),
    ).toBe("talk-1");
    expect(fetcher.mock.calls[0][0]).toBe("https://api.d-id.com/images");
    const body = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(body).toEqual({
      source_url: "https://images.d-id.com/portrait.png",
      script: {
        type: "text",
        input: "approved script",
        provider: { type: "microsoft", voice_id: "en-US-JennyNeural" },
      },
    });
    expect(JSON.stringify(body)).not.toContain("resume");
  });
  it("never retries a failed chargeable submission", async () => {
    vi.stubEnv("VIDEO_POC_LIVE_ENABLED", "true");
    vi.stubEnv("DID_API_KEY", "synthetic-test-key");
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 402 });
    vi.stubGlobal("fetch", fetcher);
    await expect(
      didProvider.create({
        image: new File(["test"], "photo.png"),
        script: "script",
        voice: "voice",
        consent: true,
        requestId: "id",
      }),
    ).rejects.toThrow(/provider/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("blocks unsafe video results", async () => {
    vi.stubEnv("VIDEO_POC_LIVE_ENABLED", "true");
    vi.stubEnv("DID_API_KEY", "synthetic-test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "done",
          result_url: "javascript:alert(1)",
        }),
      }),
    );
    await expect(didProvider.status("job")).rejects.toThrow();
  });
});
