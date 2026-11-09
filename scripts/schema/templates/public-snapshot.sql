-- Fingerprint of the existing `public` schema (READ-ONLY, repeatable).
--
-- Purpose: prove that the folioone package does not change anything in `public`.
-- Run this file ONCE BEFORE 001 and ONCE AFTER 006 (and again after any later
-- step), then compare the result sets. Every row, including the final TOTAL row,
-- must be IDENTICAL before and after.
--
-- It records, for schema public only: relations (kind, RLS flags, owner, ACL),
-- functions (definition + ACL), RLS policies, column definitions, and the exact
-- row count of every table. It reads no row contents and changes nothing.
-- If `public` holds no tables, the list is simply short; the comparison still applies.

WITH relations AS (
  SELECT 'relation' AS kind, c.relname::text AS name,
         md5(concat_ws('|', c.relkind, c.relrowsecurity, c.relforcerowsecurity,
                       pg_get_userbyid(c.relowner), COALESCE(c.relacl::text, ''))) AS fingerprint
  FROM pg_class AS c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
), functions AS (
  SELECT 'function', p.oid::regprocedure::text,
         md5(concat_ws('|', pg_get_functiondef(p.oid), COALESCE(p.proacl::text, '')))
  FROM pg_proc AS p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f', 'p')
), policies AS (
  SELECT 'policy', p.tablename || '.' || p.policyname,
         md5(concat_ws('|', p.cmd, p.permissive, p.roles::text, p.qual, p.with_check))
  FROM pg_policies AS p WHERE p.schemaname = 'public'
), columns AS (
  SELECT 'columns', c.relname::text,
         md5(string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text,
                        ',' ORDER BY a.attnum))
  FROM pg_class AS c JOIN pg_attribute AS a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
  GROUP BY c.relname
), counts AS (
  SELECT 'rowcount', c.relname::text,
         (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text
  FROM pg_class AS c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
), everything AS (
  SELECT * FROM relations UNION ALL SELECT * FROM functions UNION ALL SELECT * FROM policies
  UNION ALL SELECT * FROM columns UNION ALL SELECT * FROM counts
)
SELECT kind, name, fingerprint FROM (
  SELECT 0 AS sort, kind, name, fingerprint FROM everything
  UNION ALL
  SELECT 1, 'TOTAL', '', md5(COALESCE(string_agg(kind || '/' || name || '/' || fingerprint, ',' ORDER BY kind, name), ''))
  FROM everything
) AS result
ORDER BY sort, kind, name;
