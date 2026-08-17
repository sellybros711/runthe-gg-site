-- Run The Arcade - per-game daily plays (replaces the shared 3/day wallet).
--
-- The model this enforces:
--   signed out    : nothing playable (client-side only; there is no uid to check)
--   free account  : four free games, ONE play each per day
--                   (match, sportegories, almamater, career)
--   Arcade Card   : every game, unlimited, plus the Archive
--
-- 69_arcade_card.sql counted a single number per user per day, so it could not
-- tell "you have used your Daily Match play" from "you have used your Crossword
-- play", and its cap of 3 would have refused the fourth free game. This adds a
-- per-game counter and two RPCs beside the old ones. The old table and
-- functions are left in place (harmless, no longer called) so a rollback is a
-- client deploy, not a database restore.
--
-- The "day" is the server's America/New_York date (a single, un-spoofable
-- boundary for everyone); the client's local wallet is UX only.
--
-- Idempotent: safe to run more than once.

-- ---------- 1) per-game daily counter ---------------------------------------
create table if not exists public.arcade_game_plays (
  user_id   uuid not null references auth.users(id) on delete cascade,
  play_date date not null,
  game      text not null,
  plays     int  not null default 0,
  primary key (user_id, play_date, game)
);
alter table public.arcade_game_plays enable row level security;
drop policy if exists "arcade_game_plays read own" on public.arcade_game_plays;
create policy "arcade_game_plays read own" on public.arcade_game_plays
  for select using (auth.uid() = user_id);
-- writes happen only through the SECURITY DEFINER functions below.

-- ---------- 2) which games a free account may play --------------------------
-- One list, one place. Changing the free four is an update to this function.
create or replace function public.arcade_free_game(p_game text)
returns boolean
language sql immutable as $$
  select p_game in ('match','sportegories','almamater','career');
$$;

-- ---------- 3) spend this game's play for today (atomic) --------------------
create or replace function public.arcade_spend_game(p_game text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d   date := (now() at time zone 'America/New_York')::date;
  cap int  := 1;
  g   text := lower(coalesce(p_game, ''));
  v_plays int;
begin
  if uid is null then
    return json_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  if public.arcade_card_active(uid) then
    return json_build_object('ok', true, 'unlimited', true);
  end if;
  if not public.arcade_free_game(g) then
    return json_build_object('ok', false, 'reason', 'card_only', 'game', g);
  end if;

  insert into public.arcade_game_plays (user_id, play_date, game, plays)
    values (uid, d, g, 1)
    on conflict (user_id, play_date, game)
      do update set plays = public.arcade_game_plays.plays + 1
      where public.arcade_game_plays.plays < cap
    returning plays into v_plays;

  if v_plays is null then                    -- this game is already used today
    select plays into v_plays from public.arcade_game_plays
      where user_id = uid and play_date = d and game = g;
    return json_build_object('ok', false, 'reason', 'spent', 'game', g,
                             'unlimited', false, 'used', coalesce(v_plays, cap), 'remaining', 0);
  end if;

  return json_build_object('ok', true, 'unlimited', false, 'game', g,
                           'used', v_plays, 'remaining', cap - v_plays);
end $$;

-- ---------- 4) read today's per-game status (no spend) ----------------------
-- plays is a {game: n} object, so the client can reconcile every counter in one
-- round trip on load.
create or replace function public.arcade_game_status()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d   date := (now() at time zone 'America/New_York')::date;
  v_plays json;
begin
  if uid is null then
    return json_build_object('signed_in', false);
  end if;
  if public.arcade_card_active(uid) then
    return json_build_object('signed_in', true, 'unlimited', true);
  end if;
  select coalesce(json_object_agg(game, plays), '{}'::json) into v_plays
    from public.arcade_game_plays where user_id = uid and play_date = d;
  return json_build_object('signed_in', true, 'unlimited', false,
                           'cap', 1, 'plays', v_plays,
                           'free', json_build_array('match','sportegories','almamater','career'));
end $$;

revoke all on function public.arcade_spend_game(text)  from public, anon;
revoke all on function public.arcade_game_status()     from public, anon;
grant execute on function public.arcade_free_game(text) to authenticated, anon;
grant execute on function public.arcade_spend_game(text) to authenticated;
grant execute on function public.arcade_game_status()    to authenticated;
