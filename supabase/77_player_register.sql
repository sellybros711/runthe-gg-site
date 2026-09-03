-- Run The Arcade — the complete player register.
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- WHY THIS EXISTS
-- Sportegories judges answers against arcade/sportegories-data.js, which is
-- curated for RECOGNITION: scripts/fetch-former.mjs keeps NFL players only if
-- they lasted 8+ seasons or went in the top 15, takes the top 400 qualified
-- MLB seasons, and starts the NFL at 1995 when nflverse has 1920. That is the
-- right rule for BUILDING a solvable card and the wrong one for JUDGING an
-- answer, so real players kept being told they don't exist.
--
-- The fix is the shape Immaculate Grid uses: the complete official register,
-- server-side. Every player who ever appeared — roughly 56,000 across the
-- three leagues — is far too much to ship to a phone (~4.4MB in the client
-- encoding, on every game load), so it lives here and is asked one question,
-- once, when a card is graded.
--
-- The table is NOT directly readable. RLS is on with no policies, so the only
-- way in is player_lookup(), which is capped at one card's worth of names.
-- That keeps a public anon key from being used to vacuum the whole register.

create table if not exists player_register (
  id            text primary key,          -- 'nfl:00-0023459' / 'mlb:545361'
  sport         text not null,             -- NFL | MLB | NBA
  name          text not null,
  -- normalized 'first|last', matching keyOf() in arcade/sportegories.js so the
  -- client can ask with exactly the key it already computes
  name_key      text not null,
  -- The next three are '|'-joined lists: a swingman is listed "F-C", a player
  -- can transfer schools, and a career runs through several teams. A delimiter
  -- rather than an array or JSON so the CSV bulk load has nothing to escape;
  -- nothing in any of these values contains a pipe.
  pos           text,
  college       text,
  teams         text not null default '',
  first_season  smallint,
  last_season   smallint,
  active        boolean not null default false
);

create index if not exists player_register_name_key_idx on player_register (name_key);

alter table player_register enable row level security;
-- deliberately no policies: reachable only through the function below

/* One card is eight answers, so ten keys is a generous ceiling and a hard stop
   on using this as a bulk export. Returns every player sharing a key — two
   real people are called Chris Johnson, and the caller decides between them. */
create or replace function player_lookup(p_keys text[])
returns table (
  name_key text, sport text, name text, pos text, college text,
  teams text, first_season smallint, last_season smallint, active boolean
)
language sql stable security definer set search_path = public as $$
  select r.name_key, r.sport, r.name, r.pos, r.college,
         r.teams, r.first_season, r.last_season, r.active
    from player_register r
   where r.name_key = any (p_keys[1:10]);
$$;

revoke all on function player_lookup(text[]) from public;
grant execute on function player_lookup(text[]) to anon, authenticated;

notify pgrst, 'reload schema';
