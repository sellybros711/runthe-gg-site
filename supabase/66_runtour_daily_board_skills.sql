-- ============================================================================
-- 66_runtour_daily_board_skills.sql — daily board returns each row's SKILLS
-- ============================================================================
-- Owner: the Course Records today's-board rows should show "the archetype to
-- the right of the overall". The archetype is derived client-side from the full
-- 8-skill build, which runtour_daily_scores has stored since 24_ (p_skills on
-- every submit) but runtour_daily_board never returned. This appends `skills`
-- to the board's return shape (drop + recreate — return-type change; deployed
-- clients read fields by name, so the extra column is harmless).
--
-- Body otherwise identical to 53_ (look + legend/spotlight filters). The board
-- is day-scoped (≤200 rows), so returning one more jsonb per row is cheap —
-- no relation to the 61_ full-table TOAST concern. Safe + idempotent.
-- Run AFTER 53.
-- ============================================================================

drop function if exists public.runtour_daily_board(int,int,boolean,boolean);

create or replace function public.runtour_daily_board(
  p_day int, p_limit int default 50, p_legend boolean default false, p_spotlight boolean default false)
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              course_key text, ovr int, to_par int, won boolean, look jsonb, skills jsonb)
language sql stable security definer set search_path = public as $$
  select (row_number() over (order by s.to_par asc, s.created_at asc))::int as rank,
         s.user_id, s.display_name, s.golfer_name, s.course_key, s.ovr, s.to_par, s.won, s.look, s.skills
  from public.runtour_daily_scores s
  where s.day = p_day
    and s.is_legend    = coalesce(p_legend, false)
    and s.is_spotlight = coalesce(p_spotlight, false)
  order by s.to_par asc, s.created_at asc
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;

grant execute on function public.runtour_daily_board(int,int,boolean,boolean) to anon, authenticated;
