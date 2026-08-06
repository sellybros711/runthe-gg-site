-- ============================================================================
-- ps-runs-summary.sql — where players actually land, straight from the board
-- ============================================================================
-- Paste into the Supabase SQL Editor and run. Read-only; nothing is written.
--
-- The final-game curve is tuned around a MODEL of where runs finish: rosters drafted
-- through the real wheel in the simulator, median 88.8 overall, a third of good runs
-- between 90 and 95, 93% below 95. That model put the pivot at 95. These queries say
-- whether the model was right, using team_rating, which is the same quantity the
-- engine reads (squad_fppg * chemistry * structure).
--
-- Drop the `and daily = false` from any query to include daily-challenge runs.
-- ----------------------------------------------------------------------------

-- 1. THE SHAPE OF THE PLAYER BASE ────────────────────────────────────────────
-- Does the pivot at 95 sit where people actually are?
select
  count(*)                                                             as runs,
  round(min(team_rating), 1)                                           as min,
  round(percentile_cont(0.25) within group (order by team_rating)::numeric, 1) as p25,
  round(percentile_cont(0.50) within group (order by team_rating)::numeric, 1) as median,
  round(percentile_cont(0.75) within group (order by team_rating)::numeric, 1) as p75,
  round(percentile_cont(0.90) within group (order by team_rating)::numeric, 1) as p90,
  round(percentile_cont(0.99) within group (order by team_rating)::numeric, 1) as p99,
  round(max(team_rating), 1)                                           as max,
  round(100.0 * avg((team_rating <  90)::int), 1)                      as pct_under_90,
  round(100.0 * avg((team_rating >= 90 and team_rating < 95)::int), 1) as pct_90_to_95,
  round(100.0 * avg((team_rating >= 95)::int), 1)                      as pct_95_plus
from ps_runs
where team_rating is not null
  and daily = false;


-- 2. OUTCOMES BY BAND ────────────────────────────────────────────────────────
-- The main event. title_pct here is the real version of the number the simulator
-- projected; if the two disagree, the projection needs re-basing.
select
  band,
  runs,
  round(100.0 * runs / sum(runs) over (), 1) as share_pct,
  playoff_pct,
  title_pct,
  perfect_pct,
  avg_regular_wins
from (
  select
    case
      when team_rating <  84 then '<84'
      when team_rating <  88 then '84-88'
      when team_rating <  90 then '88-90'
      when team_rating <  92 then '90-92'
      when team_rating <  94 then '92-94'
      when team_rating <  96 then '94-96'
      when team_rating < 100 then '96-100'
      when team_rating < 105 then '100-105'
      else                        '105+'
    end as band,
    case
      when team_rating <  84 then 0 when team_rating <  88 then 1
      when team_rating <  90 then 2 when team_rating <  92 then 3
      when team_rating <  94 then 4 when team_rating <  96 then 5
      when team_rating < 100 then 6 when team_rating < 105 then 7
      else 8
    end as sort_key,
    count(*)                                    as runs,
    round(100.0 * avg(made_playoffs::int), 2)   as playoff_pct,
    round(100.0 * avg(title_won::int), 3)       as title_pct,
    round(100.0 * avg(perfect::int), 4)         as perfect_pct,
    round(avg(regular_wins), 2)                 as avg_regular_wins
  from ps_runs
  where team_rating is not null
    and daily = false
  group by 1, 2
) t
order by sort_key;


-- 3. RE-SPINS ────────────────────────────────────────────────────────────────
-- The simulator concluded re-spins are a net loss (three of them cost $30M of a $140M
-- cap) and that ~89 is therefore the practical ceiling. If players re-spin often AND
-- finish high, that conclusion is wrong and the ceiling is higher than modelled.
select
  respins,
  count(*)                                       as runs,
  round(100.0 * count(*) / sum(count(*)) over (), 1) as share_pct,
  round(avg(team_rating), 1)                     as avg_overall,
  round(100.0 * avg(title_won::int), 3)          as title_pct
from ps_runs
where team_rating is not null
  and daily = false
group by respins
order by respins;
