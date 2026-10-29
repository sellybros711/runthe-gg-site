-- Arcade Lab, part two: every game's content, the restart guard, reports,
-- and all six games switched on for testers. Idempotent: safe to re-run.
--
-- WHO SEES THE GAMES: anybody in stumpire_testers (133), and nobody else.
-- This file sets every Arcade Lab flag to 'testers'. To take one game away
-- again:  update arcade_lab_flags set mode = 'off' where flag = 'arcade_pinball';
--
-- CONTENT IS AUTHORED, VALIDATED, APPROVED, THEN FROZEN. Whack the Right
-- Player prompts and Drop Board themes are drafted (by Claude or an editor)
-- into arcade_prompts, checked against the dataset by the validator in
-- functions/_arcadelab/content/, approved by an editor in the admin page, and
-- published into arcade_slates. A published slate is a SNAPSHOT of every card
-- and value, and it can never be changed or deleted: a trigger refuses both.
--
-- RESTARTS: a fresh daily records a start. A second fresh start on the same
-- day (cleared storage, another device) marks the eventual run restarted,
-- which keeps it off the board. A run resumed on the same device is not a
-- restart. Only a run with no restarts ranks.
--
-- WIPE EVERYTHING TESTERS PLAYED (content stays):
--   delete from gem_ledger where tester; delete from arcade_runs where tester;
--   delete from arcade_run_rejections; delete from arcade_starts; delete from arcade_reports;

update public.arcade_lab_flags set mode = 'testers', updated_at = now()
 where flag in ('arcade_roll_ball', 'arcade_field_goal_flick', 'arcade_hoop_shoot',
                'arcade_whack_right_player', 'arcade_drop_board', 'arcade_pinball')
   and mode = 'off';

alter table public.arcade_runs add column if not exists restarted boolean not null default false;

create table if not exists public.arcade_prompts (
  id          text primary key,
  game_id     text not null,
  def         jsonb not null,
  status      text not null default 'draft',
  report      jsonb not null default '{}',
  drafted_by  text not null default 'editor',
  approved_by uuid,
  updated_at  timestamptz not null default now(),
  constraint arcade_prompts_game_ck check (game_id in ('whack', 'drop-board')),
  constraint arcade_prompts_status_ck check (status in ('draft', 'approved', 'rejected'))
);

create table if not exists public.arcade_slates (
  game_id      text not null,
  date_key     date not null,
  payload      jsonb not null,
  source_ids   text[] not null default '{}',
  published_by uuid,
  published_at timestamptz not null default now(),
  primary key (game_id, date_key)
);

/* A published slate is what every player of that day was scored against. */
create or replace function public.arcade_slates_frozen() returns trigger
language plpgsql as $$
begin
  raise exception 'arcade_slates rows are immutable once published';
end $$;
drop trigger if exists arcade_slates_frozen on public.arcade_slates;
create trigger arcade_slates_frozen before update or delete on public.arcade_slates
  for each row execute function public.arcade_slates_frozen();

create table if not exists public.arcade_reports (
  id         bigserial primary key,
  user_id    uuid,
  guest_id   text,
  game_id    text not null,
  date_key   date not null,
  prompt_id  text,
  athlete_id text,
  note       text,
  status     text not null default 'open',
  created_at timestamptz not null default now(),
  constraint arcade_reports_status_ck check (status in ('open', 'fixed', 'dismissed'))
);
-- one report per player, card and day
create unique index if not exists arcade_reports_once
  on public.arcade_reports (coalesce(user_id::text, guest_id), game_id, date_key, coalesce(athlete_id, ''));

create table if not exists public.arcade_starts (
  who        text not null,
  game_id    text not null,
  date_key   date not null,
  starts     integer not null default 1,
  first_at   timestamptz not null default now(),
  primary key (who, game_id, date_key)
);

alter table public.arcade_prompts enable row level security;
alter table public.arcade_slates  enable row level security;
alter table public.arcade_reports enable row level security;
alter table public.arcade_starts  enable row level security;
revoke all on public.arcade_prompts, public.arcade_slates, public.arcade_reports, public.arcade_starts
  from anon, authenticated;

create or replace function public.arcade_lab_start(p_who text, p_game text, p_date date) returns integer
language sql security definer set search_path = public as $$
  insert into arcade_starts (who, game_id, date_key) values (p_who, p_game, p_date)
  on conflict (who, game_id, date_key) do update set starts = arcade_starts.starts + 1
  returning starts;
$$;

/* The board, now without restarted runs. */
create or replace function public.arcade_lab_board(p_game text, p_date date, p_limit integer, p_tester boolean)
returns table (user_id uuid, username text, score integer)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.username::text, r.score
    from arcade_runs r left join profiles p on p.id = r.user_id
   where r.game_id = p_game and r.date_key = p_date and r.mode = 'daily' and r.user_id is not null
     and not r.restarted and (p_tester or not r.tester)
   order by r.score desc, r.id asc
   limit greatest(1, least(p_limit, 100));
$$;

do $$
declare f text;
begin
  foreach f in array array['arcade_lab_start(text,text,date)', 'arcade_lab_board(text,date,integer,boolean)']
  loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute 'grant execute on function public.' || f || ' to service_role';
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
