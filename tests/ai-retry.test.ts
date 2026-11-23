import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithFallback, fetchWithRetry } from "@/lib/ai/retry";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const res = (status: number, headers: Record<string, string> = {}) =>
  new Response("{}", { status, headers });
const instant = () => {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
};

describe("fetchWithRetry", () => {
  it("recovers from a busy moment (503, then OK)", async () => {
    fetchMock.mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200));
    const { waits, sleep } = instant();
    const r = await fetchWithRetry("https://ai.example", () => ({}), { sleep });
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(waits[0]).toBeGreaterThanOrEqual(1000);
    expect(waits[0]).toBeLessThanOrEqual(1300);
  });

  it("honours Retry-After, capped at 8 seconds", async () => {
    fetchMock
      .mockResolvedValueOnce(res(429, { "retry-after": "3" }))
      .mockResolvedValueOnce(res(429, { "retry-after": "120" }))
      .mockResolvedValueOnce(res(200));
    const { waits, sleep } = instant();
    await fetchWithRetry("https://ai.example", () => ({}), { sleep });
    expect(waits).toEqual([3000, 8000]);
  });

  it("gives up after three tries and returns the last answer", async () => {
    fetchMock.mockImplementation(async () => res(503));
    const { sleep } = instant();
    const r = await fetchWithRetry("https://ai.example", () => ({}), { sleep });
    expect(r.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never retries client errors or timeouts", async () => {
    const { sleep } = instant();
    fetchMock.mockResolvedValueOnce(res(401));
    expect(
      (await fetchWithRetry("https://ai.example", () => ({}), { sleep }))
        .status,
    ).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    fetchMock.mockRejectedValueOnce(timeout);
    await expect(
      fetchWithRetry("https://ai.example", () => ({}), { sleep }),
    ).rejects.toThrow("timed out");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("builds a fresh request (and timeout signal) for every try", async () => {
    fetchMock.mockResolvedValueOnce(res(502)).mockResolvedValueOnce(res(200));
    const init = vi.fn(() => ({ signal: AbortSignal.timeout(60_000) }));
    await fetchWithRetry("https://ai.example", init, instant());
    expect(init).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![1].signal).not.toBe(
      fetchMock.mock.calls[1]![1].signal,
    );
  });
});

vi.mock("server-only", () => ({}));

describe("fetchWithFallback", () => {
  it("moves to the next model only while the first stays busy", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      res(url === "https://a.example" ? 503 : 200),
    );
    const { sleep } = instant();
    const r = await fetchWithFallback(
      ["https://a.example", "https://b.example"],
      () => ({}),
      { sleep },
    );
    expect(r.status).toBe(200);
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual([
      "https://a.example",
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("stops at a real answer or a timeout", async () => {
    const { sleep } = instant();
    fetchMock.mockResolvedValueOnce(res(400));
    const r = await fetchWithFallback(
      ["https://a.example", "https://b.example"],
      () => ({}),
      { sleep },
    );
    expect(r.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error("slow"), { name: "TimeoutError" }),
    );
    await expect(
      fetchWithFallback(
        ["https://a.example", "https://b.example"],
        () => ({}),
        { sleep },
      ),
    ).rejects.toThrow("slow");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
