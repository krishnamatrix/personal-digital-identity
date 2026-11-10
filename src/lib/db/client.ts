import "server-only";
import { createAuthenticatedClient, createClient } from "@/lib/supabase/server";
import type { FolioneClient } from "@/lib/db/schema";

/**
 * The ONLY way application code obtains a database client. Both accessors build on the
 * cookie-backed Supabase server client (anon key + the visitor's own session), so PostgREST
 * evaluates Row Level Security for every query. There is no service-role key, no privileged
 * connection and no second code path: this file must stay that small.
 *
 * Only src/lib/db/** may call `.from()` / `.rpc()` on these clients (enforced by
 * scripts/check-db-boundary.mjs, part of `pnpm validate`). Services pass the handle straight
 * into query functions and never use it themselves.
 */
export type DbClient = FolioneClient;

/** A verified signed-in user (throws AuthenticationRequiredError) and a client carrying their JWT. */
export async function getAuthenticatedDb(): Promise<{
  client: DbClient;
  user: { id: string; user_metadata?: Record<string, unknown> | null };
}> {
  return createAuthenticatedClient();
}

/** A client that ignores cookies: always the database role `anon`. For public website reads. */
export async function getAnonymousDb(): Promise<DbClient> {
  return createClient({ anonymous: true });
}
