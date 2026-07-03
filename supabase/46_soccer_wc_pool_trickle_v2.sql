-- ============================================================================
-- 46_soccer_wc_pool_trickle_v2.sql  —  bots join ONE at a time, pool fills and
--                                        locks within ~4-5 minutes
-- ============================================================================
-- 45_soccer_wc_pool_trickle.sql added 2-5 bots per tick every 45-75s — visible
-- movement, but arriving in clumps reads as obviously fake ("why did 4 people
-- join in the same second?"). This tightens it to exactly 1 bot per tick on a
-- short, randomized interval, and shortens the lock backstop from 6 to 5
-- minutes so a typical pool fills one-by-one and kicks off within that window
-- instead of needing a deadline-triggered mass top-off to look "full."
--
-- `create or replace function` patch, same signatures as 45 — no new grants.
-- Idempotent. Run after 45_soccer_wc_pool_trickle.sql.
-- ----------------------------------------------------------------------------

-- Backstop dropped 6min -> 5min.
create or replace function _soccer_wc_lock_window() returns interval
language sql immutable as $$ select interval '5 minutes'; $$;

-- Short, jittery gap between arrivals (4-10s) so ~46 bots can join one at a
-- time well within the 5-minute window, at a pace that still reads as
-- individual people trickling in rather than a fixed metronome.
create or replace function _soccer_wc_trickle_window() returns interval
language sql volatile as $$ select make_interval(secs => 4 + random()*6); $$;

create or replace function _soccer_wc_maybe_trickle_open_season() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_season soccer_wc_seasons%rowtype;
  v_count int; v_bot jsonb; v_bot_ov numeric;
begin
  select * into v_season from soccer_wc_seasons where status='open'
    order by opened_at limit 1 for update skip locked;
  if not found then return; end if;
  if v_season.next_trickle_at is not null and now() < v_season.next_trickle_at then return; end if;

  select count(*) into v_count from soccer_wc_entrants where season_id = v_season.id;
  if v_count >= 48 then
    perform _soccer_wc_lock_season(v_season.id);
    return;
  end if;

  -- exactly one bot per tick — no batches
  select picks, overall into v_bot, v_bot_ov from _soccer_wc_bot_squad();
  insert into soccer_wc_entrants(season_id, is_bot, name, flag, picks, overall)
    values (v_season.id, true, _soccer_wc_bot_name(), _soccer_wc_bot_flag(), v_bot, v_bot_ov);

  update soccer_wc_seasons
     set next_trickle_at = now() + _soccer_wc_trickle_window()
   where id = v_season.id;

  if v_count + 1 >= 48 then
    perform _soccer_wc_lock_season(v_season.id);
  end if;
end;
$$;
