-- 61_runtour_board_perf.sql
-- ============================================================================
-- LEADERBOARD PERFORMANCE: stop the season/career boards from reading the big
-- jsonb columns (skills, look) for EVERY row on every board open.
-- ============================================================================
-- Root cause of the "all leaderboards spin forever" outage: the free Nano
-- compute ran out of Disk IO budget. The season_board / career_board RPCs
-- (from 60_) pulled `skills` and `look` (jsonb, stored in TOAST) into the
-- ranking CTE for the WHOLE runtour_scores table before applying LIMIT, so
-- each board open did a full-table TOAST read + a disk sort. On a 256 MB Nano
-- that thrashes disk and the queries never return.
--
-- Fix (identical output, far less IO):
--   1) Rank on the cheap SCALAR columns only, LIMIT to the top-N, and join back
--      to fetch skills/look for ONLY those N rows (TOAST reads drop from
--      "all rows" to "N rows").
--   2) Add a created_at index so the Today / This-week (p_since) windows do an
--      index range scan instead of a full-table filter.
-- Sort-column indexes (earnings/net/wins/majors/ovr/rep/followers, and
-- (user_id,career_id)) already exist from 22/39/48/60, so the ORDER BY is index-
-- backed once the jsonb bloat is out of the sort set.
--
-- Safe + idempotent. Redefines only runtour_season_board / runtour_career_board;
-- signatures + return shapes are byte-for-byte the same as 60_, so no client
-- change is required. Run AFTER 60_runtour_board_dedup_circuit.sql.
-- ============================================================================

-- ---- created_at index for the date-scoped windows (Today / This week) ----
create index if not exists runtour_scores_created_idx
  on public.runtour_scores (created_at);

-- ============================================================================
-- SEASON BOARD  — rank scalars, limit, then fetch jsonb for the top-N only
-- ============================================================================
create or replace function public.runtour_season_board(
    p_limit int default 100, p_sort text default 'earnings', p_dir text default 'desc',
    p_since timestamptz default null)
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              ovr int, year int, season_earnings bigint, season_net bigint, wins int, majors int,
              rep_pts int, skills jsonb, followers bigint, look jsonb)
language sql stable security definer set search_path = public as $$
  with ranked as (        -- SCALAR columns only (no skills/look) -> tiny rows, no TOAST
    select s.id, s.user_id, s.display_name, s.golfer_name, s.ovr, s.year,
           s.season_earnings, s.season_net, s.wins, s.majors, s.rep_pts, s.followers,
      (case lower(coalesce(p_sort,'earnings'))
         when 'net'     then s.season_net::numeric
         when 'wins'    then s.wins::numeric
         when 'majors'  then s.majors::numeric
         when 'ovr'     then s.ovr::numeric
         when 'rep'     then s.rep_pts::numeric
         when 'fans'    then s.followers::numeric
         else                s.season_earnings::numeric
       end) as sortk
    from runtour_scores s
    where (p_since is null or s.created_at >= p_since)
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
         sc.skills, t.followers, sc.look
  from top t
  join runtour_scores sc on sc.id = t.id      -- jsonb fetched for the N rows only
  order by (case when lower(coalesce(p_dir,'desc'))='asc' then -t.rank else t.rank end);
$$;

-- ============================================================================
-- CAREER BOARD  — aggregate scalars, rank, limit, then fetch the latest
-- golfer_name/skills/look per returned career via a lateral (top-N only)
-- ============================================================================
create or replace function public.runtour_career_board(
    p_limit int default 100, p_sort text default 'earnings', p_dir text default 'desc',
    p_since timestamptz default null)
returns table(rank int, user_id uuid, display_name text, golfer_name text, seasons int,
              career_earnings bigint, career_net bigint, wins int, majors int, rep_pts int, skills jsonb, followers bigint, look jsonb)
language sql stable security definer set search_path = public as $$
  with per_career as (    -- scalar aggregates only (no jsonb array_agg over the whole table)
    select s.user_id,
           coalesce(s.career_id, 'legacy:'||s.id::text)   as cid,
           max(s.display_name)                            as display_name,
           count(*)::int                                  as seasons,
           sum(s.season_earnings)::bigint                 as career_earnings,
           sum(s.season_net)::bigint                      as career_net,
           sum(s.wins)::int                               as wins,
           sum(s.majors)::int                             as majors,
           max(s.followers)::bigint                       as followers
    from runtour_scores s
    where (p_since is null or s.created_at >= p_since)
    group by s.user_id, coalesce(s.career_id, 'legacy:'||s.id::text)
  ), urep as ( select user_id, max(rep_pts) as rep_pts from runtour_scores group by user_id ),
  joined as (
    select pc.*, coalesce(u.rep_pts,0) as rep_pts,
      (case lower(coalesce(p_sort,'earnings'))
         when 'net'     then pc.career_net::numeric
         when 'wins'    then pc.wins::numeric
         when 'majors'  then pc.majors::numeric
         when 'seasons' then pc.seasons::numeric
         when 'rep'     then coalesce(u.rep_pts,0)::numeric
         when 'fans'    then pc.followers::numeric
         else                pc.career_earnings::numeric
       end) as sortk
    from per_career pc left join urep u on u.user_id = pc.user_id
  ), numbered as (
    select (row_number() over (order by sortk desc, career_earnings desc))::int as rank, joined.*
    from joined
  ), top as (        -- pick the N careers (scalar only) BEFORE touching any jsonb.
    select * from numbered   -- desc -> top-N; asc -> bottom-N (true worst, CS95)
    order by (case when lower(coalesce(p_dir,'desc'))='asc' then -rank else rank end)
    limit greatest(1, least(500, coalesce(p_limit, 100)))
  )
  select t.rank, t.user_id, t.display_name, lat.golfer_name, t.seasons,
         t.career_earnings, t.career_net, t.wins, t.majors, t.rep_pts,
         lat.skills, t.followers, lat.look
  from top t
  cross join lateral (            -- latest season of THIS career WITHIN the window, N rows only
    select s2.golfer_name, s2.skills, s2.look
    from runtour_scores s2
    where s2.user_id is not distinct from t.user_id
      and coalesce(s2.career_id, 'legacy:'||s2.id::text) = t.cid
      and (p_since is null or s2.created_at >= p_since)
    order by s2.year desc, s2.id desc
    limit 1
  ) lat
  order by (case when lower(coalesce(p_dir,'desc'))='asc' then -t.rank else t.rank end);
$$;

grant execute on function public.runtour_season_board(int,text,text,timestamptz) to anon, authenticated;
grant execute on function public.runtour_career_board(int,text,text,timestamptz) to anon, authenticated;
