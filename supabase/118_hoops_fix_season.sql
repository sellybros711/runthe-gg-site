-- ===========================================================================
-- 118_hoops_fix_season.sql
-- Fix History files a SEASON of trades: four windows up to the deadline, and
-- in each one at most one trade of up to three players and any picks out for
-- one to three players back.
--
--   psql -d <db> -f supabase/118_hoops_fix_season.sql       after 116 and 117
--
-- A THIRD SUBMIT BESIDE THE OTHER TWO, for the reason 117 gives: a page cached
-- from before this change still calls rtf_submit_trade or rtf_submit_fix with
-- their shapes, so both stay and this adds rtf_submit_fix_season. All three
-- write mode 'fix', so one board ranks them and the one-a-day index holds.
--
-- WHAT THE SERVER CAN CHECK, IT CHECKS: the day; at most four trades, one a
-- window, windows 0 to 3 in order; each trade one to three out, one to three
-- in, nobody twice; every partner a different club in the same season; every
-- man taken back wearing the partner's code; every man sent out either on the
-- team or taken back by an earlier trade and not sent away since; every pick
-- one of the team's own five and never sent twice. What it cannot check is the
-- salary rule, the fair value rule and the odds, because the prices and the
-- thousand seasons are not in the database, which is 108's position on a
-- season's record.
--
-- The headline is the dearest man taken back all season, which the page knows
-- and the database does not. It must be one of the men taken back. It goes in
-- fix_in so the count of who else traded for him still reads.
--
-- Safe to run twice.
-- ===========================================================================

alter table rtf_plays add column if not exists fix_trades jsonb;

create or replace function rtf_submit_fix_season(
  p_day int, p_ts text, p_trades jsonb, p_headline text,
  p_odds numeric, p_base numeric, p_replay_wins int, p_replay_title boolean
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_id bigint;
  v_club text;
  v_season int;
  v_n int;
  v_t jsonb;
  v_k text;
  v_w int;
  v_last int := -1;
  v_with text;
  v_mine text[] := '{}';
  v_picks text[] := '{}';
  v_ins text[] := '{}';
  v_outs text[];
  v_tin text[];
  v_tpk text[];
begin
  if not rtf_play_day_ok(p_day) then
    raise exception 'day % is not close enough to today (day %)', p_day, rtf_play_today();
  end if;
  if p_ts is null or p_ts !~ '^[A-Z]{2,4}_[0-9]{4}$' then raise exception 'team looks wrong'; end if;
  v_club := split_part(p_ts, '_', 1);
  v_season := split_part(p_ts, '_', 2)::int;
  if p_trades is null or jsonb_typeof(p_trades) <> 'array' then raise exception 'trades must be a list'; end if;
  v_n := jsonb_array_length(p_trades);
  if v_n > 4 then raise exception 'four trades at most'; end if;
  if p_odds is null or p_odds < 0 or p_odds > 1 then raise exception 'odds must be 0 to 1'; end if;
  if p_base is null or p_base < 0 or p_base > 1 then raise exception 'base odds must be 0 to 1'; end if;
  if p_replay_wins is not null and (p_replay_wins < 0 or p_replay_wins > 82) then
    raise exception 'replay wins must be 0 to 82';
  end if;

  for v_t in select value from jsonb_array_elements(p_trades) loop
    if jsonb_typeof(v_t) <> 'object' then raise exception 'a trade looks wrong'; end if;
    v_w := (v_t->>'w')::int;
    if v_w is null or v_w < 0 or v_w > 3 or v_w <= v_last then raise exception 'one trade a window, windows 0 to 3 in order'; end if;
    v_last := v_w;
    v_with := v_t->>'with';
    if v_with is null or v_with !~ '^[A-Z]{2,4}_[0-9]{4}$' then raise exception 'partner looks wrong'; end if;
    if split_part(v_with, '_', 2)::int <> v_season then raise exception 'the partner is from another season'; end if;
    if split_part(v_with, '_', 1) = v_club then raise exception 'a club cannot trade with itself'; end if;
    v_outs := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_t->'outs', '[]')) x), '{}');
    v_tin := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_t->'ins', '[]')) x), '{}');
    v_tpk := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_t->'picks', '[]')) x), '{}');
    if cardinality(v_outs) < 1 or cardinality(v_outs) > 3 then raise exception 'one to three players out'; end if;
    if cardinality(v_tin) < 1 or cardinality(v_tin) > 3 then raise exception 'one to three players in'; end if;
    if (select count(distinct x) from unnest(v_outs) x) <> cardinality(v_outs)
       or (select count(distinct x) from unnest(v_tin) x) <> cardinality(v_tin) then
      raise exception 'the same man twice';
    end if;
    foreach v_k in array v_outs loop
      if v_k !~ '^[a-z0-9.''-]{2,16}\|[0-9]{4}\|[A-Z]{2,4}$' then raise exception 'traded player looks wrong'; end if;
      if split_part(v_k, '|', 2)::int <> v_season then raise exception 'a man sent out is from another season'; end if;
      -- On the team to start with, or taken back earlier and still here.
      if not (split_part(v_k, '|', 3) = v_club and not (v_k = any(v_mine)))
         and not (v_k = any(v_ins)) then
        raise exception 'a man sent out is not on the team';
      end if;
      v_mine := v_mine || v_k;           -- gone now, and cannot go twice
      v_ins := array_remove(v_ins, v_k);
    end loop;
    foreach v_k in array v_tin loop
      if v_k !~ '^[a-z0-9.''-]{2,16}\|[0-9]{4}\|[A-Z]{2,4}$' then raise exception 'new player looks wrong'; end if;
      if split_part(v_k, '|', 2)::int <> v_season or split_part(v_k, '|', 3) <> split_part(v_with, '_', 1) then
        raise exception 'a man taken back is not on the partner';
      end if;
      if v_k = any(v_ins) then raise exception 'the same man taken twice'; end if;
      v_ins := v_ins || v_k;
    end loop;
    foreach v_k in array v_tpk loop
      if v_k !~ '^R[12]Y[0-9]{4}$' then raise exception 'pick looks wrong'; end if;
      if not ((substr(v_k, 2, 1) = '1' and substring(v_k from 4)::int between v_season + 1 and v_season + 3)
           or (substr(v_k, 2, 1) = '2' and substring(v_k from 4)::int between v_season + 1 and v_season + 2)) then
        raise exception 'not a pick this team owns';
      end if;
      if v_k = any(v_picks) then raise exception 'a pick sent twice'; end if;
      v_picks := v_picks || v_k;
    end loop;
  end loop;
  if v_n > 0 and (p_headline is null or not exists (
      select 1 from jsonb_array_elements(p_trades) t, jsonb_array_elements_text(t->'ins') x where x = p_headline)) then
    raise exception 'the headline must be a man taken back';
  end if;
  if v_n = 0 and p_headline is not null then raise exception 'no trades, no headline'; end if;

  if v_user is not null then
    select username::text into v_name from profiles where id = v_user;
    select id into v_id from rtf_plays
     where user_id = v_user and mode = 'fix' and day = p_day order by created_at limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  select id into v_id from rtf_plays
   where mode = 'fix' and day = p_day and fix_trades = p_trades
     and user_id is not distinct from v_user and created_at > now() - interval '1 minute'
   limit 1;
  if v_id is not null then return v_id; end if;

  insert into rtf_plays (user_id, display_name, mode, day, score,
    fix_ts, fix_slot, fix_out, fix_in, fix_trades, fix_odds, fix_base, replay_wins, replay_title)
  values (v_user, v_name, 'fix', p_day, round(p_odds, 4),
    p_ts, null,
    case when v_n > 0 then p_trades->0->'outs'->>0 end,
    p_headline, p_trades,
    round(p_odds, 4), round(p_base, 4), p_replay_wins, p_replay_title)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function rtf_submit_fix_season(int,text,jsonb,text,numeric,numeric,int,boolean) from public;
grant execute on function rtf_submit_fix_season(int,text,jsonb,text,numeric,numeric,int,boolean) to anon, authenticated;
