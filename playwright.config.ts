import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

const originalEnvironment = { ...process.env };
loadEnvConfig(process.cwd(), true);
const testCredentials = {
  FOLIOONE_DEV_TEST_EMAIL: process.env.FOLIOONE_DEV_TEST_EMAIL,
  FOLIOONE_DEV_TEST_PASSWORD: process.env.FOLIOONE_DEV_TEST_PASSWORD,
  FOLIOONE_RLS_USER_A_EMAIL: process.env.FOLIOONE_RLS_USER_A_EMAIL,
  FOLIOONE_RLS_USER_A_PASSWORD: process.env.FOLIOONE_RLS_USER_A_PASSWORD,
  FOLIOONE_RLS_USER_B_EMAIL: process.env.FOLIOONE_RLS_USER_B_EMAIL,
  FOLIOONE_RLS_USER_B_PASSWORD: process.env.FOLIOONE_RLS_USER_B_PASSWORD,
};

// Keep this loader from copying unrelated .env.local values into the test
// runner. Only explicitly designated test account credentials are selected.
for (const key of Object.keys(process.env)) {
  if (!Object.prototype.hasOwnProperty.call(originalEnvironment, key)) {
    delete process.env[key];
  }
}
Object.assign(process.env, originalEnvironment);
const selectedRlsUser = originalEnvironment.FOLIOONE_RLS_E2E_USER;
if (selectedRlsUser === "A" || selectedRlsUser === "B") {
  const selectedCredentials =
    selectedRlsUser === "A"
      ? {
          email: testCredentials.FOLIOONE_RLS_USER_A_EMAIL,
          password: testCredentials.FOLIOONE_RLS_USER_A_PASSWORD,
        }
      : {
          email: testCredentials.FOLIOONE_RLS_USER_B_EMAIL,
          password: testCredentials.FOLIOONE_RLS_USER_B_PASSWORD,
        };
  process.env.FOLIOONE_DEV_TEST_EMAIL = selectedCredentials.email ?? "";
  process.env.FOLIOONE_DEV_TEST_PASSWORD = selectedCredentials.password ?? "";
} else {
  for (const key of [
    "FOLIOONE_DEV_TEST_EMAIL",
    "FOLIOONE_DEV_TEST_PASSWORD",
  ] as const) {
    const value = testCredentials[key];
    if (!originalEnvironment[key] && value) process.env[key] = value;
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3000", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      FOLIOONE_DEV_TEST_EMAIL: "",
      FOLIOONE_DEV_TEST_PASSWORD: "",
      FOLIOONE_RLS_E2E_USER: "",
      FOLIOONE_RLS_USER_A_EMAIL: "",
      FOLIOONE_RLS_USER_A_PASSWORD: "",
      FOLIOONE_RLS_USER_B_EMAIL: "",
      FOLIOONE_RLS_USER_B_PASSWORD: "",
    },
  },
});
