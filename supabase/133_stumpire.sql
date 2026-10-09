-- Stumpire: the daily "name something the umpire didn't see coming" game.
-- Run once in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- TESTERS ONLY. Nothing here is reachable from a browser role: RLS is on with
-- no policies, and every function is revoked from anon and authenticated. The
-- only caller is the Pages Function at functions/api/stumpire, holding the
-- service role, which checks stumpire_access() before it answers anything and
-- returns 404 to everybody it refuses. The game's rules run there, in
-- functions/_stumpire/game.js; this file stores what it decides.
--
-- WHO IS A TESTER IS A ROW, NOT A DEPLOY:
--   insert into stumpire_testers (user_id, role, note)
--     select id, 'tester', 'friend' from profiles where username = 'somebody';
--   delete from stumpire_testers where user_id = (select id from profiles where username = 'somebody');
-- or from the admin page at /arcade/stumpire/admin.
--
-- THE FLAG: stumpire_settings 'mode' is 'off' (admins only), 'testers' (the
-- table above) or 'public' (anybody, a future launch). It ships 'testers'.
--
-- A PUBLISHED GRADE NEVER MOVES. stumpire_prompt_answers rows for a frozen
-- slate refuse UPDATE and DELETE in a trigger. The one insert allowed after
-- freezing is an upheld challenge's benefit-of-the-doubt row: arguable, a
-- single. Everybody who played before it keeps their result; the challenger's
-- own play is restored by the API.

create table if not exists public.stumpire_settings (
  key   text primary key,
  value jsonb not null
);
insert into public.stumpire_settings (key, value) values ('mode', '"testers"')
  on conflict (key) do nothing;

create table if not exists public.stumpire_testers (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  role     text not null default 'tester',
  note     text,
  added_at timestamptz not null default now(),
  constraint stumpire_testers_role_ck check (role in ('tester', 'admin'))
);

create table if not exists public.stumpire_prompts (
  id         text primary key,
  text       text not null,
  league     text not null,
  type       text not null default 'athlete',
  query      jsonb not null,            -- { years, where, set }
  wildcard   text,
  arguable   text[] not null default '{}',
  status     text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stumpire_prompts_league_ck check (league in ('NFL', 'NBA', 'MLB')),
  constraint stumpire_prompts_type_ck check (type in ('athlete', 'team')),
  constraint stumpire_prompts_status_ck check (status in ('draft', 'published', 'retired'))
);

create table if not exists public.stumpire_slates (
  slate_date   date primary key,
  slate_no     integer not null,
  prompt_ids   text[] not null,
  prompt_text  text[] not null,
  leagues      text[] not null,
  types        text[] not null,
  frozen       boolean not null default true,
  published_at timestamptz not null default now(),
  published_by uuid,
  constraint stumpire_slates_five check (cardinality(prompt_ids) = 5)
);

create table if not exists public.stumpire_prompt_answers (
  slate_date     date not null references public.stumpire_slates(slate_date) on delete cascade,
  at_bat         smallint not null,
  prompt_id      text not null,
  entity_id      text not null,
  name           text not null,
  prior_share    double precision not null default 0,
  observed_count integer not null default 0,
  expected_share double precision not null default 0,
  depth          double precision not null default 0,
  tier           smallint not null,
  called         boolean not null default false,
  arguable       boolean not null default false,
  primary key (slate_date, at_bat, entity_id),
  constraint stumpire_pa_at_bat_ck check (at_bat between 0 and 4),
  constraint stumpire_pa_tier_ck check (tier between 1 and 4)
);

create or replace function public.stumpire_pa_frozen() returns trigger
language plpgsql as $$
declare v_frozen boolean;
begin
  select frozen into v_frozen from public.stumpire_slates
   where slate_date = coalesce(new.slate_date, old.slate_date);
  if coalesce(v_frozen, false) then
    if tg_op in ('UPDATE', 'DELETE') then
      raise exception 'stumpire: a published grade is frozen';
    end if;
    if tg_op = 'INSERT' and (not new.arguable or new.tier <> 1 or new.called) then
      raise exception 'stumpire: only a benefit-of-the-doubt single can join a frozen slate';
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists stumpire_pa_frozen on public.stumpire_prompt_answers;
create trigger stumpire_pa_frozen before insert or update or delete on public.stumpire_prompt_answers
  for each row execute function public.stumpire_pa_frozen();

create or replace function public.stumpire_slate_frozen() returns trigger
language plpgsql as $$
begin
  if old.frozen and (new.prompt_ids is distinct from old.prompt_ids or not new.frozen) then
    raise exception 'stumpire: a published slate is frozen';
  end if;
  return new;
end $$;
drop trigger if exists stumpire_slate_frozen on public.stumpire_slates;
create trigger stumpire_slate_frozen before update on public.stumpire_slates
  for each row execute function public.stumpire_slate_frozen();

create table if not exists public.stumpire_plays (
  id         bigserial primary key,
  slate_date date not null references public.stumpire_slates(slate_date) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  guest_id   text,
  state      jsonb not null,
  version    integer not null default 1,
  bases      smallint not null default 0,
  outs       smallint not null default 0,
  strikes    smallint not null default 0,
  over       boolean not null default false,
  won        boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stumpire_plays_who check (user_id is not null or guest_id is not null)
);
create unique index if not exists stumpire_plays_user_day on public.stumpire_plays (slate_date, user_id) where user_id is not null;
create unique index if not exists stumpire_plays_guest_day on public.stumpire_plays (slate_date, guest_id) where guest_id is not null;

create table if not exists public.stumpire_answer_log (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  slate_date date,
  at_bat     smallint,
  prompt_id  text,
  play_id    bigint,
  raw        text,
  matched_id text,
  status     text not null,          -- match | picker | nopitch | expired
  via        text,                   -- id | exact | alias | order | surname | fuzzy
  ruling     text,                   -- SAFE | OUT | STRIKE | NO_PITCH | PICKER
  source     text not null default 'stumpire',
  constraint stumpire_log_raw_len check (raw is null or char_length(raw) <= 60)
);
create index if not exists stumpire_log_prompt on public.stumpire_answer_log (prompt_id, matched_id);
create index if not exists stumpire_log_nopitch on public.stumpire_answer_log (created_at desc) where status = 'nopitch';

create table if not exists public.stumpire_challenges (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  play_id     bigint references public.stumpire_plays(id) on delete cascade,
  user_id     uuid,
  slate_date  date not null,
  at_bat      smallint not null,
  prompt_id   text not null,
  entity_id   text,
  raw         text,
  ruling      text not null,
  note        text,
  status      text not null default 'open',
  resolved_at timestamptz,
  resolved_by uuid,
  resolution  text,
  constraint stumpire_challenge_status_ck check (status in ('open', 'upheld', 'denied')),
  constraint stumpire_challenge_note_len check (note is null or char_length(note) <= 280)
);
create unique index if not exists stumpire_challenge_once on public.stumpire_challenges (play_id, at_bat);

create table if not exists public.stumpire_review (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  slate_date date not null,
  at_bat     smallint not null,
  prompt_id  text not null,
  entity_id  text not null,
  play_id    bigint,
  reason     text not null,
  status     text not null default 'open',
  constraint stumpire_review_status_ck check (status in ('open', 'kept', 'removed'))
);

alter table public.stumpire_settings       enable row level security;
alter table public.stumpire_testers        enable row level security;
alter table public.stumpire_prompts        enable row level security;
alter table public.stumpire_slates         enable row level security;
alter table public.stumpire_prompt_answers enable row level security;
alter table public.stumpire_plays          enable row level security;
alter table public.stumpire_answer_log     enable row level security;
alter table public.stumpire_challenges     enable row level security;
alter table public.stumpire_review         enable row level security;
-- deliberately no policies, and no grants to anon or authenticated
revoke all on public.stumpire_settings, public.stumpire_testers, public.stumpire_prompts,
  public.stumpire_slates, public.stumpire_prompt_answers, public.stumpire_plays,
  public.stumpire_answer_log, public.stumpire_challenges, public.stumpire_review
  from anon, authenticated;

/* Who may see Stumpire. 'admin', 'tester', 'player' (public mode) or null. */
create or replace function public.stumpire_access(p_uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when (select role from stumpire_testers where user_id = p_uid) = 'admin' then 'admin'
    when coalesce((select value #>> '{}' from stumpire_settings where key = 'mode'), 'off') = 'off' then null
    when exists (select 1 from stumpire_testers where user_id = p_uid) then 'tester'
    when (select value #>> '{}' from stumpire_settings where key = 'mode') = 'public' then 'player'
    else null end;
$$;

/* Save a play only if nobody else wrote it first. Returns the new version, or
   null when the version moved (two tabs, a double tap): the API reloads. */
create or replace function public.stumpire_save_play(
  p_id bigint, p_version integer, p_state jsonb,
  p_bases integer, p_outs integer, p_strikes integer, p_over boolean, p_won boolean
) returns integer
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  update stumpire_plays
     set state = p_state, version = version + 1, bases = p_bases, outs = p_outs,
         strikes = p_strikes, over = p_over, won = p_won, updated_at = now()
   where id = p_id and version = p_version
   returning version into v;
  return v;
end $$;

/* Publish a slate in one transaction: the slate and every frozen row, or
   nothing. A slate already published for that date is refused. */
create or replace function public.stumpire_publish_slate(
  p_date date, p_no integer, p_prompt_ids text[], p_text text[], p_leagues text[], p_types text[],
  p_rows jsonb, p_by uuid default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if exists (select 1 from stumpire_slates where slate_date = p_date) then
    raise exception 'stumpire: a slate is already published for %', p_date;
  end if;
  insert into stumpire_slates (slate_date, slate_no, prompt_ids, prompt_text, leagues, types, frozen, published_by)
    values (p_date, p_no, p_prompt_ids, p_text, p_leagues, p_types, false, p_by);
  insert into stumpire_prompt_answers (slate_date, at_bat, prompt_id, entity_id, name, prior_share,
      observed_count, expected_share, depth, tier, called, arguable)
    select p_date, (r->>'at_bat')::smallint, r->>'prompt_id', r->>'entity_id', r->>'name',
           (r->>'prior_share')::float8, (r->>'observed_count')::int, (r->>'expected_share')::float8,
           (r->>'depth')::float8, (r->>'tier')::smallint, (r->>'called')::boolean, (r->>'arguable')::boolean
      from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  update stumpire_slates set frozen = true where slate_date = p_date;
  update stumpire_prompts set status = 'published', updated_at = now() where id = any (p_prompt_ids);
  return n;
end $$;

/* What real players said for a prompt, for the blend. */
create or replace function public.stumpire_observed(p_prompt_id text)
returns table (entity_id text, n bigint)
language sql stable security definer set search_path = public as $$
  select matched_id, count(*) from stumpire_answer_log
   where prompt_id = p_prompt_id and matched_id is not null and ruling in ('SAFE', 'OUT')
   group by matched_id;
$$;

/* A guest's play joins the account that signs in, unless that account has
   already played the same slate. Returns how many plays moved. */
create or replace function public.stumpire_claim(p_guest text, p_uid uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update stumpire_plays g set user_id = p_uid, guest_id = null
   where g.guest_id = p_guest and g.user_id is null
     and not exists (select 1 from stumpire_plays u where u.user_id = p_uid and u.slate_date = g.slate_date);
  get diagnostics n = row_count;
  return n;
end $$;

/* An upheld challenge on a valid answer the slate missed: the answer joins
   today's slate as a benefit-of-the-doubt single for everyone after. */
create or replace function public.stumpire_accept_answer(
  p_date date, p_at_bat smallint, p_prompt_id text, p_entity_id text, p_name text
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into stumpire_prompt_answers (slate_date, at_bat, prompt_id, entity_id, name, tier, called, arguable)
    values (p_date, p_at_bat, p_prompt_id, p_entity_id, p_name, 1, false, true)
    on conflict do nothing;
  return found;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'stumpire_access(uuid)', 'stumpire_save_play(bigint,integer,jsonb,integer,integer,integer,boolean,boolean)',
    'stumpire_publish_slate(date,integer,text[],text[],text[],text[],jsonb,uuid)', 'stumpire_observed(text)',
    'stumpire_claim(text,uuid)', 'stumpire_accept_answer(date,smallint,text,text,text)']
  loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
  end loop;
end $$;

notify pgrst, 'reload schema';
