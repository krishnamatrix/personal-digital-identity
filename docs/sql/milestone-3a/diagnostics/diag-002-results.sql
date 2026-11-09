-- Purpose: READ-ONLY evidence queries to run in Supabase SQL Editor (as postgres)
-- after the hosted diagnostic test, to cross-check what the test reported.
-- Executes no DML/DDL. postgres bypasses RLS, so this sees all rows.
-- Prerequisite: diag-001-setup.sql executed and the hosted test run.

-- 1. Every RPC evidence row (expect 10+ rows, one per wrapper per test run).
--    observed_method must be POST and observed_path exactly '/rpc/' || label
--    with the 'zz_diag_m3a_' prefix, observed_gate true.
SELECT created_at, label, observed_method, observed_path, observed_gate,
       observed_path = '/rpc/zz_diag_m3a_' || label AS path_matches_expected,
       backend_pid, observed_xid
FROM public.zz_diag_m3a_events ORDER BY created_at;

-- 2. Any row whose observed values do NOT match the gate expectation. Must be 0 rows.
SELECT * FROM public.zz_diag_m3a_events
WHERE observed_method IS DISTINCT FROM 'POST'
   OR observed_path IS DISTINCT FROM '/rpc/zz_diag_m3a_' || label
   OR observed_gate IS DISTINCT FROM true;

-- 3. Rows the direct-write attempts must NOT have changed or created. Must be 0 rows.
SELECT * FROM public.zz_diag_m3a_events WHERE label NOT LIKE 'persona\_%';
SELECT count(*) AS direct_table_rows_must_be_zero FROM public.zz_diag_m3a_direct;

-- 4. Distinct transactions per backend pid (shows connection reuse; each xid is
--    its own request transaction).
SELECT backend_pid, count(*) AS requests, count(DISTINCT observed_xid) AS distinct_xids
FROM public.zz_diag_m3a_events GROUP BY backend_pid ORDER BY requests DESC;
