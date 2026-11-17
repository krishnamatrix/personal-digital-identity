-- ============================================================================
-- Folioone M11  |  001-featured-posts.sql  |  schema: folioone
-- Featured posts: allows the new list kind `featured_post` in folioone.identity_entries
-- (My Identity → Featured: posts, videos, articles, podcasts and talks the owner links to).
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). `pnpm validate`
--                applies it to the LOCAL stack only.
-- Prerequisites: docs/sql/milestone-4/001 executed (identity_entries exists).
-- Repeatable?:   YES (drops and re-adds one CHECK constraint).
-- Safety:        One constraint on one table. No grants, policies, functions or data changes.
--                Existing rows all satisfy the wider constraint.
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       to_regclass('folioone.identity_entries') IS NOT NULL AS m4_applied;

BEGIN;

ALTER TABLE folioone.identity_entries DROP CONSTRAINT identity_entries_kind_check;
ALTER TABLE folioone.identity_entries ADD CONSTRAINT identity_entries_kind_check
  CHECK (kind IN ('employment', 'education', 'skill', 'project', 'social_link',
                  'achievement', 'certification', 'language', 'interest', 'featured_post'));

COMMIT;

-- Read-only verification: the constraint lists featured_post.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'folioone.identity_entries'::regclass AND conname = 'identity_entries_kind_check';

-- Rollback (only while no featured_post rows exist):
-- BEGIN;
-- ALTER TABLE folioone.identity_entries DROP CONSTRAINT identity_entries_kind_check;
-- ALTER TABLE folioone.identity_entries ADD CONSTRAINT identity_entries_kind_check
--   CHECK (kind IN ('employment', 'education', 'skill', 'project', 'social_link',
--                   'achievement', 'certification', 'language', 'interest'));
-- COMMIT;
