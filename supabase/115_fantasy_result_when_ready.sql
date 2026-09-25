-- ---------------------------------------------------------------------------
-- 115_fantasy_result_when_ready.sql : nobody is told how the week went until the
-- winner's code exists
--
--   psql ... -f supabase/115_fantasy_result_when_ready.sql
--
-- Needs 109, 110 and 114. Restates `fantasy_my_result` and nothing else, with the
-- same arguments and the same return columns, so `create or replace` is enough and
-- no page has to change what it reads.
--
-- THE RESULT WAITS FOR THE PRIZE, AND IT WAITS FOR EVERYBODY.
-- ---------------------------------------------------------------------------
-- Asked for by the site's owner, on seeing the flow end to end. Under 114 the popup
-- answered the moment a week was marked scored, and the code arrived whenever somebody
-- minted it. That left a gap with a player in it: the winner could open the page inside
-- that gap, be told "1st, you won the week" with no code on the sheet, and close it. The
-- sheet shows ONCE, so the code then lived only behind the result card on the home screen,
-- which is a prize a winner has to go looking for.
--
-- So a week is not over for the popup until its first place row has left `none`. That is
-- the one moment every answer on the sheet is final: the place, the field, the score, and
-- for one reader the code.
--
-- IT HOLDS BACK SECOND, THIRD AND EVERYBODY ELSE TOO, deliberately. The alternative is the
-- field hearing the result before the winner has their prize, which is the same promise
-- broken from the other side, and it would put two different "is this week over" answers on
-- one screen.
--
-- `void` COUNTS AS READY. A week with one entrant is settled but not paid (see
-- `scripts/stripe/mint-winner-code.mjs`), and without this that week's lone entrant would
-- never be told anything at all. `redeemed` counts for the obvious reason: the code existed.
--
-- WHAT IT COSTS IS A SILENT POPUP IF MINTING FAILS. That is the right way round, because a
-- failed mint turns `fantasy-live.yml` red, which somebody sees, where a winner shown a
-- sheet with no code on it is something nobody sees except the winner.
-- ---------------------------------------------------------------------------

create or replace function public.fantasy_my_result(p_season int, p_week int)
returns table (
  entered boolean, place int, entries int, score numeric, projected numeric,
  prize_place int, promo_code text, seen boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_scored timestamptz;
begin
  if v_user is null then return; end if;

  select w.scored_at into v_scored from public.fantasy_weeks w
   where w.season = p_season and w.week = p_week;
  if v_scored is null then return; end if;

  /* THE ONE NEW CLAUSE. Settled and paid, or settled and deliberately not paid. Anything
     else is a week whose result is not ready to be told to anybody. */
  if not exists (select 1 from public.fantasy_prizes pz
                  where pz.season = p_season and pz.week = p_week and pz.place = 1
                    and pz.promo_state in ('minted', 'redeemed', 'void')) then
    return;
  end if;

  return query
  with mine as (
    select e.id, e.projected, e.result_seen_at
      from public.fantasy_entries e
     where e.season = p_season and e.week = p_week and e.user_id = v_user
  ), all_rows as (
    select e.id,
           (select coalesce(sum(r.half_ppr), 0)
              from unnest(e.picks) pid
              left join public.fantasy_results r
                on r.season = e.season and r.week = e.week and r.player_id = pid) as score
      from public.fantasy_entries e
     where e.season = p_season and e.week = p_week
  ), ranked as (
    /* The board's ordering, and the same tiebreak: score descending, earlier entry first. */
    select a.id, a.score, (row_number() over (order by a.score desc, a.id asc))::int as place
      from all_rows a
  )
  select true,
         r.place,
         (select count(*)::int from all_rows),
         r.score,
         m.projected,
         pz.place,
         /* THE CODE IS HANDED TO ITS OWNER AND TO NOBODY ELSE. Unchanged from 114. */
         case when pz.user_id = v_user then pz.promo_code else null end,
         (m.result_seen_at is not null)
    from mine m
    join ranked r on r.id = m.id
    left join public.fantasy_prizes pz
      on pz.season = p_season and pz.week = p_week and pz.user_id = v_user;
end;
$$;

grant execute on function public.fantasy_my_result(int,int) to authenticated;

notify pgrst, 'reload schema';
