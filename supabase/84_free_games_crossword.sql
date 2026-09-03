-- Run The Arcade - the free four becomes Daily Crossword, Sportegories,
-- Alma Mater, Career Path. Common Ground moves behind the Arcade Card.
--
-- Why: the two games people come back to are Sportegories and Alma Mater, and
-- what those two share is that they make you PRODUCE the answer instead of
-- picking it off the screen. The crossword is the third game in that family and
-- it was sitting behind the paywall, while the free slot went to a game you can
-- finish by tapping tiles until they turn green.
--
-- ONE LIST, ONE PLACE. The free four had been written out as a literal in three
-- separate functions across 71, 79 and 83, which is three chances to change it
-- in two of them. arcade_free_games() is now the only definition; everything
-- else reads it.
--
-- Idempotent: safe to run more than once. Requires 83_referrals.sql.

-- ---------- 1) the list -----------------------------------------------------
create or replace function public.arcade_free_games()
returns text[]
language sql immutable as $$
  select array['crossword','sportegories','almamater','career']::text[];
$$;

-- ---------- 2) membership, sport editions included --------------------------
-- 'career_nba' is the same entitlement as 'career'; only five games have sport
-- editions and the suffix is never part of what a player owns.
create or replace function public.arcade_free_game(p_game text)
returns boolean
language sql stable as $$
  select regexp_replace(lower(coalesce(p_game, '')), '_(nba|nfl|mlb)$', '')
         = any (public.arcade_free_games());
$$;

-- ---------- 3) status stops carrying its own copy of the list ---------------
-- Same body as 83_referrals.sql, with the hard-coded json_build_array replaced.
-- The client paints its lock badges from this array, so a stale copy here shows
-- FREE on a game the spend RPC then refuses.
create or replace function public.arcade_game_status()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d   date := (now() at time zone 'America/New_York')::date;
  v_plays json;
  v_bonus int;
begin
  if uid is null then
    return json_build_object('signed_in', false);
  end if;
  if public.arcade_card_active(uid) then
    return json_build_object('signed_in', true, 'unlimited', true);
  end if;
  select coalesce(json_object_agg(game, plays), '{}'::json) into v_plays
    from public.arcade_game_plays where user_id = uid and play_date = d;
  v_bonus := public.arcade_bonus_today(uid);
  return json_build_object('signed_in', true, 'unlimited', false,
                           'cap', 1 + v_bonus, 'bonus', v_bonus, 'plays', v_plays,
                           'free', to_json(public.arcade_free_games()));
end $$;

-- ---------- 4) grants -------------------------------------------------------
grant execute on function public.arcade_free_games()      to authenticated, anon;
grant execute on function public.arcade_free_game(text)   to authenticated, anon;
grant execute on function public.arcade_game_status()     to authenticated;

-- ---------- 5) what this does NOT touch -------------------------------------
-- Plays already spent today stay spent, per game. Somebody who used their
-- Common Ground play this morning does not get a crossword play for free on top
-- of their own: arcade_game_plays counts per game, and their crossword row is
-- simply still 0. Nobody loses a play either. No backfill needed.
