import { defineConfig } from "vitest/config";
import path from "node:path";

// Opt-in HOSTED suite for Persona persistence (M3C). Not part of `pnpm test`.
// It needs the M3C SQL executed and verified, two dedicated test accounts, and
// FOLIOONE_PERSONA_SQL_EXECUTED=1. See docs/architecture/milestone-3c-persona-persistence.md.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/hosted/persona-persistence.hosted.ts"],
    hookTimeout: 60_000,
    testTimeout: 90_000,
    fileParallelism: false,
  },
});
