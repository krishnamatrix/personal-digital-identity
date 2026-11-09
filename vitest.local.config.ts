import { defineConfig } from "vitest/config";
import path from "node:path";

// Backend integration + RLS suites against LOCAL Supabase, started by
// `pnpm validate` (scripts/validate). Never part of `pnpm test`. The setup file
// refuses to run outside that workflow and blocks any non-loopback request.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/helpers/local-only-setup.ts"],
    include: [
      "tests/hosted/rls-isolation.hosted.ts",
      "tests/hosted/persona-persistence.hosted.ts",
      "tests/hosted/persona-anchor-absent.hosted.ts",
      "tests/hosted/persona-anchor-concurrent.hosted.ts",
    ],
    hookTimeout: 60_000,
    testTimeout: 90_000,
    fileParallelism: false,
  },
});
