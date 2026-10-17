-- ---------------------------------------------------------------------------
-- 150_putt_lives_spares.sql : a spare life from the trails fills a heart.
--
-- Safe to run more than once. Needs 146_putt_lives_nine.sql.
--
-- The owner's call (2026-10-17): a spare life picked up on a Putt Putt trail goes
-- straight into the hearts whenever they are below the max, and only a spare
-- picked up with the hearts full is kept for later. It supersedes "a spare is
-- banked and spent from the out of lives sheet as an extra heart".
--
-- Spares are found on the device (the Tour record's st.bank, one id a spare,
-- 'life:<hole>'). A signed in player's lives are this table's, so a spare fills
-- one here: putt_lives_spare() files the spare's id once an account, and only
-- then hands a life back. Two devices holding the same spare both ask, and the
-- second is told it was used, with nothing given.
--
-- WHAT A SPARE DOES. It cancels the clock of the one lost life due back LAST,
-- the same way a bought life does (149), so whatever is still on a clock comes
-- back as soon as it would have, and lives stay the max less what is still on a
-- clock. A buy afterwards sees the right number missing. With the hearts full
-- there is no clock to cancel, so nothing is filed and the spare stays the
-- device's.
--
-- An id is not checked against the trails, which this file cannot see. The
-- pattern holds an account to 1,000 ids, and each fills one heart once.
-- ---------------------------------------------------------------------------

create table if not exists public.putt_lives_spares (
  user_id    uuid not null references auth.users(id) on delete cascade,
  spare_id   text not null check (spare_id ~ '^life:[0-9]{1,3}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, spare_id)
);

alter table public.putt_lives_spares enable row level security;
-- No policy and no grant: a browser writes only through the function.
revoke all on public.putt_lives_spares from anon, authenticated;

-- fill one heart from the spare p_spare. used is true when the spare is spent:
-- now, or already (by this device or another). False only with the hearts full.
create or replace function public.putt_lives_spare(p_max int default 9, p_spare text default null)
returns table (lives int, refill_at timestamptz, max_lives int, back_at timestamptz[], used boolean)
language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  r    record;
  kept timestamptz[];
  n    int;
  done boolean;
begin
  if uid is null then raise exception 'sign in to keep lives'; end if;
  if p_spare is null or p_spare !~ '^life:[0-9]{1,3}$' then raise exception 'not a spare life'; end if;
  -- creates the row if missing, brings back lives whose time has come, and holds the row's lock
  select * into r from putt_lives_state(p_max, null);
  done := exists (select 1 from putt_lives_spares s where s.user_id = uid and s.spare_id = p_spare);
  if not done and r.lives < r.max_lives then
    insert into putt_lives_spares (user_id, spare_id) values (uid, p_spare) on conflict do nothing;
    if found then
      -- r.back_at is soonest first, so the last entry is the clock due back last
      n    := coalesce(array_length(r.back_at, 1), 0);
      kept := case when n > 1 then r.back_at[1:n - 1] else '{}'::timestamptz[] end;
      update putt_lives pl
         set back_at    = kept,
             lives      = greatest(0, r.max_lives - coalesce(array_length(kept, 1), 0)),
             refill_at  = kept[1],
             updated_at = now()
       where pl.user_id = uid;
    end if;
    done := true;
  end if;
  return query select s.lives, s.refill_at, s.max_lives, s.back_at, done from putt_lives_state(p_max, null) s;
end $$;

revoke all on function public.putt_lives_spare(int, text) from public;
grant execute on function public.putt_lives_spare(int, text) to authenticated;
