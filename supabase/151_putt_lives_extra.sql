-- ---------------------------------------------------------------------------
-- 151_putt_lives_extra.sql : bought Putt Putt lives can go over the max.
--
-- Safe to run more than once. Needs 146_putt_lives_nine.sql and
-- 149_putt_lives_buy.sql. Run it BEFORE the page and checkout that sell over
-- the max: until it is in, the checkout cannot read `extra` and answers 503,
-- so nothing is sold that the webhook could not deliver.
--
-- The owner's call (2026-10-17): a player can buy lives at any time, and go
-- over the max if they want. Before this a pack sold only when every life in it
-- would come back off a clock (149).
--
-- EXTRA LIVES. putt_lives.extra holds bought lives above the max. They have no
-- clock and never come back once spent.
--   a buy       cancels the clocks due back last first, as before, and puts
--               whatever is left of the pack into extra
--   a lost life comes out of extra first, so no clock starts while any is held
--   the answer  putt_lives_state() answers lives = hearts + extra, so the page,
--               which already draws more hearts than the max, needs no new field
-- RE-RUNNING 146 AFTER THIS UNDOES IT. 146 redefines putt_lives_state and
-- putt_lives_spend, so extras would sit unseen and a lost life would start a
-- clock while extras are held. Run 151 again after any re-run of 146.
-- supabase/test/launch_preflight.sql row 62 reads NO when that has happened.
--
-- So a clock only ever runs while extra is nought, and extra only grows while
-- no clock runs. extra is capped at 99; the checkout refuses a pack that would
-- pass it (409 lives_full), so the cap never eats a paid life.
-- ---------------------------------------------------------------------------

alter table public.putt_lives add column if not exists extra int not null default 0;
alter table public.putt_lives drop constraint if exists putt_lives_extra_check;
alter table public.putt_lives add constraint putt_lives_extra_check check (extra between 0 and 99);

-- what part of a buy went over the max, beside `given` (what came off clocks)
alter table public.putt_lives_buys add column if not exists to_extra int not null default 0;

-- 146's state, answering hearts + extra. The stored `lives` stays the hearts.
create or replace function public.putt_lives_state(p_max int default 9, p_lives int default null)
returns table (lives int, refill_at timestamptz, max_lives int, back_at timestamptz[])
language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  mx   int  := putt_lives_max(p_max);
  seed int;
  r    putt_lives;
  kept timestamptz[];
begin
  if uid is null then raise exception 'sign in to keep lives'; end if;
  seed := greatest(0, least(mx, coalesce(case when p_max in (3, 6) then p_lives * 3 else p_lives end, mx)));
  insert into putt_lives as pl (user_id, lives, back_at, refill_at, nine)
    values (uid, seed,
            array_fill(now() + interval '24 hours', array[mx - seed]),
            case when seed < mx then now() + interval '24 hours' end,
            true)
    on conflict (user_id) do nothing;
  select * into r from putt_lives pl where pl.user_id = uid for update;
  kept := coalesce((select array_agg(b order by b) from unnest(r.back_at) b where b > now()), '{}');
  update putt_lives pl
     set back_at   = kept,
         lives     = greatest(0, mx - coalesce(array_length(kept, 1), 0)),
         refill_at = kept[1],
         updated_at = case when pl.back_at is distinct from kept then now() else pl.updated_at end
   where pl.user_id = uid
   returning * into r;
  return query select r.lives + r.extra, r.refill_at, mx, r.back_at;
end $$;

-- 146's spend, taking an extra life first: no clock starts while one is held.
create or replace function public.putt_lives_spend(p_max int default 9)
returns table (lives int, refill_at timestamptz, max_lives int, back_at timestamptz[])
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'sign in to keep lives'; end if;
  perform putt_lives_state(p_max, null);
  update putt_lives pl set extra = pl.extra - 1, updated_at = now()
   where pl.user_id = uid and pl.extra > 0;
  if not found then
    update putt_lives pl set back_at = array_append(pl.back_at, now() + interval '24 hours'), updated_at = now()
     where pl.user_id = uid and pl.lives > 0;
  end if;
  return query select * from putt_lives_state(p_max, null);
end $$;

-- 149's writer: clocks first, the rest of the pack over the max.
create or replace function public.putt_lives_buy(p_session text, p_user uuid, p_lives int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  kept timestamptz[];
  n    int;
  give int;
begin
  insert into putt_lives_buys (session_id, user_id, lives) values (p_session, p_user, p_lives)
    on conflict (session_id) do nothing;
  if not found then return false; end if;

  insert into putt_lives as pl (user_id, lives, back_at, refill_at, nine)
    values (p_user, 9, '{}', null, true)
    on conflict (user_id) do nothing;
  perform 1 from putt_lives pl where pl.user_id = p_user for update;

  kept := coalesce((select array_agg(b order by b) from putt_lives pl, unnest(pl.back_at) b
                     where pl.user_id = p_user and b > now()), '{}');
  n    := coalesce(array_length(kept, 1), 0);
  give := least(n, p_lives);
  kept := case when n > give then kept[1:n - give] else '{}'::timestamptz[] end;

  update putt_lives pl
     set back_at    = kept,
         -- nine less what is still on a clock; putt_lives_state() redoes it with the
         -- player's own max (18 with a Tour Pass) the next time the page asks
         lives      = greatest(0, 9 - coalesce(array_length(kept, 1), 0)),
         refill_at  = kept[1],
         extra      = least(99, pl.extra + (p_lives - give)),
         updated_at = now()
   where pl.user_id = p_user;
  update putt_lives_buys set given = give, to_extra = p_lives - give where session_id = p_session;
  return true;
end $$;

-- create or replace keeps each function's grants; restated so a re-run can never widen them
revoke all on function public.putt_lives_state(int, int)       from public;
revoke all on function public.putt_lives_spend(int)            from public;
revoke all on function public.putt_lives_buy(text, uuid, int)  from public, anon, authenticated;
grant execute on function public.putt_lives_state(int, int) to authenticated;
grant execute on function public.putt_lives_spend(int)      to authenticated;
-- the webhook calls this as service_role. Revoking from public took that away too (a live buy
-- failed with "permission denied for function putt_lives_buy", 2026-10-17), so it is granted back
-- by name. Guarded, because a test database may have no service_role.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.putt_lives_buy(text, uuid, int) to service_role';
  end if;
end $$;
