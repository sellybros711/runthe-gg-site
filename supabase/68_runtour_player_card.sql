-- 68_runtour_player_card.sql
-- PLAYER CARDS (owner): tapping a profile on any leaderboard opens that player's collectible
-- flip card; the BACK of the card shows their LIFETIME stats. This RPC returns one cheap scalar
-- aggregate row over runtour_scores for a single user (careers / seasons / wins / majors /
-- earnings / best net / best OVR / max fans / max rep). No jsonb touched, PK'd by user index,
-- so it's a tiny read (no relation to the 61_ TOAST concern).
--
-- Run AFTER 60 (dedup) in the Supabase SQL editor. Idempotent (create or replace).

create or replace function public.runtour_player_card(p_user uuid)
returns table(careers int, seasons int, wins int, majors int, earnings bigint,
              best_net bigint, best_ovr int, followers bigint, rep_pts int)
language sql stable security definer set search_path = public as $$
  select
    count(distinct nullif(s.career_id,''))::int         as careers,
    count(*)::int                                       as seasons,
    coalesce(sum(s.wins),0)::int                        as wins,
    coalesce(sum(s.majors),0)::int                      as majors,
    coalesce(sum(s.season_earnings),0)::bigint          as earnings,
    coalesce(max(s.season_net),0)::bigint               as best_net,
    coalesce(max(s.ovr),0)::int                         as best_ovr,
    coalesce(max(s.followers),0)::bigint                as followers,
    coalesce(max(s.rep_pts),0)::int                     as rep_pts
  from runtour_scores s
  where p_user is not null and s.user_id = p_user;
$$;

grant execute on function public.runtour_player_card(uuid) to anon, authenticated;
