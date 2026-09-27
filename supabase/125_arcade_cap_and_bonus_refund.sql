-- ---------------------------------------------------------------------------
-- 125_arcade_cap_and_bonus_refund.sql : two follow-ups to the yearly plans (124)
--
-- Safe to run more than once. Requires 85_rollcall_chain.sql, 101_premium_bundles.sql,
-- 103_runtour_bundle_redeem.sql and 124_premium_yearly.sql.
--
-- 1. THE RANKED CAP ASKED THE WRONG QUESTION ABOUT WHO HOLDS THE ARCADE CARD.
--
-- grid_submit_run caps a free account at four ranked runs a day and lifts the cap
-- for a cardholder, and it decided who that is by reading public.subscriptions
-- itself. That table only holds the monthly Arcade Card. Run The Bundle grants the
-- card as a premium_unlocks row ('arcade_card_year'), bought once or kept alive by
-- a yearly plan, and never writes a subscriptions row. So a bundle buyer's arcade
-- page said unlimited (arcade/board.js and arcade_spend_token both ask
-- arcade_card_active), they played a fifth game, and the server refused the score
-- with "daily ranked limit reached". Nothing else looked wrong.
--
-- arcade_card_active() (101) is the one answer to "is this a cardholder", and it
-- already covers both kinds. This is 85's function with that one test swapped in,
-- and nothing else changed. It also means a card whose period has ended is capped
-- like every other reader already treats it, a day of slack included.
--
-- 2. A REFUNDED YEARLY RUN THE BUNDLE GIVES BACK ITS BONUS.
--
-- A yearly Run The Bundle hands over 100,000 Run The Tour coins and a Tour Pack once
-- per account (the runtour_pack row, 124). A full refund or a chargeback on the plan
-- took the plan's access back and left the bonus, so refunding the first year kept
-- the coins for nothing. premium_reclaim_bonus() is what the webhook now calls after
-- premium_sub_apply on a refund.
--
-- IT TAKES BACK ONLY WHAT THE REFUNDED PAYMENT BOUGHT. The bonus row must have been
-- written by this plan (source sub:run-the-bundle and payload stripe_sub equal to
-- the plan's id) and written inside the refunded invoice's period. So refunding a
-- renewal keeps the bonus the first year paid for, and a refund that cannot say
-- which period it covered keeps it too. A one-time Run The Bundle's bonus
-- (source bundle:run-the-bundle) is never touched: a one-time purchase is never
-- cut by anything, which is 124's rule.
--
-- COINS NOT YET REDEEMED ARE NEVER PAID: the row goes, so runtour_redeem_bundle
-- finds nothing. COINS ALREADY REDEEMED ARE TAKEN BACK out of the wallet, as far as
-- the balance goes; what was already spent is reported as a shortfall rather than
-- driving the wallet negative. The Tour Pack cannot be taken back, because packs
-- live in the golf page's own store, not on the server.
--
-- THE ROW IS DELETED, NOT MARKED, and that is the only way available: 124's trigger
-- hands back any UPDATE of a row with no end date, and the bonus row has none. With
-- the row gone the account is back where it was before the purchase, so a later
-- paid Run The Bundle, yearly or one-time, hands the bonus over again. A late event
-- about the refunded period cannot: premium_sub_apply only writes the bonus while
-- the plan's access runs past now, and the refund ended it.
-- ---------------------------------------------------------------------------

-- ---------- 1) the submit RPC, with the cap asking arcade_card_active ---------
create or replace function public.grid_submit_run(
  p_game text, p_date date, p_seconds integer, p_mistakes integer, p_reveals integer,
  p_run_len integer default null, p_replay boolean default false
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text;
  v_streak integer; v_best integer; v_last date;
  v_id     bigint;
  v_new    integer;   -- score of this submission
  v_old    integer;   -- score already on the board today, if any
  v_cap    integer;   -- per-game run_len ceiling (0 = not a streak game)
  v_base   text;      -- game key with any sport suffix stripped
begin
  if v_uid is null then raise exception 'sign in to post a score'; end if;
  if not public.grid_game_ok(p_game) then raise exception 'unknown game'; end if;
  v_base := public.grid_base_game(p_game);
  if p_seconds is null or p_seconds < 0 or p_seconds >= 86400 then raise exception 'bad time'; end if;

  -- date window: device-local "today" only (plus timezone slack)
  if p_date is null or p_date < current_date - 1 or p_date > current_date + 1 then
    raise exception 'bad date';
  end if;

  p_mistakes := greatest(0, least(20, coalesce(p_mistakes, 0)));
  p_reveals  := greatest(0, least(60, coalesce(p_reveals,  0)));

  -- per-game run caps + speed floor, both on the BASE game so every sport
  -- edition inherits its parent's rules. 999 is the column's own ceiling.
  v_cap := case v_base
    when 'almamater'    then 999
    when 'highlow'      then 500
    when 'table'        then 200
    when 'oddone'       then 200
    when 'career'       then 200
    when 'rankit'       then 200
    when 'rollcall'     then 40      -- CHANGED: names found on one roster
    when 'sportegories' then 30
    else 0 end;                      -- chain is timed, so it stays here
  if v_cap > 0 then
    p_run_len := greatest(0, least(v_cap, coalesce(p_run_len, 0)));
    -- Sportegories and Roll Call run on a fixed clock, so elapsed time proves
    -- nothing about the score and a floor on it would only reject fast honest
    -- cards.  CHANGED: rollcall joins the exemption.
    if v_base not in ('sportegories', 'rollcall')
       and p_run_len >= 8 and p_seconds < ceil(p_run_len * 0.4) then
      raise exception 'implausible run';
    end if;
  else
    p_run_len := null;                       -- timed games carry no run length
    if p_seconds < 3 then raise exception 'implausible time'; end if;
  end if;

  -- same formula as the generated score column, so the RPC can pick the better row
  v_new := case when p_run_len is not null
                then 1000000 - p_run_len * 1000 + least(p_seconds, 999)
                else p_seconds + p_mistakes * 10 + p_reveals * 15 end;

  select username into v_name from profiles where id = v_uid;
  select score into v_old from grid_runs where user_id = v_uid and game = p_game and puzzle_date = p_date;

  -- A replay whose slot is already filled is not an error and not a refusal:
  -- the player has a row for today and this run cannot improve it. Return the
  -- row they already have so the game shows their real streak.
  if p_replay and v_old is not null then
    select id into v_id from grid_runs where user_id = v_uid and game = p_game and puzzle_date = p_date;
    select streak, best_streak into v_streak, v_best from grid_streaks where user_id = v_uid and game = p_game;
    return json_build_object('id', v_id, 'streak', coalesce(v_streak, 0),
                             'best_streak', coalesce(v_best, 0), 'replay', true);
  end if;

  -- daily ranked cap for free accounts: one row per free game, so four a day.
  -- Cardholders are uncapped, and re-submitting a game already on today's board
  -- is always allowed.  CHANGED (125): a cardholder is whoever
  -- arcade_card_active() says is one, which counts the Arcade year a bundle
  -- grants as well as a card subscription.
  if v_old is null then
    if not public.arcade_card_active(v_uid) then
      if (select count(*) from grid_runs where user_id = v_uid and puzzle_date = p_date) >= 4 then
        raise exception 'daily ranked limit reached';
      end if;
    end if;
  end if;

  -- ONE statement decides the row. A replay only claims an empty slot, so it
  -- never overwrites; any other run keeps whichever score is better.
  insert into grid_runs (user_id, game, puzzle_date, base_seconds, mistakes, reveals,
                         run_len, display_name, flawless)
  values (v_uid, p_game, p_date, p_seconds, p_mistakes, p_reveals,
          p_run_len, v_name, (p_mistakes = 0 and p_reveals = 0))
  on conflict (user_id, game, puzzle_date) do update
    set base_seconds = excluded.base_seconds, mistakes = excluded.mistakes,
        reveals      = excluded.reveals,      run_len  = excluded.run_len,
        display_name = excluded.display_name, flawless = excluded.flawless
    where not p_replay and grid_runs.score > v_new
  returning id into v_id;

  -- The DO UPDATE was skipped by its WHERE, so nothing came back. The row is
  -- there and it is better than this one: keep it and report it.
  if v_id is null then
    select id into v_id from grid_runs
      where user_id = v_uid and game = p_game and puzzle_date = p_date;
  end if;

  -- cloud streak: consecutive puzzle_dates completed for this user+game
  select streak, best_streak, last_date into v_streak, v_best, v_last
    from grid_streaks where user_id = v_uid and game = p_game;
  if not found then
    v_streak := 1; v_best := 1;
    insert into grid_streaks (user_id, game, streak, best_streak, last_date)
    values (v_uid, p_game, 1, 1, p_date)
    on conflict (user_id, game) do update
      set streak      = greatest(grid_streaks.streak,      excluded.streak),
          best_streak = greatest(grid_streaks.best_streak, excluded.best_streak),
          last_date   = greatest(grid_streaks.last_date,   excluded.last_date),
          updated_at  = now();
  else
    if v_last = p_date then
      null;                                   -- already counted today; no change
    elsif v_last = p_date - 1 then
      v_streak := coalesce(v_streak, 0) + 1;  -- next calendar day
    else
      v_streak := 1;                          -- gap: streak resets
    end if;
    v_best := greatest(coalesce(v_best, 0), v_streak);
    update grid_streaks
      set streak = v_streak, best_streak = v_best, last_date = p_date, updated_at = now()
      where user_id = v_uid and game = p_game;
  end if;

  return json_build_object('id', v_id, 'streak', v_streak, 'best_streak', v_best);
end $$;

revoke all on function public.grid_submit_run(text, date, integer, integer, integer, integer, boolean) from public, anon;
grant execute on function public.grid_submit_run(text, date, integer, integer, integer, integer, boolean) to authenticated;

-- ---------- 2) taking the bonus back on a refund ------------------------------
create or replace function public.premium_reclaim_bonus(p_sub_id text, p_from timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user  uuid;
  v_row   public.premium_unlocks%rowtype;
  v_coins int := 0;
  v_have  int;
  v_took  int := 0;
begin
  if p_sub_id is null or p_sub_id = '' then
    raise exception 'premium_reclaim_bonus: no subscription id';
  end if;

  select user_id into v_user from public.premium_subscriptions where stripe_sub_id = p_sub_id;
  if v_user is null then
    return jsonb_build_object('ok', true, 'reclaimed', false, 'reason', 'no_plan');
  end if;
  if p_from is null then
    return jsonb_build_object('ok', true, 'reclaimed', false, 'reason', 'no_period');
  end if;

  -- The same lock runtour_redeem_bundle takes, so a redeem and a reclaim cannot
  -- both pay out: whichever commits second sees what the first did.
  select * into v_row from public.premium_unlocks
   where user_id = v_user and product = 'runtour_pack'
   for update;
  if not found then
    return jsonb_build_object('ok', true, 'reclaimed', false, 'reason', 'none');
  end if;
  if v_row.source is distinct from 'sub:run-the-bundle'
     or v_row.payload->>'stripe_sub' is distinct from p_sub_id then
    return jsonb_build_object('ok', true, 'reclaimed', false, 'reason', 'not_this_plan');
  end if;
  -- An hour of slack: the bonus is written a moment after Stripe opens the period.
  if v_row.granted_at < p_from - interval '1 hour' then
    return jsonb_build_object('ok', true, 'reclaimed', false, 'reason', 'earlier_period');
  end if;

  if v_row.fulfilled_at is not null then
    v_coins := greatest(0, coalesce((v_row.payload->>'coins')::int, 0));
    if v_coins > 0 then
      select coalesce(paid_coins, 0) into v_have
        from public.coin_wallet where user_id = v_user for update;
      v_took := least(greatest(coalesce(v_have, 0), 0), v_coins);
      update public.coin_wallet
         set paid_coins       = coalesce(paid_coins, 0) - v_took,
             lifetime_granted = greatest(0, coalesce(lifetime_granted, 0) - v_coins)
       where user_id = v_user;
    end if;
  end if;

  delete from public.premium_unlocks where user_id = v_user and product = 'runtour_pack';

  return jsonb_build_object('ok', true, 'reclaimed', true, 'user', v_user,
    'redeemed', v_row.fulfilled_at is not null,
    'coins_taken', v_took, 'coins_short', v_coins - v_took);
end;
$$;

revoke all on function public.premium_reclaim_bonus(text, timestamptz) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.premium_reclaim_bonus(text, timestamptz) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.premium_reclaim_bonus(text, timestamptz) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.premium_reclaim_bonus(text, timestamptz) to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
