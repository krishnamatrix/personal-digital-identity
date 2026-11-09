/**
 * Milestone 3A request-path gate diagnostic (HOSTED, opt-in, NOT run by default).
 *
 * Prerequisite: the developer manually executed
 * docs/sql/milestone-3a/diagnostics/diag-001-setup.sql in Supabase SQL Editor.
 * Run with: pnpm exec vitest run --config vitest.persona-gate-diagnostic.config.ts
 * See docs/sql/milestone-3a/diagnostics/README.md. Uses only the public anon key
 * and User A's credentials; never a service-role key or a database connection.
 * Output contains observed request.method/path values and pass/fail only; no
 * tokens, keys, passwords or header values are printed.
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ORIGINAL_ENVIRONMENT = { ...process.env };
(process.env as Record<string, string | undefined>).NODE_ENV = "development";
loadEnvConfig(process.cwd(), true);
const ALLOWED_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "FOLIOONE_RLS_USER_A_EMAIL",
  "FOLIOONE_RLS_USER_A_PASSWORD",
] as const;
const loaded = Object.fromEntries(ALLOWED_KEYS.map((k) => [k, process.env[k]]));
for (const key of Object.keys(process.env)) {
  if (!Object.prototype.hasOwnProperty.call(ORIGINAL_ENVIRONMENT, key)) {
    delete process.env[key];
  }
}
Object.assign(process.env, ORIGINAL_ENVIRONMENT);
for (const key of ALLOWED_KEYS) {
  if (!ORIGINAL_ENVIRONMENT[key] && loaded[key]) process.env[key] = loaded[key];
}

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.FOLIOONE_RLS_USER_A_EMAIL;
const password = process.env.FOLIOONE_RLS_USER_A_PASSWORD;
const configured = Boolean(projectUrl && anonKey && email && password);

const RPC_NAMES = [
  "persona_create",
  "persona_update_metadata",
  "persona_update_profile_field",
  "persona_upsert_section",
  "persona_delete_section",
  "persona_reorder_sections",
  "persona_set_default",
  "persona_set_lifecycle",
  "persona_duplicate",
  "persona_delete",
] as const;
const PREFIX = "zz_diag_m3a_";

type Reply = { status: number; body: unknown; text: string };
type Json = Record<string, unknown>;
const report: Array<{ check: string; observed: string }> = [];
const note = (check: string, observed: string) =>
  report.push({ check, observed });

let token = "";
let userId = "";

async function call(
  method: string,
  path: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    jwt?: string | null;
  } = {},
): Promise<Reply> {
  const headers: Record<string, string> = {
    apikey: anonKey as string,
    "Content-Type": "application/json",
    ...options.headers,
  };
  const jwt = options.jwt === undefined ? token : options.jwt;
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const response = await fetch(`${projectUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body, text };
}

const rpc = (name: string, args: Json = {}, extra = {}) =>
  call("POST", `/rest/v1/rpc/${name}`, { body: args, ...extra });
const events = async () => {
  const reply = await call(
    "GET",
    "/rest/v1/zz_diag_m3a_events?select=*&order=created_at",
  );
  expect(reply.status).toBe(200);
  return reply.body as Json[];
};
const messageOf = (reply: Reply) =>
  String((reply.body as Json | null)?.message ?? reply.text);

describe.skipIf(!configured)(
  "Persona request-path gate diagnostic (hosted)",
  () => {
    beforeAll(async () => {
      const client = createClient(projectUrl as string, anonKey as string, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.signInWithPassword({
        email: email as string,
        password: password as string,
      });
      if (error || !data.session) throw new Error("User A sign-in failed");
      token = data.session.access_token;
      userId = data.user.id;
      const setup = await rpc("zz_diag_m3a_probe");
      if (setup.status !== 200) {
        throw new Error(
          `Diagnostic objects missing or not callable (status ${setup.status}); run diag-001-setup.sql first.`,
        );
      }
    });

    afterAll(() => {
      console.log("PERSONA_GATE_DIAGNOSTIC_REPORT");
      console.table(report);
    });

    it("D1/D2: observed method and path for a normal direct table write (POST, PATCH, DELETE)", async () => {
      const attempts: Array<[string, string, unknown]> = [
        ["POST", "/rest/v1/zz_diag_m3a_direct", { note: "x" }],
        ["PATCH", "/rest/v1/zz_diag_m3a_direct?note=eq.x", { note: "y" }],
        ["DELETE", "/rest/v1/zz_diag_m3a_direct?note=eq.x", undefined],
      ];
      for (const [method, path, body] of attempts) {
        const reply = await call(method, path, { body });
        const message = messageOf(reply);
        note(`direct ${method}`, message);
        expect(message).toMatch(
          /zz_diag_observed method=\S+ path=\S+ op=\w+ gate=\w+/,
        );
        expect(message).toContain(`method=${method}`);
        expect(message).toMatch(/gate=(f|false)\b/);
      }
      const count = await call("GET", "/rest/v1/zz_diag_m3a_direct?select=id");
      expect(count.body).toEqual([]);
    });

    it("D3: observed values inside a plain RPC probe (GET and POST)", async () => {
      const viaGet = await call("GET", "/rest/v1/rpc/zz_diag_m3a_probe");
      const viaPost = await rpc("zz_diag_m3a_probe");
      expect(viaGet.status).toBe(200);
      expect(viaPost.status).toBe(200);
      const get = viaGet.body as Json;
      const post = viaPost.body as Json;
      note(
        "probe GET",
        `method=${get.method} path=${get.path} gate=${get.gate}`,
      );
      note(
        "probe POST",
        `method=${post.method} path=${post.path} gate=${post.gate}`,
      );
      note("probe header names", JSON.stringify(post.header_names));
      expect(get.method).toBe("GET");
      expect(post.method).toBe("POST");
      expect(post.path).toBe("/rpc/zz_diag_m3a_probe");
      expect(post.gate).toBe(false); // probe path is not on the allowlist
      expect(post.uid_present).toBe(true);
    });

    it("D4/D8: each intended mutation RPC succeeds with the same JWT and reports the exact allowlisted path", async () => {
      for (const name of RPC_NAMES) {
        const reply = await rpc(`${PREFIX}${name}`);
        const body = reply.body as Json;
        note(
          `rpc ${name}`,
          `status=${reply.status} method=${body?.method} path=${body?.path} gate=${body?.gate}`,
        );
        expect(reply.status).toBe(200);
        expect(body.method).toBe("POST");
        expect(body.path).toBe(`/rpc/${PREFIX}${name}`);
        expect(body.gate).toBe(true);
      }
      const rows = await events();
      expect(rows.length).toBeGreaterThanOrEqual(RPC_NAMES.length);
      expect(rows.every((row) => row.account_id === userId)).toBe(true);
    });

    it("D7: direct writes to the gated table are rejected with the same JWT; data is unchanged", async () => {
      const before = await events();
      const target = before[0] as Json;
      const insert = await call("POST", "/rest/v1/zz_diag_m3a_events", {
        body: { account_id: userId, label: "direct-insert" },
        headers: { Prefer: "return=representation" },
      });
      note(
        "direct insert gated table",
        `status=${insert.status} ${messageOf(insert)}`,
      );
      expect(insert.status).toBeGreaterThanOrEqual(400);

      const patch = await call(
        "PATCH",
        `/rest/v1/zz_diag_m3a_events?id=eq.${target.id}`,
        {
          body: { label: "tampered" },
          headers: { Prefer: "return=representation" },
        },
      );
      note(
        "direct patch gated table",
        `status=${patch.status} rows=${Array.isArray(patch.body) ? patch.body.length : "n/a"}`,
      );
      expect(
        patch.status >= 400 ||
          (Array.isArray(patch.body) && patch.body.length === 0),
      ).toBe(true);

      const del = await call(
        "DELETE",
        `/rest/v1/zz_diag_m3a_events?id=eq.${target.id}`,
        {
          headers: { Prefer: "return=representation" },
        },
      );
      note(
        "direct delete gated table",
        `status=${del.status} rows=${Array.isArray(del.body) ? del.body.length : "n/a"}`,
      );
      expect(
        del.status >= 400 || (Array.isArray(del.body) && del.body.length === 0),
      ).toBe(true);

      const after = await events();
      expect(after).toEqual(before);
      expect(
        after.some(
          (row) => row.label === "direct-insert" || row.label === "tampered",
        ),
      ).toBe(false);
    });

    it("D5: values are per-request and transaction-scoped; no state leaks between requests", async () => {
      const seen: Array<{ marker: unknown; xid: unknown; pid: unknown }> = [];
      for (let index = 0; index < 20; index += 1) {
        const reply = await rpc("zz_diag_m3a_scope_probe");
        const body = reply.body as Json;
        seen.push({
          marker: body.marker_found_at_start,
          xid: body.xid,
          pid: body.backend_pid,
        });
        expect(String(body.path)).toBe("/rpc/zz_diag_m3a_scope_probe");
        expect(body.method).toBe("POST");
      }
      const leaked = seen.filter(
        (entry) => entry.marker !== null && entry.marker !== "",
      );
      const pids = new Set(seen.map((entry) => entry.pid));
      const xids = new Set(seen.map((entry) => entry.xid));
      note(
        "scope probe x20",
        `marker leaks=${leaked.length} distinctPids=${pids.size} distinctXids=${xids.size}`,
      );
      expect(leaked).toEqual([]);
      expect(xids.size).toBe(seen.length);

      // Interleave allowed RPC writes with rejected direct writes; with pooled
      // connections the same backend serves both kinds, so any stale allowed
      // path would let a direct write through.
      const before = (await events()).length;
      let direct = 0;
      for (let index = 0; index < 20; index += 1) {
        await rpc(`${PREFIX}persona_create`);
        const insert = await call("POST", "/rest/v1/zz_diag_m3a_events", {
          body: { account_id: userId, label: `interleaved-${index}` },
        });
        if (insert.status < 400) direct += 1;
      }
      const after = await events();
      note(
        "interleaved rpc/direct x20",
        `directAccepted=${direct} rpcRowsAdded=${after.length - before}`,
      );
      expect(direct).toBe(0);
      expect(after.length - before).toBe(20);
    });

    it("D6: client-controllable inputs cannot change request.method/request.path or open the gate", async () => {
      const spoofHeaders: Array<Record<string, string>> = [
        {
          "request.path": `/rpc/${PREFIX}persona_create`,
          "request.method": "POST",
        },
        { "X-Request-Path": `/rpc/${PREFIX}persona_create` },
        { "X-Original-URI": `/rest/v1/rpc/${PREFIX}persona_create` },
        { "X-Forwarded-Path": `/rpc/${PREFIX}persona_create` },
        { "X-Forwarded-Method": "POST" },
        { "X-HTTP-Method-Override": "POST" },
        { "X-Method-Override": "POST" },
        { Prefer: "params=single-object" },
        { Prefer: "tx=commit" },
        { "Content-Profile": "public", "Accept-Profile": "public" },
      ];
      const before = (await events()).length;
      for (const headers of spoofHeaders) {
        const label = Object.keys(headers).join("+");
        const probe = await call("GET", "/rest/v1/rpc/zz_diag_m3a_probe", {
          headers,
        });
        const insert = await call("POST", "/rest/v1/zz_diag_m3a_events", {
          body: { account_id: userId, label: `spoof-${label}` },
          headers,
        });
        const body = probe.body as Json;
        note(
          `spoof header ${label}`,
          `probe path=${body?.path} method=${body?.method} directInsertStatus=${insert.status}`,
        );
        if (probe.status === 200) {
          expect(body.path).toBe("/rpc/zz_diag_m3a_probe");
          expect(body.method).toBe("GET");
        }
        expect(insert.status).toBeGreaterThanOrEqual(400);
      }

      const spoofQueries = [
        `?request.path=/rpc/${PREFIX}persona_create&request.method=POST`,
        `?request_path=/rpc/${PREFIX}persona_create`,
        "?_method=POST",
        `?path=/rpc/${PREFIX}persona_create`,
      ];
      for (const query of spoofQueries) {
        const insert = await call(
          "POST",
          `/rest/v1/zz_diag_m3a_events${query}`,
          {
            body: { account_id: userId, label: "spoof-query" },
          },
        );
        note(
          `spoof query ${query.slice(0, 40)}`,
          `directInsertStatus=${insert.status}`,
        );
        expect(insert.status).toBeGreaterThanOrEqual(400);
      }

      // Path-shape variants of the RPC URL: record what PostgREST reports. A
      // variant that reaches the function but reports a non-allowlisted path is
      // fine (gate false -> write rejected); one that reports the allowlisted
      // path with a different effective target would be a blocker.
      const variants = [
        `/rest/v1/rpc/${PREFIX}persona_create/`,
        `/rest/v1//rpc/${PREFIX}persona_create`,
        `/rest/v1/rpc/${PREFIX}PERSONA_CREATE`,
        `/rest/v1/rpc/${PREFIX}persona_create?select=*`,
      ];
      for (const path of variants) {
        const reply = await call("POST", path, { body: {} });
        const body = reply.body as Json | null;
        note(
          `path variant ${path.replace("/rest/v1", "")}`,
          `status=${reply.status} path=${body?.path ?? "n/a"} gate=${body?.gate ?? "n/a"}`,
        );
        if (reply.status === 200 && body) {
          // Only the exact canonical path may open the gate.
          expect(body.gate === true).toBe(
            body.path === `/rpc/${PREFIX}persona_create`,
          );
        }
      }

      const after = await events();
      const accepted = after.filter((row) =>
        /^(spoof-|interleaved-|direct-)/.test(String(row.label)),
      );
      expect(accepted).toEqual([]);
      note(
        "rows from spoof attempts",
        `${accepted.length} (before=${before}, after=${after.length})`,
      );
    });

    it("D6b: GraphQL endpoint cannot write to the gated table", async () => {
      const typeProbe = await call("POST", "/graphql/v1", {
        body: { query: '{ __type(name: "ZzDiagM3aEvents") { name } }' },
      });
      const typeExists = Boolean(
        ((typeProbe.body as Json | null)?.data as Json | undefined)?.__type,
      );
      const mutation = await call("POST", "/graphql/v1", {
        body: {
          query: `mutation { insertIntoZzDiagM3aEventsCollection(objects: [{accountId: "${userId}", label: "spoof-graphql"}]) { affectedCount } }`,
        },
      });
      note(
        "graphql",
        `typeVisible=${typeExists} mutationStatus=${mutation.status} ${typeExists ? "" : "(inconclusive: type not exposed)"}`,
      );
      const rows = (await events()).filter(
        (row) => row.label === "spoof-graphql",
      );
      expect(rows).toEqual([]);
    });

    it("D9: anonymous requests cannot call diagnostic functions or touch the tables", async () => {
      const probe = await call("POST", "/rest/v1/rpc/zz_diag_m3a_probe", {
        jwt: null,
        body: {},
      });
      const write = await call("POST", `/rest/v1/rpc/${PREFIX}persona_create`, {
        jwt: null,
        body: {},
      });
      const read = await call("GET", "/rest/v1/zz_diag_m3a_events?select=id", {
        jwt: null,
      });
      note(
        "anon probe/rpc/read",
        `${probe.status}/${write.status}/${read.status}`,
      );
      expect(probe.status).toBeGreaterThanOrEqual(400);
      expect(write.status).toBeGreaterThanOrEqual(400);
      expect(read.status).toBeGreaterThanOrEqual(400);
    });
  },
);
