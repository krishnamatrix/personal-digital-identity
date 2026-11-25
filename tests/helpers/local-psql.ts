import { execFileSync } from "node:child_process";

/**
 * LOCAL validation only: runs SQL as postgres inside the local Supabase database container,
 * to set up state the app can never create itself (granting or ending PRO without a payment,
 * moving a PRO end date into the past). Refuses to run unless `pnpm validate` started the
 * suite and named a local container. Never used by `pnpm test` or against hosted Supabase.
 */
export function localPsql(sql: string): string {
  const container = process.env.FOLIOONE_LOCAL_DB_CONTAINER ?? "";
  if (
    process.env.FOLIOONE_VALIDATE !== "1" ||
    !/^supabase_db_[\w-]+$/.test(container)
  )
    throw new Error(
      "localPsql runs only inside `pnpm validate` against the local stack.",
    );
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: sql, encoding: "utf8" },
  ).trim();
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Gives a local test account PRO until `until` (an interval from now, e.g. '30 days'). */
export function setLocalPro(email: string, until: string | null) {
  localPsql(`
    INSERT INTO folioone.accounts (id) SELECT id FROM auth.users WHERE email = ${quote(email)}
      ON CONFLICT DO NOTHING;
    INSERT INTO folioone.account_plans (account_id, plan, pro_until)
      SELECT id, ${until ? "'pro'" : "'free'"}, ${until ? `now() + interval ${quote(until)}` : "NULL"}
      FROM auth.users WHERE email = ${quote(email)}
    ON CONFLICT (account_id) DO UPDATE SET plan = EXCLUDED.plan, pro_until = EXCLUDED.pro_until;`);
}

/** Makes a local test account a platform admin (Folio Designer), or removes the role. */
export function setLocalAdmin(email: string, admin: boolean) {
  localPsql(`
    INSERT INTO folioone.accounts (id) SELECT id FROM auth.users WHERE email = ${quote(email)}
      ON CONFLICT DO NOTHING;
    ${
      admin
        ? `INSERT INTO folioone.platform_admins (account_id, note)
             SELECT id, 'local test' FROM auth.users WHERE email = ${quote(email)}
           ON CONFLICT (account_id) DO NOTHING;`
        : `DELETE FROM folioone.platform_admins
             WHERE account_id = (SELECT id FROM auth.users WHERE email = ${quote(email)});`
    }`);
}
