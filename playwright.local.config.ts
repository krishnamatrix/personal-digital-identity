import { defineConfig, devices } from "@playwright/test";
import { assertLocalUrl } from "./scripts/validate/local-guard.mjs";

/**
 * Headless E2E against the production build and LOCAL Supabase, started by
 * `pnpm validate`. Deliberately does NOT load .env.local: every value comes from
 * the orchestrator's environment, and the run refuses to start unless the
 * Supabase URL is a loopback address.
 */
if (process.env.FOLIOONE_VALIDATE !== "1") {
  throw new Error(
    "playwright.local.config.ts must be started by `pnpm validate` (FOLIOONE_VALIDATE=1).",
  );
}
const supabaseUrl = assertLocalUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "NEXT_PUBLIC_SUPABASE_URL",
).origin;

const port = process.env.FOLIOONE_E2E_PORT ?? "3100";
const baseURL = `http://127.0.0.1:${port}`;

// Passed to the Next server only; test credentials are NOT forwarded to it.
const serverEnv = {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  PERSONA_STORAGE: "supabase",
  NODE_ENV: "production",
};

// Specs read the E2E account from these names (see e2e/*.spec.ts).
// The post-deployment smoke suite runs here too, against the local stack, so the suite
// itself is verified before it is pointed at staging.
process.env.SMOKE_USER_A_EMAIL = process.env.FOLIOONE_DEV_TEST_EMAIL;
process.env.SMOKE_USER_A_PASSWORD = process.env.FOLIOONE_DEV_TEST_PASSWORD;
process.env.SMOKE_USER_B_EMAIL = process.env.E2E_USER_B_EMAIL;
process.env.SMOKE_USER_B_PASSWORD = process.env.E2E_USER_B_PASSWORD;
process.env.E2E_PERSONA_STORAGE = "supabase";
process.env.E2E_SUPABASE_URL = supabaseUrl;
process.env.E2E_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "dashboard.spec.ts",
    "health.spec.ts",
    "profile-auth.spec.ts",
    "personas.spec.ts",
    "personas-supabase.spec.ts",
    "staging-smoke.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report/local" }],
  ],
  outputDir: "test-results/local",
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next start --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: serverEnv,
  },
});
