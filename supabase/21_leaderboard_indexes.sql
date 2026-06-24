-- ============================================================================
-- 21_leaderboard_indexes.sql  —  Make the leaderboard fast (and stay fast)
-- ============================================================================
-- Symptom: a long delay loading the board after a draft, getting worse as more
-- drafts are recorded.
--
-- Cause: drafts had only one index (user_id). Every leaderboard read scans and
-- sorts the WHOLE table:
--   • board list  : ... WHERE draft_type=? [AND mode=?] ORDER BY overall DESC,
--                   progress DESC LIMIT 100        (fetchTopDrafts)
--   • your rank   : count(*) WHERE overall > ? OR (overall = ? AND progress > ?)
--                   [AND draft_type=?]             (fetchGlobalRank / fetchRankInBoard)
--   • total count : count(*) WHERE draft_type=?    (fetchAllTimeTotal)
-- With no matching index Postgres does a sequential scan + sort every time.
--
-- These indexes turn those into index scans. Inserts (one per finished game) pay
-- a negligible maintenance cost. Safe + idempotent — re-running does nothing.
--
-- If the table is large and live, you can swap each line for the non-locking
-- form: run `CREATE INDEX CONCURRENTLY ...` one statement at a time (CONCURRENTLY
-- can't run inside a transaction block, so run them individually, not as a batch).
-- ----------------------------------------------------------------------------

-- Board list + rank/count filtered by draft_type + mode (the post-draft case:
-- the entry modal opens on the exact mode/type just played).
create index if not exists drafts_board_type_mode_idx
  on drafts (draft_type, mode, overall desc, progress desc);

-- Board list + rank/count filtered by draft_type only (mode = "all" boards, the
-- all-time rank query, and the all-time total count — draft_type leads the index).
create index if not exists drafts_board_type_idx
  on drafts (draft_type, overall desc, progress desc);

-- Time-window boards (this week / today) filter on created_at.
create index if not exists drafts_created_at_idx
  on drafts (created_at);

-- Refresh planner stats so the new indexes get used right away.
analyze drafts;
