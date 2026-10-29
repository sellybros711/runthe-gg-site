-- Arcade Lab: the tester-only arcade skill games (Roll-Ball first).
-- Idempotent: safe to re-run.
--
-- TESTERS ONLY, GATED EXACTLY LIKE STUMPIRE. Who is a tester is the same
-- table, stumpire_testers (133): one list for every tester-only game. Each
-- game has its own flag here, all shipping 'off', which leaves a game visible
-- to admins alone. Nothing is reachable from a browser role: RLS on with no
-- policies, every function revoked from anon and authenticated. The only
-- caller is the Pages Function at functions/api/arcade, holding the service
-- role, which returns 404 to anybody the flag and the tester list refuse.
--
-- TURN A GAME ON FOR TESTERS:
--   update arcade_lab_flags set mode = 'testers' where flag = 'arcade_roll_ball';
-- ADD OR REMOVE A TESTER: see 133_stumpire.sql's header (stumpire_testers).
--
-- GEMS ARE A COSMETIC CURRENCY WITH NO CASH VALUE. They are never redeemable
-- for money. One award per run, held by a unique index.
--
-- WIPE EVERYTHING TESTERS PLAYED:
--   delete from gem_ledger where tester; delete from arcade_runs where tester;
--   delete from arcade_run_rejections;

create table if not exists public.arcade_lab_flags (
  flag       text primary key,
  mode       text not null default 'off',
  updated_at timestamptz not null default now(),
  constraint arcade_lab_flags_mode_ck check (mode in ('off', 'testers', 'public'))
);
insert into public.arcade_lab_flags (flag) values
  ('arcade_roll_ball'), ('arcade_field_goal_flick'), ('arcade_hoop_shoot'),
  ('arcade_whack_right_player'), ('arcade_drop_board'), ('arcade_pinball')
  on conflict (flag) do nothing;

create table if not exists public.arcade_runs (
  id              bigserial primary key,
  user_id         uuid references auth.users(id) on delete cascade,
  guest_id        text,
  game_id         text not null,
  date_key        date not null,
  mode            text not null,
  seed            bigint not null,
  score           integer not null,
  detail_json     jsonb not null default '{}',
  input_log_json  jsonb not null default '[]',
  duration_ms     integer not null,
  gems_awarded    integer not null default 0,
  client_version  text,
  tester          boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint arcade_runs_mode_ck check (mode in ('daily', 'practice')),
  constraint arcade_runs_who_ck check (user_id is not null or guest_id is not null)
);
-- One daily per player per game per day. The API checks first; this holds it.
create unique index if not exists arcade_runs_daily_user
  on public.arcade_runs (user_id, game_id, date_key) where mode = 'daily' and user_id is not null;
create unique index if not exists arcade_runs_daily_guest
  on public.arcade_runs (guest_id, game_id, date_key) where mode = 'daily' and user_id is null;
create index if not exists arcade_runs_board on public.arcade_runs (game_id, date_key, score desc);

create table if not exists public.gem_ledger (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  guest_id   text,
  amount     integer not null,
  reason     text not null,
  game_id    text,
  run_id     bigint references public.arcade_runs(id) on delete cascade,
  tester     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint gem_ledger_who_ck check (user_id is not null or guest_id is not null)
);
-- Awarding twice for one run is impossible.
create unique index if not exists gem_ledger_one_per_run on public.gem_ledger (run_id) where run_id is not null;
create index if not exists gem_ledger_user on public.gem_ledger (user_id);

create table if not exists public.arcade_run_rejections (
  id         bigserial primary key,
  user_id    uuid,
  guest_id   text,
  game_id    text not null,
  reason     text not null,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists arcade_run_rejections_recent on public.arcade_run_rejections (user_id, created_at);

alter table public.arcade_lab_flags      enable row level security;
alter table public.arcade_runs           enable row level security;
alter table public.gem_ledger            enable row level security;
alter table public.arcade_run_rejections enable row level security;
-- deliberately no policies, and no grants to anon or authenticated
revoke all on public.arcade_lab_flags, public.arcade_runs, public.gem_ledger, public.arcade_run_rejections
  from anon, authenticated;

create or replace function public.arcade_gem_total(p_uid uuid, p_guest text) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from gem_ledger
   where (p_uid is not null and user_id = p_uid) or (p_uid is null and guest_id = p_guest);
$$;

create or replace function public.arcade_lab_board(p_game text, p_date date, p_limit integer, p_tester boolean)
returns table (user_id uuid, username text, score integer)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.username::text, r.score
    from arcade_runs r left join profiles p on p.id = r.user_id
   where r.game_id = p_game and r.date_key = p_date and r.mode = 'daily' and r.user_id is not null
     and (p_tester or not r.tester)
   order by r.score desc, r.id asc
   limit greatest(1, least(p_limit, 100));
$$;

/* A guest's runs and gems move to the account on sign in. A day the account
   already played stays the account's; the guest's copy of it is left. */
create or replace function public.arcade_lab_claim(p_guest text, p_uid uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update arcade_runs r set user_id = p_uid, guest_id = null
   where r.guest_id = p_guest and r.user_id is null
     and not exists (select 1 from arcade_runs x where x.user_id = p_uid and x.game_id = r.game_id
                      and x.date_key = r.date_key and x.mode = r.mode);
  get diagnostics n = row_count;
  update gem_ledger set user_id = p_uid, guest_id = null where guest_id = p_guest and user_id is null;
  return n;
end $$;

do $$
declare f text;
begin
  foreach f in array array['arcade_gem_total(uuid,text)', 'arcade_lab_board(text,date,integer,boolean)', 'arcade_lab_claim(text,uuid)']
  loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute 'grant execute on function public.' || f || ' to service_role';
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
