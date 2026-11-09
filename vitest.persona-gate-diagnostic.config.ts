import { defineConfig } from "vitest/config";

// Opt-in hosted diagnostic for the Milestone 3A request-path gate. Not part of
// `pnpm test`. See docs/sql/milestone-3a/diagnostics/README.md.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/hosted/persona-request-gate-diagnostic.hosted.ts"],
    hookTimeout: 30_000,
    testTimeout: 120_000,
  },
});
