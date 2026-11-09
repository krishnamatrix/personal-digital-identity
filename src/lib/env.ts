import { z } from "zod";

const environmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  // Persona storage backend. "fixture" (default) keeps Personas in server memory;
  // "supabase" uses the PostgREST/RPC repository and requires the M3C SQL to be
  // approved, executed and verified first. Server-side only: no NEXT_PUBLIC_ prefix.
  PERSONA_STORAGE: z.enum(["fixture", "supabase"]).default("fixture"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export const env = environmentSchema.parse(process.env);

export function requireSupabaseConfig() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for Supabase access.",
    );
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}
