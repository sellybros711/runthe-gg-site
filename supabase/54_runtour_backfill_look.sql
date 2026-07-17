-- ============================================================================
-- 54_runtour_backfill_look.sql — retro-fill a player's golfer onto their old rows
-- ============================================================================
-- Migrations 52/53 added the `look` column but left every PRE-existing score with
-- look=null (which renders the generic default golfer). This adds a one-shot RPC
-- the client calls on the first sign-in after the migration: it stamps the caller's
-- CURRENT profile look onto all of THEIR OWN rows that still have no look, across
-- both the season/career board (runtour_scores) and the daily/weekly board
-- (runtour_daily_scores). So a returning player's old entries show their real
-- golfer instead of the placeholder.
--
-- Safety: SECURITY DEFINER but scoped hard to auth.uid() — a caller can only ever
-- touch their own rows, and only rows where look IS NULL (never overwrites a look
-- already saved by a post-migration submission). Idempotent (a second call updates
-- 0 rows). Returns the number of rows filled.
-- Apply in the Supabase SQL editor AFTER 52 and 53. Idempotent.
-- ----------------------------------------------------------------------------

create or replace function public.runtour_backfill_look(p_look jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_n   int  := 0;
  v_m   int;
begin
  if v_uid is null or p_look is null then
    return 0;
  end if;
  update public.runtour_scores set look = p_look
    where user_id = v_uid and look is null;
  get diagnostics v_m = row_count;  v_n := v_n + v_m;
  update public.runtour_daily_scores set look = p_look
    where user_id = v_uid and look is null;
  get diagnostics v_m = row_count;  v_n := v_n + v_m;
  return v_n;
end; $$;

grant execute on function public.runtour_backfill_look(jsonb) to authenticated;
