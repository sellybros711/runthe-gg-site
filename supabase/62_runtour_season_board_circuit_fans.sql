-- 62_runtour_season_board_circuit_fans.sql
-- ============================================================================
-- SINGLE SEASON board: (1) exclude Legend Circuit seasons, (2) Fans = fans
-- GAINED that season (not the career running total).
-- ============================================================================
-- (1) CIRCUIT EXCLUSION. Since 60_, finished Legend Circuit seasons post to the
--     board under the same career_id (years 31-42) so the CAREER board can
--     aggregate them (owner: "the Legend Circuit should be included in career
--     stats"). But on the SINGLE SEASON board they read as impossible tour
--     seasons (a circuit year has 5 circuit majors + up to 3 past-champion
--     guest majors = up to 8 majors and ~18 events vs a weak retired-alumni
--     field, e.g. the reported "15 wins / 7 majors" rows). A tour career is
--     capped at 30 years (CAREER_MAX_YEARS), so `year <= 30` cleanly separates
--     tour seasons from circuit seasons. The CAREER board still counts every
--     row (tour + circuit), unchanged.
-- (2) FANS GAINED. The client submits the career's RUNNING fan total with each
--     season, so the season board previously ranked "total fans at the end of
--     that season" (a year-29 row always dwarfs a year-2 row). The per-season
--     GAIN is derived here from the data we already have:
--        gain = row.followers - (the same career's previous posted season's
--                                followers), floored at 0
--     via lag() over (user_id, career_id, year). A career's FIRST posted
--     season's gain = its total (all fans gained since debut). This fixes
--     every legacy row retroactively and needs NO client change; the CAREER
--     board keeps max(followers) = the career's true total.
--     (A fan-losing season floors at 0. Rows with no career grouping - guests /
--      legacy null career_id - fall back to gain 0 via the same floor when the
--      partition lumps them; guest rows carry followers 0 anyway.)
--
-- Safe + idempotent: redefines ONLY runtour_season_board (same signature +
-- return shape as 61_, so no client change). runtour_career_board untouched.
-- Run AFTER 61_runtour_board_perf.sql.
-- ============================================================================

create or replace function public.runtour_season_board(
    p_limit int default 100, p_sort text default 'earnings', p_dir text default 'desc',
    p_since timestamptz default null)
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              ovr int, year int, season_earnings bigint, season_net bigint, wins int, majors int,
              rep_pts int, skills jsonb, followers bigint, look jsonb)
language sql stable security definer set search_path = public as $$
  with gains as (          -- per-season fan GAIN, derived from the running totals (scalar cols only)
    select s.id, s.user_id, s.display_name, s.golfer_name, s.ovr, s.year,
           s.season_earnings, s.season_net, s.wins, s.majors, s.rep_pts, s.created_at,
           greatest(0::bigint,
             coalesce(s.followers,0)
             - coalesce(lag(s.followers) over (partition by s.user_id, s.career_id
                                               order by coalesce(s.year,1), s.id), 0)
           ) as fol_gain
    from runtour_scores s
    where coalesce(s.year, 1) <= 30      -- tour seasons only; Legend Circuit years (31+) stay off THIS board
  ), ranked as (
    select g.*,
      (case lower(coalesce(p_sort,'earnings'))
         when 'net'     then g.season_net::numeric
         when 'wins'    then g.wins::numeric
         when 'majors'  then g.majors::numeric
         when 'ovr'     then g.ovr::numeric
         when 'rep'     then g.rep_pts::numeric
         when 'fans'    then g.fol_gain::numeric
         else                g.season_earnings::numeric
       end) as sortk
    from gains g
    where (p_since is null or g.created_at >= p_since)
  ), numbered as (
    select (row_number() over (order by sortk desc, season_earnings desc, id))::int as rank, ranked.*
    from ranked
  ), top as (        -- pick the N rows (scalar only) BEFORE touching any jsonb.
    select * from numbered   -- desc -> top-N; asc -> bottom-N (true worst, CS95)
    order by (case when lower(coalesce(p_dir,'desc'))='asc' then -rank else rank end)
    limit greatest(1, least(500, coalesce(p_limit, 100)))
  )
  select t.rank, t.user_id, t.display_name, t.golfer_name, t.ovr, t.year,
         t.season_earnings, t.season_net, t.wins, t.majors, t.rep_pts,
         sc.skills, t.fol_gain as followers, sc.look
  from top t
  join runtour_scores sc on sc.id = t.id      -- jsonb fetched for the N rows only
  order by (case when lower(coalesce(p_dir,'desc'))='asc' then -t.rank else t.rank end);
$$;

grant execute on function public.runtour_season_board(int,text,text,timestamptz) to anon, authenticated;

-- NOTE: the fan-gain lag runs over the FULL career history (unwindowed) so a
-- Today/This-week row's gain is still measured against its own previous season,
-- not whatever happens to be inside the window.
