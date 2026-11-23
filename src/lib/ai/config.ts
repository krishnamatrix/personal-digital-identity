import "server-only";
import { z } from "zod";

export const LOCAL_AI_BASE_URL = "http://127.0.0.1:31415/v1";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

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
  if (!["google", "openai", "openrouter", "local"].includes(provider))
    throw new AiConfigurationError();

  // Legacy gateway settings are only reused for the local/gateway provider. A
  // provider switch must not send the old gateway's endpoint or key to a cloud API.
  const model =
    setting("llm_model") ||
    (provider === "local"
      ? process.env.AI_MODEL?.trim() || "auto"
      : provider === "google"
        ? "gemini-3.5-flash-lite"
        : provider === "openrouter"
          ? process.env.OPENROUTER_MODEL?.trim() || "openrouter/auto"
          : process.env.OPENAI_MODEL?.trim());
  if (!modelSchema.safeParse(model).success) throw new AiConfigurationError();
  const resolvedModel = model as string;
  const fallbackModelRaw =
    setting("llm_fallback_model") ||
    (provider === "openrouter"
      ? process.env.OPENROUTER_FALLBACK_MODEL?.trim()
      : undefined) ||
    undefined;
  if (fallbackModelRaw && !modelSchema.safeParse(fallbackModelRaw).success) {
    throw new AiConfigurationError();
  }
  const endpoint = baseUrl(
    setting("llm_endpoint") ||
      (provider === "google"
        ? "https://generativelanguage.googleapis.com/v1beta"
        : provider === "openai"
          ? "https://api.openai.com/v1"
          : provider === "openrouter"
            ? OPENROUTER_BASE_URL
            : process.env.AI_BASE_URL?.trim() || LOCAL_AI_BASE_URL),
  );
  const apiKey =
    setting("llm_api_key") ||
    (provider === "google"
      ? process.env.GEMINI_API_KEY?.trim()
      : provider === "openai"
        ? process.env.OPENAI_API_KEY?.trim()
        : provider === "openrouter"
          ? process.env.OPENROUTER_API_KEY?.trim()
          : process.env.AI_API_KEY?.trim()) ||
    undefined;
  if (apiKey && /[\r\n]/.test(apiKey)) throw new AiConfigurationError();

  if (provider === "google") {
    return apiKey
      ? {
          provider: "gemini" as const,
          apiKey,
          model: resolvedModel,
          fallbackModel: fallbackModelRaw,
          endpoint: `${endpoint}/models/${encodeURIComponent(resolvedModel)}:generateContent`,
        }
      : null;
  }
  if ((provider === "openai" || provider === "openrouter") && !apiKey)
    return null;
  const format = formatSchema.safeParse(
    setting("llm_response_format") ||
      process.env.AI_RESPONSE_FORMAT?.trim() ||
      "json_schema",
  );
  if (!format.success) throw new AiConfigurationError();
  return {
    provider: "openai-compatible" as const,
    providerName: provider as "openai" | "openrouter" | "local",
    baseUrl: endpoint,
    model: resolvedModel,
    fallbackModel: fallbackModelRaw,
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
