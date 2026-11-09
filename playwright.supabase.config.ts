import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

/**
 * Persona acceptance against the REAL Supabase persistence (M3D Task 3).
 * Dev server on :3100 with PERSONA_STORAGE=supabase. Signed-in user = RLS test
 * account A (the shared specs read FOLIOONE_DEV_TEST_*); B is used only by the
 * isolation scenario. No service-role key, no database URL.
 *
 *   pnpm exec playwright test --config playwright.supabase.config.ts
 */
const original = { ...process.env };
loadEnvConfig(process.cwd(), true);
const loaded = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  aEmail: process.env.FOLIOONE_RLS_USER_A_EMAIL,
  aPassword: process.env.FOLIOONE_RLS_USER_A_PASSWORD,
  bEmail: process.env.FOLIOONE_RLS_USER_B_EMAIL,
  bPassword: process.env.FOLIOONE_RLS_USER_B_PASSWORD,
};
for (const key of Object.keys(process.env)) {
  if (!Object.prototype.hasOwnProperty.call(original, key))
    delete process.env[key];
}
Object.assign(process.env, original);
process.env.FOLIOONE_DEV_TEST_EMAIL = loaded.aEmail ?? "";
process.env.FOLIOONE_DEV_TEST_PASSWORD = loaded.aPassword ?? "";
process.env.E2E_SUPABASE_URL = loaded.url ?? "";
process.env.E2E_SUPABASE_ANON_KEY = loaded.anon ?? "";
process.env.E2E_USER_B_EMAIL = loaded.bEmail ?? "";
process.env.E2E_USER_B_PASSWORD = loaded.bPassword ?? "";
process.env.E2E_PERSONA_STORAGE = "supabase";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["personas.spec.ts", "personas-supabase.spec.ts"],
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PERSONA_STORAGE: "supabase",
      FOLIOONE_DEV_TEST_EMAIL: "",
      FOLIOONE_DEV_TEST_PASSWORD: "",
      FOLIOONE_RLS_E2E_USER: "",
      FOLIOONE_RLS_USER_A_EMAIL: "",
      FOLIOONE_RLS_USER_A_PASSWORD: "",
      FOLIOONE_RLS_USER_B_EMAIL: "",
      FOLIOONE_RLS_USER_B_PASSWORD: "",
      E2E_SUPABASE_URL: "",
      E2E_SUPABASE_ANON_KEY: "",
      E2E_USER_B_EMAIL: "",
      E2E_USER_B_PASSWORD: "",
      E2E_PERSONA_STORAGE: "",
    },
  },
});
