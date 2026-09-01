-- ---------------------------------------------------------------------------
-- 92_ideas_board.sql : the ideas board at /ideas/
--
-- Safe to run more than once.
--
-- One board for the whole site, split by game. A signed-in player posts a feature
-- request against one game (or against the site itself), everybody else votes it up or
-- down, and the ones people actually want float to the top.
--
-- WHAT IT ADDS
--   * ideas            one row per suggestion
--   * idea_votes       one row per person per idea, and the primary key says so
--   * ideas_public     the read view, with the author's crest joined on
--   * ideas_post()     write an idea, rate limited
--   * ideas_vote()     up, down, or take it back
--   * ideas_set_status() the owner's own hand, for planned / shipped / declined
--
-- ---------------------------------------------------------------------------
-- WHY THE SCORE IS STORED AND NOT COUNTED
-- ---------------------------------------------------------------------------
-- A board sorted by score with any kind of paging wants an index on (game, score), and
-- you cannot index an aggregate over another table. The alternative is counting votes on
-- every read, which is correct and gets slower exactly as the feature succeeds.
--
-- So up_count and down_count live on the idea and a trigger on idea_votes maintains them.
-- That is the same bargain ps_runs already makes with display_name and display_mark, and
-- it has the same failure mode: a counter can drift from the rows it counts. The trigger
-- covers insert, update and delete, and ideas_recount() at the bottom rebuilds every
-- counter from the votes themselves, so drift is always one command away from fixed.
-- ---------------------------------------------------------------------------

-- ---------- 1) which games a board exists for ------------------------------
-- ONE LIST, HERE, and the check constraint reads it. A game that is not on this list
-- cannot be posted against, which is what stops the board growing a section for a
-- typo. Adding a game is one line, and it is deliberately a line somebody has to write:
-- an ideas section for a game nobody can play yet is a section with nothing in it.
create or replace function public.ideas_game_ok(p_game text)
returns boolean
language sql immutable as $$
  select p_game in ('nfl','cfb','hoops','wrestling','setlist','golf','baseball','soccer',
                    'arcade','site');
$$;

-- ---------- 2) the ideas ---------------------------------------------------
create table if not exists public.ideas (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  game        text not null,
  title       text not null,
  body        text not null default '',
  status      text not null default 'open',
  -- MODERATION IS ONE FLAG. A public suggestion box on the internet gets spam, and the
  -- answer has to be something the owner can do in ten seconds from the table editor.
  -- Hidden rows leave the view entirely; nothing else in this file has to know.
  hidden      boolean not null default false,
  up_count    integer not null default 0,
  down_count  integer not null default 0,
  created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ideas_game_ck') then
    alter table public.ideas add constraint ideas_game_ck check (ideas_game_ok(game));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ideas_status_ck') then
    alter table public.ideas add constraint ideas_status_ck
      check (status in ('open','planned','shipped','declined'));
  end if;
  -- LENGTH IS ENFORCED HERE AND NOT ONLY IN THE FORM. A textarea maxlength is a
  -- suggestion to a browser, and this table is reachable by anyone with the anon key.
  if not exists (select 1 from pg_constraint where conname = 'ideas_title_ck') then
    alter table public.ideas add constraint ideas_title_ck
      check (char_length(title) between 4 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ideas_body_ck') then
    alter table public.ideas add constraint ideas_body_ck check (char_length(body) <= 1000);
  end if;
end $$;

-- The board's own sort. Partial on hidden because every read filters it out, so the
-- index should not carry rows the board can never show.
create index if not exists ideas_game_score_idx
  on public.ideas (game, (up_count - down_count) desc, created_at desc) where not hidden;
create index if not exists ideas_game_new_idx
  on public.ideas (game, created_at desc) where not hidden;
-- The All view, which is the one the page opens on.
create index if not exists ideas_score_idx
  on public.ideas ((up_count - down_count) desc, created_at desc) where not hidden;
create index if not exists ideas_new_idx
  on public.ideas (created_at desc) where not hidden;
-- "Mine", and the rate limit below.
create index if not exists ideas_user_idx on public.ideas (user_id, created_at desc);

-- ---------- 3) the votes ---------------------------------------------------
-- ONE ROW PER PERSON PER IDEA, said by the primary key rather than by a rule somewhere
-- that has to be remembered. There is no way to vote twice that does not involve a
-- second account, and a second account is a cost the voter pays rather than a hole.
create table if not exists public.idea_votes (
  idea_id  bigint not null references public.ideas(id) on delete cascade,
  user_id  uuid   not null references auth.users(id) on delete cascade,
  dir      smallint not null,
  voted_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'idea_votes_dir_ck') then
    alter table public.idea_votes add constraint idea_votes_dir_ck check (dir in (-1, 1));
  end if;
end $$;
create index if not exists idea_votes_user_idx on public.idea_votes (user_id);

-- ---------- 4) the counters, maintained ------------------------------------
-- All three of insert, update and delete, because a vote can be cast, flipped, or taken
-- back and only the first of those is obvious.
create or replace function public.idea_votes_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if tg_op = 'UPDATE' then
      update ideas set up_count   = up_count   - (case when old.dir =  1 then 1 else 0 end),
                       down_count = down_count - (case when old.dir = -1 then 1 else 0 end)
       where id = old.idea_id;
    end if;
    update ideas set up_count   = up_count   + (case when new.dir =  1 then 1 else 0 end),
                     down_count = down_count + (case when new.dir = -1 then 1 else 0 end)
     where id = new.idea_id;
    return new;
  end if;
  update ideas set up_count   = up_count   - (case when old.dir =  1 then 1 else 0 end),
                   down_count = down_count - (case when old.dir = -1 then 1 else 0 end)
   where id = old.idea_id;
  return old;
end $$;

drop trigger if exists idea_votes_sync_trg on public.idea_votes;
create trigger idea_votes_sync_trg
  after insert or update or delete on public.idea_votes
  for each row execute function public.idea_votes_sync();

-- ---------- 5) reading it --------------------------------------------------
-- RLS on both tables. Reads go through the view, writes go through the functions below,
-- and neither table takes a direct write from a browser.
alter table public.ideas enable row level security;
alter table public.idea_votes enable row level security;

drop policy if exists "ideas read" on public.ideas;
create policy "ideas read" on public.ideas for select using (not hidden);

-- YOUR OWN VOTES ARE READABLE AND NOBODY ELSE'S ARE. The page needs to know which arrow
-- to light for you; it has no business knowing how any named person voted. The totals
-- are on the idea, which is all a board is entitled to say.
drop policy if exists "idea_votes read own" on public.idea_votes;
create policy "idea_votes read own" on public.idea_votes
  for select using (auth.uid() = user_id);

-- The author, joined on, so the board can draw the same crest the leaderboards draw.
-- SECURITY INVOKER so the view cannot become a way to read profiles the caller could
-- not read directly; profiles is already world readable for exactly these fields.
create or replace view public.ideas_public
with (security_invoker = true) as
  select i.id, i.game, i.title, i.body, i.status,
         i.up_count, i.down_count, (i.up_count - i.down_count) as score,
         i.created_at, i.user_id,
         p.username        as author_name,
         p.avatar_color    as author_color,
         p.avatar_initials as author_initials,
         p.crest_mark      as author_mark,
         p.crest_rung      as author_rung,
         p.crest_tier      as author_tier,
         p.crest_ring      as author_ring
    from public.ideas i
    left join public.profiles p on p.id = i.user_id
   where not i.hidden;

grant select on public.ideas_public to anon, authenticated;

-- ---------- 6) posting -----------------------------------------------------
create or replace function public.ideas_post(p_game text, p_title text, p_body text default '')
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_title text;
  v_body  text;
  v_today integer;
  v_id    bigint;
begin
  if v_user is null then
    raise exception 'sign in to post an idea';
  end if;
  if not ideas_game_ok(p_game) then
    raise exception 'that is not a game on this board';
  end if;

  v_title := btrim(coalesce(p_title, ''));
  v_body  := btrim(coalesce(p_body, ''));
  if char_length(v_title) < 4 then
    raise exception 'give the idea a title';
  end if;
  if char_length(v_title) > 120 then
    raise exception 'that title is too long';
  end if;
  if char_length(v_body) > 1000 then
    raise exception 'that description is too long';
  end if;

  -- FIVE A DAY. Not one: somebody who has just found the board and has three real ideas
  -- should not be told to come back tomorrow after the first. Not unlimited: a script
  -- with a stolen session should hit a wall it cannot walk through. Counted over a
  -- rolling 24 hours rather than a calendar day, so it cannot be reset by waiting for
  -- midnight in a timezone the poster picked.
  select count(*) into v_today from ideas
   where user_id = v_user and created_at > now() - interval '24 hours';
  if v_today >= 5 then
    raise exception 'that is five ideas today, come back tomorrow';
  end if;

  insert into ideas (user_id, game, title, body)
  values (v_user, p_game, v_title, v_body)
  returning id into v_id;

  -- YOUR OWN IDEA STARTS WITH YOUR OWN VOTE, because you obviously want it and a board
  -- where the author has to remember to upvote their own post ranks by who remembered.
  insert into idea_votes (idea_id, user_id, dir) values (v_id, v_user, 1);

  return v_id;
end $$;
revoke all on function public.ideas_post(text,text,text) from public;
grant execute on function public.ideas_post(text,text,text) to authenticated;

-- ---------- 7) voting ------------------------------------------------------
-- p_dir of 0 means "take my vote back", which is a thing every board with arrows needs
-- and most of them make you discover by clicking the same arrow twice. It is a real
-- argument here rather than a special case in the client.
create or replace function public.ideas_vote(p_idea bigint, p_dir integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_score integer;
begin
  if v_user is null then
    raise exception 'sign in to vote';
  end if;
  if p_dir not in (-1, 0, 1) then
    raise exception 'a vote is up, down, or none';
  end if;
  if not exists (select 1 from ideas where id = p_idea and not hidden) then
    raise exception 'no such idea';
  end if;

  if p_dir = 0 then
    delete from idea_votes where idea_id = p_idea and user_id = v_user;
  else
    insert into idea_votes (idea_id, user_id, dir)
    values (p_idea, v_user, p_dir::smallint)
    on conflict (idea_id, user_id)
      do update set dir = excluded.dir, voted_at = now();
  end if;

  select up_count - down_count into v_score from ideas where id = p_idea;
  return v_score;
end $$;
revoke all on function public.ideas_vote(bigint,integer) from public;
grant execute on function public.ideas_vote(bigint,integer) to authenticated;

-- ---------- 8) status, which is the owner's hand ---------------------------
-- PLANNED and SHIPPED are the whole reason a board like this is worth having: they are
-- what tell somebody their suggestion was read. There is no role table on this project,
-- so the allowed usernames are named here, and that is a deliberate floor rather than a
-- design: it is one line to change and it cannot be escalated from a browser.
create or replace function public.ideas_set_status(p_idea bigint, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select username into v_name from profiles where id = auth.uid();
  -- THE ADMIN LIST, and it is compared in lower case because a username that differs
  -- only in capitals is the same person to everybody except a string comparison.
  if v_name is null or lower(v_name) not in ('malikwillislover','runnyj') then
    raise exception 'not yours to set';
  end if;
  if p_status not in ('open','planned','shipped','declined') then
    raise exception 'that is not a status';
  end if;
  update ideas set status = p_status where id = p_idea;
end $$;
revoke all on function public.ideas_set_status(bigint,text) from public;
grant execute on function public.ideas_set_status(bigint,text) to authenticated;

-- ---------- 9) the repair, for when a counter drifts -----------------------
-- Not called by anything. It exists because a denormalized counter is a promise the
-- trigger keeps, and a promise worth making is worth being able to check. Run it and
-- every score on the board is rebuilt from the votes that are actually there.
create or replace function public.ideas_recount()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_rows integer;
begin
  update ideas i set
    up_count   = coalesce(v.up, 0),
    down_count = coalesce(v.down, 0)
  from (select id from ideas) src
  left join lateral (
    select count(*) filter (where dir =  1) as up,
           count(*) filter (where dir = -1) as down
      from idea_votes where idea_id = src.id
  ) v on true
  where i.id = src.id
    and (i.up_count is distinct from coalesce(v.up, 0)
      or i.down_count is distinct from coalesce(v.down, 0));
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke all on function public.ideas_recount() from public;

analyze public.ideas;
analyze public.idea_votes;

notify pgrst, 'reload schema';
