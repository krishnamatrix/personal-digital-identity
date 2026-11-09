import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The single PostgreSQL schema that holds all Folioone application data, in
 * every environment (local, staging, production). Environments are separated by
 * Supabase project and credentials, never by schema name.
 *
 * Every Supabase client in the application is created with this schema
 * (`db: { schema: FOLIOONE_SCHEMA }`), so PostgREST resolves tables and RPCs in
 * `folioone` and never falls back to `public`. This is deliberately a constant,
 * not an environment variable: a misconfigured value could silently point the
 * app at another schema.
 *
 * Do not confuse this with Supabase Storage bucket names: the application uses
 * no Storage, and this value must never be used as a bucket name.
 */
export const FOLIOONE_SCHEMA = "folioone" as const;

/** Client options shared by every Supabase client construction. */
export const folioneDbOptions = { schema: FOLIOONE_SCHEMA } as const;

/**
 * A Supabase client bound to the Folioone schema. Typing repositories with this
 * (instead of the default `public` client) makes the compiler reject a client
 * created without `db.schema`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type FolioneClient = SupabaseClient<
  any,
  typeof FOLIOONE_SCHEMA,
  typeof FOLIOONE_SCHEMA
>;
/* eslint-enable @typescript-eslint/no-explicit-any */
