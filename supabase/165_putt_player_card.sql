-- ---------------------------------------------------------------------------
-- 165_putt_player_card.sql : a Putt Putt player card, for the Daily Hole board.
--
-- Safe to run more than once. Needs 103 (ps_saves), 148 (putt_daily) and
-- profiles (usernames).
--
-- Tapping a row on the Daily Hole board opens that player's card: their level
-- on the Tour, the stars they hold out of the stars there are, aces, worlds
-- cleared, Daily Holes played and their best streak. The page works these out
-- from its own record and sends them up with the cloud save, as payload->'card'
-- (putt.js cardOf). This reads that one key back, and nothing else of the save.
--
-- The board shows usernames, never user ids, so the card is asked for by
-- username. A player with no card yet (an older page saved them) answers with
-- just their name and their Daily Hole count.
-- ---------------------------------------------------------------------------

create or replace function public.putt_player_card(p_username text)
returns table (username text, card jsonb, board_days bigint, saved_at timestamptz)
language sql security definer set search_path = public stable as $$
  select p.username::text,
         case when jsonb_typeof(s.payload->'card') = 'object' then s.payload->'card' end,
         (select count(*) from putt_daily d where d.user_id = p.id),
         s.saved_at
    from profiles p
    left join ps_saves s on s.user_id = p.id and s.game = 'putt' and s.slot = 'tour'
   where p_username is not null and length(p_username) <= 64 and lower(p.username::text) = lower(p_username)
   limit 1
$$;

revoke all on function public.putt_player_card(text) from public;
grant execute on function public.putt_player_card(text) to anon, authenticated;
