import "server-only";
import { z } from "zod";

export type ProviderStatus = {
  status: "processing" | "ready" | "failed";
  url?: string;
};
export type GenerationInput = {
  image: File;
  script: string;
  voice: string;
  consent: boolean;
  requestId: string;
};
export interface VideoProvider {
  create(input: GenerationInput): Promise<string>;
  status(id: string): Promise<ProviderStatus>;
}
export function liveEnabled() {
  return (
    process.env.VIDEO_POC_LIVE_ENABLED === "true" &&
    Boolean(process.env.DID_API_KEY?.trim())
  );
}
async function request(path: string, init: RequestInit = {}) {
  const key = process.env.DID_API_KEY?.trim();
  if (!liveEnabled() || !key) throw new Error("Live video is not configured.");
  const response = await fetch(`https://api.d-id.com${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Basic ${key}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(
      "The video provider could not complete this request. Check provider credits and configuration before trying again.",
    );
  return response.json();
}
export const didProvider: VideoProvider = {
  async create(input) {
    const body = new FormData();
    body.set(
      "image",
      input.image,
      input.image.type === "image/png" ? "portrait.png" : "portrait.jpg",
    );
    const image = z
      .object({ url: z.url().refine((v) => v.startsWith("https://")) })
      .parse(await request("/images", { method: "POST", body }));
    const talk = z.object({ id: z.string().min(1).max(200) }).parse(
      await request("/talks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_url: image.url,
          script: {
            type: "text",
            input: input.script,
            provider: { type: "microsoft", voice_id: input.voice },
          },
        }),
      }),
    );
    return talk.id;
  },
  async status(id) {
    const result = z
      .object({ status: z.string(), result_url: z.url().optional() })
      .parse(await request(`/talks/${encodeURIComponent(id)}`));
    if (result.status === "done") {
      if (!result.result_url?.startsWith("https://"))
        throw new Error("Invalid provider output.");
      return { status: "ready", url: result.result_url };
    }
    return {
      status: ["error", "rejected", "failed"].includes(result.status)
        ? "failed"
        : "processing",
    };
  },
};
