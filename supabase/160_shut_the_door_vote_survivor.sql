-- ---------------------------------------------------------------------------
-- 160_shut_the_door_vote_survivor.sql : Shut The Door's vote for tomorrow,
--                                        Survivor, the archive and the Pro gate.
--
-- Safe to run more than once. Needs 153, 155, 156, 157 and 159 (shut_the_door).
-- Run it BEFORE the page ships, and at least a day before the vote's first
-- day (shutdoor_vote_epoch(), 2026-11-16): votes for that day are cast the day
-- before. The page reads a missing function as "could not ask" and plays the
-- default, so nothing breaks while it is missing.
--
-- THE VOTE (CONTRACT.md section 16). From the epoch on, each day's daily is one
-- of two candidates. The candidates for day D are the packs nobody was offered
-- (or given, before the vote) on any of the 13 days before D, ordered by the
-- site's string hash of 'shut-the-door-vote-' || D || '-' || id, the first
-- two. shut-the-door/modes.js runs the same rule; test/modes.mjs holds the two
-- to the same answers. Signed-in players who finished today's daily vote once
-- for tomorrow. When a day begins its votes are closed, so the first read of
-- that day locks it, the same whoever reads it: more votes wins, no votes or a
-- tie is candidate A. From the epoch on, a daily post must be for the locked
-- situation.
--
-- SURVIVOR (CONTRACT.md section 17). A run of saves. Run 0 of the day is the
-- day's run and the only one on the Survivor board. One run a day free; a Pro
-- player may start another once the last is over. The page posts each finished
-- situation in order; a door shut goes on, anything else ends the run. Which
-- situation and seed each index plays is modes.js's (day, run, index); the
-- calls are kept, so check-replays.mjs can replay a run offline.
--
-- THE ARCHIVE. A Pro player may play any past daily. Kept here, first one per
-- day, never on the daily board.
--
-- PRO. shutdoor_is_pro(uid) is the one gate. It answers false for everyone
-- until payments exist: the store agent flips PRO_LIVE in a later migration and
-- adds the std_premium product to premium_unlocks (101_premium_bundles.sql).
--
-- What changes:
--   shutdoor_packs         new: the 30 situations in rotation order
--   shutdoor_vote_days     new: each vote day's candidates, and its lock
--   shutdoor_votes         new: one vote per (day, user)
--   shutdoor_survivor      new: one row per (user, day, run)
--   shutdoor_archive       new: one row per (user, day)
--   shutdoor_submit        one more check (the locked situation). The rest is 159's
--   the functions below    new
-- ---------------------------------------------------------------------------

-- ---- the 30 situations ------------------------------------------------------
create table if not exists public.shutdoor_packs (
  id  text primary key check (length(id) between 1 and 64),
  ord int  not null unique
);
alter table public.shutdoor_packs enable row level security;
revoke all on public.shutdoor_packs from anon, authenticated;
-- the list is shut-the-door/data/schedule.json's rotation, in order (test/modes.mjs checks it)
insert into public.shutdoor_packs (id, ord) values
  ('std-2025-ws7-yamamoto', 0),
  ('std-2011-ws6-feliz', 1),
  ('std-2025-diaz-cin', 2),
  ('std-1988-ws1-eckersley', 3),
  ('std-2016-ws7-chapman', 4),
  ('std-2024-ws5-buehler', 5),
  ('std-2025-scott-kc', 6),
  ('std-2019-nlwc-hader', 7),
  ('std-2022-ws6-pressly', 8),
  ('std-2001-ws7-rivera', 9),
  ('std-2015-ws1-familia', 10),
  ('std-2010-hoffman-stl', 11),
  ('std-2021-nlcs6-smith', 12),
  ('std-2005-nlcs5-lidge', 13),
  ('std-2018-alcs4-kimbrel', 14),
  ('std-2012-ws4-romo', 15),
  ('std-2023-williams-sd', 16),
  ('std-2008-ws5-lidge', 17),
  ('std-2020-ws6-urias', 18),
  ('std-2013-alcs6-uehara', 19),
  ('std-2023-ws1-sewald', 20),
  ('std-2011-rivera-min', 21),
  ('std-2014-ws7-bumgarner', 22),
  ('std-2007-ws4-papelbon', 23),
  ('std-2023-hader-stl', 24),
  ('std-2015-alcs6-davis', 25),
  ('std-2008-krod-sea', 26),
  ('std-2025-alcs7-hoffman', 27),
  ('std-2010-ws5-wilson', 28),
  ('std-2017-ws2-jansen', 29)
on conflict (id) do update set ord = excluded.ord;

-- the first day picked by a vote. The same date is modes.js VOTE.EPOCH
create or replace function public.shutdoor_vote_epoch() returns date
language sql immutable as $$ select date '2026-11-16' $$;

-- Run The Diamond's string hash (rng.js hashSeed): h = 31 h + code, wrapped to a
-- signed 32-bit integer, then its absolute value. ASCII text only
create or replace function public.shutdoor_hash(p text) returns bigint
language plpgsql immutable as $$
declare h bigint := 0; i int;
begin
  for i in 1 .. length(p) loop
    h := (h * 31 + ascii(substr(p, i, 1))) % 4294967296;
  end loop;
  if h >= 2147483648 then h := h - 4294967296; end if;
  return abs(h);
end $$;

-- the day's pack before the vote: the rotation of the first 30 from daily #1 (2026-10-26),
-- as data/schedule.json lists it
create or replace function public.shutdoor_fixed_pack(p_day date) returns text
language sql stable security definer set search_path = public as $$
  select p.id from shutdoor_packs p
   where p.ord = (((p_day - date '2026-10-26') % 30) + 30) % 30
$$;

-- ---- the vote -----------------------------------------------------------------
create table if not exists public.shutdoor_vote_days (
  day       date primary key,
  a         text not null,
  b         text not null,
  winner    text,
  votes_a   int,
  votes_b   int,
  locked_at timestamptz
);
create table if not exists public.shutdoor_votes (
  day        date        not null,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  pack       text        not null,
  created_at timestamptz not null default now(),
  primary key (day, user_id)
);
alter table public.shutdoor_vote_days enable row level security;
alter table public.shutdoor_votes enable row level security;
revoke all on public.shutdoor_vote_days from anon, authenticated;
revoke all on public.shutdoor_votes from anon, authenticated;

-- the candidates for a day, [A, B], written once and read after. Every day from the
-- epoch up to it is filled in order first, since each reads the 13 before it. Nothing
-- past tomorrow, and nothing before the epoch (null)
create or replace function public.shutdoor_vote_candidates(p_day date) returns text[]
language plpgsql security definer set search_path = public as $$
declare d date; k int; seen text[]; pick text[];
begin
  if p_day is null or p_day < shutdoor_vote_epoch() or p_day > shutdoor_today() + 1 then return null; end if;
  select coalesce(max(v.day) + 1, shutdoor_vote_epoch()) into d from shutdoor_vote_days v;
  while d <= p_day loop
    seen := '{}';
    for k in 1 .. 13 loop
      if d - k >= shutdoor_vote_epoch() then
        seen := seen || (select array[v.a, v.b] from shutdoor_vote_days v where v.day = d - k);
      else
        seen := seen || shutdoor_fixed_pack(d - k);
      end if;
    end loop;
    select array_agg(x.id order by x.h, x.ord) into pick from (
      select p.id, p.ord, shutdoor_hash('shut-the-door-vote-' || to_char(d, 'YYYY-MM-DD') || '-' || p.id) as h
        from shutdoor_packs p where not (p.id = any(seen))
       order by 3, 2 limit 2) x;
    insert into shutdoor_vote_days (day, a, b) values (d, pick[1], pick[2]) on conflict (day) do nothing;
    d := d + 1;
  end loop;
  return (select array[v.a, v.b] from shutdoor_vote_days v where v.day = p_day);
end $$;

-- the day's situation once the day has begun (its votes closed with the day before):
-- more votes wins, no votes or a tie is A. Locked on the first read, the same for every
-- reader. null before the epoch (the schedule's own day) and for a day not yet begun
create or replace function public.shutdoor_vote_lock(p_day date) returns text
language plpgsql security definer set search_path = public as $$
declare c text[]; va int; vb int; w text;
begin
  if p_day is null or p_day < shutdoor_vote_epoch() or p_day > shutdoor_today() then return null; end if;
  select v.winner into w from shutdoor_vote_days v where v.day = p_day;
  if w is not null then return w; end if;
  c := shutdoor_vote_candidates(p_day);
  select count(*) filter (where x.pack = c[1]), count(*) filter (where x.pack = c[2]) into va, vb
    from shutdoor_votes x where x.day = p_day;
  update shutdoor_vote_days set winner = case when vb > va then c[2] else c[1] end,
         votes_a = va, votes_b = vb, locked_at = now()
   where day = p_day and winner is null;
  return (select v.winner from shutdoor_vote_days v where v.day = p_day);
end $$;

-- what the page shows for a day's vote:
-- {day, epoch, open, candidates [A, B], myVote, votes {a, b} | null, winner, canVote, why}.
-- votes are shown once the day is locked, or to a player who has voted
create or replace function public.shutdoor_vote(p_day date) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text[]; w text; mine text; va int; vb int; can boolean := false; why text;
begin
  c := shutdoor_vote_candidates(p_day);
  if c is null then
    return json_build_object('day', p_day, 'epoch', shutdoor_vote_epoch(), 'open', false, 'candidates', null,
                             'myVote', null, 'votes', null, 'winner', null, 'canVote', false, 'why', 'no vote for that day');
  end if;
  w := shutdoor_vote_lock(p_day);
  if uid is not null then select x.pack into mine from shutdoor_votes x where x.day = p_day and x.user_id = uid; end if;
  select count(*) filter (where x.pack = c[1]), count(*) filter (where x.pack = c[2]) into va, vb
    from shutdoor_votes x where x.day = p_day;
  if p_day <> shutdoor_today() + 1 then why := 'voting is closed';
  elsif uid is null then why := 'sign in to vote';
  elsif mine is not null then why := 'you voted';
  elsif not exists (select 1 from shutdoor_outings o where o.user_id = uid and o.day = shutdoor_today()) then
    why := 'finish today''s daily to vote';
  else can := true;
  end if;
  return json_build_object('day', p_day, 'epoch', shutdoor_vote_epoch(), 'open', p_day = shutdoor_today() + 1,
    'candidates', c, 'myVote', mine,
    'votes', case when w is not null or mine is not null then json_build_object('a', va, 'b', vb) end,
    'winner', w, 'canVote', can, 'why', why);
end $$;

-- one vote for tomorrow, signed in, after finishing today's daily. The first vote stands.
-- Answers shutdoor_vote(p_day)
create or replace function public.shutdoor_vote_cast(p_day date, p_pack text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text[];
begin
  if uid is null then raise exception 'sign in to vote'; end if;
  if p_day is distinct from shutdoor_today() + 1 then raise exception 'voting is closed'; end if;
  c := shutdoor_vote_candidates(p_day);
  if c is null then raise exception 'no vote for that day'; end if;
  if p_pack is null or not (p_pack = any(c)) then raise exception 'not a candidate'; end if;
  if not exists (select 1 from shutdoor_outings o where o.user_id = uid and o.day = shutdoor_today()) then
    raise exception 'finish today''s daily to vote';
  end if;
  insert into shutdoor_votes (day, user_id, pack) values (p_day, uid, p_pack) on conflict (day, user_id) do nothing;
  return shutdoor_vote(p_day);
end $$;

-- ---- the daily's post: the locked situation from the epoch on -----------------
create or replace function public.shutdoor_submit(
  p_day date, p_number int, p_scenario text, p_calls jsonb, p_outcome text,
  p_pitches int, p_score int, p_percentile int, p_pitched_like text, p_strip jsonb)
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
  s int; b int; v_last date;
  r bigint; total bigint;
  k_score int; k_outcome text;
begin
  if uid is null then raise exception 'sign in to post a daily'; end if;
  if p_day is null or abs(p_day - shutdoor_today()) > 1 then raise exception 'that day is not open'; end if;
  if p_outcome is null or p_outcome not in ('door_shut', 'tie_held', 'doors_open', 'walk_off') then raise exception 'not an outcome'; end if;
  if p_pitches is null or p_pitches not between 1 and 150 then raise exception 'not a real outing'; end if;
  if jsonb_typeof(p_calls) is distinct from 'array' or jsonb_array_length(p_calls) <> p_pitches
     or exists (select 1 from jsonb_array_elements(p_calls) c
                 where jsonb_typeof(c) <> 'object'
                    or (c->>'type') is null or length(c->>'type') > 2
                    or (c->>'cell') !~ '^[0-9]+$' or (c->>'cell')::int not between 0 and 24
                    -- the release (156): absent or null is 1.0x; present, a number 0..1. The case
                    -- reads the number only once it is one, so a string never reaches the cast
                    or case jsonb_typeof(c->'q')
                         when 'number' then (c->>'q')::numeric not between 0 and 1
                         when 'null' then false
                         else c ? 'q' end
                    -- the effort (157): absent or null is his ordinary pitch; present, a number
                    -- 0..1 on a call with a number q. Read as a number only once it is one
                    or case jsonb_typeof(c->'e')
                         when 'number' then (c->>'e')::numeric not between 0 and 1
                                            or jsonb_typeof(c->'q') is distinct from 'number'
                         when 'null' then false
                         else c ? 'e' end
                    -- the free aim point (157): absent or null is the cell's centre; present, two
                    -- numbers -0.5..0.5. Each read as a number only once it is one
                    or case jsonb_typeof(c->'at')
                         when 'array' then jsonb_array_length(c->'at') <> 2
                                           or exists (select 1 from jsonb_array_elements(c->'at') a
                                                       where case when jsonb_typeof(a) = 'number'
                                                                  then (a #>> '{}')::numeric not between -0.5 and 0.5
                                                                  else true end)
                         when 'null' then false
                         else c ? 'at' end) then
    raise exception 'the calls do not make an outing';
  end if;
  if jsonb_typeof(p_strip) is distinct from 'array' or jsonb_array_length(p_strip) <> p_pitches
     or exists (select 1 from jsonb_array_elements_text(p_strip) x where x not in ('green', 'yellow', 'orange', 'red')) then
    raise exception 'the strip does not match the calls';
  end if;
  if p_score is null or p_score not between 0 and 1000 or p_percentile is null or p_percentile not between 0 and 100 then
    raise exception 'not a real score';
  end if;
  -- from the vote's first day, the day's situation is the one the vote locked (160)
  if p_day >= shutdoor_vote_epoch() and p_scenario is distinct from shutdoor_vote_lock(p_day) then
    raise exception 'that is not the day''s situation';
  end if;

  insert into shutdoor_outings (user_id, day, daily_number, scenario_id, calls, outcome, pitches, score,
                                percentile, pitched_like, strip)
    values (uid, p_day, p_number, left(p_scenario, 64), p_calls, p_outcome, p_pitches, p_score,
            p_percentile, nullif(left(coalesce(p_pitched_like, ''), 60), ''), p_strip)
    on conflict (user_id, day) do nothing;
  get diagnostics n = row_count;

  -- TODO(v2 trophies): the result is written here; trophies hang off this insert.

  -- the streak from the kept rows, whatever order they came in (159): a late post for
  -- yesterday, from a second device or a guest who signed in, no longer resets it
  select z.streak, z.best, z.last_day into s, b, v_last from shutdoor_streak_of(uid) z;
  if n > 0 then
    select greatest(coalesce(max(t.best), 0), b) into b from shutdoor_streaks t where t.user_id = uid;
    insert into shutdoor_streaks (user_id, streak, best, last_day, updated_at)
      values (uid, s, b, v_last, now())
      on conflict (user_id) do update
        set streak = excluded.streak, best = excluded.best, last_day = excluded.last_day, updated_at = now();
  else
    select t.streak, t.best, t.last_day into s, b, v_last from shutdoor_streaks t where t.user_id = uid;
  end if;

  select x.rk, x.n into r, total from (
    select o.user_id, row_number() over (order by o.score desc, o.created_at) as rk, count(*) over () as n
      from shutdoor_outings o where o.day = p_day
  ) x where x.user_id = uid;

  -- what the server keeps for the day, so a second device can say which outing counts (159)
  select o.score, o.outcome into k_score, k_outcome from shutdoor_outings o where o.user_id = uid and o.day = p_day;
  return json_build_object('taken', n > 0, 'streak', coalesce(s, 0), 'best', coalesce(b, 0),
                           'rank', r, 'players', coalesce(total, 0), 'keptScore', k_score, 'keptOutcome', k_outcome);
end $$;

-- ---- Pro ------------------------------------------------------------------------
-- The one gate. False for everyone while PRO_LIVE is false (no price, no buy flow yet).
-- Then: a std_premium row in premium_unlocks (101), with its end date honoured.
create or replace function public.shutdoor_is_pro(p_uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  PRO_LIVE constant boolean := false;
  ok boolean := false;
begin
  if not PRO_LIVE or p_uid is null or to_regclass('public.premium_unlocks') is null then return false; end if;
  execute 'select exists (select 1 from public.premium_unlocks u where u.user_id = $1 and u.product = ''std_premium''
             and (u.expires_at is null or u.expires_at > now()))' into ok using p_uid;
  return coalesce(ok, false);
end $$;
revoke all on function public.shutdoor_is_pro(uuid) from public;

-- what the caller may play: {signedIn, pro, archive, survivorRuns (null is unlimited)}
create or replace function public.shutdoor_entitlements() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('signedIn', auth.uid() is not null, 'pro', shutdoor_is_pro(auth.uid()),
                           'archive', shutdoor_is_pro(auth.uid()),
                           'survivorRuns', case when shutdoor_is_pro(auth.uid()) then null else 1 end)
$$;

-- ---- calls, as the daily's guard checks them (157) ------------------------------
create or replace function public.shutdoor_calls_ok(p_calls jsonb, p_pitches int) returns boolean
language sql immutable as $$
  select p_pitches is not null and p_pitches between 1 and 150 and not (
    jsonb_typeof(p_calls) is distinct from 'array' or jsonb_array_length(p_calls) <> p_pitches
     or exists (select 1 from jsonb_array_elements(p_calls) c
                 where jsonb_typeof(c) <> 'object'
                    or (c->>'type') is null or length(c->>'type') > 2
                    or (c->>'cell') !~ '^[0-9]+$' or (c->>'cell')::int not between 0 and 24
                    -- the release (156): absent or null is 1.0x; present, a number 0..1. The case
                    -- reads the number only once it is one, so a string never reaches the cast
                    or case jsonb_typeof(c->'q')
                         when 'number' then (c->>'q')::numeric not between 0 and 1
                         when 'null' then false
                         else c ? 'q' end
                    -- the effort (157): absent or null is his ordinary pitch; present, a number
                    -- 0..1 on a call with a number q. Read as a number only once it is one
                    or case jsonb_typeof(c->'e')
                         when 'number' then (c->>'e')::numeric not between 0 and 1
                                            or jsonb_typeof(c->'q') is distinct from 'number'
                         when 'null' then false
                         else c ? 'e' end
                    -- the free aim point (157): absent or null is the cell's centre; present, two
                    -- numbers -0.5..0.5. Each read as a number only once it is one
                    or case jsonb_typeof(c->'at')
                         when 'array' then jsonb_array_length(c->'at') <> 2
                                           or exists (select 1 from jsonb_array_elements(c->'at') a
                                                       where case when jsonb_typeof(a) = 'number'
                                                                  then (a #>> '{}')::numeric not between -0.5 and 0.5
                                                                  else true end)
                         when 'null' then false
                         else c ? 'at' end))
$$;

-- ---- Survivor ---------------------------------------------------------------------
create table if not exists public.shutdoor_survivor (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  day        date        not null,
  run        int         not null check (run >= 0),
  entries    jsonb       not null default '[]'::jsonb,
  saves      int         not null default 0,
  points     int         not null default 0,
  over       boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day, run)
);
create index if not exists shutdoor_survivor_rank on public.shutdoor_survivor (day, run, saves desc, points desc, updated_at);
alter table public.shutdoor_survivor enable row level security;
revoke all on public.shutdoor_survivor from anon, authenticated;

-- the caller's runs for a day: {day, pro, runs [{run, saves, points, over, entries}], canStart}.
-- null signed out
create or replace function public.shutdoor_survivor_state(p_day date) returns json
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else json_build_object(
    'day', p_day,
    'pro', shutdoor_is_pro(auth.uid()),
    'runs', coalesce((select json_agg(json_build_object('run', s.run, 'saves', s.saves, 'points', s.points,
                                                        'over', s.over, 'entries', s.entries) order by s.run)
                        from shutdoor_survivor s where s.user_id = auth.uid() and s.day = p_day), '[]'::json),
    'canStart', not exists (select 1 from shutdoor_survivor s where s.user_id = auth.uid() and s.day = p_day and not s.over)
                and (shutdoor_is_pro(auth.uid())
                     or not exists (select 1 from shutdoor_survivor s where s.user_id = auth.uid() and s.day = p_day)))
  end
$$;

-- start the day's run, or resume the live one. Free: run 0 only. Pro: the next run once
-- the last is over. Answers shutdoor_survivor_state(p_day)
create or replace function public.shutdoor_survivor_start(p_day date) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nxt int;
begin
  if uid is null then raise exception 'sign in to keep a run'; end if;
  if p_day is distinct from shutdoor_today() then raise exception 'a run starts today'; end if;
  if exists (select 1 from shutdoor_survivor s where s.user_id = uid and s.day = p_day and not s.over) then
    return shutdoor_survivor_state(p_day);
  end if;
  select coalesce(max(s.run) + 1, 0) into nxt from shutdoor_survivor s where s.user_id = uid and s.day = p_day;
  if nxt > 0 and not shutdoor_is_pro(uid) then raise exception 'one run a day'; end if;
  insert into shutdoor_survivor (user_id, day, run) values (uid, p_day, nxt) on conflict do nothing;
  return shutdoor_survivor_state(p_day);
end $$;

-- one finished situation of a live run, in order (p_index is how many came before).
-- A door shut is a save and the run goes on; anything else ends it. A repeat of a
-- posted index changes nothing. Answers shutdoor_survivor_state(p_day)
create or replace function public.shutdoor_survivor_post(
  p_day date, p_run int, p_index int, p_scenario text, p_calls jsonb, p_outcome text, p_pitches int, p_score int)
returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s record;
begin
  if uid is null then raise exception 'sign in to keep a run'; end if;
  if p_day is null or p_day not between shutdoor_today() - 1 and shutdoor_today() then raise exception 'that day is not open'; end if;
  select * into s from shutdoor_survivor x where x.user_id = uid and x.day = p_day and x.run = p_run for update;
  if not found then raise exception 'no such run'; end if;
  if p_index is null or p_index < jsonb_array_length(s.entries) then return shutdoor_survivor_state(p_day); end if;
  if s.over then raise exception 'the run is over'; end if;
  if p_index <> jsonb_array_length(s.entries) or p_index >= 500 then raise exception 'out of order'; end if;
  if p_outcome is null or p_outcome not in ('door_shut', 'tie_held', 'doors_open', 'walk_off') then raise exception 'not an outcome'; end if;
  if not shutdoor_calls_ok(p_calls, p_pitches) then raise exception 'the calls do not make an outing'; end if;
  if p_score is null or p_score not between 0 and 1000 then raise exception 'not a real score'; end if;
  if p_scenario is null or not exists (select 1 from shutdoor_packs p where p.id = p_scenario) then raise exception 'not a situation'; end if;
  update shutdoor_survivor set
      entries = entries || jsonb_build_array(jsonb_build_object('scenarioId', p_scenario, 'calls', p_calls,
                                                                'outcome', p_outcome, 'pitches', p_pitches, 'score', p_score)),
      saves = saves + (p_outcome = 'door_shut')::int,
      points = points + p_score,
      over = p_outcome <> 'door_shut',
      updated_at = now()
   where user_id = uid and day = p_day and run = p_run;
  return shutdoor_survivor_state(p_day);
end $$;

-- the day's Survivor board: run 0 of each player, most saves, then most points, then who
-- got there first. Live runs show as they stand
create or replace function public.shutdoor_survivor_board(p_day date, p_limit int default 50)
returns table (rank bigint, username text, saves int, points int, over boolean, mine boolean, players bigint)
language sql security definer set search_path = public stable as $$
  with r as (
    select s.*, row_number() over (order by s.saves desc, s.points desc, s.updated_at) as rk, count(*) over () as n
      from shutdoor_survivor s where s.day = p_day and s.run = 0
  )
  select r.rk, coalesce(p.username, 'Closer')::text, r.saves, r.points, r.over, r.user_id = auth.uid(), r.n
    from r left join profiles p on p.id = r.user_id
   where r.rk <= greatest(1, least(100, coalesce(p_limit, 50))) or r.user_id = auth.uid()
   order by r.rk
$$;

-- ---- the archive (Pro) --------------------------------------------------------------
create table if not exists public.shutdoor_archive (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  day         date        not null,
  scenario_id text        not null check (length(scenario_id) between 1 and 64),
  calls       jsonb       not null,
  outcome     text        not null check (outcome in ('door_shut', 'tie_held', 'doors_open', 'walk_off')),
  pitches     int         not null,
  score       int         not null check (score between 0 and 1000),
  percentile  int         not null check (percentile between 0 and 100),
  created_at  timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.shutdoor_archive enable row level security;
revoke all on public.shutdoor_archive from anon, authenticated;

-- keep a past daily played from the archive. Pro only, a day before today, the first one
-- stands. Never on the daily board. {taken}
create or replace function public.shutdoor_archive_submit(
  p_day date, p_scenario text, p_calls jsonb, p_outcome text, p_pitches int, p_score int, p_percentile int)
returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'sign in to keep it'; end if;
  if not shutdoor_is_pro(uid) then raise exception 'the archive is for Pro'; end if;
  if p_day is null or p_day < date '2026-10-26' or p_day >= shutdoor_today() then raise exception 'not an archive day'; end if;
  if p_outcome is null or p_outcome not in ('door_shut', 'tie_held', 'doors_open', 'walk_off') then raise exception 'not an outcome'; end if;
  if not shutdoor_calls_ok(p_calls, p_pitches) then raise exception 'the calls do not make an outing'; end if;
  if p_score is null or p_score not between 0 and 1000 or p_percentile is null or p_percentile not between 0 and 100 then
    raise exception 'not a real score';
  end if;
  insert into shutdoor_archive (user_id, day, scenario_id, calls, outcome, pitches, score, percentile)
    values (uid, p_day, left(p_scenario, 64), p_calls, p_outcome, p_pitches, p_score, p_percentile)
    on conflict (user_id, day) do nothing;
  get diagnostics n = row_count;
  return json_build_object('taken', n > 0);
end $$;

-- ---- grants -------------------------------------------------------------------------
revoke all on function public.shutdoor_hash(text) from public;
revoke all on function public.shutdoor_fixed_pack(date) from public;
revoke all on function public.shutdoor_vote_candidates(date) from public;
revoke all on function public.shutdoor_vote_lock(date) from public;
revoke all on function public.shutdoor_vote(date) from public;
revoke all on function public.shutdoor_vote_cast(date, text) from public;
revoke all on function public.shutdoor_entitlements() from public;
revoke all on function public.shutdoor_calls_ok(jsonb, int) from public;
revoke all on function public.shutdoor_survivor_state(date) from public;
revoke all on function public.shutdoor_survivor_start(date) from public;
revoke all on function public.shutdoor_survivor_post(date, int, int, text, jsonb, text, int, int) from public;
revoke all on function public.shutdoor_survivor_board(date, int) from public;
revoke all on function public.shutdoor_archive_submit(date, text, jsonb, text, int, int, int) from public;
revoke all on function public.shutdoor_submit(date, int, text, jsonb, text, int, int, int, text, jsonb) from public;
grant execute on function public.shutdoor_vote(date) to anon, authenticated;
grant execute on function public.shutdoor_vote_cast(date, text) to authenticated;
grant execute on function public.shutdoor_entitlements() to anon, authenticated;
grant execute on function public.shutdoor_survivor_state(date) to authenticated;
grant execute on function public.shutdoor_survivor_start(date) to authenticated;
grant execute on function public.shutdoor_survivor_post(date, int, int, text, jsonb, text, int, int) to authenticated;
grant execute on function public.shutdoor_survivor_board(date, int) to anon, authenticated;
grant execute on function public.shutdoor_archive_submit(date, text, jsonb, text, int, int, int) to authenticated;
grant execute on function public.shutdoor_submit(date, int, text, jsonb, text, int, int, int, text, jsonb) to authenticated;
