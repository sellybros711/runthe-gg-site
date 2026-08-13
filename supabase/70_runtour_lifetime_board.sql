-- 70_runtour_lifetime_board.sql
-- LIFETIME LEADERBOARD (owner: "a lifetime leaderboard section where you can see all users lifetime
-- stats on a leaderboard").
--
-- One row per PLAYER, aggregating every season they have ever posted - across every career, including
-- Legend Circuit years. This is the same aggregate the player card's LIFETIME panel already shows
-- (runtour_player_card, migration 68), just for everyone at once and ranked, so a player's card and
-- their row on this board can never disagree.
--
-- Perf follows the 61_ discipline: aggregate on SCALAR columns only, rank and LIMIT on those, and only
-- then join the jsonb (the golfer look) for the handful of rows actually returned. Grouping by user_id
-- collapses the table to one row per account before anything expensive happens.
--
-- Identity: the username comes from `profiles` (live), not from the display_name frozen onto each row at
-- submit time, so a renamed player reads correctly here without needing to post a new season.
-- Guests (user_id is null) are excluded - a guest post is anonymous and can't be attributed to a person.
--
-- Run AFTER 65 (runtour_profile_look) and 68 in the Supabase SQL editor. Idempotent (create or replace).

create or replace function public.runtour_lifetime_board(
    p_limit int default 200, p_sort text default 'earnings', p_dir text default 'desc')
returns table(rank int, user_id uuid, display_name text,
              careers int, seasons int, wins int, majors int,
              earnings bigint, net bigint, best_net bigint, best_ovr int,
              followers bigint, rep_pts int, cur_look jsonb, look jsonb)
language sql stable security definer set search_path = public as $$
  with per_user as (          -- scalar aggregates only; one row per account
    select s.user_id,
           count(distinct nullif(s.career_id,''))::int   as careers,
           count(*)::int                                 as seasons,
           coalesce(sum(s.wins),0)::int                  as wins,
           coalesce(sum(s.majors),0)::int                as majors,
           coalesce(sum(s.season_earnings),0)::bigint    as earnings,
           coalesce(sum(s.season_net),0)::bigint         as net,
           coalesce(max(s.season_net),0)::bigint         as best_net,
           coalesce(max(s.ovr),0)::int                   as best_ovr,
           coalesce(max(s.followers),0)::bigint          as followers,
           coalesce(max(s.rep_pts),0)::int               as rep_pts,
           max(s.id)                                     as last_id
    from runtour_scores s
    where s.user_id is not null            -- signed-in accounts only (guest posts are anonymous)
    group by s.user_id
  ), sorted as (
    select pu.*,
      (case lower(coalesce(p_sort,'earnings'))
         when 'net'      then pu.net::numeric
         when 'wins'     then pu.wins::numeric
         when 'majors'   then pu.majors::numeric
         when 'seasons'  then pu.seasons::numeric
         when 'careers'  then pu.careers::numeric
         when 'ovr'      then pu.best_ovr::numeric
         when 'fans'     then pu.followers::numeric
         when 'rep'      then pu.rep_pts::numeric
         else                 pu.earnings::numeric
       end) as sortk
    from per_user pu
  ), numbered as (
    select (row_number() over (order by sortk desc, earnings desc, seasons desc))::int as rank, sorted.*
    from sorted
  ), top as (        -- pick the N players (scalar only) BEFORE touching any jsonb
    select * from numbered
    order by (case when lower(coalesce(p_dir,'desc'))='asc' then -rank else rank end)
    limit greatest(1, least(500, coalesce(p_limit, 200)))
  )
  select t.rank, t.user_id,
         coalesce(pr.username, lat.display_name, 'Golfer')  as display_name,
         t.careers, t.seasons, t.wins, t.majors,
         t.earnings, t.net, t.best_net, t.best_ovr,
         t.followers, t.rep_pts,
         pl.look                                            as cur_look,
         lat.look                                           as look
  from top t
  left join profiles pr             on pr.id = t.user_id
  left join runtour_profile_look pl on pl.user_id = t.user_id
  left join lateral (               -- their most recent posted season, N rows only
    select s.display_name, s.look
    from runtour_scores s
    where s.user_id = t.user_id
    order by s.id desc
    limit 1
  ) lat on true
  order by (case when lower(coalesce(p_dir,'desc'))='asc' then -t.rank else t.rank end);
$$;

grant execute on function public.runtour_lifetime_board(int, text, text) to anon, authenticated;

-- Ranking scans every posted season grouped by account, so keep that group-by cheap.
create index if not exists runtour_scores_user_idx on public.runtour_scores(user_id);
