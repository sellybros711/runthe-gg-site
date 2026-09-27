-- ---------------------------------------------------------------------------
-- 114_fantasy_prizes.sql : who won the week, and the one code that pays for it
--
--   psql ... -f supabase/114_fantasy_prizes.sql
--
-- Needs 109 and 110. Independent of 111, 112 and 113.
--
-- THE TOP THREE ARE RECORDED BY TRIGGER. THE CODE IS MINTED BY A SEPARATE STEP.
-- ---------------------------------------------------------------------------
-- That split is the whole safety argument of this file and it is not tidiness.
--
-- Placing is arithmetic over rows the server already has, so a trigger writes it the moment
-- a week is marked scored and nobody has to remember. Money is not arithmetic. A path that
-- ran from "won a week" straight to "owns the product" would be a second way to obtain the
-- thing the store sells, and the store has exactly one on purpose.
--
-- So this file records WHO won and leaves `promo_code` null. `scripts/stripe/mint-winner-
-- code.mjs` is what fills it. It was written to be run by a person; it now runs on its own,
-- from `fantasy-live.yml`, on the tick that closes the week, and a field of one is voided
-- rather than paid. That is still a separate step from this trigger, in a separate process
-- holding the Stripe key, which is the half of the argument above that matters.
-- `115_fantasy_result_when_ready.sql` keeps every entrant's result back until it has run.
--
-- A CODE IS NOT A GRANT, AND THAT IS WHY IT IS A CODE. `functions/api/stripe/checkout-
-- bundle.js` already sends `allow_promotion_codes`, and `webhook.js` already grants on
-- `payment_status = 'no_payment_required'`, which is exactly what a 100% off promotion code
-- produces, with a comment saying so. So a winner redeeming this walks the ordinary store
-- checkout and the ordinary webhook. Nothing here adds a payment path, an unlock path, or a
-- product belonging to one game, and the whole of `premium_unlocks` is untouched.
--
-- IT IS DELIBERATELY NOT IN `achievements.js`'s CATALOG. `CATALOG.length` is the denominator
-- `crest.js` divides by and it is one number for everybody, so a badge for finishing top
-- three in a weekly competition is a badge almost nobody can ever light: every other
-- account's GOAT would be capped below 100% for ever by something no amount of play can
-- reach. That is the ceiling the bundle refused to put in front of Full Team, and it would
-- arrive here by accident the first time somebody filed a winner's mark in the obvious
-- place. A win lives in this table, on its own surface, outside the denominator.
--
-- AND IT IS NOT ON ANY LEADERBOARD ROW. `display_pro` is the pattern for a mark that
-- travels, and a win deliberately does not: gold on a board here means an ACHIEVEMENT IN
-- THAT GAME (a perfect season, the top step) and the blue rail means whose row it is. A
-- fantasy win is neither, and a third meaning on a row that already carries two is how a
-- board stops being readable. The mark is on the winner's own profile, which they are the
-- only reader of, so it publishes nothing about anybody.
-- ---------------------------------------------------------------------------

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The record
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.fantasy_prizes (
  season       int  not null,
  week         int  not null,
  place        int  not null check (place between 1 and 3),
  user_id      uuid not null references auth.users(id) on delete cascade,
  /* The entry that won it. Kept so a placement can be traced back to the six men that
     earned it after the fact, and so a re-settle can tell "the same result" from "a
     different one" without comparing floats. */
  entry_id     bigint not null references public.fantasy_entries(id) on delete cascade,
  display_name text,
  score        numeric(7,2) not null,

  /* NULL UNTIL A PERSON MINTS ONE, and null for second and third by design: the prize for
     those two is the mark. `state` is the audit trail rather than a second copy of whether
     the string is null, because "minted" and "redeemed" are different facts and only Stripe
     knows the second one. */
  promo_code   text,
  promo_state  text not null default 'none'
                 check (promo_state in ('none','minted','redeemed','void')),
  minted_at    timestamptz,

  settled_at   timestamptz not null default now(),
  primary key (season, week, place)
);

/* ONE PRIZE PER ACCOUNT PER WEEK. An account can only have one entry, so it can only place
   once, and a second row for one person in one week would be a settle that ran twice
   against a changed board. The constraint is what makes that loud. */
create unique index if not exists fantasy_prizes_one_per_account
  on public.fantasy_prizes (season, week, user_id);

/* A CODE IS ONE PERSON'S. Two winners sharing a string would mean one of them arrives at a
   checkout that has already been spent, which reads as the prize being a lie. */
create unique index if not exists fantasy_prizes_code_once
  on public.fantasy_prizes (promo_code) where promo_code is not null;

alter table public.fantasy_prizes enable row level security;

/* NO SELECT POLICY AT ALL, WHICH IS THE POINT. Every other table in this mode is read
   directly by somebody; this one holds a promotion code worth $19.99 and is reached only
   through `fantasy_my_result`, which hands a code to `auth.uid()` and to nobody else. A
   read-own policy would still expose the column to anybody who guessed the table name and
   was the row's owner, which is fine, and would also be one edit away from being widened by
   somebody who read "prizes" as "a public list of winners". The function is the door. */

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Has this reader been told yet
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The popup shows once. WHERE that "once" is remembered is the whole decision: browser
-- storage is per device, so a reader who entered on a phone and came back on a laptop would
-- be told twice, and one who cleared site data would be told for ever.
--
-- It is a fact about the ACCOUNT, so it is a column on the account's own entry. An entry is
-- already exactly one row per (user, season, week), so this needs no new key and no new
-- table, and `add column` is additive: a page one deploy behind never asks about it.

alter table public.fantasy_entries
  add column if not exists result_seen_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Settling, and the ordering that is NOT written out a second time
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `fantasy_standings` already decides the order (score descending, and the EARLIER entry
-- takes a tie), and 96's `commish_my_tenure` is the standing warning about what happens
-- when one ordering gets two implementations: they disagree the first time either is
-- touched, and the disagreement is a player told they came second on one screen and third
-- on another.
--
-- SO THIS CALLS IT RATHER THAN REPEATING IT. What the board does not publish is `user_id`,
-- deliberately, because it is a public list. It publishes `entry_no`, which is the key the
-- live board already animates on, so the join back to an account is `entry_no` and the
-- ordering is never restated at all.

create or replace function public.fantasy_settle_week(p_season int, p_week int)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_scored timestamptz; v_n int;
begin
  select w.scored_at into v_scored from public.fantasy_weeks w
   where w.season = p_season and w.week = p_week;
  /* A WEEK THAT IS STILL BEING PLAYED HAS NO WINNER. Settling a partial board would name
     somebody top on a Sunday afternoon and then take it off them, and `promo_state` has no
     way back once a code exists. */
  if v_scored is null then
    return 0;
  end if;

  with board as (
    select s.place, s.entry_no, s.score, s.display_name
      from public.fantasy_standings(p_season, p_week, 3) s
     where s.place <= 3
  ), ids as (
    /* The board's own key, which is `entry_no`'s definition in `fantasy_standings` and is
       the one thing restated here. It is `order by id`, so there is nothing in it that can
       drift the way a scoring order can. */
    select e.id, e.user_id,
           (dense_rank() over (order by e.id))::int as entry_no
      from public.fantasy_entries e
     where e.season = p_season and e.week = p_week
  )
  insert into public.fantasy_prizes
    (season, week, place, user_id, entry_id, display_name, score)
  select p_season, p_week, b.place, i.user_id, i.id, b.display_name, b.score
    from board b
    join ids i on i.entry_no = b.entry_no
  /* IDEMPOTENT, AND IT NEVER OVERWRITES A MINTED CODE. Re-running this is an ordinary thing
     to want (a backfill, a re-deploy, a second final write), and the one thing it must not
     do is move a prize out from under a code somebody is already holding. */
  on conflict (season, week, place) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.fantasy_settle_week(int,int) from public;

/* THE TRIGGER IS WHAT MAKES IT IMPOSSIBLE TO FORGET. `scored_at` is set exactly once, by a
   final write in `fantasy_mark_results`, and is never unset (110 says so at length), so the
   transition from null to a timestamp IS the moment a week is over. Hanging the settle on
   the workflow instead would put it one forgotten step away from a week that nobody ever
   won, and the symptom of that is silence. */
create or replace function public.fantasy_settle_on_scored()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scored_at is not null and old.scored_at is null then
    perform public.fantasy_settle_week(new.season, new.week);
  end if;
  return new;
end;
$$;

drop trigger if exists fantasy_settle_on_scored on public.fantasy_weeks;
create trigger fantasy_settle_on_scored
  after update on public.fantasy_weeks
  for each row execute function public.fantasy_settle_on_scored();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. What a reader is told, and it is only ever about themselves
-- ─────────────────────────────────────────────────────────────────────────────
--
-- One call answers the popup: did I enter, where did I finish, out of how many, and is
-- there a code with my name on it. Everything in it is about `auth.uid()`.
--
-- IT ANSWERS NOTHING UNTIL THE WEEK IS SCORED. A placement on a week still being played is
-- a number that moves, and a popup announcing one would be announcing it four times.

/* DROPPED FIRST, because 120 adds two return columns and `create or replace` refuses to
   change a return type. Without this, re-running the chain over a database that has 120
   dies here with "cannot change return type of existing function", which is 109's own
   lesson about `fantasy_standings`. Nothing depends on it in the catalog sense. */
drop function if exists public.fantasy_my_result(int, int);

create or replace function public.fantasy_my_result(p_season int, p_week int)
returns table (
  entered boolean, place int, entries int, score numeric, projected numeric,
  prize_place int, promo_code text, seen boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_scored timestamptz;
begin
  if v_user is null then return; end if;

  select w.scored_at into v_scored from public.fantasy_weeks w
   where w.season = p_season and w.week = p_week;
  if v_scored is null then return; end if;

  return query
  with mine as (
    select e.id, e.projected, e.result_seen_at
      from public.fantasy_entries e
     where e.season = p_season and e.week = p_week and e.user_id = v_user
  ), all_rows as (
    select e.id,
           (select coalesce(sum(r.half_ppr), 0)
              from unnest(e.picks) pid
              left join public.fantasy_results r
                on r.season = e.season and r.week = e.week and r.player_id = pid) as score
      from public.fantasy_entries e
     where e.season = p_season and e.week = p_week
  ), ranked as (
    /* The board's ordering, and the same tiebreak: score descending, earlier entry first. */
    select a.id, a.score, (row_number() over (order by a.score desc, a.id asc))::int as place
      from all_rows a
  )
  select true,
         r.place,
         (select count(*)::int from all_rows),
         r.score,
         m.projected,
         pz.place,
         /* THE CODE IS HANDED TO ITS OWNER AND TO NOBODY ELSE, and the `user_id` test is
            belt and braces on top of `mine` already being scoped to them: this is the one
            column in the mode that is worth money. */
         case when pz.user_id = v_user then pz.promo_code else null end,
         (m.result_seen_at is not null)
    from mine m
    join ranked r on r.id = m.id
    left join public.fantasy_prizes pz
      on pz.season = p_season and pz.week = p_week and pz.user_id = v_user;
end;
$$;

grant execute on function public.fantasy_my_result(int,int) to authenticated;

/* SEEN IS WRITTEN BY THE READER AND SAYS NOTHING ELSE. It cannot mark anybody else's entry,
   it cannot unmark, and it is not what decides whether a prize exists. */
create or replace function public.fantasy_ack_result(p_season int, p_week int)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return false; end if;
  update public.fantasy_entries e
     set result_seen_at = coalesce(e.result_seen_at, now())
   where e.season = p_season and e.week = p_week and e.user_id = v_user;
  return found;
end;
$$;

grant execute on function public.fantasy_ack_result(int,int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The mark, which is the reader's own and travels nowhere
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every week this account placed in, newest first, for the profile. No code, because a
-- profile is a record of what somebody did rather than a place to keep a voucher.
--
-- IT IS OWNER-READ, so it is not a disclosure at all: nothing here says anything about
-- anybody to anybody else, which is the difference between this and `display_pro`.

create or replace function public.fantasy_my_wins()
returns table (season int, week int, place int)
language sql
stable
security definer
set search_path = public
as $$
  select p.season, p.week, p.place
    from public.fantasy_prizes p
   where p.user_id = auth.uid()
   order by p.season desc, p.week desc;
$$;

grant execute on function public.fantasy_my_wins() to authenticated;

notify pgrst, 'reload schema';
