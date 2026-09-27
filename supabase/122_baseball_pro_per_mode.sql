-- ---------------------------------------------------------------------------
-- 122_baseball_pro_per_mode.sql : one free play of EACH extra mode a day
--
--   psql ... -f supabase/122_baseball_pro_per_mode.sql
--
-- Needs 121. Safe to run more than once.
--
-- THE RULE CHANGED BACK, and this file is the change. 121 shipped one token a
-- day shared by all six modes: play Eras and every one of the six was shut. The
-- owner's call after it went live (2026-09) is one play of each: an Era, an
-- All-Time Staff, a One Franchise, a Division, a Cap Survivor and a Trade
-- Machine, every Eastern day. Pro still removes the limit.
--
-- THE PRIMARY KEY IS THE WHOLE RULE, so the key is all that moves. Under 121 it
-- was (user_id, day), which refuses a second row of any mode; here it is
-- (user_id, mode, day), which refuses only a second row of the same one.
-- rtd_mode_spend inserts with `on conflict do nothing` and counts the row, so it
-- needs no change: the conflict it detects is whatever the key says.
-- rtd_mode_state already answers the list of modes played today.
--
-- Rows 121 wrote are one per player per day and are valid under the wider key,
-- so nothing is deleted.
-- ---------------------------------------------------------------------------

do $$
declare
  v_cols text;
begin
  select string_agg(a.attname, ',' order by k.ord)
    into v_cols
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
   where c.conrelid = 'public.rtd_mode_plays'::regclass and c.contype = 'p';
  if v_cols is distinct from 'user_id,mode,day' then
    alter table public.rtd_mode_plays drop constraint if exists rtd_mode_plays_pkey;
    alter table public.rtd_mode_plays add constraint rtd_mode_plays_pkey primary key (user_id, mode, day);
  end if;
end $$;
