import {
  assertLocalUrl,
  installFetchGuard,
} from "../../scripts/validate/local-guard.mjs";

// Vitest setup for vitest.local.config.ts ONLY. Refuses to run unless the
// orchestrator marked the run as local validation, then blocks every request
// to a non-loopback host.
if (process.env.FOLIOONE_VALIDATE !== "1") {
  throw new Error(
    "vitest.local.config.ts must be started by `pnpm validate` (FOLIOONE_VALIDATE=1).",
  );
}
assertLocalUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "NEXT_PUBLIC_SUPABASE_URL",
);
installFetchGuard();
