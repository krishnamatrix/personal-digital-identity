import { describe, expect, it, vi } from "vitest";
import { StudioJobs } from "@/domains/video-studio/jobs";

const input = {
  image: new File(["photo"], "portrait.png", { type: "image/png" }),
  script: "hello ".repeat(20),
  voice: "en-US-JennyNeural",
  consent: true,
  requestId: "550e8400-e29b-41d4-a716-446655440000",
};
describe("owner-scoped video jobs", () => {
  it("deduplicates concurrent submissions and refuses cross-owner lookup", async () => {
    const create = vi.fn().mockResolvedValue("talk-1");
    const status = vi.fn().mockResolvedValue({
      status: "ready",
      url: "https://result.d-id.com/video.mp4",
    });
    const jobs = new StudioJobs({ create, status });
    const [a, b] = await Promise.all([
      jobs.create("alice", input),
      jobs.create("alice", input),
    ]);
    expect(a.id).toBe(b.id);
    expect(create).toHaveBeenCalledTimes(1);
    await expect(jobs.status("bob", a.id)).rejects.toThrow(/not found/);
    expect(status).not.toHaveBeenCalled();
    expect((await jobs.status("alice", a.id)).status).toBe("ready");
  });
  it("requires consent and limits submissions before provider calls", async () => {
    const create = vi.fn().mockResolvedValue("talk-1");
    const jobs = new StudioJobs({ create, status: vi.fn() });
    await expect(
      jobs.create("alice", { ...input, consent: false }),
    ).rejects.toThrow(/consent/);
    expect(create).not.toHaveBeenCalled();
    for (let i = 0; i < 3; i++)
      await jobs.create("alice", { ...input, requestId: crypto.randomUUID() });
    await expect(
      jobs.create("alice", { ...input, requestId: crypto.randomUUID() }),
    ).rejects.toThrow(/limit/);
  });
  it("does not resubmit an ambiguous failed request", async () => {
    const create = vi
      .fn()
      .mockRejectedValue(new Error("private provider details"));
    const jobs = new StudioJobs({ create, status: vi.fn() });
    const a = await jobs.create("alice", input);
    const b = await jobs.create("alice", input);
    expect(a.status).toBe("failed");
    expect(b.id).toBe(a.id);
    expect(create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(a)).not.toContain("private provider details");
  });
});
