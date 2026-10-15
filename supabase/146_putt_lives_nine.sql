-- ---------------------------------------------------------------------------
-- 146_putt_lives_nine.sql : nine Putt Putt lives, each on its own 24 hour clock.
--
-- Safe to run more than once. Needs 138_putt_lives.sql.
--
-- The owner's call (2026-10-15): a heart is three lives, and a player has three
-- hearts, so nine lives (six hearts, eighteen, with a Tour Pass). Every life that
-- is lost comes back 24 hours after it was lost, on its own clock. 138 kept one
-- clock that started only when the last life went and filled them all at once.
--
-- back_at holds when each lost life comes back, one entry a lost life, oldest
-- first. lives is always the max less the entries still to come, and refill_at
-- is kept as the next one back, for the page's clock. Every clock is still the
-- server's now().
--
-- p_max is 9, or 18 with a Tour Pass. A page cached from before this file sends
-- 3 or 6; those are read as 9 and 18, and its lives as a heart each.
-- ---------------------------------------------------------------------------

alter table public.putt_lives add column if not exists back_at timestamptz[] not null default '{}';
alter table public.putt_lives add column if not exists nine boolean not null default false;
alter table public.putt_lives drop constraint if exists putt_lives_lives_check;
alter table public.putt_lives add constraint putt_lives_lives_check check (lives between 0 and 18);

-- ONE TIME: a row from 138 becomes a nine life row. Each of its lives is a full
-- heart (three). The lives it had already lost come back at the end of its clock
-- if one was running, else 24 hours from now. Nobody loses anything, and a row
-- that was waiting does not wait any longer than it would have.
update public.putt_lives pl
   set lives   = least(9, pl.lives * 3),
       back_at = array_fill(coalesce(pl.refill_at, now() + interval '24 hours'), array[greatest(0, 9 - least(9, pl.lives * 3))]),
       refill_at = case when least(9, pl.lives * 3) >= 9 then null
                        else coalesce(pl.refill_at, now() + interval '24 hours') end,
       nine    = true,
       updated_at = now()
 where not pl.nine;

-- 3 and 9 are read as 9, 6 and 18 as 18, anything else as 9
create or replace function public.putt_lives_max(p_max int)
returns int language sql immutable as $$
  select case when p_max in (6, 18) then 18 else 9 end
$$;

-- The return type gains back_at, so the old functions go first.
drop function if exists public.putt_lives_spend(int);
drop function if exists public.putt_lives_refill(int);
drop function if exists public.putt_lives_state(int, int);

-- the row as it stands: lives whose time has come are back, created if missing.
-- A first call seeds the row from the lives the browser had (scaled by three
-- when an old page sends them), so a player keeps what they had.
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
  return query select r.lives, r.refill_at, mx, r.back_at;
end $$;

-- take one life. Its own 24 hour clock starts now; nothing else moves.
create or replace function public.putt_lives_spend(p_max int default 9)
returns table (lives int, refill_at timestamptz, max_lives int, back_at timestamptz[])
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r   record;
begin
  if uid is null then raise exception 'sign in to keep lives'; end if;
  select * into r from putt_lives_state(p_max, null);
  if r.lives > 0 then
    update putt_lives pl set back_at = array_append(pl.back_at, now() + interval '24 hours'), updated_at = now()
     where pl.user_id = uid;
  end if;
  return query select * from putt_lives_state(p_max, null);
end $$;

-- a tester's free refill. The list is the page's PUTT_TESTERS; keep the two in step.
create or replace function public.putt_lives_refill(p_max int default 9)
returns table (lives int, refill_at timestamptz, max_lives int, back_at timestamptz[])
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mx  int  := putt_lives_max(p_max);
begin
  if uid is null then raise exception 'sign in to keep lives'; end if;
  if not exists (select 1 from profiles p where p.id = uid
                 and lower(p.username::text) in ('csel8','runnyj','malikwillislover','slimeyb3','jordantest')) then
    raise exception 'refills are for testers';
  end if;
  perform putt_lives_state(p_max, null);
  update putt_lives pl set back_at = '{}', lives = mx, refill_at = null, updated_at = now() where pl.user_id = uid;
  return query select mx, null::timestamptz, mx, '{}'::timestamptz[];
end $$;

revoke all on function public.putt_lives_state(int, int)  from public;
revoke all on function public.putt_lives_spend(int)       from public;
revoke all on function public.putt_lives_refill(int)      from public;
grant execute on function public.putt_lives_state(int, int) to authenticated;
grant execute on function public.putt_lives_spend(int)      to authenticated;
grant execute on function public.putt_lives_refill(int)     to authenticated;
