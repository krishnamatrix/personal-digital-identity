#!/usr/bin/env node
// `pnpm validate`: local-first validation. Nothing here connects to hosted Supabase.
//
// Flags:  --keep     leave local Supabase running afterwards
//         --no-e2e   stop after the build (skip Playwright)
//         --public-decoy  also install the ORIGINAL public-schema package first (mirrors the
//                         hosted state) and prove it is untouched afterwards
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertLocalUrl } from "./local-guard.mjs";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const keep = args.has("--keep") || process.env.FOLIOONE_VALIDATE_KEEP === "1";
const withE2e = !args.has("--no-e2e");
const publicDecoy = args.has("--public-decoy");
const logDir = join(root, ".validate");
mkdirSync(logDir, { recursive: true });

/** Canonical package (generated from the approved SQL): schema folioone. */
const SQL_PACKAGE = [
  "docs/sql/folioone-schema/001-create-schema.sql",
  "docs/sql/folioone-schema/002-identity-tables.sql",
  "docs/sql/folioone-schema/003-identity-rls.sql",
  "docs/sql/folioone-schema/004-persona-tables.sql",
  "docs/sql/folioone-schema/005-persona-rls-and-grants.sql",
  "docs/sql/folioone-schema/006-persona-functions.sql",
  // M4: profile expansion + identity_entries (hand-written, folioone only; reviewed SQL).
  "docs/sql/milestone-4/001-identity-profile-expansion.sql",
  // M5: website configuration + published snapshot (adds a narrow anon read; see the file header).
  "docs/sql/milestone-5/001-website.sql",
  // M6: articles + published article snapshot (replaces the three website functions).
  "docs/sql/milestone-6/001-articles.sql",
  // M7: widens the website theme CHECK constraints to the portfolio templates.
  "docs/sql/milestone-7/001-website-templates.sql",
  // M8: digital cards + published card snapshot (narrow anon read, like M5).
  "docs/sql/milestone-8/001-digital-cards.sql",
  // M9: Free / PRO plans (one narrow SECURITY DEFINER function, AD-011). 002 (the secret) is
  // run by hand on each project and is deliberately not applied here.
  "docs/sql/milestone-9/001-pro-plans.sql",
  // M10 (Storage policies) is not applied here: Storage is disabled in the local stack.
  // M11: featured_post entry kind, then Insights (public ids + insight_events, anon INSERT only).
  "docs/sql/milestone-11/001-featured-posts.sql",
  "docs/sql/milestone-11/002-insights.sql",
  // M12: 'booking_open' insight event (links page + booking block need no schema change).
  "docs/sql/milestone-12/001-booking-insights.sql",
  // M13: video intro row (owner-only) + 'video_complete' event. 001 (Storage) is not applied.
  "docs/sql/milestone-13/002-intro-videos.sql",
  "docs/sql/milestone-13/003-intro-video-background.sql",
  "docs/sql/milestone-13/004-intro-trim-and-studio.sql",
  // ChatCards: reserved routes, the ChatCard + conversation tables, and their Insights events.
  "docs/sql/milestone-chatcards/001-chatcard-routes.sql",
  "docs/sql/milestone-chatcards/002-chatcards.sql",
  "docs/sql/milestone-chatcards/003-chatcard-insights.sql",
];

/**
 * `--public-decoy`: the ORIGINAL public-schema package, applied first, to mirror the hosted
 * development project where those objects still exist. They must be untouched at the end.
 */
const LEGACY_PUBLIC_PACKAGE = [
  "docs/sql/milestone-2/001-identity-tables.sql",
  "docs/sql/milestone-2/002-identity-rls.sql",
  "docs/sql/milestone-3c/001-persona-schema-secured.sql",
  "docs/sql/milestone-3c/002-persona-gate-policies-grants.sql",
  "docs/sql/milestone-3c/003-persona-mutation-rpcs.sql",
  "docs/sql/milestone-3c/004-persona-version-conflict-sqlstate.sql",
];
const SNAPSHOT_SQL = "docs/sql/folioone-schema/public-snapshot.sql";

const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(
  readFileSync(join(root, "supabase/config.toml"), "utf8"),
)?.[1];
if (!projectId) throw new Error("supabase/config.toml has no project_id");
const dbContainer = `supabase_db_${projectId}`;

const results = [];
let cleaningUp = false;

function log(message) {
  console.log(`\n\u001b[1m[validate] ${message}\u001b[0m`);
}

/** Environment for child processes: no inherited Supabase/Folioone settings. */
function baseEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("FOLIOONE_") ||
      key.startsWith("SUPABASE_") ||
      key.startsWith("NEXT_PUBLIC_SUPABASE") ||
      key === "PERSONA_STORAGE" ||
      key === "DATABASE_URL" ||
      key === "MIGRATION_DATABASE_URL"
    ) {
      delete env[key];
    }
  }
  return env;
}

function run(
  command,
  commandArgs,
  { env = baseEnv(), input, capture = false, logName } = {},
) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      env,
      stdio: [
        input === undefined ? "ignore" : "pipe",
        capture || logName ? "pipe" : "inherit",
        capture || logName ? "pipe" : "inherit",
      ],
    });
    let out = "";
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (out += d));
    if (input !== undefined) child.stdin.end(input);
    child.on("error", (error) => resolve({ code: 127, out: String(error) }));
    child.on("close", (code) => {
      if (logName) writeFileSync(join(logDir, logName), out);
      resolve({ code: code ?? 1, out });
    });
  });
}

async function step(name, fn) {
  const started = Date.now();
  log(`${name} ...`);
  try {
    await fn();
    results.push({ name, ok: true, seconds: (Date.now() - started) / 1000 });
  } catch (error) {
    results.push({ name, ok: false, seconds: (Date.now() - started) / 1000 });
    console.error(
      `\n[validate] FAILED: ${name}\n${error instanceof Error ? error.message : error}`,
    );
    throw error;
  }
}

async function must(command, commandArgs, options) {
  const { code, out } = await run(command, commandArgs, options);
  if (code !== 0)
    throw new Error(
      `${command} ${commandArgs.join(" ")} exited with ${code}${options?.logName ? ` (see .validate/${options.logName})` : ""}${options?.capture ? `\n${out}` : ""}`,
    );
  return out;
}

const psql = (sql, extra = []) =>
  run(
    "docker",
    [
      "exec",
      "-i",
      dbContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      ...extra,
    ],
    { input: sql, capture: true },
  );

async function cleanup() {
  if (cleaningUp) return;
  cleaningUp = true;
  if (keep) {
    log(
      "cleanup: --keep set, leaving local Supabase running (stop it with `pnpm supabase:local:stop`)",
    );
    return;
  }
  log("cleanup: stopping local Supabase and discarding its data");
  await run("supabase", ["stop", "--no-backup"], { capture: true });
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await cleanup();
    process.exit(130);
  });
}

// ---------------------------------------------------------------------------
let localEnv;
const users = {};

async function main() {
  await step("preflight (container runtime, Supabase CLI)", async () => {
    const docker = await run(
      "docker",
      ["info", "--format", "{{.ServerVersion}}"],
      { capture: true },
    );
    if (docker.code !== 0) {
      throw new Error(
        "A container runtime is required but the Docker daemon is not reachable.\n" +
          "Start Docker Desktop (or Colima/OrbStack) and run `pnpm validate` again.\n" +
          "Tests are NOT skipped when the runtime is missing.",
      );
    }
    const cli = await run("supabase", ["--version"], { capture: true });
    if (cli.code !== 0)
      throw new Error(
        "The Supabase CLI is required (https://supabase.com/docs/guides/cli).",
      );
  });

  await step("typecheck", () => must("pnpm", ["typecheck"]));
  await step("lint", () => must("pnpm", ["lint"]));
  await step(
    "database access boundary (src/lib/db only, no wildcard selects)",
    () => must("pnpm", ["check:db-boundary"]),
  );
  await step("format check", () => must("pnpm", ["format:check"]));
  await step("unit tests (fixture adapter, no database)", () =>
    must("pnpm", ["test"]),
  );

  await step(
    "start local Supabase (always a fresh stack with the current config)",
    async () => {
      // A stack that is already running may have been started with an older
      // supabase/config.toml (e.g. different exposed schemas), so never reuse it.
      await run("supabase", ["stop", "--no-backup"], { capture: true });
      await must("supabase", ["start"], { logName: "supabase-start.log" });
    },
  );

  await step("read local connection settings", async () => {
    const out = await must("supabase", ["status", "-o", "env"], {
      capture: true,
    });
    // Only the API URL and the anon (publishable) key are used. Nothing else is read.
    const value = (key) =>
      new RegExp(`^${key}="?([^"\\n]+)"?`, "m").exec(out)?.[1];
    const url = assertLocalUrl(
      value("API_URL"),
      "Local Supabase API_URL",
    ).origin;
    const anon = value("ANON_KEY");
    if (!anon) throw new Error("Local Supabase did not report an anon key.");
    localEnv = {
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
      FOLIOONE_VALIDATE: "1",
    };
  });

  await step(
    "prove .env.local cannot redirect the run to a hosted project",
    async () => {
      // Load env files exactly as Next.js and the test helpers do, with our values
      // already in the process environment, and check what a child would really see.
      const probe = `
      const { loadEnvConfig } = require("@next/env");
      loadEnvConfig(process.cwd(), true);
      const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
      console.log(JSON.stringify({ host: u.hostname, port: u.port }));`;
      const out = await must("node", ["-e", probe], {
        env: { ...baseEnv(), ...localEnv },
        capture: true,
      });
      const seen = JSON.parse(out.trim().split("\n").pop());
      assertLocalUrl(
        `http://${seen.host}:${seen.port}`,
        "Effective NEXT_PUBLIC_SUPABASE_URL after env-file loading",
      );
      console.log(
        `effective Supabase host after loading env files: ${seen.host}:${seen.port}`,
      );
    },
  );

  await step("canonical SQL package is in sync with the approved sources", () =>
    must("node", ["scripts/schema/generate-folioone-sql.mjs", "--check"]),
  );

  await step("clean local database (supabase db reset, no seed)", async () => {
    await must("supabase", ["db", "reset", "--local", "--no-seed"], {
      logName: "supabase-reset.log",
    });
  });

  const apply = async (files) => {
    for (const file of files) {
      const { code, out } = await psql(readFileSync(join(root, file), "utf8"), [
        "-q",
      ]);
      writeFileSync(
        join(logDir, `sql-${file.split("/").slice(-2).join("-")}.log`),
        out,
      );
      if (code !== 0)
        throw new Error(
          `${file} failed on the clean local database:\n${out.slice(-1500)}`,
        );
      console.log(`applied ${file}`);
    }
  };
  const snapshot = async () => {
    const { code, out } = await psql(
      readFileSync(join(root, SNAPSHOT_SQL), "utf8"),
      ["-At"],
    );
    if (code !== 0) throw new Error(`public-snapshot.sql failed:\n${out}`);
    return out.trim();
  };

  if (publicDecoy) {
    await step(
      "mirror hosted state: install the ORIGINAL public-schema package (decoy)",
      () => apply(LEGACY_PUBLIC_PACKAGE),
    );
  }

  let publicBefore;
  await step("fingerprint schema public (before)", async () => {
    publicBefore = await snapshot();
    writeFileSync(join(logDir, "public-before.txt"), publicBefore + "\n");
    console.log(`public fingerprint: ${publicBefore.split("\n").pop()}`);
  });

  await step(
    "apply canonical schema package (folioone), verbatim",
    async () => {
      await apply(SQL_PACKAGE);
      await psql("NOTIFY pgrst, 'reload schema';");
      // Read-only catalog verification output is kept for review.
      const verify = await psql(
        readFileSync(
          join(root, "docs/sql/folioone-schema/007-verify-catalog.sql"),
          "utf8",
        ),
        ["-q"],
      );
      writeFileSync(join(logDir, "verify-catalog.local.txt"), verify.out);
      if (verify.code !== 0)
        throw new Error(
          "007-verify-catalog.sql failed locally; see .validate/verify-catalog.local.txt",
        );
    },
  );

  await step("assert the folioone catalog shape", async () => {
    const sql = `
      WITH f AS (SELECT p.* FROM pg_proc p WHERE p.pronamespace = 'folioone'::regnamespace)
      SELECT
        (SELECT count(*) FROM f) = 35,
        (SELECT count(*) FROM f WHERE prosrc LIKE '%PT409%') = 11,
        (SELECT count(*) FROM f WHERE prosrc LIKE '%40001%') = 0,
        (SELECT count(*) FROM f WHERE prosecdef) = 1,
        (SELECT count(*) FROM f WHERE prosecdef AND proname = 'billing_activate_pro') = 1,
        (SELECT count(*) FROM f WHERE prosrc ~* '\\mpublic\\.') = 0,
        (SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'folioone'::regnamespace AND c.relkind = 'r'
           AND c.relname IN ('accounts','identity_profiles','identity_entries','website_sites','website_published','articles','website_published_articles','digital_cards','digital_card_published','account_plans','pro_payments','billing_secrets','insight_events','intro_videos','personas','persona_sections','persona_profile_field_selections','persona_profile_overrides','persona_revisions','chat_cards','chat_card_public','chat_card_code_batches','chat_card_codes','chat_card_redemptions','chat_card_redeem_attempts','conversations','conversation_messages','conversation_blocks','conversation_reports')
           AND c.relrowsecurity AND c.relforcerowsecurity) = 29,
        (SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'folioone'::regnamespace AND c.relkind = 'r') = 29,
        (SELECT count(*) FROM pg_policies WHERE schemaname = 'folioone') = 85,
        (SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
           AND c.relname IN ('accounts','identity_profiles','personas','persona_sections','persona_profile_field_selections','persona_profile_overrides','persona_revisions')) = ${publicDecoy ? 7 : 0};`;
    const { code, out } = await psql(sql, ["-At", "-F", ","]);
    if (code !== 0 || out.trim().split("\n").pop() !== "t,t,t,t,t,t,t,t,t,t") {
      throw new Error(
        `Unexpected local catalog shape (folioone: 35 functions (11 + 3 website + 1 article trigger + 3 snapshot gate helpers + 3 card + 4 plan + 10 ChatCards), 11 PT409, 0 x 40001, exactly 1 SECURITY DEFINER (billing_activate_pro), no public. references, 29 forced-RLS tables (7 package + identity_entries + 2 website + 2 article + 2 card + 3 plan + insight_events + intro_videos + 10 ChatCards), 85 policies (21 + 4 + 7 + 9 + 7 + 3 + 2 + 4 + 26 ChatCards + 2 ChatCard insights); public app tables = ${publicDecoy ? 7 : 0}): ${out}`,
      );
    }
  });

  await step(
    "create dedicated local test users (Auth sign-up, anon key only)",
    async () => {
      for (const label of ["a", "b", "c", "d", "e", "f", "g", "dev"]) {
        const email = `local-${label}@folioone.test`;
        const password = `Aa1!${randomBytes(12).toString("hex")}`;
        const response = await fetch(
          `${localEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              apikey: localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ email, password }),
          },
        );
        if (!response.ok)
          throw new Error(
            `Local sign-up for ${label} failed with HTTP ${response.status}`,
          );
        users[label] = { email, password };
      }
    },
  );

  await step(
    "prove requests without a schema header cannot reach application tables",
    async () => {
      const base = localEnv.NEXT_PUBLIC_SUPABASE_URL;
      const apikey = localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const login = await fetch(`${base}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey },
        body: JSON.stringify({
          email: users.a.email,
          password: users.a.password,
        }),
      });
      const token = (await login.json()).access_token;
      if (!token) throw new Error("Could not sign in the local probe user");
      const get = async (path, profile) => {
        const response = await fetch(`${base}/rest/v1/${path}`, {
          headers: {
            apikey,
            authorization: `Bearer ${token}`,
            ...(profile ? { "accept-profile": profile } : {}),
          },
        });
        return {
          status: response.status,
          body: await response.json().catch(() => null),
        };
      };
      const inFolioone = await get("personas?select=id", "folioone");
      if (inFolioone.status !== 200)
        throw new Error(
          `folioone is not reachable through the Data API: HTTP ${inFolioone.status} ${JSON.stringify(inFolioone.body)}`,
        );
      const defaultSchema = await get("personas?select=id");
      if (publicDecoy) {
        if (defaultSchema.status === 200 && defaultSchema.body.length !== 0)
          throw new Error("Default-schema request returned decoy rows");
        console.log(
          `decoy mode: default-schema request returned HTTP ${defaultSchema.status}; folioone HTTP 200`,
        );
      } else {
        if (
          defaultSchema.status !== 404 ||
          !["PGRST205", "42P01"].includes(defaultSchema.body?.code)
        )
          throw new Error(
            `Expected the default schema to have no "personas" table (404 PGRST205 or 42P01), got ${defaultSchema.status} ${JSON.stringify(defaultSchema.body)}`,
          );
        console.log(
          "default schema has no application tables (404 relation does not exist); folioone answers HTTP 200",
        );
      }
    },
  );

  const dbEnv = (extra = {}) => ({
    ...baseEnv(),
    ...localEnv,
    FOLIOONE_PERSONA_SQL_EXECUTED: "1",
    FOLIOONE_PERSONA_004_EXECUTED: "1",
    FOLIOONE_RLS_USER_A_EMAIL: users.a.email,
    FOLIOONE_RLS_USER_A_PASSWORD: users.a.password,
    FOLIOONE_RLS_USER_B_EMAIL: users.b.email,
    FOLIOONE_RLS_USER_B_PASSWORD: users.b.password,
    // Every FOLIOONE_* key the suites read is set (blank when unused) so nothing falls back to .env.local.
    FOLIOONE_RLS_USER_C_EMAIL: "",
    FOLIOONE_RLS_USER_C_PASSWORD: "",
    FOLIOONE_PERSONA_ANCHOR_TEST: "",
    FOLIOONE_PERSONA_CONCURRENCY_TEST: "",
    ...extra,
  });
  const vitestLocal = (files, env) =>
    must(
      "pnpm",
      ["exec", "vitest", "run", "--config", "vitest.local.config.ts", ...files],
      { env },
    );

  await step(
    "DB integration: RLS isolation (real local Auth + PostgREST)",
    () => vitestLocal(["tests/hosted/rls-isolation.hosted.ts"], dbEnv()),
  );
  await step(
    "DB integration: Persona persistence, RPCs, lifecycle, versions, defaults",
    () => vitestLocal(["tests/hosted/persona-persistence.hosted.ts"], dbEnv()),
  );
  await step(
    "DB integration: articles, ownership, versions and the published article snapshot",
    () => vitestLocal(["tests/hosted/articles-snapshot.hosted.ts"], dbEnv()),
  );
  await step("DB integration: account anchor absent branch (fresh user)", () =>
    vitestLocal(
      ["tests/hosted/persona-anchor-absent.hosted.ts"],
      dbEnv({
        FOLIOONE_RLS_USER_C_EMAIL: users.c.email,
        FOLIOONE_RLS_USER_C_PASSWORD: users.c.password,
        FOLIOONE_PERSONA_ANCHOR_TEST: "1",
      }),
    ),
  );
  await step(
    "DB integration: concurrent first-time creation (fresh user)",
    () =>
      vitestLocal(
        ["tests/hosted/persona-anchor-concurrent.hosted.ts"],
        dbEnv({
          FOLIOONE_RLS_USER_C_EMAIL: users.d.email,
          FOLIOONE_RLS_USER_C_PASSWORD: users.d.password,
          FOLIOONE_PERSONA_CONCURRENCY_TEST: "1",
        }),
      ),
  );

  await step(
    "DB integration: ChatCards (PRO gate, codes, atomic redemption, conversations, RLS)",
    () =>
      vitestLocal(
        ["tests/hosted/chatcards.hosted.ts"],
        dbEnv({
          FOLIOONE_CHAT_OWNER_EMAIL: users.e.email,
          FOLIOONE_CHAT_OWNER_PASSWORD: users.e.password,
          FOLIOONE_CHAT_READER_EMAIL: users.f.email,
          FOLIOONE_CHAT_READER_PASSWORD: users.f.password,
          FOLIOONE_CHAT_OTHER_EMAIL: users.g.email,
          FOLIOONE_CHAT_OTHER_PASSWORD: users.g.password,
          // Lets the suite grant / end PRO on the LOCAL database (see tests/helpers/local-psql.ts).
          FOLIOONE_LOCAL_DB_CONTAINER: dbContainer,
        }),
      ),
  );

  const appEnv = () => ({
    ...baseEnv(),
    ...localEnv,
    PERSONA_STORAGE: "supabase",
  });
  await step("production build (local Supabase configuration)", () =>
    must("pnpm", ["build"], { env: appEnv() }),
  );

  await step(
    "prove the build contains no hosted Supabase address",
    async () => {
      const { code, out } = await run(
        "grep",
        [
          "-rIl",
          "--include=*.js",
          "--include=*.html",
          "--include=*.json",
          "-e",
          "\\.supabase\\.co",
          ".next/static",
          ".next/server",
        ],
        { capture: true },
      );
      if (code === 0)
        throw new Error(
          `The build output references a hosted Supabase address:\n${out}`,
        );
      console.log(
        'no ".supabase.co" address found in .next/static or .next/server',
      );
    },
  );

  if (withE2e) {
    await step("headless Playwright E2E against the production build", () =>
      must(
        "pnpm",
        [
          "exec",
          "playwright",
          "test",
          "--config",
          "playwright.local.config.ts",
        ],
        {
          env: {
            ...appEnv(),
            FOLIOONE_DEV_TEST_EMAIL: users.dev.email,
            FOLIOONE_DEV_TEST_PASSWORD: users.dev.password,
            E2E_USER_B_EMAIL: users.b.email,
            E2E_USER_B_PASSWORD: users.b.password,
            FOLIOONE_LOCAL_DB_CONTAINER: dbContainer,
          },
        },
      ),
    );
  } else {
    log("--no-e2e: skipping Playwright");
  }

  await step(
    "schema public is unchanged after the whole run (fingerprint + row counts)",
    async () => {
      const after = await snapshot();
      writeFileSync(join(logDir, "public-after.txt"), after + "\n");
      if (after !== publicBefore) {
        throw new Error(
          "The fingerprint of schema public CHANGED during validation. See .validate/public-before.txt and public-after.txt.",
        );
      }
      const written = after
        .split("\n")
        .filter((l) => l.startsWith("rowcount|") && l.split("|")[2] !== "0");
      if (written.length)
        throw new Error(
          `Rows exist in schema public tables:\n${written.join("\n")}`,
        );
      console.log(
        `public fingerprint identical: ${after.split("\n").pop()}; all public tables have 0 rows`,
      );
    },
  );
}

let failed = false;
try {
  await main();
} catch {
  failed = true;
} finally {
  await cleanup();
}

console.log("\n[validate] summary");
for (const r of results)
  console.log(
    `  ${r.ok ? "PASS" : "FAIL"}  ${r.name}  (${r.seconds.toFixed(1)}s)`,
  );
console.log(
  failed ? "\n[validate] FAILED\n" : "\n[validate] ALL STEPS PASSED\n",
);
process.exit(failed ? 1 : 0);
