-- ===========================================================================
-- 117_hoops_trade.sql
-- Fix History files a TRADE: one or two men out to a club from the same
-- season, one or two back.
--
--   psql -d <db> -f supabase/117_hoops_trade.sql       after 116
--
-- WHY A SECOND SUBMIT RATHER THAN A CHANGE TO 116's. The first version of the
-- mode was one of the five for any man since 1974, and 116's rtf_submit_fix
-- files exactly that: a slot from 0 to 4, one out, one in. A page cached from
-- before this change still calls it with that shape, so it stays as it is and
-- this file adds rtf_submit_trade beside it. Both write mode 'fix', so one
-- board ranks both and the one-a-day index covers both.
--
-- THE OLD COLUMNS ARE STILL WRITTEN. fix_out and fix_in carry the first man of
-- each side (the dearest, which the page sorts first), so the count of who else
-- traded for a man and any reader that predates this file keep working. The
-- whole trade is in the three new columns.
--
-- WHAT THE SERVER CAN CHECK, IT CHECKS: the day, the shape of every key, one
-- or two a side, nobody twice, every man out wearing the team's club and
-- season, every man in wearing the partner's, and the partner being a
-- different club in the same season. What it cannot check is the salary rule
-- and the odds, because neither the prices nor the thousand seasons are in
-- the database. The odds are trusted within bounds, which is 108's position on
-- a season's record.
--
-- Safe to run twice.
-- ===========================================================================

alter table rtf_plays add column if not exists fix_with text;     -- the partner, 'MIL_2021'
alter table rtf_plays add column if not exists fix_outs text[];   -- every man sent, as pkeys
alter table rtf_plays add column if not exists fix_ins text[];    -- every man taken back

create or replace function rtf_submit_trade(
  p_day int, p_ts text, p_with text, p_outs text[], p_ins text[],
  p_odds numeric, p_base numeric, p_replay_wins int, p_replay_title boolean
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_id bigint;
  v_club text;
  v_season text;
  v_wclub text;
  v_k text;
  v_nout int := coalesce(array_length(p_outs, 1), 0);
  v_nin int := coalesce(array_length(p_ins, 1), 0);
begin
  if not rtf_play_day_ok(p_day) then
    raise exception 'day % is not close enough to today (day %)', p_day, rtf_play_today();
  end if;
  if p_ts is null or p_ts !~ '^[A-Z]{2,4}_[0-9]{4}$' then raise exception 'team looks wrong'; end if;
  if p_with is null or p_with !~ '^[A-Z]{2,4}_[0-9]{4}$' then raise exception 'partner looks wrong'; end if;
  v_club := split_part(p_ts, '_', 1);
  v_season := split_part(p_ts, '_', 2);
  v_wclub := split_part(p_with, '_', 1);
  if split_part(p_with, '_', 2) <> v_season then raise exception 'the partner is from another season'; end if;
  if v_wclub = v_club then raise exception 'a club cannot trade with itself'; end if;
  if v_nout < 1 or v_nout > 2 then raise exception 'one or two players out'; end if;
  if v_nin < 1 or v_nin > 2 then raise exception 'one or two players in'; end if;
  if (select count(distinct k) from unnest(p_outs) k) <> v_nout then raise exception 'the same man out twice'; end if;
  if (select count(distinct k) from unnest(p_ins) k) <> v_nin then raise exception 'the same man in twice'; end if;
  foreach v_k in array p_outs loop
    if v_k is null or v_k !~ '^[a-z0-9.''-]{2,16}\|[0-9]{4}\|[A-Z]{2,4}$' then raise exception 'traded player looks wrong'; end if;
    if split_part(v_k, '|', 2) <> v_season or split_part(v_k, '|', 3) <> v_club then
      raise exception 'a man sent out is not on the team';
    end if;
  end loop;
  foreach v_k in array p_ins loop
    if v_k is null or v_k !~ '^[a-z0-9.''-]{2,16}\|[0-9]{4}\|[A-Z]{2,4}$' then raise exception 'new player looks wrong'; end if;
    if split_part(v_k, '|', 2) <> v_season or split_part(v_k, '|', 3) <> v_wclub then
      raise exception 'a man taken back is not on the partner';
    end if;
  end loop;
  if p_odds is null or p_odds < 0 or p_odds > 1 then raise exception 'odds must be 0 to 1'; end if;
  if p_base is null or p_base < 0 or p_base > 1 then raise exception 'base odds must be 0 to 1'; end if;
  if p_replay_wins is not null and (p_replay_wins < 0 or p_replay_wins > 82) then
    raise exception 'replay wins must be 0 to 82';
  end if;

  if v_user is not null then
    select username::text into v_name from profiles where id = v_user;
    select id into v_id from rtf_plays
     where user_id = v_user and mode = 'fix' and day = p_day order by created_at limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  -- A retry after a timeout lands on the row already there.
  select id into v_id from rtf_plays
   where mode = 'fix' and day = p_day and fix_ins = p_ins and fix_outs = p_outs
     and user_id is not distinct from v_user and created_at > now() - interval '1 minute'
   limit 1;
  if v_id is not null then return v_id; end if;

  insert into rtf_plays (user_id, display_name, mode, day, score,
    fix_ts, fix_slot, fix_out, fix_in, fix_with, fix_outs, fix_ins,
    fix_odds, fix_base, replay_wins, replay_title)
  values (v_user, v_name, 'fix', p_day, round(p_odds, 4),
    p_ts, null, p_outs[1], p_ins[1], p_with, p_outs, p_ins,
    round(p_odds, 4), round(p_base, 4), p_replay_wins, p_replay_title)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function rtf_submit_trade(int,text,text,text[],text[],numeric,numeric,int,boolean) from public;
grant execute on function rtf_submit_trade(int,text,text,text[],text[],numeric,numeric,int,boolean) to anon, authenticated;
