import "server-only";
import { randomUUID } from "node:crypto";
import { VOICES, validateScript } from "./studio";
import {
  didProvider,
  type VideoProvider,
  type GenerationInput,
} from "./provider";

type Job = {
  id: string;
  owner: string;
  providerId?: string;
  status: "processing" | "ready" | "failed";
  url?: string;
  created: number;
  lastPoll: number;
  polling?: Promise<void>;
  reservation: Promise<void>;
};
const TTL = 60 * 60 * 1000;
const publicJob = (j: Job) => ({
  id: j.id,
  status: j.status,
  ...(j.url ? { url: j.url } : {}),
  ...(j.status === "failed"
    ? {
        error:
          "Generation did not complete. Do not automatically retry: the provider may have accepted or charged for the request. Check your provider dashboard first.",
      }
    : {}),
});
/** Single-process POC only. Restart discards jobs; this is not durable billing infrastructure. */
export class StudioJobs {
  private jobs = new Map<string, Job>();
  private requests = new Map<string, string>();
  constructor(private provider: VideoProvider) {}
  async create(owner: string, input: GenerationInput) {
    if (!input.consent) throw new Error("Explicit consent is required.");
    validateScript(input.script);
    if (
      !VOICES.some((v) => v.id === input.voice) ||
      !/^[0-9a-f-]{36}$/i.test(input.requestId)
    )
      throw new Error("Invalid generation options.");
    for (const [id, j] of this.jobs)
      if (Date.now() - j.created > TTL) this.jobs.delete(id);
    for (const [key, id] of this.requests)
      if (!this.jobs.has(id)) this.requests.delete(key);
    const key = `${owner}:${input.requestId}`;
    const existing = this.jobs.get(this.requests.get(key) ?? "");
    if (existing) {
      await existing.reservation;
      return publicJob(existing);
    }
    if (
      this.jobs.size >= 100 ||
      [...this.jobs.values()].filter((j) => j.owner === owner).length >= 3
    )
      throw new Error(
        "POC generation limit reached. Try again after one hour.",
      );
    const job: Job = {
      id: randomUUID(),
      owner,
      status: "processing",
      created: Date.now(),
      lastPoll: 0,
      reservation: Promise.resolve(),
    };
    this.jobs.set(job.id, job);
    this.requests.set(key, job.id);
    job.reservation = this.provider
      .create(input)
      .then((id) => {
        job.providerId = id;
      })
      .catch(() => {
        job.status = "failed";
      });
    await job.reservation;
    return publicJob(job);
  }
  async status(owner: string, id: string) {
    const job = this.jobs.get(id);
    if (!job || job.owner !== owner || Date.now() - job.created > TTL)
      throw new Error(
        "Video job not found or expired. Server restarts clear POC jobs.",
      );
    await job.reservation;
    if (
      job.status === "processing" &&
      job.providerId &&
      !job.polling &&
      Date.now() - job.lastPoll >= 4000
    ) {
      job.lastPoll = Date.now();
      job.polling = this.provider
        .status(job.providerId)
        .then((result) => {
          job.status = result.status;
          job.url = result.url;
        })
        .finally(() => {
          job.polling = undefined;
        });
    }
    if (job.polling) await job.polling;
    return publicJob(job);
  }
}
const globalJobs = globalThis as typeof globalThis & {
  videoStudioJobs?: StudioJobs;
};
export const studioJobs = (globalJobs.videoStudioJobs ??= new StudioJobs(
  didProvider,
));
