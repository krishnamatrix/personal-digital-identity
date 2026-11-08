# Database DDL Execution Tracker

All active SQL is intended for manual execution by the developer as `postgres`
through Supabase SQL Editor. Codex does not connect or execute SQL. The
developer reported that `folioone_migrator` and `folioone_runtime` were removed
and have no database-level privileges. The developer has now confirmed manual
execution and catalog verification of both active Milestone 2 identity DDL
files. No execution date was provided.

## Active DDL

| DDL filename                                                   | Migration/version ID     | Dependencies                                                                                                                                                                  | Execution status | Execution date | Verification status / evidence                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [001-identity-tables.sql](milestone-2/001-identity-tables.sql) | `M2-IDENTITY-TABLES-001` | Approved development project; Supabase `auth.users`; `postgres` preflight confirms `public CREATE`, `auth USAGE`, and `REFERENCES` on `auth.users`; both target tables absent | executed         | Not provided   | verified — developer reports both tables exist, are owned by `postgres`, have RLS enabled and forced, and contain the expected primary keys, foreign keys, and check constraints. Catalog verification only; no runtime RLS enforcement claim.               |
| [002-identity-rls.sql](milestone-2/002-identity-rls.sql)       | `M2-IDENTITY-RLS-001`    | 001 executed and verified; Supabase `anon`, `authenticated`, `service_role` roles and authenticated access to `auth.uid()`/`public`                                           | executed         | Not provided   | verified — developer reports exact authenticated grants, no table privileges for `anon`, `service_role`, or `PUBLIC`, and exactly five ownership policies using `auth.uid()`. No DELETE policy. Catalog verification only; no runtime RLS enforcement claim. |

The catalog results above remain catalog verification, distinct from runtime
enforcement. Hosted two-user Auth/PostgREST isolation results are recorded in
[Milestone 2C](../architecture/milestone-2c-rls-isolation-verification.md).
That validation executed no SQL and changed no database objects; the two
designated users' account/profile rows were initialized through authenticated
PostgREST requests. DDL execution statuses and dates above are unchanged.

## Milestone 3A Persona proposals

The following numbered files are architecture proposals only. The developer has
not approved or executed them. Their status is `pending`; no Persona tables,
indexes, grants or policies are claimed to exist. Execute in the listed order
only after explicit review, checking every file's preflight against live state.

| DDL filename                                                                  | Migration/version ID | Dependencies                                                                                   | Execution status | Execution date | Verification status / evidence                                                                 |
| ----------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- | ---------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| [001-persona-tables.sql](milestone-3a/001-persona-tables.sql)                 | `M3A-PERSONA-001`    | Approved design; M2 `accounts` exists; target absent                                           | pending          | Not executed   | Not verified; proposal only                                                                    |
| [002-persona-configuration.sql](milestone-3a/002-persona-configuration.sql)   | `M3A-PERSONA-002`    | 001 executed and reviewed; M2 `identity_profiles` exists; targets absent                       | pending          | Not executed   | Not verified; proposal only                                                                    |
| [003-persona-revisions.sql](milestone-3a/003-persona-revisions.sql)           | `M3A-PERSONA-003`    | 001-002 executed and reviewed; retention decision accepted; target absent                      | pending          | Not executed   | Not verified; proposal only                                                                    |
| [004-persona-rls-and-grants.sql](milestone-3a/004-persona-rls-and-grants.sql) | `M3A-PERSONA-004`    | 001-003 executed; Supabase roles and auth.uid ACL preflight pass; no existing Persona policies | pending          | Not executed   | Not verified; proposal only; catalog checks and separately approved runtime RLS tests required |

## Retired SQL archive

These files are marked RETIRED and must not be executed. The developer's role
cleanup report confirms the custom roles were removed, but does not identify
which historical SQL files were used. Their file-specific execution statuses
remain unrecorded; no status is inferred.

| Retired file                                                                                                                              | Reason                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [custom-ddls.sql.retired](retired/custom-ddls.sql.retired)                                                                                | Historical aggregate role provisioning.                    |
| [001-runtime-auth-schema-usage.sql.retired](retired/milestone-2a/001-runtime-auth-schema-usage.sql.retired)                               | Grant targeted to removed `folioone_runtime`.              |
| [002-migrator-default-privileges.sql.retired](retired/milestone-2a/002-migrator-default-privileges.sql.retired)                           | Custom-role default ACLs and temporary membership changes. |
| [003-temporary-drizzle-database-create-grant.sql.retired](retired/milestone-2a/003-temporary-drizzle-database-create-grant.sql.retired)   | Temporary database CREATE grant to removed migrator.       |
| [004-temporary-drizzle-database-create-revoke.sql.retired](retired/milestone-2a/004-temporary-drizzle-database-create-revoke.sql.retired) | Revoke paired with the retired temporary grant.            |

## Reporting execution

After the developer executes an active file, record the filename/ID, date,
completion result, and read-only verification output. Mark it `executed` only
on explicit developer confirmation; mark `verified` only after confirmation
that its post-execution checks passed. Record `failed` if reported, and inspect
actual state before retrying. A file's presence is never evidence of execution.
