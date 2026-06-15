-- ============================================================================
-- 01_delete_forged.sql  —  Remove forged leaderboard scores
-- ============================================================================
-- Run this in the Supabase SQL editor (it needs table-owner / service rights;
-- the public anon key cannot DELETE, which is exactly why the board was only
-- ever writable through submit_draft()).
--
-- DETECTION RATIONALE
--   • Across the first ~2,270 drafts (everything before 2026-06-10) the highest
--     score ever recorded was 93.0, and ZERO drafts ever reached 94.
--   • The physical ceiling of a legitimately *draftable* squad is ~98.8 (Quick)
--     because the dataset has no 99-rated GK and only one 99-rated DEF.
--   • On 2026-06-10 a 3-hour burst produced six scores >= 94 (incl. a 99.1 that
--     sits at/above the cherry-pick ceiling) — the signature of client-forged
--     submissions against the old, score-trusting submit_draft().
--
-- Threshold: overall >= 94. Adjust BELOW if you want a stricter/looser cut.
-- ----------------------------------------------------------------------------

-- STEP 1 — PREVIEW the rows that will be deleted. Review before deleting.
SELECT id, name, flag, overall, progress, result, furthest, mode, created_at
FROM   drafts
WHERE  overall >= 94
ORDER  BY overall DESC;

-- STEP 2 — DELETE them. Uncomment to execute after reviewing STEP 1.
-- DELETE FROM drafts WHERE overall >= 94;

-- OPTIONAL — if you'd rather quarantine than hard-delete, move them aside:
--   CREATE TABLE IF NOT EXISTS drafts_quarantine (LIKE drafts INCLUDING ALL);
--   INSERT INTO drafts_quarantine SELECT * FROM drafts WHERE overall >= 94;
--   DELETE FROM drafts WHERE overall >= 94;
