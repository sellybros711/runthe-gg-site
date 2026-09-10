-- ---------------------------------------------------------------------------
-- 95_commish_choices.sql : what every commissioner did with the same item
--
-- Safe to run more than once.
--
-- Commish Simulator hands you an item and three ways to rule on it. The thing that
-- makes a ruling worth talking about is not the ruling, it is the company you kept:
-- "62% of commissioners held the line, you paid them" is a sentence somebody sends to
-- a friend. A score out of a hundred is not.
--
-- WHAT IT ADDS
--   * commish_choices      one row per person per item, holding their LATEST ruling
--   * commish_tally        the public counts, one row per item and option
--   * commish_rule()       record a ruling and get that item's split back in one trip
--   * commish_split()      read one item's split without writing
--   * commish_splits()     read many, for the results screen at the end of a term
--   * commish_recount()    rebuild every counter from the rows underneath
--
-- ---------------------------------------------------------------------------
-- WHY THE LATEST RULING AND NOT EVERY RULING
-- ---------------------------------------------------------------------------
-- A term is five seasons and about forty five rulings, and the mode is built to be
-- played again: the whole pitch is that a different commissioner gets a different
-- sport. If every replay counted, the split would stop describing what people believe
-- and start describing who replayed the most. So the primary key is (item, person) and
-- a second ruling on the same item REPLACES the first.
--
-- The cost is real and worth naming: somebody who tries both sides to see what happens
-- moves their own vote to whichever they tried last. That is the honest reading of what
-- they currently think, and there is no version of this that is both replay-proof and
-- lets a person change their mind.
--
-- ---------------------------------------------------------------------------
-- WHY IT NEEDS AN ACCOUNT
-- ---------------------------------------------------------------------------
-- The alternative is a browser-generated id, and the anon key is in the page source of
-- every game on this site, so a browser-generated id is a number anybody can mint as
-- many of as they like. The primary key bounds one PERSON to one row per item; it
-- bounds one ATTACKER to nothing at all if the subject is theirs to invent.
--
-- So a split is what commissioners WITH ACCOUNTS decided, everyone can read it, and the
-- page says the first half of that sentence out loud rather than implying it counted
-- everybody. If the mode launches free and the sample turns out thin, that is a
-- decision to take with the numbers in hand.
--
-- ---------------------------------------------------------------------------
-- THE DOCKET IS NOT FROZEN
-- ---------------------------------------------------------------------------
-- Item ids live in cfb/commish/docket.js and that file is edited every week. Rewriting
-- an item under its existing id silently pools the old votes with the new ones, and
-- nothing here can tell the difference: to this table an id is an id. That is why there
-- is no check constraint listing the ids, which would need a migration every time the
-- docket grew, and why commish_forget_item() is at the bottom. Changing what an item
-- ASKS means clearing what it recorded.
-- ---------------------------------------------------------------------------

-- ---------- 1) what a legal id looks like ----------------------------------
-- Not a whitelist of ids, per the note above, but a shape. This is reachable with the
-- anon key by anyone who reads the page source, so the thing to bound is how much of a
-- mess one call can make: a slug, short, lower case.
create or replace function public.commish_slug_ok(p text)
returns boolean
language sql immutable as $$
  select p is not null and p ~ '^[a-z0-9][a-z0-9_-]{0,39}$';
$$;

-- ---------- 2) the rulings --------------------------------------------------
create table if not exists public.commish_choices (
  item_id   text not null,
  user_id   uuid not null references auth.users(id) on delete cascade,
  option_id text not null,
  ruled_at  timestamptz not null default now(),
  primary key (item_id, user_id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'commish_choices_item_ck') then
    alter table public.commish_choices add constraint commish_choices_item_ck
      check (commish_slug_ok(item_id));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'commish_choices_option_ck') then
    alter table public.commish_choices add constraint commish_choices_option_ck
      check (commish_slug_ok(option_id));
  end if;
end $$;

-- "What did I rule on this last time", and the rate limit below.
create index if not exists commish_choices_user_idx
  on public.commish_choices (user_id, ruled_at desc);

-- ---------- 3) the counts ---------------------------------------------------
-- STORED, NOT COUNTED, the same bargain ideas makes with up_count. Every reaction
-- screen in the mode reads a split, so counting rows on read means the feature gets
-- slower exactly as it works. A counter can drift from the rows it counts, which is
-- what commish_recount() at the bottom is for.
create table if not exists public.commish_tally (
  item_id   text not null,
  option_id text not null,
  n         integer not null default 0,
  primary key (item_id, option_id)
);

create or replace function public.commish_tally_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A ruling changed hands: take it off the old option first. UPDATE is the ordinary
  -- case here rather than the rare one, because the mode is built to be replayed.
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    update commish_tally set n = greatest(n - 1, 0)
     where item_id = old.item_id and option_id = old.option_id;
  end if;
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    insert into commish_tally (item_id, option_id, n)
    values (new.item_id, new.option_id, 1)
    on conflict (item_id, option_id) do update set n = commish_tally.n + 1;
    return new;
  end if;
  return old;
end $$;

drop trigger if exists commish_tally_sync_trg on public.commish_choices;
create trigger commish_tally_sync_trg
  after insert or update or delete on public.commish_choices
  for each row execute function public.commish_tally_sync();

-- ---------- 4) who may read what -------------------------------------------
alter table public.commish_choices enable row level security;
alter table public.commish_tally   enable row level security;

-- YOUR OWN RULINGS AND NOBODY ELSE'S. The page needs to know what you did last time
-- so it can say "you ruled the other way in your first term"; it has no business
-- knowing how any named person ruled on anything. The totals are on the tally, which
-- is all a split is entitled to say.
drop policy if exists "commish_choices read own" on public.commish_choices;
create policy "commish_choices read own" on public.commish_choices
  for select using (auth.uid() = user_id);

-- The counts are public and carry no identity at all.
drop policy if exists "commish_tally read" on public.commish_tally;
create policy "commish_tally read" on public.commish_tally for select using (true);

-- No insert, update or delete policy on either table, on purpose. Writes go through
-- commish_rule() below, which is the only thing that gets to touch them.
grant select on public.commish_tally to anon, authenticated;

-- ---------- 5) reading a split ---------------------------------------------
-- The shape every caller gets back, built once so the write path and the read path
-- cannot disagree about it:
--
--   { "item": "roster-limits", "total": 41, "counts": { "hold": 25, "raise": 11, ... } }
--
-- TOTAL IS THE SUM OF THE COUNTS AND NOT A SECOND QUERY, so a percentage worked out on
-- the page always lands on a hundred. An item nobody has ruled on comes back with
-- total 0 and an empty object rather than null, because the caller then has one shape
-- to handle instead of two.
create or replace function public.commish_split_json(p_item text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'item',   p_item,
    'total',  coalesce(sum(n), 0),
    'counts', coalesce(jsonb_object_agg(option_id, n) filter (where n > 0), '{}'::jsonb)
  )
  from commish_tally where item_id = p_item;
$$;

create or replace function public.commish_split(p_item text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not commish_slug_ok(p_item) then
    return jsonb_build_object('item', p_item, 'total', 0, 'counts', '{}'::jsonb);
  end if;
  return commish_split_json(p_item);
end $$;

-- MANY AT ONCE, for the screen at the end of a term that wants a line about each of
-- forty five rulings. Forty five round trips would paint that screen in pieces.
-- The cap is on the array length rather than on the response size: an unbounded array
-- from a public key is a way to ask the database to do arbitrary work.
create or replace function public.commish_splits(p_items text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ids text[];
  v_out jsonb := '{}'::jsonb;
  v_id  text;
begin
  if p_items is null or array_length(p_items, 1) is null then
    return v_out;
  end if;
  if array_length(p_items, 1) > 120 then
    raise exception 'too many items at once';
  end if;
  select array_agg(distinct x) into v_ids
    from unnest(p_items) as x where commish_slug_ok(x);
  if v_ids is null then return v_out; end if;
  foreach v_id in array v_ids loop
    v_out := v_out || jsonb_build_object(v_id, commish_split_json(v_id));
  end loop;
  return v_out;
end $$;

-- ---------- 6) recording a ruling ------------------------------------------
-- ONE ROUND TRIP DOES BOTH. The reaction screen wants the split the instant the ruling
-- lands, and asking for it separately means either painting the screen twice or
-- holding it back until two calls return. It also means the number you are shown
-- INCLUDES you, which is the honest version: you are one of the commissioners.
create or replace function public.commish_rule(p_item text, p_option text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_recent integer;
begin
  if not commish_slug_ok(p_item) or not commish_slug_ok(p_option) then
    raise exception 'that is not an item';
  end if;

  -- NOT SIGNED IN IS NOT AN ERROR. Most of the mode works signed out and a ruling is
  -- not the place to stop somebody: they get the split, their own ruling just does not
  -- join it, and the page says which of those happened.
  if v_user is null then
    return commish_split_json(p_item) || jsonb_build_object('recorded', false);
  end if;

  -- A term is about forty five rulings and somebody in a hurry might play three in an
  -- hour. Six hundred is far above anything a person does and far below what a script
  -- would want. The primary key already bounds the ROWS one account can create; this
  -- bounds the WRITES, which is the part that costs.
  select count(*) into v_recent from commish_choices
   where user_id = v_user and ruled_at > now() - interval '1 hour';
  if v_recent >= 600 then
    raise exception 'that is a lot of rulings for one hour';
  end if;

  insert into commish_choices (item_id, user_id, option_id, ruled_at)
  values (p_item, v_user, p_option, now())
  on conflict (item_id, user_id)
    do update set option_id = excluded.option_id, ruled_at = excluded.ruled_at;

  return commish_split_json(p_item) || jsonb_build_object('recorded', true);
end $$;

-- WHAT I RULED LAST TIME, across every item, so a returning commissioner can be told
-- they are about to go the other way. Own rows only, and the RLS policy says so too.
create or replace function public.commish_my_rulings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(item_id, option_id), '{}'::jsonb)
    from commish_choices where user_id = auth.uid();
$$;

-- ---------- 6a) who may call these -----------------------------------------
-- REVOKE FROM PUBLIC FIRST, AND THAT IS NOT A FORMALITY. Postgres grants EXECUTE on a new
-- function to PUBLIC by default, and anon and authenticated are both members of PUBLIC, so
-- a plain "revoke from anon, authenticated" at the bottom of a file removes a grant those
-- roles never held and leaves the one they are actually using untouched. Every function
-- here is security definer, so the two repair functions below shipped reachable by anybody
-- holding the anon key, which is anybody who has read the page source. One of them deletes
-- an item's data. supabase/test/commish_test.sql is what caught it.
--
-- So: take it away from everybody, then hand it back by name.
revoke execute on function public.commish_split_json(text) from public;
revoke execute on function public.commish_split(text)      from public;
revoke execute on function public.commish_splits(text[])   from public;
revoke execute on function public.commish_rule(text,text)  from public;
revoke execute on function public.commish_my_rulings()     from public;

grant execute on function public.commish_split(text)     to anon, authenticated;
grant execute on function public.commish_splits(text[])  to anon, authenticated;
grant execute on function public.commish_rule(text,text) to anon, authenticated;
-- ASKING WHAT YOU RULED NEEDS AN ACCOUNT, because without one there is no you to ask
-- about: the function reads auth.uid() and a signed out caller gets an empty object no
-- matter what. Not granted to anon so the answer is a refusal rather than a shrug.
grant execute on function public.commish_my_rulings()    to authenticated;
-- commish_split_json() is the shared body of the two read functions and is not granted to
-- anybody. Reaching a split goes through commish_split(), which checks the id's shape.

-- ---------- 7) fixing it ----------------------------------------------------
-- Drift is always one command away from fixed. Rebuilds every counter from the rulings
-- themselves and drops tally rows nothing points at any more.
create or replace function public.commish_recount()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_rows integer;
begin
  delete from commish_tally;
  insert into commish_tally (item_id, option_id, n)
  select item_id, option_id, count(*) from commish_choices group by 1, 2;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

-- THE ONE TO RUN WHEN AN ITEM IS REWRITTEN UNDER ITS OLD ID. Clears both the rulings
-- and the counts for that item, so the split starts again describing the question that
-- is actually being asked. Owner's hand only: it is not granted to anybody.
create or replace function public.commish_forget_item(p_item text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_rows integer;
begin
  delete from commish_choices where item_id = p_item;
  get diagnostics v_rows = row_count;
  delete from commish_tally where item_id = p_item;
  return v_rows;
end $$;

-- FROM PUBLIC, per the note above 6a, and not from the two role names: anon and
-- authenticated are members of PUBLIC and hold no grant of their own to take away.
revoke execute on function public.commish_recount()         from public;
revoke execute on function public.commish_forget_item(text) from public;
