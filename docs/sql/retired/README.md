# Retired SQL archive

Files in this folder are retained only for historical audit context. Their
`.sql.retired` suffix prevents them from being mistaken for executable DDL.
Every file is marked `RETIRED — DO NOT EXECUTE`; credential-bearing lines were
omitted during archival. None of these files is part of the current execution
sequence.

The former `folioone_runtime` and `folioone_migrator` roles were permanently
removed by the developer. Their creation, grants, default privileges, temporary
membership changes, and Drizzle database `CREATE` grant/revoke are obsolete.
Current application requests use the authenticated Supabase server client.
