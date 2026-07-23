-- ============================================================================
-- 64_runtour_career_fans_nonzero.sql — the career FANS board hides 0-fan careers
-- ============================================================================
-- Careers posted BEFORE the fans system exist with 0 (or null) followers. On the
-- career board's Fans sort they're meaningless legacy entries, so they're
-- excluded from THAT ONE CATEGORY only (a conditional HAVING that fires only
-- when p_sort='fans'). Every other sort still shows every career, unchanged.
-- Doing it server-side keeps ranks contiguous and makes the Low-High view show
-- the genuinely lowest real fan counts instead of a wall of legacy zeros.
--
-- Safe + idempotent: redefines ONLY runtour_career_board (same signature +
-- return shape as 61, so no client change needed). Run AFTER
-- 61_runtour_board_perf.sql (and 62/63 - order among those doesn't matter).
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
    -- the ONLY change vs 61: pre-fans legacy careers (0/null followers) are
    -- excluded from the FANS category alone; every other sort keeps them all.
    having (lower(coalesce(p_sort,'')) <> 'fans' or max(coalesce(s.followers,0)) > 0)
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

grant execute on function public.runtour_career_board(int,text,text,timestamptz) to anon, authenticated;
