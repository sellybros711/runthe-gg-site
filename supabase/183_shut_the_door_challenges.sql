-- ---------------------------------------------------------------------------
-- 183_shut_the_door_challenges.sql : Shut The Door custom challenges
--
--   psql ... -f supabase/183_shut_the_door_challenges.sql
--
-- Needs 160 (shutdoor_is_pro, shutdoor_calls_ok, shutdoor_packs). Safe to run more
-- than once. Run it BEFORE the site PR merges, and before the matchup build uploads
-- (.github/workflows/shut-the-door-matchups.yml writes into the bucket made here).
--
-- WHAT IT IS (the owner, 2026-11-18). A Pro player makes a challenge: any pack's pitcher
-- against any pack's lineup, who is up, who is on, the outs, the count, the lead (1 to 3)
-- and the inning (8th, 9th or 10th). Anyone with the link plays it free, signed in or not;
-- signing in posts the score. One counted try a player, the first post stands. A
-- challenge never expires.
--
-- WHAT IT NEVER TOUCHES: the daily board (shutdoor_outings), Survivor (shutdoor_survivor)
-- and the archive. Its results live in their own table and only its own functions read it.
--
-- What changes:
--   storage bucket shutdoor-matchups     public: the matchup packs, gzipped (matchups.js)
--   shutdoor_challenges                  one row a challenge: its spec, its data, its seed, its rules
--   shutdoor_challenge_results           one row a player a challenge: the first post
--   shutdoor_challenge_spec_ok(jsonb)    challenge.js normalize, as the server checks it
--   shutdoor_challenge_create            Pro: make one ({code, seed, rules, createdAt})
--   shutdoor_challenge_get               anyone: one by its code, with its standings
--   shutdoor_challenge_submit            signed in: the one counted try
--   shutdoor_my_challenges               signed in: the ones made and played
-- ---------------------------------------------------------------------------

-- ---- the matchup packs: public files, read straight from their public URL ------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('shutdoor-matchups', 'shutdoor-matchups', true, 5242880, array['application/gzip', 'application/octet-stream'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                                 allowed_mime_types = excluded.allowed_mime_types;

-- ---- the challenges -------------------------------------------------------------------
create table if not exists public.shutdoor_challenges (
  code        text        primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  creator     uuid        not null references auth.users(id) on delete cascade,
  spec        jsonb       not null,
  pitcher     text        not null check (length(pitcher) between 1 and 64),
  lineup      text        not null check (length(lineup) between 1 and 64),
  build       text        not null check (build ~ '^[a-z0-9-]{1,32}$'),
  sha         text        not null check (sha ~ '^[0-9a-f]{64}$'),
  seed        bigint      not null check (seed between 0 and 4294967295),
  rules       int         not null check (rules between 1 and 99),
  created_at  timestamptz not null default now()
);
create index if not exists shutdoor_challenges_creator on public.shutdoor_challenges (creator, created_at desc);
alter table public.shutdoor_challenges enable row level security;
revoke all on public.shutdoor_challenges from anon, authenticated;

create table if not exists public.shutdoor_challenge_results (
  code        text        not null references public.shutdoor_challenges(code) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  calls       jsonb       not null,
  outcome     text        not null check (outcome in ('door_shut', 'tie_held', 'doors_open', 'walk_off')),
  pitches     int         not null,
  score       int         not null check (score between 0 and 1000),
  strip       jsonb       not null,
  created_at  timestamptz not null default now(),
  primary key (code, user_id)
);
create index if not exists shutdoor_challenge_results_rank on public.shutdoor_challenge_results (code, score desc, created_at);
create index if not exists shutdoor_challenge_results_user on public.shutdoor_challenge_results (user_id, created_at desc);
alter table public.shutdoor_challenge_results enable row level security;
revoke all on public.shutdoor_challenge_results from anon, authenticated;

-- ---- the spec, as challenge.js normalize checks it ------------------------------------
-- null when it is a challenge, else the reason. Each field read as a number only once it is one.
create or replace function public.shutdoor_challenge_spec_ok(p jsonb) returns text
language plpgsql immutable as $$
declare
  up int; r int; back int; i int; seen int[] := '{}';
  nums text[] := array['up', 'outs', 'balls', 'strikes', 'lead', 'them', 'inning'];
  k text;
begin
  if jsonb_typeof(p) is distinct from 'object' then return 'not a challenge'; end if;
  if (p->>'v') is distinct from '1' then return 'not a challenge'; end if;
  if coalesce(p->>'pitcher', '') !~ '^std-[a-z0-9-]{3,60}$' then return 'pick a pitcher'; end if;
  if coalesce(p->>'lineup', '') !~ '^std-[a-z0-9-]{3,60}$' then return 'pick a lineup'; end if;
  foreach k in array nums loop
    if jsonb_typeof(p->k) is distinct from 'number' or (p->>k) !~ '^[0-9]+$' then return 'not a challenge'; end if;
  end loop;
  if jsonb_typeof(p->'home') is distinct from 'boolean' then return 'not a challenge'; end if;
  up := (p->>'up')::int;
  if up > 8 then return 'pick who is up'; end if;
  if (p->>'outs')::int > 2 then return 'pick the outs'; end if;
  if (p->>'balls')::int > 3 or (p->>'strikes')::int > 2 then return 'pick the count'; end if;
  if (p->>'lead')::int not between 1 and 3 then return 'the lead is 1 to 3 runs'; end if;
  if (p->>'them')::int > 20 then return 'pick the score'; end if;
  if (p->>'inning')::int not in (8, 9, 10) then return 'the 8th, the 9th or the 10th'; end if;
  if jsonb_typeof(p->'on') is distinct from 'array' or jsonb_array_length(p->'on') <> 3 then return 'pick the runners'; end if;
  for i in 0..2 loop
    if jsonb_typeof(p->'on'->i) = 'null' then continue; end if;
    if jsonb_typeof(p->'on'->i) is distinct from 'number' or (p->'on'->>i) !~ '^[0-9]+$' then return 'pick the runners'; end if;
    r := (p->'on'->>i)::int;
    if r > 8 then return 'pick the runners'; end if;
    if r = up then return 'the man up cannot be on base'; end if;
    if r = any(seen) then return 'a runner on two bases'; end if;
    back := (up - r + 9) % 9;
    if back < 1 or back > 4 then return 'a runner is one of the four hitters before the man up'; end if;
    seen := seen || r;
  end loop;
  -- only the fields challenge.js writes
  if exists (select 1 from jsonb_object_keys(p) x
              where x not in ('v', 'pitcher', 'lineup', 'up', 'on', 'outs', 'balls', 'strikes', 'lead', 'them', 'inning', 'home')) then
    return 'not a challenge';
  end if;
  return null;
end $$;

-- ---- one challenge, as everyone reads it ------------------------------------------------
-- {code, spec, build, sha, seed, rules, createdAt, creator, mine, players, results [{username,
-- score, outcome, pitches, creator, mine}] (the best 100, and the caller's), myResult {calls,
-- outcome, pitches, score} | null}. null when there is no such code.
create or replace function public.shutdoor_challenge_get(p_code text) returns json
language sql stable security definer set search_path = public as $$
  with c as (select * from shutdoor_challenges where code = upper(p_code)),
  r as (
    select x.*, row_number() over (order by x.score desc, x.created_at) as rk
      from shutdoor_challenge_results x where x.code = upper(p_code)
  )
  select case when not exists (select 1 from c) then null else (
    select json_build_object(
      'code', c.code, 'spec', c.spec, 'build', c.build, 'sha', c.sha, 'seed', c.seed, 'rules', c.rules,
      'createdAt', c.created_at,
      'creator', coalesce((select p.username from profiles p where p.id = c.creator), 'Closer'),
      'mine', c.creator = auth.uid(),
      'players', (select count(*) from r),
      'results', coalesce((select json_agg(json_build_object(
                     'rank', r.rk, 'username', coalesce(p.username, 'Closer'), 'score', r.score, 'outcome', r.outcome,
                     'pitches', r.pitches, 'creator', r.user_id = c.creator, 'mine', r.user_id = auth.uid()) order by r.rk)
                   from r left join profiles p on p.id = r.user_id
                  where r.rk <= 100 or r.user_id = auth.uid()), '[]'::json),
      'myResult', (select json_build_object('calls', r.calls, 'outcome', r.outcome, 'pitches', r.pitches, 'score', r.score)
                     from r where r.user_id = auth.uid()))
      from c)
  end
$$;

-- ---- make one (Pro) ---------------------------------------------------------------------
-- The server draws the seed, so the maker cannot pick his luck, and keeps the rules the page
-- played under, so everyone plays the same game. The code is six letters and digits.
create or replace function public.shutdoor_challenge_create(p_spec jsonb, p_build text, p_sha text, p_rules int)
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  why text;
  c text; s bigint; tries int := 0;
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if uid is null then raise exception 'sign in to make a challenge'; end if;
  if not shutdoor_is_pro(uid) then raise exception 'making a challenge is for Pro'; end if;
  why := shutdoor_challenge_spec_ok(p_spec);
  if why is not null then raise exception '%', why; end if;
  if not exists (select 1 from shutdoor_packs p where p.id = p_spec->>'pitcher') then raise exception 'not a pitcher in the game'; end if;
  if not exists (select 1 from shutdoor_packs p where p.id = p_spec->>'lineup') then raise exception 'not a lineup in the game'; end if;
  if coalesce(p_build, '') !~ '^[a-z0-9-]{1,32}$' or coalesce(p_sha, '') !~ '^[0-9a-f]{64}$' then raise exception 'not a matchup'; end if;
  if p_rules is null or p_rules not between 1 and 99 then raise exception 'not a rule set'; end if;
  if (select count(*) from shutdoor_challenges x where x.creator = uid and x.created_at > now() - interval '1 day') >= 50 then
    raise exception 'fifty challenges a day';
  end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * 32)::int, 1); end loop;
    s := floor(random() * 4294967296)::bigint;
    begin
      insert into shutdoor_challenges (code, creator, spec, pitcher, lineup, build, sha, seed, rules)
        values (c, uid, p_spec, p_spec->>'pitcher', p_spec->>'lineup', p_build, p_sha, s, p_rules);
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 20 then raise exception 'try again'; end if;
    end;
  end loop;
  return json_build_object('code', c, 'seed', s, 'rules', p_rules,
                           'createdAt', (select x.created_at from shutdoor_challenges x where x.code = c));
end $$;

-- ---- the one counted try ------------------------------------------------------------------
-- {taken (false when this account's earlier try counts), result: shutdoor_challenge_get}
create or replace function public.shutdoor_challenge_submit(
  p_code text, p_calls jsonb, p_outcome text, p_pitches int, p_score int, p_strip jsonb)
returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'sign in to post your score'; end if;
  if not exists (select 1 from shutdoor_challenges c where c.code = upper(p_code)) then raise exception 'no such challenge'; end if;
  if p_outcome is null or p_outcome not in ('door_shut', 'tie_held', 'doors_open', 'walk_off') then raise exception 'not an outcome'; end if;
  if not shutdoor_calls_ok(p_calls, p_pitches) then raise exception 'the calls do not make an outing'; end if;
  if jsonb_typeof(p_strip) is distinct from 'array' or jsonb_array_length(p_strip) <> p_pitches
     or exists (select 1 from jsonb_array_elements_text(p_strip) x where x not in ('green', 'yellow', 'orange', 'red')) then
    raise exception 'the strip does not match the calls';
  end if;
  if p_score is null or p_score not between 0 and 1000 then raise exception 'not a real score'; end if;
  insert into shutdoor_challenge_results (code, user_id, calls, outcome, pitches, score, strip)
    values (upper(p_code), uid, p_calls, p_outcome, p_pitches, p_score, p_strip)
    on conflict (code, user_id) do nothing;
  get diagnostics n = row_count;
  return json_build_object('taken', n > 0, 'result', shutdoor_challenge_get(p_code));
end $$;

-- ---- the caller's: made, and played -------------------------------------------------------
-- [{code, spec, createdAt, made, players, best, myScore}], newest first
create or replace function public.shutdoor_my_challenges(p_limit int default 50) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'code', c.code, 'spec', c.spec, 'createdAt', c.created_at, 'made', c.creator = auth.uid(),
           'players', (select count(*) from shutdoor_challenge_results x where x.code = c.code),
           'best', (select max(x.score) from shutdoor_challenge_results x where x.code = c.code),
           'myScore', (select x.score from shutdoor_challenge_results x where x.code = c.code and x.user_id = auth.uid()))
         order by c.created_at desc), '[]'::json)
    from (select * from shutdoor_challenges c
           where auth.uid() is not null
             and (c.creator = auth.uid()
                  or exists (select 1 from shutdoor_challenge_results x where x.code = c.code and x.user_id = auth.uid()))
           order by c.created_at desc
           limit greatest(1, least(200, coalesce(p_limit, 50)))) c
$$;

-- ---- grants ---------------------------------------------------------------------------------
revoke all on function public.shutdoor_challenge_spec_ok(jsonb) from public;
revoke all on function public.shutdoor_challenge_get(text) from public;
revoke all on function public.shutdoor_challenge_create(jsonb, text, text, int) from public;
revoke all on function public.shutdoor_challenge_submit(text, jsonb, text, int, int, jsonb) from public;
revoke all on function public.shutdoor_my_challenges(int) from public;
grant execute on function public.shutdoor_challenge_get(text) to anon, authenticated;
grant execute on function public.shutdoor_challenge_create(jsonb, text, text, int) to authenticated;
grant execute on function public.shutdoor_challenge_submit(text, jsonb, text, int, int, jsonb) to authenticated;
grant execute on function public.shutdoor_my_challenges(int) to authenticated;
