import "server-only";
import { z } from "zod";

export const LOCAL_AI_BASE_URL = "http://127.0.0.1:31415/v1";
export const DEFAULT_GEMINI_FALLBACK = "gemini-3.5-flash";

export class AiConfigurationError extends Error {
  constructor() {
    super("AI configuration is invalid. Check the server provider settings.");
    this.name = "AiConfigurationError";
  }
}

const modelSchema = z.string().trim().min(1).max(200);
const formatSchema = z.enum(["json_schema", "json_object"]);

/** Lowercase requested settings take precedence, then conventional uppercase aliases. */
function setting(name: string): string | undefined {
  return (
    process.env[name]?.trim() ||
    process.env[name.toUpperCase()]?.trim() ||
    undefined
  );
}

function baseUrl(value: string): string {
  const result = z.url().safeParse(value);
  if (!result.success) throw new AiConfigurationError();
  const url = new URL(result.data);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new AiConfigurationError();
  return result.data.replace(/\/+$/, "");
}

/** Read lazily on the server; never import from client components. */
export function getAiConfiguration() {
  const selected =
    setting("llm_provider") || process.env.AI_PROVIDER?.trim() || "google";
  const provider =
    selected === "gemini"
      ? "google"
      : selected === "openai-compatible"
        ? "local"
        : selected;
  if (!["google", "openai", "local"].includes(provider))
    throw new AiConfigurationError();

  // Legacy gateway settings are only reused for the local/gateway provider. A
  // provider switch must not send the old gateway's endpoint or key to a cloud API.
  const model =
    setting("llm_model") ||
    (provider === "local"
      ? process.env.AI_MODEL?.trim() || "auto"
      : provider === "google"
        ? "gemini-3.5-flash-lite"
        : process.env.OPENAI_MODEL?.trim());
  if (!modelSchema.safeParse(model).success) throw new AiConfigurationError();
  const resolvedModel = model as string;
  const endpoint = baseUrl(
    setting("llm_endpoint") ||
      (provider === "google"
        ? "https://generativelanguage.googleapis.com/v1beta"
        : provider === "openai"
          ? "https://api.openai.com/v1"
          : process.env.AI_BASE_URL?.trim() || LOCAL_AI_BASE_URL),
  );
  const apiKey =
    setting("llm_api_key") ||
    (provider === "google"
      ? process.env.GEMINI_API_KEY?.trim()
      : provider === "openai"
        ? process.env.OPENAI_API_KEY?.trim()
        : process.env.AI_API_KEY?.trim()) ||
    undefined;
  if (apiKey && /[\r\n]/.test(apiKey)) throw new AiConfigurationError();

  if (provider === "google") {
    const generate = (m: string) =>
      `${endpoint}/models/${encodeURIComponent(m)}:generateContent`;
    // A second model to use when the first is overloaded (Gemini answers 503 "high
    // demand" for minutes at a time on popular models). "none" turns it off.
    const fallback = setting("llm_fallback_model") || DEFAULT_GEMINI_FALLBACK;
    const fallbackModel =
      fallback === "none" || fallback === resolvedModel
        ? null
        : modelSchema.safeParse(fallback).success
          ? fallback
          : null;
    return apiKey
      ? {
          provider: "gemini" as const,
          apiKey,
          model: resolvedModel,
          endpoint: generate(resolvedModel),
          fallbackModel,
          fallbackEndpoint: fallbackModel ? generate(fallbackModel) : null,
        }
      : null;
  }
  if (provider === "openai" && !apiKey) return null;
  const format = formatSchema.safeParse(
    setting("llm_response_format") ||
      process.env.AI_RESPONSE_FORMAT?.trim() ||
      "json_schema",
  );
  if (!format.success) throw new AiConfigurationError();
  return {
    provider: "openai-compatible" as const,
    providerName: provider as "openai" | "local",
    baseUrl: endpoint,
    model: resolvedModel,
    apiKey,
    responseFormat: format.data,
    endpoints: {
      chat: `${endpoint}/chat/completions`,
      responses: `${endpoint}/responses`,
      messages: `${endpoint}/messages`,
      embeddings: `${endpoint}/embeddings`,
    },
  };
}

export type GatewayConfiguration = Extract<
  NonNullable<ReturnType<typeof getAiConfiguration>>,
  { provider: "openai-compatible" }
>;
