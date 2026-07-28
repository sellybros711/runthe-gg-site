-- 60_football_rank_windows.sql
--
-- Single RPC that returns rank and total for all three time windows
-- (today, this week, all time) in one call. Replaces six separate
-- count queries from the client, cutting six HTTP round trips to one.
--
-- Safe to re-run: CREATE OR REPLACE.


create or replace function ps_rank_windows(
  p_score    numeric,
  p_mode     text default 'free',
  p_franchise text default null,
  p_era      text default null,
  p_day_cut  text default null,
  p_week_cut text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mode text := lower(btrim(coalesce(p_mode, 'free')));
  v_fran text := case when v_mode = 'club'
                      then upper(btrim(p_franchise)) else null end;
  v_era  text := case when v_mode = 'era'
                      then btrim(p_era) else null end;
  v_day  timestamptz;
  v_week timestamptz;

  v_all_better  bigint;
  v_all_count   bigint;
  v_week_better bigint;
  v_week_count  bigint;
  v_day_better  bigint;
  v_day_count   bigint;
begin
  if p_day_cut is not null and p_day_cut <> '' then
    v_day := p_day_cut::timestamptz;
  end if;
  if p_week_cut is not null and p_week_cut <> '' then
    v_week := p_week_cut::timestamptz;
  end if;

  -- All time: one scan, two aggregates.
  select count(*) filter (where score > p_score),
         count(*)
    into v_all_better, v_all_count
    from ps_runs
   where run_mode = v_mode
     and display_name is not null
     and (v_fran is null or franchise = v_fran)
     and (v_era  is null or era = v_era);

  -- This week.
  if v_week is not null then
    select count(*) filter (where score > p_score),
           count(*)
      into v_week_better, v_week_count
      from ps_runs
     where run_mode = v_mode
       and display_name is not null
       and created_at >= v_week
       and (v_fran is null or franchise = v_fran)
       and (v_era  is null or era = v_era);
  end if;

  -- Today.
  if v_day is not null then
    select count(*) filter (where score > p_score),
           count(*)
      into v_day_better, v_day_count
      from ps_runs
     where run_mode = v_mode
       and display_name is not null
       and created_at >= v_day
       and (v_fran is null or franchise = v_fran)
       and (v_era  is null or era = v_era);
  end if;

  return jsonb_build_object(
    'day',  case when v_day_better is not null then jsonb_build_object(
              'rank', v_day_better + 1,
              'total', greatest(v_day_count, v_day_better + 1))
            else null end,
    'week', case when v_week_better is not null then jsonb_build_object(
              'rank', v_week_better + 1,
              'total', greatest(v_week_count, v_week_better + 1))
            else null end,
    'all',  jsonb_build_object(
              'rank', v_all_better + 1,
              'total', greatest(v_all_count, v_all_better + 1))
  );
end $$;

revoke all on function ps_rank_windows(numeric,text,text,text,text,text) from public;
grant execute on function ps_rank_windows(numeric,text,text,text,text,text)
  to anon, authenticated;

notify pgrst, 'reload schema';
