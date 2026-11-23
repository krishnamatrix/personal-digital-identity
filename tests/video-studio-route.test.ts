// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  enabled: vi.fn(),
  create: vi.fn(),
  status: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createAuthenticatedClient: mocks.auth,
}));
vi.mock("@/domains/video-studio/provider", () => ({
  liveEnabled: mocks.enabled,
}));
vi.mock("@/domains/video-studio/jobs", () => ({
  studioJobs: { create: mocks.create, status: mocks.status },
}));
import { GET, POST } from "@/app/api/poc/video-studio/route";
const url = "http://localhost:3000/api/poc/video-studio";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.auth.mockResolvedValue({ user: { id: "verified-owner" } });
});
describe("live studio authentication boundary", () => {
  it("rejects disabled mode before auth or provider work", async () => {
    mocks.enabled.mockReturnValue(false);
    const result = await GET(new NextRequest(url + "?id=job"));
    expect(result.status).toBe(401);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("rejects signed-out requests", async () => {
    mocks.auth.mockRejectedValue(new Error("signed out"));
    const result = await POST(
      new NextRequest(url, {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
      }),
    );
    expect(result.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects cross-origin submission", async () => {
    const result = await POST(
      new NextRequest(url, {
        method: "POST",
        headers: { origin: "https://other.example" },
      }),
    );
    expect(result.status).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("forwards only the verified owner for status reads", async () => {
    mocks.status.mockResolvedValue({ id: "job", status: "processing" });
    const result = await GET(new NextRequest(url + "?id=job&owner=attacker"));
    expect(result.status).toBe(200);
    expect(mocks.status).toHaveBeenCalledWith("verified-owner", "job");
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects missing consent before submitting a chargeable job", async () => {
    const form = new FormData();
    form.set(
      "image",
      new File(
        [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
        "portrait.png",
        { type: "image/png" },
      ),
    );
    form.set("script", "hello ".repeat(20));
    form.set("voice", "en-US-JennyNeural");
    const result = await POST(
      new NextRequest(url, {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: form,
      }),
    );
    expect(result.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
