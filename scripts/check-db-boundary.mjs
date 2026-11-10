#!/usr/bin/env node
/**
 * Database-boundary check. Part of `pnpm validate` (and `pnpm check:db-boundary`).
 *
 * Folioone rule: every Supabase database operation lives in src/lib/db/**. This script fails,
 * naming file and line, when production code (src/**) breaks the boundary:
 *
 *   db-from      `.from(...)` outside src/lib/db/
 *   db-rpc       `.rpc(...)` outside src/lib/db/
 *   wildcard     `.select()` / `.select("*")` / a select-column constant containing `*`
 *   client-init  createServerClient / createBrowserClient / a runtime @supabase/supabase-js
 *                import outside the approved client modules
 *   client-import  a "use client" module importing the database layer or the server Supabase client
 *
 * The one allowed import from a client component is src/lib/db/schema.ts (the schema NAME, not
 * a query); it is deliberately not server-only.
 *
 * Comments are blanked before scanning, so prose cannot trigger a rule. Tests (tests/, e2e/) are
 * not scanned: they may build clients for isolated setup and teardown.
 *
 * EXEMPTIONS: none. If one is ever unavoidable, add it to EXEMPT below with the rule, the file
 * and a written reason, and mention it in docs/architecture/database-access-layer.md.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const DB_LAYER = "src/lib/db/";
/** Only these files may construct a Supabase client (database access goes through db/client.ts). */
export const APPROVED_CLIENT_MODULES = [
  "src/lib/supabase/server.ts", // cookie-backed server client (auth + the base of db/client.ts)
  "src/lib/supabase/client.ts", // browser client (auth only; no database queries)
  "src/lib/db/client.ts",
  "src/middleware.ts", // session refresh only; contains no queries
];
/** @type {{ rule: string, file: string, reason: string }[]} */
export const EXEMPT = [];

const BUILTIN_FROM = new Set([
  "Array",
  "Buffer",
  "Object",
  "Set",
  "Map",
  "Uint8Array",
  "Uint16Array",
  "Uint32Array",
  "Int8Array",
  "Int16Array",
  "Int32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
]);

/** Blanks comments (keeping line numbers and columns) so they never match a rule. */
export function stripComments(text) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(
      /(^|[^:\\])(\/\/.*$)/gm,
      (_, pre, rest) => pre + " ".repeat(rest.length),
    );
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/**
 * @param {{ path: string, text: string }[]} files  paths relative to the repo root, "/" separated
 * @returns {{ file: string, line: number, rule: string, message: string }[]}
 */
export function scanSources(files) {
  const out = [];
  const add = (file, text, index, rule, message) => {
    if (EXEMPT.some((e) => e.rule === rule && e.file === file)) return;
    out.push({ file, line: lineOf(text, index), rule, message });
  };

  for (const { path, text: raw } of files) {
    if (!/\.(ts|tsx|mts|mjs|js|jsx)$/.test(path)) continue;
    const text = stripComments(raw);
    const inDb = path.startsWith(DB_LAYER);

    if (!inDb) {
      for (const m of text.matchAll(/([A-Za-z_$][\w$]*)?\s*\.\s*from\s*\(/g)) {
        if (m[1] && BUILTIN_FROM.has(m[1])) continue;
        add(
          path,
          text,
          m.index + m[0].indexOf("from"),
          "db-from",
          "Supabase `.from()` outside src/lib/db/. Move this query into a src/lib/db/queries/* module.",
        );
      }
      for (const m of text.matchAll(/\.\s*rpc\s*\(/g)) {
        add(
          path,
          text,
          m.index,
          "db-rpc",
          "Supabase `.rpc()` outside src/lib/db/. Move this call into a src/lib/db/queries/* module.",
        );
      }
    }

    for (const m of text.matchAll(/\.\s*select\s*\(\s*\)/g)) {
      add(
        path,
        text,
        m.index,
        "wildcard",
        "`.select()` with no columns returns every column. List the columns explicitly.",
      );
    }
    for (const m of text.matchAll(/\.\s*select\s*\(\s*(["'`])([^"'`]*)\1/g)) {
      if (m[2].includes("*"))
        add(
          path,
          text,
          m.index,
          "wildcard",
          "Wildcard column selection. List the columns explicitly.",
        );
    }
    for (const m of text.matchAll(
      /\.\s*select\s*\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g,
    )) {
      const decl = new RegExp(
        `(?:const|let|var)\\s+${m[1]}\\s*(?::[^=]+)?=([^;]*);`,
      ).exec(text);
      if (decl && /(["'`])[^"'`]*\*[^"'`]*\1/.test(decl[1])) {
        add(
          path,
          text,
          m.index,
          "wildcard",
          `Column list \`${m[1]}\` contains a wildcard. List the columns explicitly.`,
        );
      }
    }

    if (!APPROVED_CLIENT_MODULES.includes(path)) {
      for (const m of text.matchAll(
        /\b(createServerClient|createBrowserClient)\s*\(/g,
      )) {
        add(
          path,
          text,
          m.index,
          "client-init",
          `\`${m[1]}\` outside the approved client modules (${APPROVED_CLIENT_MODULES.join(", ")}).`,
        );
      }
      for (const m of text.matchAll(
        /import\s+(?!type\b)[^;]*?from\s+["']@supabase\/supabase-js["']/g,
      )) {
        add(
          path,
          text,
          m.index,
          "client-init",
          "Runtime import of @supabase/supabase-js outside the approved client modules (type-only imports are fine).",
        );
      }
    }

    if (
      /^\s*(["'])use client\1/.test(
        text.replace(/^\s*(\/\/.*\n|\/\*[\s\S]*?\*\/\s*)*/, ""),
      )
    ) {
      for (const m of text.matchAll(/from\s+["']([^"']*)["']/g)) {
        if (
          /(^|\/)lib\/db(?!\/schema(\.ts)?$)(\/|$)|lib\/supabase\/server|^server-only$/.test(
            m[1],
          )
        ) {
          add(
            path,
            text,
            m.index,
            "client-import",
            `Client component imports server-only module "${m[1]}". Fetch data in a Server Component or Server Action instead.`,
          );
        }
      }
    }
  }
  return out;
}

export function collectSources(root, dir = "src") {
  const abs = join(root, dir);
  return readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = join(dir, e.name);
    if (e.isDirectory())
      return e.name === "node_modules" ? [] : collectSources(root, rel);
    return /\.(ts|tsx|mts|mjs|js|jsx)$/.test(e.name)
      ? [
          {
            path: rel.split(sep).join("/"),
            text: readFileSync(join(root, rel), "utf8"),
          },
        ]
      : [];
  });
}

export function formatViolation(v) {
  return `  ${v.file}:${v.line}  [${v.rule}] ${v.message}`;
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = process.cwd();
  const files = collectSources(root);
  const violations = scanSources(files);
  if (violations.length > 0) {
    console.error(
      `Database boundary violated (${violations.length}):\n${violations.map(formatViolation).join("\n")}`,
    );
    console.error(
      "\nAll Supabase database access must live in src/lib/db/ (see docs/architecture/database-access-layer.md).",
    );
    process.exit(1);
  }
  console.log(
    `database boundary OK: ${files.length} source files scanned, no violations.`,
  );
}
