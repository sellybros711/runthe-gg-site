-- ---------------------------------------------------------------------------
-- 120_fantasy_pro_pass.sql : the winner gets 30 days of Pro, and then it ends
--
--   psql ... -f supabase/120_fantasy_pro_pass.sql
--
-- Needs 101, 107, 109, 110, 114 and 115. Safe to run more than once.
--
-- THE PRIZE WAS A CODE FOR THE LIFETIME BUNDLE. IT IS A 30 DAY PASS NOW.
-- ---------------------------------------------------------------------------
-- Asked for by the site's owner. Under 114 the winner was handed a 100% off Stripe
-- promotion code for the Perfect Season Premium Bundle, which is the lifetime product the
-- store sells, minted by `scripts/stripe/mint-winner-code.mjs`. Now first place gets Pro
-- for 30 days: both game unlocks, `ps_premium` and `cfb_premium`, as `premium_unlocks` rows
-- with an `expires_at`. When that passes, `premium_products()` stops answering them and the
-- account is an ordinary free account again. Nothing has to run on day 30.
--
-- IT IS A GRANT AND NOT A CODE, and that reverses 114's argument on purpose. 114 said a
-- path from "won a week" to "owns the product" would be a second way to obtain what the
-- store sells. That was true of a lifetime bundle. A pass that ends is not what the store
-- sells, and a code for one would need a product the catalog does not have, which is the
-- second payment path the site refuses. So it is written straight to the table, the way a
-- comp is, and Stripe is not involved at all.
--
-- IT IS PAID INSIDE THE SETTLE. `fantasy_settle_week` runs from 114's trigger the moment a
-- week is marked scored, and it now pays first place in the same transaction. So the
-- result popup (115) can never wait on a separate job, and no Stripe secret is needed for a
-- week to close.
--
-- WHAT EVERY READER DOES WITH IT, checked rather than assumed:
--
--   premium_products()        honours expires_at (101). The modes open, then close.
--   104 commish clock, 106    honour expires_at. The meters come off, then back on.
--   ps_is_pro, display_pro    DELIBERATELY SKIPS A PASS, below. A gold name is stamped on a
--                             board row when it is filed and never taken off, so a pass
--                             would leave gold names on rows for ever after it ended. The
--                             gold name says "this account holds the bundle", and a winner
--                             holding a pass does not.
--   the receipt               reads `source`, and says "Won", not "Bought".
--   checkout-bundle.js        stops counting a row that ends as owning the bundle, so a
--                             winner can still buy it for good, during the pass or after.
--
-- A WINNER WHO ALREADY OWNS IT FOR GOOD KEEPS IT FOR GOOD. A permanent row is never
-- touched. A second win while a pass is running adds 30 days to the end of it, not to
-- today, so two wins are 60 days.
-- ---------------------------------------------------------------------------

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The prize row learns the new state and when the pass ends
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fantasy_prizes
  add column if not exists pass_until timestamptz;

alter table public.fantasy_prizes
  drop constraint if exists fantasy_prizes_promo_state_check;
alter table public.fantasy_prizes
  add constraint fantasy_prizes_promo_state_check
  check (promo_state in ('none', 'minted', 'redeemed', 'void', 'granted'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Paying first place
-- ─────────────────────────────────────────────────────────────────────────────
--
-- IDEMPOTENT. It acts only on a first place row still at 'none', so a second call, a
-- re-settle or a re-run of this file pays nobody twice.
--
-- A FIELD OF ONE IS VOIDED, not paid, which is the rule the minting script ran on: a week
-- nobody else entered is not a competition. `p_force` pays one anyway, by hand.

create or replace function public.fantasy_grant_pass(
  p_season int, p_week int, p_force boolean default false)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_prize   public.fantasy_prizes%rowtype;
  v_entries int;
  v_tag     text := 'fantasy:' || p_season || '-w' || p_week;
  v_until   timestamptz;
begin
  select * into v_prize from public.fantasy_prizes
   where season = p_season and week = p_week and place = 1
   for update;
  if not found then return 'no winner'; end if;
  if v_prize.promo_state <> 'none' then return v_prize.promo_state; end if;

  select count(*)::int into v_entries from public.fantasy_entries
   where season = p_season and week = p_week;
  if v_entries < 2 and not p_force then
    update public.fantasy_prizes set promo_state = 'void'
     where season = p_season and week = p_week and place = 1;
    return 'void';
  end if;

  /* THE TWO GAME UNLOCKS, the same pair either bundle grants. A permanent row
     (expires_at null) is left exactly as it is: the `where` on the update is what keeps a
     winner who already bought the bundle from being handed an end date. A row that ends is
     extended from the LATER of its own end and now, so a lapsed pass restarts at today and a
     running one stacks. */
  insert into public.premium_unlocks
    (user_id, product, source, payload, expires_at, fulfilled_at)
  select v_prize.user_id, pr.product, v_tag,
         jsonb_build_object('season', p_season, 'week', p_week),
         now() + interval '30 days', now()
    from unnest(array['ps_premium', 'cfb_premium']) as pr(product)
  on conflict (user_id, product) do update
     set expires_at = greatest(public.premium_unlocks.expires_at, now()) + interval '30 days',
         source     = excluded.source,
         payload    = excluded.payload,
         granted_at = now(),
         fulfilled_at = now()
   where public.premium_unlocks.expires_at is not null;

  /* NULL MEANS THEY ALREADY OWN IT FOR GOOD. The sheet says so rather than printing an end
     date for access that has none. */
  select case when bool_or(u.expires_at is null) then null else max(u.expires_at) end
    into v_until
    from public.premium_unlocks u
   where u.user_id = v_prize.user_id and u.product in ('ps_premium', 'cfb_premium');

  update public.fantasy_prizes
     set promo_state = 'granted', pass_until = v_until, minted_at = now()
   where season = p_season and week = p_week and place = 1;
  return 'granted';
end;
$$;

revoke all on function public.fantasy_grant_pass(int, int, boolean) from public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The settle pays, in the same transaction
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 114's body, word for word, with one line added at the end. The ordering is still
-- `fantasy_standings`' and is still not written out a second time.

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
  if v_scored is null then
    return 0;
  end if;

  with board as (
    select s.place, s.entry_no, s.score, s.display_name
      from public.fantasy_standings(p_season, p_week, 3) s
     where s.place <= 3
  ), ids as (
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
  on conflict (season, week, place) do nothing;

  get diagnostics v_n = row_count;

  /* THE ONE NEW LINE. A week with no first place row (nobody entered) is 'no winner' and
     writes nothing. */
  perform public.fantasy_grant_pass(p_season, p_week);
  return v_n;
end;
$$;

revoke all on function public.fantasy_settle_week(int,int) from public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. What a reader is told
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 115's function with two columns on the end: `prize_state` and `pass_until`. Adding a
-- return column is a different return type, so it is dropped and made again, and the grant
-- is restated. `promo_code` stays where it was, so a page one deploy behind still reads the
-- columns it knows.
--
-- 'granted' joins the states that mean the result is ready to tell.

drop function if exists public.fantasy_my_result(int, int);

create function public.fantasy_my_result(p_season int, p_week int)
returns table (
  entered boolean, place int, entries int, score numeric, projected numeric,
  prize_place int, promo_code text, seen boolean,
  prize_state text, pass_until timestamptz)
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

  if not exists (select 1 from public.fantasy_prizes pz
                  where pz.season = p_season and pz.week = p_week and pz.place = 1
                    and pz.promo_state in ('minted', 'redeemed', 'void', 'granted')) then
    return;
  end if;

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
    select a.id, a.score, (row_number() over (order by a.score desc, a.id asc))::int as place
      from all_rows a
  )
  select true,
         r.place,
         (select count(*)::int from all_rows),
         r.score,
         m.projected,
         pz.place,
         case when pz.user_id = v_user then pz.promo_code else null end,
         (m.result_seen_at is not null),
         /* Only ever the reader's own prize row, because the join below is on them. */
         pz.promo_state,
         pz.pass_until
    from mine m
    join ranked r on r.id = m.id
    left join public.fantasy_prizes pz
      on pz.season = p_season and pz.week = p_week and pz.user_id = v_user;
end;
$$;

grant execute on function public.fantasy_my_result(int,int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. A pass is not a gold name
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 107's two functions, with a pass left out of both. See the header for why.

create or replace function public.ps_is_pro(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.premium_unlocks u
     where u.user_id = p_user
       and u.product in ('ps_premium', 'cfb_premium')
       and (u.expires_at is null or u.expires_at > now())
       and u.source not like 'fantasy:%'
  );
$$;

create or replace function public.premium_unlocks_backfill_pro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source like 'fantasy:%' then
    return new;
  end if;
  update public.ps_runs r
     set display_pro = true
   where r.user_id = new.user_id
     and r.display_pro is distinct from true;
  return new;
end;
$$;

/* AND ON AN UPDATE, which 107 did not need. A winner who then buys the bundle already has
   the two rows, so the webhook's upsert UPDATES them rather than inserting, and an
   insert-only trigger would leave that buyer's old board rows plain. */
drop trigger if exists premium_unlocks_backfill_pro_trg on public.premium_unlocks;
create trigger premium_unlocks_backfill_pro_trg
  after insert or update on public.premium_unlocks
  for each row execute function public.premium_unlocks_backfill_pro();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. A week that closed before this file was run
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A scored week whose first place is still at 'none' was waiting on the minting script,
-- which no longer runs. Pay it now, so a winner is not left waiting on nothing.

select p.season, p.week, public.fantasy_grant_pass(p.season, p.week) as result
  from public.fantasy_prizes p
  join public.fantasy_weeks w on w.season = p.season and w.week = p.week
 where p.place = 1 and p.promo_state = 'none' and w.scored_at is not null;

notify pgrst, 'reload schema';
