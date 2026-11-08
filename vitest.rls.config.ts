import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/hosted/rls-isolation.hosted.ts"],
    hookTimeout: 30_000,
    testTimeout: 60_000,
  },
});
