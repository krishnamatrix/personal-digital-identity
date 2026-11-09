#!/usr/bin/env node
// Deterministic generator for docs/sql/folioone-schema/*.
//
// Reads the APPROVED sources and applies a fixed, ordered set of syntax-aware
// rules. It is not a global find-and-replace:
//   * each rule matches one syntactic shape (schema qualifier, schema-name string
//     literal, the phrase "schema public", one escaped qualifier inside a regex);
//   * every rule has a PINNED expected replacement count per file, so a change in
//     an approved source makes the generator fail until a human re-reviews it;
//   * the PUBLIC role keyword is never touched (rules are case-sensitive);
//   * after the rules, any remaining lowercase `public` fails the run unless the
//     line is on the reviewed allow-list below.
//
//   node scripts/schema/generate-folioone-sql.mjs           write the files
//   node scripts/schema/generate-folioone-sql.mjs --check   fail if files differ
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA = "folioone";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = "docs/sql/folioone-schema";

const RULES = [
  { id: "qualifier", re: /\bpublic\.(?=[A-Za-z_])/g, to: `${SCHEMA}.` },
  {
    id: "escaped-qualifier",
    re: /\bpublic\\\.(?=[A-Za-z_])/g,
    to: `${SCHEMA}\\.`,
  },
  { id: "schema-literal", re: /'public'/g, to: `'${SCHEMA}'` },
  { id: "schema-phrase", re: /\bschema public\b/g, to: `schema ${SCHEMA}` },
];

// Exact comment lines (after the rules) that mention the word `public` in prose,
// rewritten one by one. Each must occur exactly once in its file.
const LINE_REWRITES = {
  "docs/sql/milestone-2/001-identity-tables.sql": [
    [
      "-- REFERENCES on auth.users, and CREATE on public; both application tables are",
      `-- REFERENCES on auth.users, and CREATE on ${SCHEMA}; both application tables are`,
    ],
  ],
  "docs/sql/milestone-2/002-identity-rls.sql": [
    [
      "-- public and auth and EXECUTE on auth.uid(); no policies already exist on the",
      `-- ${SCHEMA} and auth and EXECUTE on auth.uid(); no policies already exist on the`,
    ],
    [
      "-- access to new public tables. Remove every non-owner ACL entry except the",
      `-- access to new tables. Remove every non-owner ACL entry except the`,
    ],
  ],
  "docs/sql/milestone-3c/verify-catalog.sql": [
    [
      "--    6c. Default privileges that would apply to FUTURE objects in public.",
      `--    6c. Default privileges that would apply to FUTURE objects in ${SCHEMA} (and global ones).`,
    ],
  ],
  "docs/sql/milestone-3c/001-persona-schema-secured.sql": [
    [
      "-- Supabase default privileges grant new public tables to API roles. Remove every",
      `-- Supabase default privileges can grant new tables to API roles. Remove every`,
    ],
  ],
};

/** Lowercase `public` left after the rules must be on this reviewed list (prose that is correct as is). */
const ALLOWED_LEFTOVER = [];

const SOURCES = {
  "002-identity-tables.sql": {
    src: "docs/sql/milestone-2/001-identity-tables.sql",
    title: "Identity tables: accounts and identity_profiles",
    prerequisites:
      "001-create-schema.sql executed. Supabase Auth present (auth.users).",
    kind: "ONE-TIME. Preflight refuses a second run or a pre-existing target; single transaction.",
    expected:
      "COMMIT. Tables folioone.accounts and folioone.identity_profiles with their constraints; asserted by the file.",
    counts: {
      qualifier: 13,
      "escaped-qualifier": 0,
      "schema-literal": 2,
      "schema-phrase": 0,
    },
  },
  "003-identity-rls.sql": {
    src: "docs/sql/milestone-2/002-identity-rls.sql",
    title: "Identity RLS, policies and grants",
    prerequisites: "002-identity-tables.sql executed.",
    kind: "ONE-TIME. Preflight refuses a second run; single transaction.",
    expected:
      "COMMIT. RLS enabled AND forced on both tables; 5 owner-only policies; privileges to authenticated only; no PUBLIC/anon/service_role privileges.",
    counts: {
      qualifier: 24,
      "escaped-qualifier": 0,
      "schema-literal": 6,
      "schema-phrase": 0,
    },
  },
  "004-persona-tables.sql": {
    src: "docs/sql/milestone-3c/001-persona-schema-secured.sql",
    title: "Persona tables (created locked down)",
    prerequisites: "003-identity-rls.sql executed (folioone.accounts exists).",
    kind: "ONE-TIME. Preflight refuses a second run; single transaction.",
    expected:
      "COMMIT. Five Persona tables with all constraints and indexes, RLS enabled and forced, every privilege revoked until 005.",
    counts: {
      qualifier: 41,
      "escaped-qualifier": 0,
      "schema-literal": 6,
      "schema-phrase": 4,
    },
  },
  "005-persona-rls-and-grants.sql": {
    src: "docs/sql/milestone-3c/002-persona-gate-policies-grants.sql",
    title: "Persona write-context helper, policies and column-level grants",
    prerequisites: "004-persona-tables.sql executed.",
    kind: "ONE-TIME. Preflight refuses a second run; single transaction.",
    expected:
      "COMMIT. folioone.persona_write_rpc_context(); 16 policies; column-level INSERT/UPDATE and the approved DELETE grants to authenticated only.",
    counts: {
      qualifier: 54,
      "escaped-qualifier": 0,
      "schema-literal": 10,
      "schema-phrase": 0,
    },
  },
  "006-persona-functions.sql": {
    src: "docs/sql/milestone-3c/003-persona-mutation-rpcs.sql",
    title:
      "Persona mutation RPCs and read-only detail helper (final PT409 definitions)",
    prerequisites: "005-persona-rls-and-grants.sql executed.",
    kind: "ONE-TIME. Preflight refuses a second run; single transaction.",
    expected:
      "COMMIT. Nine SECURITY INVOKER mutation RPCs, folioone.persona_detail_json(uuid); EXECUTE for authenticated only; a stale version raises SQLSTATE PT409.",
    counts: {
      qualifier: 134,
      "escaped-qualifier": 1,
      "schema-literal": 8,
      "schema-phrase": 1,
      "pt409-errcode": 7,
      "pt409-comment": 11,
    },
    pt409: true,
  },
  "007-verify-catalog.sql": {
    src: "docs/sql/milestone-3c/verify-catalog.sql",
    title: "Read-only catalog verification",
    prerequisites: "006-persona-functions.sql executed.",
    kind: "READ-ONLY, repeatable. Every statement is a SELECT.",
    expected:
      "See the Expected: comment above each numbered section. Catalog evidence only; the postgres role bypasses RLS, so it shows no runtime isolation.",
    counts: {
      qualifier: 20,
      "escaped-qualifier": 1,
      "schema-literal": 13,
      "schema-phrase": 0,
    },
    append: "scripts/schema/templates/verify-addendum.sql",
  },
};

function applyRules(file, text) {
  const seen = {};
  let out = text;
  for (const rule of RULES) {
    let n = 0;
    out = out.replace(rule.re, () => {
      n += 1;
      return rule.to;
    });
    seen[rule.id] = n;
  }
  for (const [from, to] of LINE_REWRITES[file] ?? []) {
    const hits = out.split("\n").filter((l) => l === from).length;
    if (hits !== 1)
      throw new Error(
        `${file}: line rewrite expected exactly once, found ${hits}: ${from}`,
      );
    out = out.replace(from, to);
  }
  return { out, seen };
}

function applyPt409(text) {
  let errcode = 0;
  let comment = 0;
  let out = text.replace(/ERRCODE = '40001'/g, () => {
    errcode += 1;
    return "ERRCODE = 'PT409'";
  });
  out = out
    .split("\n")
    .map((line) =>
      /^\s*--/.test(line) && line.includes("40001")
        ? ((comment += 1), line.replaceAll("40001", "PT409"))
        : line,
    )
    .join("\n");
  if (/40001/.test(out)) throw new Error("40001 remains after the PT409 rules");
  return { out, seen: { "pt409-errcode": errcode, "pt409-comment": comment } };
}

/** Applies only the schema rules (no PT409, no header) to a source text; used by tests. */
export function retarget(file, text) {
  return applyRules(file, text).out;
}

function checkLeftovers(file, text) {
  const bad = [];
  text.split("\n").forEach((line, i) => {
    if (/\bpublic\b/.test(line) && !ALLOWED_LEFTOVER.includes(line.trim()))
      bad.push(`  L${i + 1}: ${line.trim()}`);
  });
  if (bad.length)
    throw new Error(
      `${file}: unclassified lowercase "public" remains:\n${bad.join("\n")}`,
    );
}

const header = (
  name,
  meta,
  source,
) => `-- ============================================================================
-- Folioone canonical schema package  |  ${name}  |  schema: ${SCHEMA}
-- ${meta.title}
--
-- GENERATED by scripts/schema/generate-folioone-sql.mjs from ${source}
-- (pnpm schema:generate). Do not edit by hand: change the approved source or the
-- generator and regenerate. Tests fail if this file drifts.
--
-- Environment:   any Supabase project. The schema is "${SCHEMA}" everywhere; the
--                project (URL + keys) selects the environment.
-- Prerequisites: ${meta.prerequisites}
-- Repeatable?:   ${meta.kind}
-- Expected:      ${meta.expected}
-- Safety:        Does not modify or read rows of schema public, does not touch
--                auth.users data, creates no roles, no SECURITY DEFINER.
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project.
-- The text below is the approved source with the schema retargeted by the
-- generator rules; its original header is kept for its design notes.
-- ============================================================================

`;

export function generate({ verbose = false } = {}) {
  const out = new Map();
  for (const [name, meta] of Object.entries(SOURCES)) {
    let text = readFileSync(join(root, meta.src), "utf8");
    const seen = {};
    if (meta.pt409) {
      const r = applyPt409(text);
      text = r.out;
      Object.assign(seen, r.seen);
    }
    const r = applyRules(meta.src, text);
    text = r.out;
    Object.assign(seen, r.seen);
    const mismatches = Object.entries(meta.counts).filter(
      ([rule, expected]) => seen[rule] !== expected,
    );
    if (process.env.GEN_REPORT === "1") console.log(name, JSON.stringify(seen));
    else if (mismatches.length)
      throw new Error(
        `${name}: ${mismatches.map(([rule, expected]) => `rule "${rule}" replaced ${seen[rule]}, pinned ${expected}`).join("; ")}. Review the source change, then update the pinned count.`,
      );
    checkLeftovers(meta.src, text);
    if (meta.append) text += readFileSync(join(root, meta.append), "utf8");
    if (verbose) console.log(name, JSON.stringify(seen));
    out.set(`${OUT_DIR}/${name}`, header(name, meta, meta.src) + text);
  }

  const create = readFileSync(
    join(root, "scripts/schema/templates/001-create-schema.sql"),
    "utf8",
  );
  out.set(
    `${OUT_DIR}/001-create-schema.sql`,
    header(
      "001-create-schema.sql",
      {
        title: "Create the canonical schema",
        prerequisites:
          "A Supabase project (Auth, roles anon/authenticated/service_role). Run public-snapshot.sql first and save its output.",
        kind: "ONE-TIME. Refuses to run if the schema already exists; single transaction.",
        expected:
          "COMMIT. Schema folioone owned by postgres; USAGE granted to authenticated only.",
      },
      "scripts/schema/templates/001-create-schema.sql",
    ) + create,
  );

  const snapshot = readFileSync(
    join(root, "scripts/schema/templates/public-snapshot.sql"),
    "utf8",
  );
  out.set(
    `${OUT_DIR}/public-snapshot.sql`,
    header(
      "public-snapshot.sql",
      {
        title: "Fingerprint of schema public (non-interference evidence)",
        prerequisites: "None.",
        kind: "READ-ONLY, repeatable.",
        expected:
          "A result set to save before 001 and compare after 006: identical rows, identical TOTAL.",
      },
      "scripts/schema/templates/public-snapshot.sql",
    ) + snapshot,
  );

  const rollbackSource = "docs/sql/milestone-3c/rollback.sql";
  const rb = applyRules(
    rollbackSource,
    readFileSync(join(root, rollbackSource), "utf8"),
  );
  const rbCounts = { qualifier: 22 };
  if (rb.seen.qualifier !== rbCounts.qualifier)
    throw new Error(
      `rollback.sql: qualifier count ${rb.seen.qualifier}, expected ${rbCounts.qualifier}`,
    );
  checkLeftovers(rollbackSource, rb.out);
  out.set(
    `${OUT_DIR}/rollback.sql`,
    `-- ============================================================================
-- Folioone canonical schema package  |  rollback.sql  |  schema: ${SCHEMA}
-- ROLLBACK GUIDANCE ONLY. Every statement is commented out; nothing runs by
-- default. All of it is DESTRUCTIVE and needs explicit developer approval.
--
-- Because folioone is a self-contained new schema, the cleanest full rollback
-- drops that schema alone. It cannot affect schema public or any Auth user.
-- Set PERSONA_STORAGE back to "fixture" (or point the app away) first.
--
-- FULL ROLLBACK (destroys ALL Folioone data stored in schema folioone):
--   BEGIN;
--   DROP SCHEMA ${SCHEMA} CASCADE;
--   COMMIT;
-- Afterwards remove "${SCHEMA}" from Dashboard > Project Settings > Data API >
-- Exposed schemas. Run public-snapshot.sql: it must still equal the saved output.
--
-- Partial recovery options follow (the original Persona guidance, retargeted).
-- File numbers inside it refer to the ORIGINAL milestone files; in this package
-- they are 004-persona-tables (original 001), 005-persona-rls-and-grants
-- (original 002) and 006-persona-functions (original 003).
-- ============================================================================

` + rb.out,
  );

  out.set(
    `${OUT_DIR}/README.md`,
    readFileSync(join(root, "scripts/schema/templates/README.md"), "utf8"),
  );
  return out;
}

const invoked =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const check = process.argv.includes("--check");
  let files;
  try {
    files = generate({ verbose: !check });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  let drift = 0;
  for (const [path, content] of files) {
    const target = join(root, path);
    if (check) {
      if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
        console.error(`DRIFT: ${path}`);
        drift += 1;
      }
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }
  if (check) process.exit(drift ? 1 : 0);
  console.log(`wrote ${files.size} files to ${OUT_DIR}`);
}
