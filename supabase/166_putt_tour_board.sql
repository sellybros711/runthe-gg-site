-- ---------------------------------------------------------------------------
-- 166_putt_tour_board.sql : the Putt Putt Tour board, ranked by stars.
--
-- Safe to run more than once. Needs 103 (ps_saves), 165 (the player card) and
-- profiles (usernames).
--
-- The Daily Hole board gets a second tab, Tour stars (the owner, 2026-11-05:
-- players who play the Daily Hole every day were not playing the Tour). It ranks
-- every player by the stars they hold on the Tour, and the furthest hole they
-- have reached breaks a tie. It reads the card the page sends up with its cloud
-- save (payload->'card', putt.js cardFor), the same card 165 reads, so a row
-- opens that player's card with nothing more asked. Only a card with stars is
-- ranked. The look on the card draws the golfer on the row. The card is written
-- by the player's own page, so every number is type and range checked before it
-- is cast: one bad card is left off the board, it can never break the board.
-- ---------------------------------------------------------------------------

create or replace function public.putt_tour_board(p_limit int default 50)
returns table (rank bigint, username text, stars int, stars_max int, lv int, levels int, world text,
               look jsonb, card jsonb, board_days bigint, mine boolean, players bigint)
language sql security definer set search_path = public stable as $$
  with c as (
    select s.user_id, s.payload->'card' as card
      from ps_saves s
     where s.game = 'putt' and s.slot = 'tour'
       -- a case, so the type checks run before the casts (a where clause's order is the planner's)
       and case when jsonb_typeof(s.payload->'card') = 'object'
                 and jsonb_typeof(s.payload->'card'->'stars') = 'number'
                 and jsonb_typeof(s.payload->'card'->'lv') = 'number'
            then (s.payload->'card'->>'stars')::numeric between 1 and 100000
                 and (s.payload->'card'->>'lv')::numeric between 1 and 100000
            else false end
  ), r as (
    select c.*, row_number() over (order by (c.card->>'stars')::numeric desc, (c.card->>'lv')::numeric desc, c.user_id) as rk,
           count(*) over () as n
      from c
  )
  select r.rk, coalesce(p.username, 'Golfer')::text,
         (r.card->>'stars')::numeric::int,
         case when jsonb_typeof(r.card->'starsMax') = 'number' and (r.card->>'starsMax')::numeric between 0 and 100000 then (r.card->>'starsMax')::numeric::int end,
         (r.card->>'lv')::numeric::int,
         case when jsonb_typeof(r.card->'levels') = 'number' and (r.card->>'levels')::numeric between 0 and 100000 then (r.card->>'levels')::numeric::int end,
         case when jsonb_typeof(r.card->'world') = 'string' then left(r.card->>'world', 40) end,
         case when jsonb_typeof(r.card->'look') = 'object' and length((r.card->'look')::text) <= 4096 then r.card->'look' end,
         r.card - 'look',
         (select count(*) from putt_daily d where d.user_id = r.user_id),
         r.user_id = auth.uid(), r.n
    from r left join profiles p on p.id = r.user_id
   where r.rk <= greatest(1, least(100, coalesce(p_limit, 50))) or r.user_id = auth.uid()
   order by r.rk
$$;

revoke all on function public.putt_tour_board(int) from public;
grant execute on function public.putt_tour_board(int) to anon, authenticated;
