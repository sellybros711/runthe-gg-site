-- ============================================================================
-- 48_soccer_h2h_stall_recovery.sql  —  stale-lobby exclusion + symmetric
--                                        stall-to-bot recovery
-- ============================================================================
-- Bug report: Quick Match paired a player into a real lobby whose host had
-- been inactive for a long time (created it, never came back). The guest
-- drafted, then had no way forward — the ONLY existing bot-backfill path was
-- "host alone in a still-empty lobby"; once a real opponent occupies a slot
-- (even an inactive one), nothing could ever convert the match, so it just
-- stalled forever. This is NOT bots impersonating real accounts — bots only
-- ever fill a slot nobody real is using — but a real account that goes
-- inactive mid-lobby had no equivalent recovery.
--
-- Fix, two parts:
--   1. soccer_h2h_quick() now ignores lobbies that haven't been touched
--      recently, so a long-abandoned lobby is never handed out in the first
--      place.
--   2. soccer_h2h_record_bot_match (host-only, empty-lobby-only) is replaced
--      by soccer_h2h_take_over_stalled, usable by EITHER role whenever the
--      other side never showed up or never finished drafting after a fair
--      wait. A real, present, actively-drafting opponent can never be
--      converted — the function raises if the "stalled" side turns out to
--      already be complete.
--
-- `create or replace function` patch on top of 42/47. Drops the old 4-arg
-- soccer_h2h_record_bot_match (superseded, no longer called by the client).
--
-- Idempotent. Run after 47_soccer_bots_persistent.sql.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Quick Match: skip lobbies that have gone quiet. A fresh lobby (host just
-- created it, maybe hasn't drafted yet either) is still fair game; one that's
-- sat untouched for a while is almost certainly abandoned.
-- ---------------------------------------------------------------------------
create or replace function soccer_h2h_quick()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_code text;
  v_name text; v_flag text;
begin
  if uid is null then raise exception 'must be signed in to play online'; end if;
  select username::text, nullif(flag,'') into v_name, v_flag from profiles where id = uid;

  select id, code into v_id, v_code from soccer_h2h_matches
    where is_public = true and status = 'open' and guest is null and host <> uid
      and updated_at >= now() - interval '90 seconds'
    order by created_at asc
    limit 1
    for update skip locked;

  if v_id is not null then
    update soccer_h2h_matches
       set guest = uid, guest_name = coalesce(v_name,'Guest'), guest_flag = coalesce(v_flag,'USA'),
           status = 'drafting', updated_at = now()
     where id = v_id;
    return jsonb_build_object('match_id', v_id, 'code', v_code, 'role', 'guest');
  end if;

  return soccer_h2h_create(true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Symmetric stall recovery: the caller must already have submitted their
-- own draft. The OTHER side (whichever role that is for this caller) must
-- still be genuinely missing or mid-draft — never a complete, present
-- opponent. A short floor covers "nobody's even joined yet" (mirrors the old
-- host-only path, harmless to convert fast since there's truly no one
-- there); a longer floor covers "someone real is in the lobby but hasn't
-- finished drafting," giving a slow-but-present opponent a fair window
-- before we give up on them.
-- ---------------------------------------------------------------------------
drop function if exists soccer_h2h_record_bot_match(uuid, int, int, text);

create or replace function soccer_h2h_take_over_stalled(
  p_match_id uuid, p_my_goals int, p_opp_goals int, p_i_won boolean
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_match soccer_h2h_matches%rowtype;
  v_role text;
  v_bot soccer_bots%rowtype;
  v_stalled_role text;
  v_min_wait interval;
  v_winner text;
begin
  if uid is null then raise exception 'must be signed in to play online'; end if;

  select * into v_match from soccer_h2h_matches where id = p_match_id for update;
  if not found then raise exception 'no such match'; end if;

  if v_match.host = uid then v_role := 'host';
  elsif v_match.guest = uid then v_role := 'guest';
  else raise exception 'you are not in this match'; end if;

  if v_match.status in ('done','void','abandoned') then
    return _soccer_h2h_state_json(p_match_id);
  end if;

  if v_role = 'host' then
    if v_match.host_picks is null then raise exception 'submit your own squad first'; end if;
    if v_match.guest is null then
      v_stalled_role := 'guest'; v_min_wait := interval '4 seconds';
    elsif v_match.guest_picks is null then
      v_stalled_role := 'guest'; v_min_wait := interval '20 seconds';
    else
      raise exception 'your opponent is here — refresh and try again';
    end if;
  else
    if v_match.guest_picks is null then raise exception 'submit your own squad first'; end if;
    if v_match.host_picks is null then
      v_stalled_role := 'host'; v_min_wait := interval '20 seconds';
    else
      raise exception 'your opponent is here — refresh and try again';
    end if;
  end if;

  if now() - v_match.updated_at < v_min_wait then
    raise exception 'not enough time has passed yet';
  end if;

  select * into v_bot from soccer_bots order by random() limit 1;

  if v_stalled_role = 'guest' then
    v_winner := case when p_i_won then 'host' else 'guest' end;
    update soccer_h2h_matches
       set guest_is_bot = true, guest_name = v_bot.name, guest_flag = v_bot.flag,
           status = 'done', host_goals = p_my_goals, guest_goals = p_opp_goals, winner = v_winner,
           updated_at = now()
     where id = p_match_id;
  else
    v_winner := case when p_i_won then 'guest' else 'host' end;
    update soccer_h2h_matches
       set host_is_bot = true, host_name = v_bot.name, host_flag = v_bot.flag,
           status = 'done', host_goals = p_opp_goals, guest_goals = p_my_goals, winner = v_winner,
           updated_at = now()
     where id = p_match_id;
  end if;

  perform _soccer_h2h_apply_result(p_match_id);   -- caller's own (real) W/L

  if p_i_won then
    update soccer_bots set h2h_losses = h2h_losses + 1, h2h_streak = 0 where id = v_bot.id;
  else
    update soccer_bots set h2h_wins = h2h_wins + 1, h2h_streak = h2h_streak + 1,
           h2h_best_streak = greatest(h2h_best_streak, h2h_streak + 1) where id = v_bot.id;
  end if;

  return jsonb_build_object('bot_name', v_bot.name, 'bot_flag', v_bot.flag,
                             'role_taken_over', v_stalled_role);
end;
$$;

revoke all on function soccer_h2h_take_over_stalled(uuid, int, int, boolean) from public;
grant execute on function soccer_h2h_take_over_stalled(uuid, int, int, boolean) to authenticated;

-- Optional housekeeping (run manually or via pg_cron): matches that never left
-- 'open'/'drafting' after a long wait are just abandoned lobbies, not history.
--   delete from soccer_h2h_matches where status in ('open','drafting') and updated_at < now() - interval '2 hours';
