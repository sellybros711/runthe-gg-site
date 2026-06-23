-- audit_suspicious.sql  —  READ-ONLY. Scans the leaderboard for suspicious rows.
-- Run in the Supabase SQL editor. Nothing is modified.
--
-- How it works: submit_draft() is the only legit way to post a score, and it
-- RECOMPUTES the overall from the squad's real ratings. This query repeats that
-- exact computation from each row's player_ids and compares it to the stored
-- value. Any mismatch means the row was NOT produced by submit_draft (i.e.
-- inserted/edited directly = a forgery). It also flags structural impossibilities
-- (wrong squad size, duplicate or unknown players, out-of-range progress).

with agg as (
  select
    d.id, d.name, d.user_id, d.overall as stored_overall, d.progress,
    d.draft_type, d.mode, d.created_at,
    cardinality(d.player_ids)                                              as n_ids,
    cardinality(array(select distinct unnest(d.player_ids)))               as n_distinct,
    count(w.player_id)                                                     as n_found,
    avg(w.wc_overall)                                                      as v_avg,
    count(*) filter (where w.wc_overall >= 99)                            as v_num99,
    count(*) filter (where w.is_captain)                                  as v_caps,
    coalesce(sum(coalesce(array_length(string_to_array(nullif(w.award,''),'|'),1),0)),0) as v_awards
  from drafts d
  left join lateral unnest(d.player_ids) as pid on true
  left join wc_players w on w.player_id = pid
  group by d.id
),
calc as (
  select *,
    round( round(v_avg + v_num99*0.15, 1) * (power(1.005, v_caps) * power(1.02, v_awards)), 1) as recomputed_overall
  from agg
)
select
  id, name, user_id, stored_overall, recomputed_overall,
  round(stored_overall - recomputed_overall, 1) as diff,
  progress, draft_type, n_ids, n_distinct, n_found, created_at,
  array_remove(array[
    case when n_ids <> n_found                              then 'unknown_player_ids' end,
    case when n_ids <> n_distinct                           then 'duplicate_players'  end,
    case when draft_type = 'full'  and n_ids <> 11          then 'bad_size_full'       end,
    case when draft_type <> 'full' and n_ids <> 6           then 'bad_size_quick'      end,
    case when progress < 0 or progress > 6                  then 'bad_progress'        end,
    case when abs(coalesce(stored_overall,0) - coalesce(recomputed_overall,0)) > 0.15
                                                            then 'score_mismatch'      end
  ], null) as flags
from calc
where n_ids <> n_found
   or n_ids <> n_distinct
   or (draft_type = 'full'  and n_ids <> 11)
   or (draft_type <> 'full' and n_ids <> 6)
   or progress < 0 or progress > 6
   or abs(coalesce(stored_overall,0) - coalesce(recomputed_overall,0)) > 0.15
order by abs(coalesce(stored_overall,0) - coalesce(recomputed_overall,0)) desc nulls last,
         stored_overall desc
limit 200;
