# Milestone 2A: Supabase Security Foundation Verification — Historical Record

> **Superseded operating model — do not execute SQL from this report.** The
> developer later reported that `folioone_runtime` and `folioone_migrator` were
> permanently removed and that neither retained database-level privileges.
> Their final role/dependency verification was still in progress at the time of
> the report. All role-creation, role-grant, temporary membership, custom-role
> default-privilege, and migration-credential proposals below are historical
> only. The role-specific files have been moved to `docs/sql/retired/`.
>
> Current operating instructions are in [docs/sql/README.md](../sql/README.md),
> active DDL status is in the [execution tracker](../sql/execution-tracker.md),
> and user-owned runtime access uses the authenticated Supabase server client.
> Codex does not connect to Supabase, execute SQL, or apply migrations.

The inspection facts and architecture discussion below are retained as audit
history; they are not current provisioning instructions. The current reported
identity DDL execution and catalog-verification status is recorded in the
section below and in the SQL execution tracker.

## Milestone 2 identity DDL — developer-reported catalog verification

The developer confirmed that both active SQL files were manually executed in
the hosted development Supabase project using the authorized `postgres`
connection. The execution date was not provided. The following results are
developer-reported catalog verification; Codex did not connect to Supabase or
independently inspect the database.

- `accounts` and `identity_profiles` exist and are owned by `postgres`.
- Both tables have RLS enabled and `FORCE ROW LEVEL SECURITY`.
- Expected primary keys, foreign keys, cascade behavior, and check constraints
  are present.
- `authenticated` has `SELECT` and `INSERT` on `accounts`, and `SELECT`,
  `INSERT`, and `UPDATE` on `identity_profiles`.
- `anon`, `service_role`, and `PUBLIC` have no table privileges on either
  table.
- Exactly five policies exist, all targeting `authenticated`:
  `accounts_select_own`, `accounts_insert_own`, `identity_profiles_select_own`,
  `identity_profiles_insert_own`, and `identity_profiles_update_own`.
- All five policies use `auth.uid()` for ownership. No `DELETE` policies exist.

These results establish the reported schema, ACL, and policy catalog state.
They do **not** establish that runtime requests enforce the policies correctly:
`postgres` has `BYPASSRLS`, and catalog inspection is not an authenticated
request test. Hosted application integration and two-user cross-account
isolation remain unverified. Two-user isolation testing remains subject to
separate approval. The tracker records both files as `executed` and
`verified` based on the developer's report.

## Non-production approval

The user explicitly confirmed that the Supabase project configured through `.env.local` is a dedicated non-production Folioone development project approved for controlled security testing. This is the approval provided for this stage; the project label was not independently checked in the Supabase Dashboard.

## Stage 1: PostgreSQL connectivity and authentication

- **Passed:** `.env.local` contains `DATABASE_URL`; no credential values were printed. The connection uses TLS and the Supabase shared transaction pooler on port `6543`.
- **Passed:** PostgreSQL authentication succeeded and a read-only `SELECT 1` returned successfully.
- **Passed:** Drizzle Kit loads `.env.local` without logging the connection string. The earlier CJS/top-level-await config issue was fixed in [drizzle.config.ts](../../drizzle.config.ts) and [env.ts](../../src/lib/env.ts).
- The connected database is `postgres`, running PostgreSQL `17.11`. The server-side backend port reported by PostgreSQL is `5432`; the client connects to the shared transaction pooler at `6543`.

## Stage 2: Read-only role and privilege inspection

All inspection in this stage used catalog/metadata `SELECT` statements. No table data was queried.

### Connection identity and current privileges

| Property                        | Inspected result                                              |
| ------------------------------- | ------------------------------------------------------------- |
| `current_database()`            | `postgres`                                                    |
| `current_user` / `session_user` | `postgres` / `postgres`                                       |
| PostgreSQL version              | `17.11`                                                       |
| Client endpoint                 | Supabase shared transaction pooler, port `6543`, TLS required |
| Server backend port             | `5432`                                                        |
| Application driver settings     | Postgres.js pool size `1`, `prepare: false`                   |

The current `postgres` role is not a PostgreSQL superuser, but has `CREATEDB`, `CREATEROLE`, replication, and `BYPASSRLS`. It can `SET ROLE` to `service_role`, `pg_read_all_data`, and several other Supabase/predefined roles. `service_role` itself has `BYPASSRLS`. The current connection is therefore unsuitable for application runtime queries.

### Existing PostgreSQL role matrix

`Y` means enabled; `N` means disabled. Role flags below were read from `pg_roles`.

| Role                          | LOGIN | SUPERUSER | CREATEDB | CREATEROLE | INHERIT | BYPASSRLS |
| ----------------------------- | ----- | --------- | -------- | ---------- | ------- | --------- |
| `anon`                        | N     | N         | N        | N          | Y       | N         |
| `authenticated`               | N     | N         | N        | N          | Y       | N         |
| `authenticator`               | Y     | N         | N        | N          | N       | N         |
| `dashboard_user`              | N     | N         | Y        | Y          | Y       | N         |
| `pg_checkpoint`               | N     | N         | N        | N          | Y       | N         |
| `pg_create_subscription`      | N     | N         | N        | N          | Y       | N         |
| `pg_database_owner`           | N     | N         | N        | N          | Y       | N         |
| `pg_execute_server_program`   | N     | N         | N        | N          | Y       | N         |
| `pg_maintain`                 | N     | N         | N        | N          | Y       | N         |
| `pg_monitor`                  | N     | N         | N        | N          | Y       | N         |
| `pg_read_all_data`            | N     | N         | N        | N          | Y       | N         |
| `pg_read_all_settings`        | N     | N         | N        | N          | Y       | N         |
| `pg_read_all_stats`           | N     | N         | N        | N          | Y       | N         |
| `pg_read_server_files`        | N     | N         | N        | N          | Y       | N         |
| `pg_signal_backend`           | N     | N         | N        | N          | Y       | N         |
| `pg_stat_scan_tables`         | N     | N         | N        | N          | Y       | N         |
| `pg_use_reserved_connections` | N     | N         | N        | N          | Y       | N         |
| `pg_write_all_data`           | N     | N         | N        | N          | Y       | N         |
| `pg_write_server_files`       | N     | N         | N        | N          | Y       | N         |
| `pgbouncer`                   | Y     | N         | N        | N          | Y       | N         |
| `postgres`                    | Y     | N         | Y        | Y          | Y       | Y         |
| `service_role`                | N     | N         | N        | N          | Y       | Y         |
| `supabase_admin`              | Y     | Y         | Y        | Y          | Y       | Y         |
| `supabase_auth_admin`         | Y     | N         | N        | Y          | N       | N         |
| `supabase_etl_admin`          | Y     | N         | N        | N          | Y       | Y         |
| `supabase_privileged_role`    | N     | N         | N        | N          | Y       | N         |
| `supabase_read_only_user`     | Y     | N         | N        | N          | Y       | Y         |
| `supabase_realtime_admin`     | N     | N         | N        | N          | N       | N         |
| `supabase_replication_admin`  | Y     | N         | N        | N          | Y       | N         |
| `supabase_storage_admin`      | Y     | N         | N        | Y          | N       | N         |

### Existing role memberships and SET ROLE paths

PostgreSQL 17 membership rows expose `ADMIN`, `INHERIT`, and `SET` options. Inspected membership edges:

| Member                    | Granted roles                                                                                                                             | Options                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `authenticator`           | `anon`, `authenticated`, `service_role`                                                                                                   | `ADMIN=false`, `INHERIT=false`, `SET=true` |
| `postgres`                | `anon`, `authenticated`, `authenticator`, `pg_create_subscription`, `pg_monitor`, `pg_read_all_data`, `pg_signal_backend`, `service_role` | `ADMIN=true`, `INHERIT=true`, `SET=true`   |
| `postgres`                | `supabase_privileged_role`                                                                                                                | `ADMIN=false`, `INHERIT=true`, `SET=true`  |
| `pg_monitor`              | `pg_read_all_settings`, `pg_read_all_stats`, `pg_stat_scan_tables`                                                                        | `ADMIN=false`, `INHERIT=true`, `SET=true`  |
| `supabase_etl_admin`      | `pg_monitor`, `pg_read_all_data`, `supabase_privileged_role`                                                                              | `ADMIN=false`, `INHERIT=true`, `SET=true`  |
| `supabase_read_only_user` | `pg_monitor`, `pg_read_all_data`                                                                                                          | `ADMIN=false`, `INHERIT=true`, `SET=true`  |
| `supabase_realtime_admin` | `anon`, `authenticated`, `service_role`                                                                                                   | `ADMIN=false`, `INHERIT=false`, `SET=true` |
| `supabase_storage_admin`  | `authenticator`                                                                                                                           | `ADMIN=false`, `INHERIT=false`, `SET=true` |

The current `postgres` session can `SET ROLE service_role`; it is also a member of `pg_read_all_data`. It is not a member of `supabase_admin`. Neither proposed application role should be a member of an existing role, including `authenticated`, `authenticator`, `service_role`, or any administrative role. PostgreSQL 17 automatically gives a non-superuser role creator with `CREATEROLE` an `ADMIN` membership in roles it creates, with `INHERIT=false` and `SET=false`. That is the administrator being a member of the new role, not the new role being a member of the administrator. The eventual catalog state must still be queried in both directions; it is not assumed here. Future RLS policies for direct Drizzle access must target the dedicated runtime role (or use a deliberately designed policy target); the runtime role will not assume the Supabase API's `authenticated` role.

### Database, schema, object and default privileges

- Database `postgres` is owned by `postgres`. `PUBLIC` has `CONNECT` and `TEMPORARY`; `dashboard_user` and `postgres` also have `CONNECT`, `CREATE`, and `TEMPORARY`; `supabase_etl_admin` and `supabase_storage_admin` have database `CREATE`. The configured `postgres` login therefore has database `CREATE` in the inspected ACL (and as owner); it is not a superuser.
- Schema `public` is owned by `pg_database_owner`. `PUBLIC` has `USAGE`; `CREATE` is held by `pg_database_owner`. The runtime role will receive only `USAGE`, not `CREATE`.
- Schema `auth` is owned by `supabase_admin`. `USAGE` is granted to `anon`, `authenticated`, `dashboard_user`, `postgres`, and `service_role`; it is not granted to `PUBLIC`. The future runtime role therefore needs explicit `USAGE` on `auth` to call `auth.uid()`.
- Other inspected non-system schemas are Supabase-managed: `extensions` is owned by `postgres`; `graphql`, `graphql_public`, `realtime`, `storage`, and `vault` are owned by `supabase_admin`. Their `CREATE` rights are limited to `postgres`, `dashboard_user`, or Supabase schema-admin roles as applicable; their `USAGE` ACLs are assigned to Supabase API/service roles. No Folioone runtime role exists in these ACLs.
- There are **zero application tables in `public`**, and no application table/sequence ownership or current table/sequence grants exist for Folioone. No runtime table or sequence grant is currently required.
- Supabase-managed objects were found in `auth`, `realtime`, `storage`, `extensions`, and `vault`; their owners are Supabase-managed roles (and, for two extension views, `postgres`). Runtime access to those schemas or objects is not needed. `auth` contains 27 Supabase Auth tables and one sequence; `storage` contains 10 managed tables; `realtime` has three managed tables and one sequence.
- Existing object ownership summary: Auth tables/sequence are owned by `supabase_auth_admin`; storage tables by `supabase_storage_admin`; realtime tables/sequence by `supabase_admin` or `supabase_realtime_admin`; the vault table/view by `supabase_admin`; extension views by `postgres`. No objects are owned by a Folioone role.
- Existing managed table ACLs include `postgres` access to Auth tables; `anon`/`authenticated` and `service_role` access to selected `realtime` and `storage` tables; and extension-view access for `PUBLIC`/`dashboard_user`/`postgres`. The vault ACLs grant `service_role` selected read/delete rights. No such grants are proposed for runtime.
- Existing sequence ACLs: `auth.refresh_tokens_id_seq` has `USAGE` for `postgres`; `realtime.subscription_id_seq` has `USAGE` for `anon`, `authenticated`, `postgres`, and `service_role`. No sequence in `public` exists.
- Existing routine ACL summary: `auth.email()`, `auth.jwt()`, `auth.role()`, and `auth.uid()` are executable by `PUBLIC` (with an additional `postgres` grant on `auth.jwt()`); `public.rls_auto_enable()` has `PUBLIC`, `anon`, `authenticated`, `postgres`, and `service_role` execution grants. Managed `extensions`, `graphql_public`, `realtime`, `storage`, and `vault` routines have ACLs for their owning/admin/API roles. No Folioone-specific routine grant exists.
- Existing `postgres`/`supabase_admin` default privileges in `public` grant broad table privileges—including `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, and PostgreSQL 17 `MAINTAIN`—to `anon`, `authenticated`, and `service_role`; they also grant `USAGE`, `SELECT`, and `UPDATE` on sequences and `EXECUTE` on functions. New application objects should not be created as either role. A dedicated migration login isolates future objects from these defaults.
- Drizzle Kit's default migration metadata schema is `drizzle`, separate from `public`; it was absent during the prior inspection. The earlier Stage 3A proposal made `folioone_migrator` the schema owner; Stage 3C now recommends `postgres` ownership with `USAGE, CREATE` granted to the migrator, subject to resolving the built-in runner's database `CREATE` requirement. Runtime gets no access to that schema.

### Supabase Auth functions

- `auth.uid()` exists, is owned by `supabase_auth_admin`, is `SECURITY INVOKER`, and has `EXECUTE` for `PUBLIC`. This means no explicit function `GRANT` is necessary. `auth` schema `USAGE` is still required.
- `auth.email()`, `auth.jwt()`, and `auth.role()` also have `PUBLIC EXECUTE`; they are not required by the approved Drizzle strategy. Runtime is not granted access to `auth.users` or other Auth tables.
- Built-in `pg_catalog.set_config(text,text,boolean)` is executable by `anon` and `authenticated`; the earlier transaction-local claim probe also succeeded. The only claim source used by the application must remain the subject from its verified Supabase session.
- `public.rls_auto_enable()` is a Supabase-managed `SECURITY DEFINER` event-trigger function with `search_path=pg_catalog`; it has `PUBLIC EXECUTE`. It returns `event_trigger`, is not an application query function, and is not part of the proposed runtime grants. No function body or table data was inspected.

## Stage 3: Transaction-local claim propagation

- **Mechanics probe passed:** On the shared transaction pooler, `set_config('request.jwt.claim.sub', synthetic_uuid, true)` applied within a transaction and `auth.uid()` resolved the synthetic UUID.
- **Reset probe passed:** After rollback, the next transaction had an empty claim and `auth.uid()` returned null.
- **Security validation not established:** The probe used a synthetic UUID and `postgres` with `BYPASSRLS`; it did not exercise a verified user's session, an application table, or an RLS policy.

## Stage 3A: Proposed runtime and migration role design

### Design

- `folioone_runtime`: dedicated login used only by server-side Drizzle user-scoped transactions. It has no role memberships, no schema `CREATE`, no database `CREATE`, and no table ownership. It receives `CONNECT`, `USAGE` on `public` and `auth`, and future per-object CRUD/sequence rights only through isolated defaults for objects created by the migration role.
- `folioone_migrator`: separate login/credential used only for schema migrations. It has no superuser, `BYPASSRLS`, `CREATEDB`, `CREATEROLE`, replication, or membership in existing roles. It receives `CONNECT`, `USAGE, CREATE` on `public`, and proposed `USAGE, CREATE` on `drizzle`; the schema itself is proposed owned by `postgres`, while objects created by the migrator are owned by the migrator. Whether this role also needs database `CREATE` depends on the unresolved migration-runner choice described below. It must never be used for user-facing requests.
- Neither role is intentionally granted membership in existing Supabase roles. PostgreSQL may create a reverse creator-to-new-role ADMIN membership; the verification queries below check all membership edges touching either proposed role and the creator's ADMIN/INHERIT/SET options. No password is included in the proposal. Both logins need credentials provisioned separately through a secure secret-management path before they can authenticate.
- Runtime RLS policies must apply to `folioone_runtime` and check `auth.uid()` against row ownership. The runtime credential can call `set_config`, so server-side session verification and server-only credential protection remain essential: possession of the runtime DB credential would allow an attacker to forge the transaction-local subject.
- The database currently grants `TEMPORARY` to `PUBLIC`. PostgreSQL has no per-role deny to remove that inherited privilege. Revoking it from `PUBLIC` would affect other Supabase roles and is not proposed; runtime receives no additional temporary-table grant.

### Exact SQL proposed for review — not executed

Run only later through the separate administration connection, after explicit approval. No password is set here.

```sql
-- Create an isolated application login. CREATE ROLE sets the security attributes.
CREATE ROLE folioone_runtime
  WITH LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS;

-- Keep migration credentials separate from application runtime credentials.
CREATE ROLE folioone_migrator
  WITH LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS;

-- Explicit database connection access; no database CREATE is granted.
GRANT CONNECT ON DATABASE postgres
  TO folioone_runtime, folioone_migrator;

-- Runtime can resolve application objects and auth.uid(), but cannot create objects.
GRANT USAGE ON SCHEMA public TO folioone_runtime;
GRANT USAGE ON SCHEMA auth TO folioone_runtime;

-- Migration login can create application objects in public.
GRANT USAGE, CREATE ON SCHEMA public TO folioone_migrator;

-- Drizzle Kit defaults its migration ledger to schema "drizzle".
-- Keep schema ownership with postgres; migration role can create/use objects there.
CREATE SCHEMA drizzle AUTHORIZATION postgres;
GRANT USAGE, CREATE ON SCHEMA drizzle TO folioone_migrator;

-- Future user-owned tables created as folioone_migrator get only CRUD rights.
ALTER DEFAULT PRIVILEGES FOR ROLE folioone_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO folioone_runtime;

-- USAGE supports nextval/currval for generated identifiers; UPDATE/setval is not granted.
ALTER DEFAULT PRIVILEGES FOR ROLE folioone_migrator IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO folioone_runtime;

-- Do not make future application functions executable by every database role.
-- No app function EXECUTE grant is proposed until a specific function is required.
ALTER DEFAULT PRIVILEGES FOR ROLE folioone_migrator
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

No table grant is proposed now because `public` contains no application tables. The table/sequence defaults apply only to future objects created by `folioone_migrator` in `public`; they do not alter existing objects or Supabase-managed defaults. `auth.uid()` already has `PUBLIC EXECUTE`, so a redundant explicit function grant is intentionally omitted. No role membership `GRANT` is proposed. PostgreSQL 17 automatically gives a non-superuser `CREATEROLE` creator an `ADMIN` membership in a newly created role with `SET` and `INHERIT` false; the verification SQL checks all membership edges and options in both directions rather than assuming that state. This reverse membership does not make the new role a member of the administrator. [PostgreSQL role attributes](https://www.postgresql.org/docs/17/role-attributes.html)

**Drizzle migration execution prerequisite:** The configured `postgres` login owns database `postgres` and its inspected ACL includes database `CREATE`, so it can create `drizzle AUTHORIZATION postgres` and grant schema `USAGE, CREATE` to the migrator without granting database `CREATE` to either application role. However, the built-in Drizzle Kit migration runner itself executes `CREATE SCHEMA IF NOT EXISTS drizzle` as the migration login on every run. PostgreSQL 17 checks database `CREATE` before its `IF NOT EXISTS` early return. Therefore a pre-existing schema plus `USAGE, CREATE` on that schema is not sufficient for the unmodified built-in runner when `folioone_migrator` lacks database `CREATE`. The design must either approve that database privilege for the migration-only role or select and verify a migration execution path that does not issue `CREATE SCHEMA` on each run. No database `CREATE` grant to an application role is silently proposed. [Drizzle Kit migrate documentation](https://orm.drizzle.team/docs/drizzle-kit-migrate), [PostgreSQL 17 CREATE SCHEMA source](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/commands/schemacmds.c)

The existing inspection did not establish that `postgres` can `SET ROLE` to a not-yet-created `folioone_migrator`; that state cannot be read before the role exists. PostgreSQL 17 gives a non-superuser CREATEROLE role ADMIN membership in a role it creates, initially with `SET=false` and `INHERIT=false`. ADMIN permits the administrator to grant membership back to itself with `SET=true`; this would allow it to `SET ROLE folioone_migrator` and act with that role's privileges. It does not give the application role membership in an administrative role, but it expands the administrator's operational path into the migration identity. No such self-grant is included in the proposed SQL. [PostgreSQL role attributes](https://www.postgresql.org/docs/17/role-attributes.html), [PostgreSQL GRANT](https://www.postgresql.org/docs/17/sql-grant.html)

### Proposed verification SQL — not executed

Run after approved role/grant execution. These statements are read-only checks.

```sql
-- Role attributes
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
       rolinherit, rolreplication, rolbypassrls
FROM pg_roles
WHERE rolname IN ('folioone_runtime', 'folioone_migrator')
ORDER BY rolname;

-- Inspect memberships in both directions for both new roles.
-- "new role is member of granted role" means possible inherited/SET privileges.
-- "other role is member of new role" includes the creator-side ADMIN edge.
SELECT CASE
         WHEN member.rolname IN ('folioone_runtime', 'folioone_migrator')
           THEN 'new role is member of granted role'
         ELSE 'other role is member of new role'
       END AS membership_direction,
       parent.rolname AS granted_role,
       member.rolname AS member_role,
       grantor.rolname AS grantor,
       m.admin_option, m.inherit_option, m.set_option
FROM pg_auth_members AS m
JOIN pg_roles AS parent ON parent.oid = m.roleid
JOIN pg_roles AS member ON member.oid = m.member
JOIN pg_roles AS grantor ON grantor.oid = m.grantor
WHERE member.rolname IN ('folioone_runtime', 'folioone_migrator')
   OR parent.rolname IN ('folioone_runtime', 'folioone_migrator')
ORDER BY membership_direction, member_role, granted_role;

-- Check both application roles against privileged Supabase/PostgreSQL roles.
SELECT app.role_name,
       target.role_name AS privileged_role,
       pg_has_role(app.role_name, target.role_name, 'MEMBER') AS member,
       pg_has_role(app.role_name, target.role_name, 'USAGE') AS inherited,
       pg_has_role(app.role_name, target.role_name, 'SET') AS can_set_role
FROM (VALUES ('folioone_runtime'), ('folioone_migrator')) AS app(role_name)
CROSS JOIN unnest(ARRAY[
  'postgres', 'supabase_admin', 'service_role', 'authenticator',
  'supabase_auth_admin', 'supabase_storage_admin', 'supabase_etl_admin',
  'supabase_read_only_user', 'supabase_replication_admin', 'dashboard_user',
  'pg_read_all_data', 'pg_write_all_data', 'pg_read_server_files',
  'pg_write_server_files', 'pg_execute_server_program', 'pg_signal_backend',
  'pg_monitor', 'pg_use_reserved_connections', 'pg_create_subscription'
]) AS target(role_name)
ORDER BY app.role_name, target.role_name;

-- Run in the same administrator login session used to create the roles.
-- Explicitly inspect creator membership and its options for each created role.
SELECT creator.rolname AS administrator_role,
       created.rolname AS created_role,
       m.admin_option, m.inherit_option, m.set_option,
       pg_has_role(creator.oid, created.oid, 'MEMBER') AS is_member,
       pg_has_role(creator.oid, created.oid, 'USAGE') AS inherits_privileges,
       pg_has_role(creator.oid, created.oid, 'SET') AS can_set_role
FROM pg_roles AS creator
CROSS JOIN pg_roles AS created
LEFT JOIN pg_auth_members AS m
  ON m.member = creator.oid AND m.roleid = created.oid
WHERE creator.rolname = session_user
  AND created.rolname IN ('folioone_runtime', 'folioone_migrator')
ORDER BY created.rolname;

-- Effective database/schema/function access.
SELECT has_database_privilege('folioone_runtime', 'postgres', 'CONNECT') AS can_connect,
       has_database_privilege('folioone_runtime', 'postgres', 'CREATE') AS can_create_database_objects,
       has_schema_privilege('folioone_runtime', 'public', 'USAGE') AS public_usage,
       has_schema_privilege('folioone_runtime', 'public', 'CREATE') AS public_create,
       has_schema_privilege('folioone_runtime', 'auth', 'USAGE') AS auth_usage,
       has_function_privilege('folioone_runtime', 'auth.uid()', 'EXECUTE') AS can_execute_auth_uid;

-- Default ACLs for only migration-created public objects.
SELECT pg_get_userbyid(d.defaclrole) AS creator_role,
       n.nspname AS schema, d.defaclobjtype AS object_type,
       d.defaclacl
FROM pg_default_acl AS d
JOIN pg_namespace AS n ON n.oid = d.defaclnamespace
WHERE d.defaclrole = 'folioone_migrator'::regrole
  AND n.nspname = 'public'
ORDER BY object_type;
```

### SQL statement rationale and security effect

| Proposed statement group                           | Purpose and risk addressed                                                                                                                                                                                                                                                                                                   | Supabase-specific?                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `CREATE ROLE folioone_runtime ...`                 | Login-only runtime with no elevated attributes; no membership is granted, so it cannot inherit or `SET ROLE` to admin/service roles. Password is not set in this stage.                                                                                                                                                      | Custom login used through Supabase pooler; PostgreSQL role attributes are standard. |
| `CREATE ROLE folioone_migrator ...`                | Separate migration identity; no admin flags or `BYPASSRLS`. It owns only objects it creates and is never used for requests.                                                                                                                                                                                                  | Role use is standard; separate credentials follow the approved architecture.        |
| `GRANT CONNECT ...`                                | Allows both dedicated logins to connect. Does not grant database object creation. `PUBLIC` already has CONNECT, but explicit grants document required access.                                                                                                                                                                | Standard PostgreSQL.                                                                |
| Runtime `USAGE` on `public` and `auth`             | `public` resolves app relations; `auth` resolves `auth.uid()`. No `CREATE`, Auth table access, or Auth schema DDL is granted.                                                                                                                                                                                                | `auth` schema/function are Supabase-specific.                                       |
| Migrator `USAGE, CREATE` on `public` and `drizzle` | Allows migrations to create public app objects and ledger objects in the postgres-owned `drizzle` schema. Runtime gets no `drizzle` access. The built-in migration runner separately issues `CREATE SCHEMA IF NOT EXISTS`, which requires database `CREATE` even when the schema exists; resolve this explicitly before use. | `drizzle` schema is Drizzle Kit's observed default.                                 |
| Table default CRUD grant                           | Future migration-created app tables support the approved read/write CRUD operations and no truncate, trigger, ownership, or grant option. RLS policies remain independently required.                                                                                                                                        | Standard PostgreSQL.                                                                |
| Sequence default `USAGE`                           | Allows generated sequence values without granting `UPDATE`/`setval`.                                                                                                                                                                                                                                                         | Standard PostgreSQL.                                                                |
| Global function default revoke                     | Prevents future migration-created functions from inheriting PostgreSQL's default `PUBLIC EXECUTE`; future runtime-callable functions must receive a specific grant. PostgreSQL requires a global per-role revoke, not a schema-only revoke.                                                                                  | Standard PostgreSQL.                                                                |
| No function `GRANT` now                            | `auth.uid()` already grants EXECUTE to PUBLIC; no application function currently needs runtime access.                                                                                                                                                                                                                       | `auth.uid()` is Supabase-specific.                                                  |
| No role membership `GRANT` SQL                     | Neither role is intentionally made a member of other roles. PostgreSQL's automatic creator membership is checked separately, including ADMIN/INHERIT/SET options and both membership directions.                                                                                                                             | PostgreSQL 17 membership options are standard.                                      |

## Pooler compatibility and security implications

- Supabase's shared transaction pooler on port `6543` supports custom database login roles; its username format is `[role].[project-ref]`. Credentials must be configured separately and never logged. [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)
- Transaction mode does not preserve session state and does not support prepared statements. Postgres.js/Drizzle `prepare: false` is set in the current application client. All claim setup and user queries must run inside one transaction on the same transaction connection. The existing `max: 1` pool setting is compatible with the documented server-side pattern. [Supabase transaction-mode limitations](https://supabase.com/docs/guides/database/connecting-to-postgres#transaction-mode-limitations)
- The synthetic claim and reset probes passed in the earlier Stage 3 test, but a real runtime-role test remains outstanding. A database credential holder can set arbitrary custom GUC claims; the trusted server must derive the subject only from a verified Supabase session and keep `folioone_runtime` credentials server-side.
- A table owner normally bypasses RLS unless `FORCE ROW LEVEL SECURITY` is enabled. `folioone_migrator` will own objects it creates and therefore remains a migration-only credential. Runtime must never use it.
- Existing default ACLs for `postgres` and `supabase_admin` give broad rights to `anon`, `authenticated`, and `service_role`; `service_role` bypasses RLS. The proposal isolates future application objects under `folioone_migrator` instead of changing Supabase-managed role defaults. PostgreSQL applies default privileges according to the role creating each object; its global function `PUBLIC EXECUTE` default must be revoked at the role level, since a per-schema revoke cannot undo a global default. [PostgreSQL ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)
- `ALTER DEFAULT PRIVILEGES FOR ROLE folioone_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` affects only future functions/procedures created by `folioone_migrator`, globally across schemas in this database. It does not change existing routines. It does not alter defaults for Supabase-managed creator roles such as `postgres`, `supabase_admin`, or Auth/Storage owners. Given the migrator's proposed CREATE rights only on `public` and `drizzle`, it withholds the default PUBLIC execute grant for its future application routines and any routine it may create in `drizzle`; specifically required runtime execution must be explicitly granted. Existing `auth.uid()` PUBLIC execution remains unchanged. This global revoke is needed because a per-schema default revoke cannot cancel a global default grant. [PostgreSQL ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)
- The runtime role will inherit database `TEMPORARY` through existing `PUBLIC` ACL. Selectively denying that inherited right is not possible without changing the database-wide `PUBLIC` grant, so no such global change is proposed. PostgreSQL grants database `CONNECT` and `TEMPORARY` to `PUBLIC` by default. [PostgreSQL privileges](https://www.postgresql.org/docs/17/ddl-priv.html)

## Risks and remaining prerequisites

1. **SQL approval:** None of the proposed `CREATE ROLE`, `GRANT`, `CREATE SCHEMA`, or `ALTER DEFAULT PRIVILEGES` statements have been run. Review and explicitly approve the exact SQL before execution.
2. **Credentials and application routing:** No passwords are created. Provision distinct secrets after approval. Runtime `DATABASE_URL` must use `folioone_runtime`; Drizzle Kit must use a separate migration URL/credential for `folioone_migrator`. The current `drizzle.config.ts` reads `DATABASE_URL`, so this routing change must be separately reviewed before migrations. Supabase's documented password handling route for custom roles needs to be followed; see Stage 3C.
3. **Auth foreign keys:** No `REFERENCES` grant to `auth.users` is proposed now. If a future migration adds an FK to Auth, inspect and grant only the specific referenced-table privilege to the migration identity; runtime does not need Auth table access.
4. **RLS policy target and FORCE RLS:** Future policies must target `folioone_runtime` and enforce `auth.uid()` ownership. Force-RLS/table ownership choices must be handled with the actual schema migration. No policies or tables exist to verify now.
5. **PUBLIC TEMP:** Existing database-level `PUBLIC TEMPORARY` remains an ambient privilege pending service-impact review; removing it globally is outside this proposal.
6. **Drizzle migration runner:** Resolve whether to grant database `CREATE` to migration-only `folioone_migrator` for the built-in runner, or use a separately designed/verified migration runner that skips the built-in `CREATE SCHEMA IF NOT EXISTS` step. The selected path must preserve migration ledger tracking and ownership while keeping runtime without database/schema CREATE.
7. **Verification:** After role creation is approved and completed, inspect memberships in both directions, creator ADMIN/INHERIT/SET options, and inherited/SET reachability for both application roles. Then test connection through the shared transaction pooler as `folioone_runtime`, confirm grants, and verify claim propagation using a verified test subject. Stage 4 still requires the separately approved two-user arrangement and isolated records.

## Stage 3B — Execution Readiness Review

This section is a plan only. No statements below have been executed. The historical facts above came from read-only catalog inspection using the configured privileged `postgres` connection.

### Final proposed execution sequence

1. **Preflight with read-only catalog checks:** re-confirm the current database, its owner and ACL, current login, and administrative executor. The existing inspection found database `postgres` owned by `postgres`; the configured `postgres` login has database `CREATE` through its ownership/ACL. Confirm this still holds immediately before provisioning, using an administrative session that does not print its connection string. After both roles exist, verify whether the administrator has `SET` membership in `folioone_migrator`; do not infer it from role creation alone.
2. **Use the inspected `postgres` login for the recommended schema bootstrap:** it owns database `postgres` and has database `CREATE` in the inspected ACL, so it can create `drizzle` owned by itself and grant only schema `USAGE, CREATE` to `folioone_migrator`. This avoids a `SET ROLE` requirement and adds no database privilege to either application role. Reconfirm the owner and ACL before execution; use no `service_role` credential.
3. **Resolve the built-in migration runner's database CREATE requirement before approving execution.** The installed Drizzle Kit/Drizzle ORM path unconditionally sends `CREATE SCHEMA IF NOT EXISTS <schema>` before ledger-table setup. PostgreSQL 17 checks database `CREATE` before it returns for an existing schema. A schema-level grant cannot satisfy this check. Either explicitly approve database `CREATE` for the migration-only role, or design and verify a different runner that does not issue that statement. The latter is narrower in privileges but requires separate implementation/design approval and verification; it is not part of this documentation change.
4. **Create roles and grants** using the exact Stage 3A SQL block only after approval, with no database `CREATE` grant to either Folioone role in the base proposal. Create the `postgres`-owned Drizzle schema and grant migrator schema access. No existing table grants are needed because the inspection found zero application tables in `public`.
5. **Provision two independent credentials** using the secure process below. Set runtime and migration connection configuration separately. Do not make migration credentials available to the running application.
6. **Apply each `ALTER DEFAULT PRIVILEGES FOR ROLE folioone_migrator` statement as `folioone_migrator` itself** after its credential is securely provisioned, or through another explicitly verified authorized session. Do not assume the `postgres` CREATEROLE administrator's ADMIN membership gives it SET/inherited rights for this command; do not self-grant role membership as a convenience.
7. **Run post-creation verification** below before using either role. This is still not Stage 4 and does not establish RLS isolation.

### Schema creation and exact additional SQL

The recommended schema ownership SQL is:

```sql
CREATE SCHEMA drizzle AUTHORIZATION postgres;
GRANT USAGE, CREATE ON SCHEMA drizzle TO folioone_migrator;
```

The configured `postgres` login can execute these bootstrap statements based on the prior read-only inspection (database owner and database CREATE ACL), subject to preflight recheck. Schema ownership is `postgres`; the migrator gets only the schema privileges it needs to create and use objects; runtime gets no `drizzle` schema privileges. The metadata table will be owned by whichever role creates it, expected to be `folioone_migrator` when the migration connection is used. The second statement does not grant database-level CREATE.

This schema model alone does not make the stock Drizzle Kit migrate command work with a migrator lacking database CREATE: its unconditional `CREATE SCHEMA IF NOT EXISTS` statement is subject to the database-level check even when the schema already exists. Do not treat the schema grants as satisfying that separate requirement.

### Read-only preflight and post-creation checks

Use catalog-only queries. For the existing database, the prior inspection recorded the owner and ACL findings above. Reconfirm before provisioning:

```sql
SELECT d.datname,
       pg_get_userbyid(d.datdba) AS database_owner,
       has_database_privilege(session_user, d.datname, 'CONNECT') AS login_can_connect,
       has_database_privilege(session_user, d.datname, 'CREATE') AS login_has_create,
       d.datacl
FROM pg_database AS d
WHERE d.datname = current_database();

SELECT session_user, current_user, current_database(), current_setting('server_version');
```

After provisioning, run the Stage 3A proposed verification queries for role attributes, memberships in both directions, privileged-role reachability, creator membership options, effective privileges, and default ACLs. Additionally verify database/schema ACLs, ownership and absence of runtime access to `drizzle`:

```sql
SELECT r.rolname,
       has_database_privilege(r.rolname, current_database(), 'CONNECT') AS can_connect,
       has_database_privilege(r.rolname, current_database(), 'CREATE') AS can_create_in_database,
       has_schema_privilege(r.rolname, 'public', 'USAGE') AS public_usage,
       has_schema_privilege(r.rolname, 'public', 'CREATE') AS public_create,
       has_schema_privilege(r.rolname, 'drizzle', 'USAGE') AS drizzle_usage,
       has_schema_privilege(r.rolname, 'drizzle', 'CREATE') AS drizzle_create
FROM pg_roles AS r
WHERE r.rolname IN ('folioone_runtime', 'folioone_migrator')
ORDER BY r.rolname;

SELECT n.nspname AS schema_name,
       pg_get_userbyid(n.nspowner) AS schema_owner
FROM pg_namespace AS n
WHERE n.nspname IN ('public', 'auth', 'drizzle')
ORDER BY n.nspname;
```

Expected base design: runtime `CONNECT=true`, database `CREATE=false`, `public USAGE=true/CREATE=false`, `auth USAGE=true`, and `drizzle USAGE=false/CREATE=false`; migrator `CONNECT=true`, `database CREATE=false` unless the stock runner is explicitly approved, `public USAGE=true/CREATE=true`, `drizzle USAGE=true/CREATE=true`, and schema owner `postgres`. Verify `auth.uid()` execution, default ACLs for future migrator-created objects, that the metadata table owner is `folioone_migrator`, and that neither new role has membership in `postgres`, `service_role`, `authenticated`, `authenticator`, Supabase administration roles, or predefined privileged roles. The administrator's reverse ADMIN membership is reported separately; it is not an application-role membership in an administrator.

### Secure credential provisioning and pooler connection checks

- Provision two independent, randomly generated strong secrets using the approved Supabase database-role management interface or a secure administrative credential workflow. Do not place plaintext passwords in committed SQL, source files, this report, terminal arguments, shell history, command output, or logs. Do not generate or display credentials during this documentation review.
- Store the runtime secret only in the server's secret manager/runtime environment as the runtime database URL (or equivalent separate host/user/password variables). Store the migrator secret in a deployment/migration-only secret scope. The running application must not receive the migrator secret. Keep the existing `DATABASE_URL` routing for runtime separate from a migration-only variable such as `MIGRATION_DATABASE_URL`; the current `drizzle.config.ts` reads `DATABASE_URL`, so configuration must be deliberately updated and reviewed before migration use.
- For Supabase's shared transaction pooler on port `6543`, configure each custom-role username in the documented form `[ROLE].[PROJECT-REF]`, using respectively `folioone_runtime.[PROJECT-REF]` and `folioone_migrator.[PROJECT-REF]`. Use the project's TLS-required connection settings. Ensure URL-encoded credentials are handled by the secret/configuration layer and never printed. The existing Postgres.js/Drizzle client uses `prepare: false`, as required for transaction pooling; preserve that for the runtime pooler connection. Confirm the migration tool's driver/connection mode is compatible as well.
- After secrets are provisioned, perform a minimal connection smoke test for each role through port `6543`, using a process that reads its connection secret from the appropriate environment/secret manager, has shell tracing disabled, and prints only the following read-only result—not its URL or password:

```sql
SELECT current_user, session_user, current_database();
```

The runtime test must report both role identities as `folioone_runtime` and database `postgres`; the migration test must report `folioone_migrator` and database `postgres`. A successful connection checks authentication/route only; it does not verify app queries, claim propagation, or RLS.

- Rotate either secret through the same secure credential workflow when required: update the corresponding secret store and dependent service configuration without logging values, validate the new credential with the identity-only smoke test, then invalidate the old credential. Coordinate rotation to avoid exposing migration credentials to runtime deployment environments.

### Final privilege model and remaining prerequisites

- **Runtime:** login only; no object ownership; no `SUPERUSER`, `BYPASSRLS`, `CREATEDB`, `CREATEROLE`, or `REPLICATION`; no privileged role memberships; no database or schema `CREATE`. It receives only database `CONNECT`, `public` and `auth` `USAGE`, future table CRUD defaults, and future sequence `USAGE` defaults. It has no `drizzle` access.
- **Migrator:** separate login, used only for migrations; no `SUPERUSER`, `BYPASSRLS`, `CREATEDB`, `CREATEROLE`, or `REPLICATION`; no membership in privileged roles; intended not to have database `CREATE`, subject to the unresolved stock Drizzle Kit runner requirement. It gets `CONNECT`, `USAGE, CREATE` on `public` and `drizzle`; owns application objects and migration ledger objects it creates. The `drizzle` schema itself is proposed owned by `postgres`. It is never used for user-scoped runtime work.
- Neither role receives membership in `service_role`, `postgres`, `authenticated`, `authenticator`, Supabase administration roles, or predefined privileged roles. PostgreSQL CREATEROLE creator-side ADMIN membership is distinct and must be inspected; if created by configured `postgres`, it may administer the new roles, and self-granting SET would let the administrator act as migrator. Prefer a separate supported administrative operation that avoids that self-membership path.
- Before execution, confirm the supported administrative executor, approve any administrator membership path if the fallback is needed, approve secure credential provisioning and separate environment routing, and review the exact SQL. After execution, complete all post-creation checks and identity-only connection tests. RLS identity claims, application operations, and two-user isolation remain unverified; Stage 4 requires its own approved test arrangement.

## Stage 3C — Final Execution Design Review

This review preserves all earlier inspection results and adds source-level validation of the installed migration path. No SQL was executed and no database or application changes were made.

### Drizzle metadata schema ownership comparison

**Inspected configuration and versions:** `package.json` pins `drizzle-kit` `0.31.4`, `drizzle-orm` `0.44.5`, and `postgres` (Postgres.js) `3.4.7`. [drizzle.config.ts](../../drizzle.config.ts) selects the PostgreSQL dialect, schema file, and a single `dbCredentials.url`; it does not explicitly set migrations metadata options, so Drizzle's default metadata schema/table are `drizzle.__drizzle_migrations`. [src/db/client.ts](../../src/db/client.ts) uses `drizzle-orm/postgres-js`, Postgres.js `max: 1`, and explicit `prepare: false`. [src/lib/env.ts](../../src/lib/env.ts) currently provides only `DATABASE_URL`; there is no migration-specific URL/helper or migration package script.

Drizzle Kit documentation says the migration log table is created/used by `migrate` and defaults to `drizzle.__drizzle_migrations`; its schema/table can be configured. In the installed versions, the PostgreSQL migrate path delegates to Drizzle ORM's Postgres.js migrator. That code issues `CREATE SCHEMA IF NOT EXISTS drizzle`, then `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations`, selects the latest row, and inserts applied migration records. It does not require the migration role to own the schema for these table operations: `USAGE` and `CREATE` on an existing schema are sufficient for the migrator to create the ledger table, and the role that creates the table (`folioone_migrator`) owns it and can later read/update it. Application/runtime is not granted access to `drizzle` in either model. [Drizzle Kit migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate), [Drizzle Kit config](https://orm.drizzle.team/docs/drizzle-config-file)

However, the built-in runner's preceding `CREATE SCHEMA IF NOT EXISTS` is a material exception. PostgreSQL 17 checks database `CREATE` and ability to become the requested owner before checking whether `IF NOT EXISTS` can return as a no-op. Therefore a pre-created schema plus schema-level `USAGE, CREATE` does **not** let a database-privilege-restricted migrator run the unmodified Drizzle migration command. This was confirmed against the installed migration source and PostgreSQL 17 `CreateSchemaCommand`, which performs the ACL and role checks before its existing-schema early return. [PostgreSQL 17 source](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/commands/schemacmds.c)

| Design                                                      | Schema/object ownership and ordinary ledger access                                                                           | Stock `drizzle-kit migrate` with no database `CREATE` on migrator                                                                                                                                            | Security and operational effect                                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drizzle` owned by `folioone_migrator`                      | Migrator owns schema and ledger table; runtime excluded. Schema owner has broad control over everything in that schema.      | Does not work: its `CREATE SCHEMA IF NOT EXISTS` still needs database `CREATE`; when executing `AUTHORIZATION folioone_migrator`, it must also be able to SET ROLE to itself (which it can as its own role). | Convenient ownership but gives migrator schema-owner authority and still does not remove database-level prerequisite.                                 |
| `drizzle` owned by `postgres`, migrator has `USAGE, CREATE` | Migrator creates/owns its ledger table and can read/write it; postgres retains schema-level owner control; runtime excluded. | Does not work with the unmodified runner unless migrator also has database `CREATE`, for the same unconditional schema statement.                                                                            | Narrower schema authority for migrator; least-privilege ownership choice if paired with a runner that avoids the unnecessary schema-create statement. |

**Recommended ownership SQL:**

```sql
CREATE SCHEMA drizzle AUTHORIZATION postgres;
GRANT USAGE, CREATE ON SCHEMA drizzle TO folioone_migrator;
```

This matches the inspected database owner/ACL arrangement and avoids granting either Folioone role database `CREATE` just to bootstrap the schema. Runtime receives no privileges on `drizzle`. The ledger table and any other objects created there by a connection authenticated as `folioone_migrator` remain owned by the migrator. This is the preferred ownership model. The built-in Drizzle Kit migration-runner conflict remains unresolved: either approve database `CREATE` for the migration-only role (a broader database privilege than the schema grants), or separately design and validate an execution path that preserves Drizzle ledger semantics but omits `CREATE SCHEMA IF NOT EXISTS` after bootstrap. No such runner or privilege change is authorized or implemented here. The migration runner decision is a prerequisite to execution.

### Default function privileges

The proposed statement remains:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE folioone_migrator
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

This changes only default ACLs for **future functions/procedures created by `folioone_migrator`** in this database, across schemas; it does not revoke EXECUTE from any existing function. It does not affect default privileges belonging to `postgres`, `supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin`, or other Supabase-managed creator roles. Given the planned migrator CREATE access only to `public` and `drizzle`, it ensures future application functions created by the migrator are not executable by `PUBLIC` unless later granted explicitly. A specific runtime-callable application function will need a deliberate EXECUTE grant. Existing `auth.uid()` PUBLIC EXECUTE and Supabase-managed defaults remain unchanged. The global scope is intentional: a per-schema default revoke cannot cancel PostgreSQL's global default PUBLIC EXECUTE grant. [PostgreSQL ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)

### Runtime and migration connection separation

**Current inspected state:** both [drizzle.config.ts](../../drizzle.config.ts) and [src/db/client.ts](../../src/db/client.ts) use `DATABASE_URL`. The Drizzle config loads `.env.local`; the application client opens Postgres.js with `max: 1, prepare: false`. In the installed Drizzle Kit `0.31.4` source, PostgreSQL migration selects the Postgres.js driver (the `pg` package is not installed) and creates its client with `{ max: 1 }`; Postgres.js `3.4.7` defaults `prepare` to `false`. TLS and the shared transaction pooler endpoint must be encoded/configured in both URLs, using Supavisor port `6543` and username format `[ROLE].[PROJECT-REF]` (`folioone_runtime.[PROJECT-REF]` and `folioone_migrator.[PROJECT-REF]`).

**Exact future configuration changes, not made now:**

1. Keep `src/db/client.ts` on `requireDatabaseUrl()` so the application runtime reads only `DATABASE_URL`, whose credential is `folioone_runtime`; preserve Postgres.js `{ max: 1, prepare: false }` and TLS-required pooler settings.
2. Add a separate validated `requireMigrationDatabaseUrl()` path for `MIGRATION_DATABASE_URL`, and change `drizzle.config.ts` to use it. Inject that variable only into a dedicated migration job/terminal environment. Do not put it in the application runtime's environment or a shared `.env.local` loaded by Next.js. A migration-only local secret source may be loaded by Drizzle Kit config only, and must be ignored by version control.
3. Ensure the migration URL authenticates as `folioone_migrator` through the same Supabase shared transaction pooler/TLS endpoint. Preserve transaction-pooler compatibility: the installed migration driver uses a single connection and Postgres.js default `prepare: false`; verify this remains true if the config or driver changes. Runtime user-scoped operations continue to use only the runtime URL and transaction-local claim setup.
4. Add/document a migration command that runs in an environment holding only the migration credential. The current `package.json` has no migration scripts. Before adding one, resolve the `CREATE SCHEMA IF NOT EXISTS` privilege conflict above; do not use `DATABASE_URL` as an implicit fallback for migrations.

### Secure custom-role password provisioning

Supabase's current role documentation describes creating password-login roles with PostgreSQL role commands. Its Dashboard Database Settings page and corresponding Management API endpoint manage the project `postgres` password; they are not documented as setters for arbitrary custom-role passwords. The Supabase Knowledge Base recommends the interactive `psql` `\password role_name` meta-command when setting a custom role password: it prompts interactively, computes the verifier client-side, and avoids placing the cleartext password in shell history or the SQL statement. Use this through an approved TLS-protected administrative `psql` connection after role creation. Do not type the secret into SQL Editor, a `CREATE/ALTER ROLE ... PASSWORD` statement, command arguments, shell variables, logs, or source. Supabase warns that failed SQL statements and extended logging can expose inline password text; it recommends Dashboard/Management API for the project password, not a generic custom-role password UI. Store each generated credential separately in the relevant runtime or migration secret manager, and rotate using the same interactive `psql \password` method if no supported custom-role Management API is available. [Supabase Postgres Roles](https://supabase.com/docs/guides/database/postgres/roles), [Supabase credential logging guidance](https://supabase.com/kb/troubleshooting/provisioning-credentials-without-log-exposure), [Supabase database password API](https://supabase.com/docs/reference/api/v1-update-database-password), [PostgreSQL psql](https://www.postgresql.org/docs/17/app-psql.html)

No actual password is generated, displayed, or set in this review.

### Remaining prerequisites and verification

- Decide whether to preserve stock `drizzle-kit migrate` and explicitly accept database `CREATE` on the migration-only role, or keep the no-database-CREATE model and separately design/validate a migration execution path that omits the schema-create command. The recommended schema owner remains `postgres`; this decision concerns the migration runner's database privilege, not runtime.
- Approve the exact schema SQL and role/grant SQL before execution. Reconfirm database ownership/ACL, roles and membership state with read-only catalog queries first. No credentials or grant changes are approved by this report update.
- Apply role-specific default privileges while authenticated as `folioone_migrator` (or verify the exact authority path first); this avoids using the administrator's automatic creator membership to gain SET access.
- After an approved solution is implemented, verify runtime has no database/schema `CREATE`, no access to `drizzle`, and no privileged membership; verify migrator attributes and memberships; verify schema owner is `postgres`, migrator has only `USAGE, CREATE` on `drizzle`, and runtime has none; verify `__drizzle_migrations` is owned by migrator and subsequent ledger reads/inserts work; verify future default table/sequence/function ACL behavior.
- Provision distinct runtime and migration passwords interactively via `psql \password` over TLS, keep migration secret out of the application runtime, and test each connection by selecting only `current_user`, `session_user`, and `current_database()` without printing connection strings.
- Runtime authentication, actual app operations, claim propagation under the runtime role, and RLS isolation remain unverified. Stage 4 remains not started and needs a separately approved two-user test arrangement.

## Stage 3D — Post-Provision Read-Only Verification and App Configuration

The user reported that roles were provisioned manually. The following checks used read-only catalog `SELECT` statements through the existing configured connection. The connection identity was `current_user = session_user = postgres`, on database `postgres`, PostgreSQL `17.11`. No SQL other than read-only inspection was issued. No database changes or migrations were performed in this verification.

### Actual role and privilege findings

| Role                | LOGIN | SUPERUSER | CREATEDB | CREATEROLE | INHERIT | REPLICATION | BYPASSRLS |
| ------------------- | ----- | --------- | -------- | ---------- | ------- | ----------- | --------- |
| `folioone_runtime`  | true  | false     | false    | false      | false   | false       | false     |
| `folioone_migrator` | true  | false     | false    | false      | false   | false       | false     |

The role-membership catalog returned two reverse creator-membership edges: `postgres` is a member of each Folioone role with `ADMIN=true`, `INHERIT=false`, `SET=false`, grantor `supabase_admin`. Neither Folioone role is a member of another role; no application-role membership in `postgres`, `service_role`, Supabase administration roles, or predefined privileged roles was found. The administrator's membership in the new roles is distinct from an app role being a member of an administrator.

Database `postgres` is owned by `postgres`. Both Folioone roles have `CONNECT=true`, `CREATE=false`, and `TEMPORARY=true` (the latter is inherited from the existing `PUBLIC` ACL). The schema/object inspection returned:

| Schema    | Owner               | Runtime USAGE / CREATE | Migrator USAGE / CREATE |
| --------- | ------------------- | ---------------------- | ----------------------- |
| `public`  | `pg_database_owner` | true / false           | true / true             |
| `auth`    | `supabase_admin`    | false / false          | false / false           |
| `drizzle` | `postgres`          | false / false          | true / true             |

The `drizzle` owner and grants match the intended ownership model. No tables, sequences, views, or migration ledger table were found in `public` or `drizzle` at inspection time. `auth.uid()` has EXECUTE available to runtime, but runtime has no `auth` schema USAGE, so it cannot resolve/call that function through normal schema-qualified use. The intended auth claim path is therefore not ready.

The catalog query returned **no default ACL entries for `folioone_migrator`**. Consequently the intended future table CRUD grants, sequence USAGE grant, and default function EXECUTE revoke are not currently configured. Existing tables are absent, so this is a future-object privilege gap rather than an existing-table grant finding. No attempt was made to repair these missing grants.

`folioone_migrator` also has database `CREATE=false`. The installed Drizzle Kit migration path unconditionally executes `CREATE SCHEMA IF NOT EXISTS` before ledger-table setup, and PostgreSQL checks database CREATE before its existing-schema no-op. The stock migration command therefore cannot be treated as ready under the observed role privileges. No migration was run.

### Environment/configuration changes made

- `DATABASE_URL` is now used only by the application database client. Validation requires the Supabase transaction pooler (`pooler.supabase.com:6543`), TLS, and username `folioone_runtime.[PROJECT-REF]`; invalid privileged or misrouted URLs fail with a generic error that does not include the URL.
- `MIGRATION_DATABASE_URL` is read only by `drizzle.config.ts`, which now loads ignored `.env.migrations.local` and authenticates as `folioone_migrator`. The config explicitly targets the `drizzle` migration ledger schema. The variable is not part of the application's parsed runtime environment and is not needed to build or start the static UI.
- Added `.env.migrations.example` with an empty placeholder and updated `.gitignore` to allow committing only that safe example. Updated `.env.example`, `development-setup.md`, and `environment-variables.md` to document the role separation, pooler/TLS expectations, and secret isolation.
- The existing `.env.local` `DATABASE_URL` was not a runtime-role URL. Its value was blanked locally instead of preserving a privileged connection as the app's runtime URL. That administrator credential was inadvertently emitted in a shell search during this work; treat it as exposed and rotate it through the approved process. No replacement runtime or migration credentials are present in the repository. Supply those separately through the approved secret store/local ignored files before database use.
- Added environment tests for missing variables, valid role-specific pooler URLs, and rejection of an administrator URL as runtime configuration. The runtime Postgres.js client retains `{ max: 1, prepare: false }`; the installed Drizzle Kit Postgres.js driver uses `max: 1` and Postgres.js defaults `prepare` to false. No application database query or migration was executed.

### Blockers before database-backed product implementation

1. Runtime requires `USAGE ON SCHEMA auth` to call `auth.uid()`; that privilege is currently absent. User approval is required before any database grant is applied.
2. Migrator default ACL rows for future tables, sequences, and functions are absent. User approval is required before configuring them.
3. The stock Drizzle Kit runner requires database `CREATE`, currently absent from the migrator. Either approve that privilege or approve a separately designed runner that omits the redundant schema-create statement while preserving ledger behavior. No role design or privilege changes were made here.
4. Runtime and migration credentials must be provisioned and stored separately. The current local runtime URL is blank; no role-authenticated connection smoke test was possible. Any leaked preexisting administrator credential should be rotated by the project owner through the approved secure process.
5. Do not proceed to Stage 4 RLS isolation tests or Milestone 2B until explicitly approved. The next documented database-backed product milestone depends on schema/migrations, Auth claim access, and RLS security; it is blocked by the missing privileges and migration-runner decision above. No separate database-independent product milestone is specified in the approved blueprint.

## Stage 4: Isolated two-user RLS tests

**Not started.** Stage 3B and Stage 3C are documentation/readiness reviews only; no provisioning was performed. Do not start Stage 4 or Milestone 2B as part of this stage. RLS isolation is not claimed as verified. Wait for explicit approval of the proposed SQL and execution sequence before executing any database-changing statement.
