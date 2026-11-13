-- Shut The Door: the closer's club for the two proxy spots whose packs had no team.
--
-- The 2005 NLCS (Brad Lidge, Houston Astros) and the 2007 World Series (Jonathan Papelbon, Boston
-- Red Sox) packs were built with pitcher.team null, so a save there unlocked no plate and the
-- scorebug showed "us". The packs now carry the team (pipeline/build_packs.py RETRO_TEAM), and
-- plate.js PACK_CLUBS has both. This adds the same two rows to the server's list.
--
-- Safe to run twice: an existing row is set to the same club.

insert into public.shutdoor_pack_clubs (id, club) values
  ('std-2005-nlcs5-lidge', 'astros'),
  ('std-2007-ws4-papelbon', 'redsox')
on conflict (id) do update set club = excluded.club;
