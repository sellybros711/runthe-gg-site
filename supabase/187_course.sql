-- 187: Run The Course, phase 1 (2026-11-25).
--
-- A golf course tycoon at /course, unlisted until launch. A signed in
-- player's course lives here. Its Pages Function (functions/api/course)
-- resolves the account from the browser's session, re-runs a filed shift
-- with the game's own simulation, and writes here with the service role.
-- No browser role can read or write any of this.
--
--   course_courses   one row a course: owner, name, tier, cash, stars, seed
--   course_holes     one row a hole: par, template, design version, condition
--   course_shifts    one row a filed shift: the server's own result of it
--
--   course_open(user, seed, holes)         the course, made on the first visit
--   course_shift_file(...)                 one shift, once: the result, cash, stars
--   course_events_add(user, device, rows)  first party events into game_events (170)
--
-- course_shift_file rewrites two jsonb columns, once a filed shift: the
-- shift number must be the next one, so a resend writes nothing. It is an
-- "event" in scripts/save-writes.json. Opening the game writes nothing.
--
-- Safe to run twice: create if not exists, create or replace, the same grants.
-- Needs 170 and 171 (game_events, with device_id and an optional user_id).

create table if not exists public.course_courses (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null references auth.users(id) on delete cascade,
  slot           int  not null default 1,
  name           text not null default 'Your Course',
  logo           text,
  tier           text not null default 'muni',
  cash           bigint not null default 0,
  stars          numeric(3,2) not null default 2.00,
  schema_version int  not null default 1,
  config_version int  not null default 1,
  seed           int  not null,
  shifts_filed   int  not null default 0,
  state          jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  constraint course_courses_owner_slot unique (owner, slot),
  constraint course_courses_name_ck check (char_length(name) between 1 and 40),
  constraint course_courses_cash_ck check (cash >= 0),
  constraint course_courses_stars_ck check (stars between 1 and 5),
  constraint course_courses_state_ck check (pg_column_size(state) < 16000)
);

create table if not exists public.course_holes (
  course_id      uuid not null references public.course_courses(id) on delete cascade,
  ord            int  not null,
  par            int  not null,
  template       text not null,
  open           boolean not null default false,
  design_version int  not null default 1,
  mastery        int  not null default 0,
  design_points  int  not null default 6,
  layout         jsonb not null default '{}',
  condition      jsonb not null default '{}',
  primary key (course_id, ord),
  constraint course_holes_ord_ck check (ord between 1 and 18),
  constraint course_holes_par_ck check (par between 3 and 5),
  constraint course_holes_layout_ck check (pg_column_size(layout) < 8000),
  constraint course_holes_condition_ck check (pg_column_size(condition) < 1000)
);

create table if not exists public.course_shifts (
  course_id      uuid not null references public.course_courses(id) on delete cascade,
  shift_no       int  not null,
  server_day     date not null default ((now() at time zone 'America/New_York')::date),
  seed           int  not null,
  config_version int  not null,
  rounds         int  not null,
  cash           int  not null,
  tips           int  not null,
  walk_offs      int  not null,
  avg_round_s    numeric(6,1),
  low_round      int,
  stars_after    numeric(3,2) not null,
  checksum       text not null,
  verified       text not null,
  filed_at       timestamptz not null default now(),
  primary key (course_id, shift_no),
  constraint course_shifts_verified_ck check (verified in ('replay', 'bounds'))
);

alter table public.course_courses enable row level security;
alter table public.course_holes   enable row level security;
alter table public.course_shifts  enable row level security;
revoke all on public.course_courses, public.course_holes, public.course_shifts from anon, authenticated;

-- The course and its holes, in one round trip. The first
-- visit makes the course from the holes the Function sends (the game's own
-- config); later visits only read, so opening the game writes nothing.
create or replace function public.course_open(p_user uuid, p_seed int, p_holes jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare c public.course_courses%rowtype;
begin
  if p_user is null then return null; end if;
  select * into c from course_courses where owner = p_user and slot = 1;
  if not found then
    if jsonb_typeof(p_holes) is distinct from 'array' or jsonb_array_length(p_holes) not between 1 and 18 then return null; end if;
    insert into course_courses (owner, seed) values (p_user, p_seed)
      on conflict (owner, slot) do nothing;
    select * into c from course_courses where owner = p_user and slot = 1;
    insert into course_holes (course_id, ord, par, template, open, condition)
      select c.id, (h->>'ord')::int, (h->>'par')::int, h->>'template', coalesce((h->>'open')::boolean, false), coalesce(h->'condition', '{}'::jsonb)
        from jsonb_array_elements(p_holes) h
      on conflict (course_id, ord) do nothing;
  end if;
  return json_build_object(
    'course', json_build_object('id', c.id, 'name', c.name, 'logo', c.logo, 'tier', c.tier, 'cash', c.cash, 'stars', c.stars,
      'schema_version', c.schema_version, 'config_version', c.config_version, 'seed', c.seed,
      'shifts_filed', c.shifts_filed, 'state', c.state),
    'holes', (select coalesce(json_agg(json_build_object('ord', h.ord, 'par', h.par, 'template', h.template, 'open', h.open,
        'design_version', h.design_version, 'mastery', h.mastery, 'design_points', h.design_points,
        'layout', h.layout, 'condition', h.condition) order by h.ord), '[]'::json)
      from course_holes h where h.course_id = c.id),
    'now', now());
end $$;

-- One shift, filed once. The Function has already re-run it; these are the
-- server's numbers, not the page's. The shift number must be the next one, so
-- a second send of the same shift (a retry, a second tab) changes nothing and
-- answers filed = false with what is stored.
create or replace function public.course_shift_file(
  p_user uuid, p_shift_no int, p_seed int, p_config_version int,
  p_result jsonb, p_cash bigint, p_stars numeric, p_state jsonb, p_conditions jsonb,
  p_checksum text, p_verified text)
returns json language plpgsql security definer set search_path = public as $$
declare c public.course_courses%rowtype; v_new boolean := false;
begin
  if p_user is null then return null; end if;
  select * into c from course_courses where owner = p_user and slot = 1 for update;
  if not found then return null; end if;
  if p_shift_no = c.shifts_filed + 1 and p_cash >= 0 and p_stars between 1 and 5 then
    insert into course_shifts (course_id, shift_no, seed, config_version, rounds, cash, tips, walk_offs,
        avg_round_s, low_round, stars_after, checksum, verified)
      values (c.id, p_shift_no, p_seed, p_config_version, (p_result->>'rounds')::int, (p_result->>'cash')::int,
        (p_result->>'tips')::int, (p_result->>'walk_offs')::int, (p_result->>'avg_round_s')::numeric,
        (p_result->>'low_round')::int, p_stars, p_checksum, p_verified)
      on conflict (course_id, shift_no) do nothing;
    v_new := found;
  end if;
  if v_new then
    update course_courses set cash = p_cash, stars = p_stars, shifts_filed = p_shift_no,
        state = coalesce(p_state, state), last_seen_at = now()
      where id = c.id returning * into c;
    update course_holes h set condition = x.condition
      from (select (e->>'ord')::int as ord, e->'condition' as condition
              from jsonb_array_elements(coalesce(p_conditions, '[]'::jsonb)) e) x
     where h.course_id = c.id and h.ord = x.ord and h.condition is distinct from x.condition;
  end if;
  return json_build_object('filed', v_new, 'cash', c.cash, 'stars', c.stars, 'shifts_filed', c.shifts_filed);
end $$;

-- First party events, as 175 does for Last Shot: a batch for one player (an
-- account, else a device), a daily cap, and a small trim of old rows a call.
create or replace function public.course_events_add(p_user uuid, p_device text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int; cap constant int := 3000; keep constant interval := interval '120 days'; trim_n constant int := 200;
begin
  if p_device is not null and p_device !~ '^[A-Za-z0-9-]{8,40}$' then p_device := null; end if;
  if p_user is null and p_device is null then return 0; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 40 then return 0; end if;
  if (select count(*) from game_events where game = 'course' and created_at > now() - interval '1 day'
        and (case when p_user is not null then user_id = p_user else user_id is null and device_id = p_device end)) >= cap then return 0; end if;
  insert into game_events (game, user_id, device_id, session_id, name, client_ms, props)
    select 'course', p_user, p_device, r->>'session_id', r->>'name', (r->>'client_ms')::int, coalesce(r->'props', '{}'::jsonb)
      from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  delete from game_events where id in (
    select id from game_events where game = 'course' and created_at < now() - keep
     order by created_at limit trim_n);
  return n;
end $$;

-- The server role only (183's lesson: a revoke from public takes the service
-- role's execute with it, so it is granted back by name).
revoke all on function public.course_open(uuid, int, jsonb) from public, anon, authenticated;
revoke all on function public.course_shift_file(uuid, int, int, int, jsonb, bigint, numeric, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.course_events_add(uuid, text, jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.course_open(uuid, int, jsonb) to service_role';
    execute 'grant execute on function public.course_shift_file(uuid, int, int, int, jsonb, bigint, numeric, jsonb, jsonb, text, text) to service_role';
    execute 'grant execute on function public.course_events_add(uuid, text, jsonb) to service_role';
    execute 'grant select, insert, update, delete on public.course_courses, public.course_holes, public.course_shifts to service_role';
  end if;
end $$;
