-- ---------------------------------------------------------------------------
-- 138_putt_lives.sql : Putt Putt Tour lives are the account's, on server time.
--
-- Safe to run more than once.
--
-- The Tour record rides on ps_saves (103), and its conflict rule is PROGRESS:
-- a write that moves the record backwards is refused. Lives go DOWN, so that
-- rule cannot hold them, and they rode along on whichever copy changed them
-- last. Clearing site data before the first sync of a session, or a phone
-- whose clock was wound forward, refilled them.
--
-- So lives live here. One row an account, written only by these functions,
-- and every clock is the server's now():
--
--   putt_lives_state(p_max, p_lives)  read them, filling them if the 24 hour
--                                     clock has run out. The first call for an
--                                     account seeds the row from p_lives, so a
--                                     player keeps the lives they had.
--   putt_lives_spend(p_max)           take one. The last one starts the clock.
--   putt_lives_refill(p_max)          fill them now, for a tester account only.
--
-- p_max is 3, or 6 with a Tour Pass. The pass is decided in the golf wallet,
-- which is not in this repository, so the page says which and this file only
-- holds it to those two numbers. A forged 6 buys three lives once; it never
-- refills a clock early, which is the thing this file exists to stop.
-- ---------------------------------------------------------------------------

create table if not exists public.putt_lives (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  lives      int not null check (lives between 0 and 6),
  refill_at  timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.putt_lives enable row level security;
-- No policy and no grant: a browser reads and writes only through the functions.
revoke all on public.putt_lives from anon, authenticated;

create or replace function public.putt_lives_max(p_max int)
returns int language sql immutable as $$
  select case when p_max = 6 then 6 else 3 end
$$;

-- the row as it stands, filled if its clock has run out, created if missing.
-- The seed is held to 6 rather than to p_max, because a pass holder's first call
-- can come before the page has read the wallet, and that must not cost lives.
create or replace function public.putt_lives_state(p_max int default 3, p_lives int default null)
returns table (lives int, refill_at timestamptz, max_lives int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mx  int  := putt_lives_max(p_max);
  r   putt_lives;
begin
  if uid is null then raise exception 'sign in to keep lives'; end if;
  insert into putt_lives as pl (user_id, lives, refill_at)
    values (uid, greatest(0, least(6, coalesce(p_lives, mx))),
            case when coalesce(p_lives, mx) <= 0 then now() + interval '24 hours' end)
    on conflict (user_id) do nothing;
  select * into r from putt_lives pl where pl.user_id = uid for update;
  if r.refill_at is not null and now() >= r.refill_at then
    update putt_lives pl set lives = mx, refill_at = null, updated_at = now()
      where pl.user_id = uid returning * into r;
  end if;
  return query select r.lives, r.refill_at, mx;
end $$;

-- take one life; the last one starts a 24 hour clock that is never restarted
create or replace function public.putt_lives_spend(p_max int default 3)
returns table (lives int, refill_at timestamptz, max_lives int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r   record;
begin
  if uid is null then raise exception 'sign in to keep lives'; end if;
  perform putt_lives_state(p_max, null);
  update putt_lives pl
     set lives = greatest(0, pl.lives - 1),
         refill_at = case when pl.lives - 1 <= 0 and pl.refill_at is null then now() + interval '24 hours' else pl.refill_at end,
         updated_at = now()
   where pl.user_id = uid;
  select * into r from putt_lives_state(p_max, null);
  return query select r.lives, r.refill_at, r.max_lives;
end $$;

-- a tester's free refill. The list is the page's PUTT_TESTERS; keep the two in step.
create or replace function public.putt_lives_refill(p_max int default 3)
returns table (lives int, refill_at timestamptz, max_lives int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mx  int  := putt_lives_max(p_max);
begin
  if uid is null then raise exception 'sign in to keep lives'; end if;
  if not exists (select 1 from profiles p where p.id = uid
                 and lower(p.username::text) in ('csel8','runnyj','malikwillislover','slimeyb3','jordantest')) then
    raise exception 'refills open at launch';
  end if;
  perform putt_lives_state(p_max, null);
  update putt_lives pl set lives = mx, refill_at = null, updated_at = now() where pl.user_id = uid;
  return query select mx, null::timestamptz, mx;
end $$;

revoke all on function public.putt_lives_state(int, int)  from public;
revoke all on function public.putt_lives_spend(int)       from public;
revoke all on function public.putt_lives_refill(int)      from public;
grant execute on function public.putt_lives_state(int, int) to authenticated;
grant execute on function public.putt_lives_spend(int)      to authenticated;
grant execute on function public.putt_lives_refill(int)     to authenticated;
