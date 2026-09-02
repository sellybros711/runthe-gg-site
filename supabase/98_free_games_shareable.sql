-- Run The Arcade - the free four becomes the four most SHAREABLE games.
--
--   out:  Daily Crossword, Alma Mater
--   in:   Guess the Player, Common Ground
--   stay: Sportegories, Career Path
--
-- WHY. A daily spreads on the artefact it hands you at the end. Two of the
-- twelve games produce a grid worth sending, Guess the Player's eight rows of
-- tiles and Common Ground's four rows of colour, and both of them were behind
-- the card. So the games most likely to travel were the ones almost nobody
-- could play, and the free tier was carrying the crossword, which is the most
-- generic format here and the one most obviously worth paying for.
--
-- The two that stay are the two that make you PRODUCE an answer, which is the
-- habit worth giving away. The set is now: produce, produce, share, share.
--
-- WHAT IT COSTS A PLAYER WHO IS HERE TODAY. Somebody who plays the crossword
-- free every morning loses that, and that is the real price of this change.
-- It is deliberate: the crossword is the strongest reason to buy a card that
-- the arcade has, and it was being given away to people who were never going
-- to be asked for anything.
--
-- Plays already spent today stay spent, per game. Nobody loses a play they
-- have taken and nobody is handed one back: arcade_game_plays counts per game,
-- so a crossword row from this morning simply stops being free tomorrow, and a
-- player's untouched Common Ground row is free from the moment this runs.
--
-- THE CLIENT MIRROR must move in the same deploy. tokens.js carries its own
-- copy of this list to paint the lock badges without a round trip, and
-- scripts/check-freegames.mjs fails the build when the two disagree, which is
-- what stops a game showing FREE while the spend RPC refuses it.
--
-- Idempotent: safe to run more than once. Requires 84_free_games_crossword.sql.

create or replace function public.arcade_free_games()
returns text[]
language sql immutable as $$
  select array['sportegories','career','guess','match']::text[];
$$;

-- arcade_free_game() and arcade_game_status() already read the function above
-- rather than a literal of their own (that was the point of 84), so there is
-- nothing else to change here. The grants from 84 still stand.
