import { defineConfig, devices } from "@playwright/test";

/**
 * Post-deployment smoke tests against a DEPLOYED Folioone (e.g. Railway staging).
 *
 *   SMOKE_BASE_URL=https://<staging-host> \
 *   SMOKE_USER_A_EMAIL=... SMOKE_USER_A_PASSWORD=... \
 *   SMOKE_USER_B_EMAIL=... SMOKE_USER_B_PASSWORD=... \
 *   pnpm smoke:staging
 *
 * Deliberately reads ONLY the process environment (never .env.local) and starts no
 * server. Use dedicated staging test accounts; see docs/architecture/staging-smoke-tests.md.
 */
const baseURL = process.env.SMOKE_BASE_URL;
if (!baseURL) {
  throw new Error("SMOKE_BASE_URL is required (the deployed staging URL).");
}
const url = new URL(baseURL);
const local = ["127.0.0.1", "localhost"].includes(url.hostname);
if (url.protocol !== "https:" && !local) {
  throw new Error(
    "SMOKE_BASE_URL must use https:// for a deployed environment.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["staging-smoke.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report/staging" }],
  ],
  outputDir: "test-results/staging",
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
