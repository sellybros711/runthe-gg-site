-- 109_fantasy_challenge.sql
--
-- THE WEEKLY CHALLENGE STOPS BEING A FEEL TEST.
--
-- `football/fantasy/index.html` keeps a submitted lineup in localStorage and nowhere else,
-- and says so on the screen rather than letting somebody believe they have entered
-- something. That is right while nothing is at stake and wrong the moment there is a prize,
-- which there now is: the top three get something and the winner gets the bundle.
--
-- WHAT MOVES SERVER SIDE, AND WHY EACH ONE HAS TO.
--
--   * THE LOCK. A page that trusts its own clock is a page whose clock can be wrong by
--     being set wrong. The week locks at the FIRST kickoff, so a lineup accepted a minute
--     late is a lineup submitted knowing how one of its men did.
--   * THE PRICES. The client sends six ids and nothing else. A client that can post any six
--     players AT ANY PRICE is a client that can win a prize with a lineup it invented, and
--     with the top three paid that is not hypothetical. The cap, the slot shape and whether
--     a man was even on this week's board are all answered from rows here.
--   * THE COUNT. One entry an account, which only a unique index can promise.
--
-- IT FAILS CLOSED, AND THAT IS THE REVERSAL WORTH READING BEFORE COPYING ANYTHING HERE.
-- Every other allowance on this site fails OPEN and says so at length: an unreachable
-- Commissioner clock lets the season through, because a wrongly granted season costs a
-- fraction of a sale and a wrongly refused one costs a player who came back. That argument
-- inverts when there is a prize. A wrongly ACCEPTED entry is a lineup in a competition
-- somebody may win money from, against six players whose prices nobody checked; a wrongly
-- refused one costs a player one week of a free game. So a week with no row here is a week
-- with no entries, not a week that waves everybody through. Do not "fix" that.
--
-- THE WEEK CARRIES ITS OWN CAP AND SLOTS, rather than this file hardcoding them.
-- `108_hoops_leaderboard.sql` writes eight engine constants out as literals and its own
-- header records the cost: move one in the engine and the server starts labelling seasons
-- wrongly, silently. Here the publisher writes `cap_musd` and `slots` off the same
-- `PS_FANTASY_DRAFT` the page drafts against, so there is one copy and an entry is checked
-- against the rules the board it came from was actually built with.
--
-- A SCORE IS DERIVED AND NEVER STORED. `fantasy_standings` joins an entry's six ids to
-- `fantasy_results`, so a stat correction re-scores every board row with no backfill and no
-- settle job that can be forgotten. Same reason the badge cabinet is derived.
--
--   psql ... -f supabase/109_fantasy_challenge.sql
--
-- Needs: 10_accounts.sql (profiles).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The week
-- ─────────────────────────────────────────────────────────────────────────────
--
-- One row a week, published by `.github/workflows/fantasy-pool.yml` out of the same JSON
-- the page reads. Its existence is what opens a week: no row, no entries.

create table if not exists public.fantasy_weeks (
  season      int  not null,
  week        int  not null,
  locks_at    timestamptz not null,
  cap_musd    numeric(7,2) not null,
  /* The slot list the board was built with, in order, e.g. {QB,RB,RB,WR,WR,TE}. A lineup
     is checked as a MULTISET against this, because the six arrive in whatever order the
     drafter filled them and the order carries no meaning. */
  slots       text[] not null,
  scored_at   timestamptz,
  built_at    timestamptz not null default now(),
  primary key (season, week)
);

alter table public.fantasy_weeks enable row level security;

drop policy if exists "fantasy_weeks read" on public.fantasy_weeks;
create policy "fantasy_weeks read" on public.fantasy_weeks
  for select using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The board, as the server sees it
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every draftable man with his price, his position and what the board projected. About 400
-- rows a week.
--
-- PUBLIC READ, deliberately, and it gives nothing away: this is the same file the page
-- already downloads to draw the wheel. What it buys is that the page and the server can
-- never disagree about what a man cost, because there is one row and the page's copy is a
-- cache of it.

create table if not exists public.fantasy_prices (
  season      int  not null,
  week        int  not null,
  player_id   text not null,
  pos         text not null,
  price_musd  numeric(7,2) not null,
  proj        numeric(7,2) not null,
  primary key (season, week, player_id),
  foreign key (season, week) references public.fantasy_weeks (season, week) on delete cascade
);

alter table public.fantasy_prices enable row level security;

drop policy if exists "fantasy_prices read" on public.fantasy_prices;
create policy "fantasy_prices read" on public.fantasy_prices
  for select using (true);

-- What each man actually did, half PPR, written after the games.
--
-- A MAN WITH NO ROW SCORED ZERO and that is a result rather than a gap, which is
-- `weekly-results.mjs`'s own rule arriving at the table: nflverse writes a row for somebody
-- who was active and did nothing and no row at all for somebody inactive, hurt, benched or
-- cut, and all four are nought on a lineup.
--
-- THE JOIN BELOW IS A LEFT JOIN AND UNDER A `sum` THAT BUYS NOTHING, which is worth saying
-- rather than implying. The first draft of this note claimed an inner join "would quietly
-- total five men", and the test written from it passed with the inner join in: a missing
-- row contributes null to a sum, which is the same as contributing nothing, and the
-- `coalesce` outside already answers the all-absent case. It is written left because the
-- INTENT is six men one of whom scored zero, and the day anything here counts the rows
-- rather than adding them the two stop being the same query. What the test actually holds
-- is the arithmetic and the join KEY, which is where a real defect would live.

create table if not exists public.fantasy_results (
  season      int  not null,
  week        int  not null,
  player_id   text not null,
  half_ppr    numeric(7,2) not null,
  primary key (season, week, player_id),
  foreign key (season, week) references public.fantasy_weeks (season, week) on delete cascade
);

alter table public.fantasy_results enable row level security;

drop policy if exists "fantasy_results read" on public.fantasy_results;
create policy "fantasy_results read" on public.fantasy_results
  for select using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The entry
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ONE AN ACCOUNT AND FINAL. The mode gives five chances and asks which one to submit, so
-- the choosing has already happened by the time a row reaches here; a second submit would
-- make the five meaningless. The unique index is the whole rule and the function's own
-- check is only there to give a sentence instead of a constraint name.
--
-- `display_name` IS COPIED AT SUBMIT TIME and that is on purpose. It is read out of
-- `profiles` by the function rather than sent, the same as `rtf_submit_run`, and frozen
-- because a board of a finished week is a record of who entered it: somebody renaming
-- themselves in November should not rewrite week 3's result. Every other board here reads
-- the name live and is ranking a run rather than settling a competition.
--
-- `spend` and `projected` ARE STORED, unlike the score, and the difference is what each one
-- is about. The score is a fact about the games and has to move when a stat is corrected.
-- These two are facts about the DRAFT: what this lineup cost against the cap it was legal
-- under, at the moment it was entered. Re-deriving them later off a rebuilt board would
-- silently restate somebody's entry.

create table if not exists public.fantasy_entries (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  season       int  not null,
  week         int  not null,
  picks        text[] not null,
  spend        numeric(7,2) not null,
  projected    numeric(7,2) not null,
  display_name text,
  created_at   timestamptz not null default now(),
  foreign key (season, week) references public.fantasy_weeks (season, week) on delete cascade
);

create unique index if not exists fantasy_entries_one_an_account
  on public.fantasy_entries (user_id, season, week);

-- The board's own read: a week's entries, and the standings function sorts what it gets.
create index if not exists fantasy_entries_week_idx
  on public.fantasy_entries (season, week);

alter table public.fantasy_entries enable row level security;

/* READ YOUR OWN AND NOBODY ELSE'S, and the board below is a security definer function
   rather than a view over this, for one reason: BEFORE THE LOCK, A BOARD IS THE ANSWER KEY.
   Every entrant meets their own wheel, so a list of what everybody else submitted, with
   projections, is a list of the best lineups available, handed to whoever enters last.
   After the lock it is the point of the whole mode. */
drop policy if exists "fantasy_entries read own" on public.fantasy_entries;
create policy "fantasy_entries read own" on public.fantasy_entries
  for select using (auth.uid() = user_id);

/* A POLICY WITH NO GRANT IS DEAD WEIGHT, and the first draft of this file had exactly that:
   the read-own policy above, and `authenticated` with no select privilege on the table at
   all, so the rule it describes was unreachable and reading your own entry raised
   "permission denied". RLS narrows a grant, it does not make one. `anon` gets nothing,
   because an entry belongs to an account. */
grant select on public.fantasy_entries to authenticated;

/* NO INSERT POLICY AT ALL, and no insert grant. The only way in is `fantasy_submit`, which
   is security definer and checks the clock, the cap, the slots and the board. A policy here
   would be a second door into a prize competition. */

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Submitting
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Six ids. Everything else is looked up.

create or replace function public.fantasy_submit(
  p_season int, p_week int, p_picks text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_wk    public.fantasy_weeks%rowtype;
  v_spend numeric(7,2);
  v_proj  numeric(7,2);
  v_found int;
  v_name  text;
  v_bad   text;
begin
  if v_user is null then
    raise exception 'sign in to enter';
  end if;

  select * into v_wk from public.fantasy_weeks
   where season = p_season and week = p_week;
  /* FAILS CLOSED. See the header: this is the one allowance on the site that refuses when
     it cannot answer, because what is on the other side is a prize. */
  if not found then
    raise exception 'that week is not open for entries';
  end if;
  if now() >= v_wk.locks_at then
    raise exception 'entries for that week are closed';
  end if;

  if p_picks is null or array_length(p_picks, 1) is distinct from array_length(v_wk.slots, 1) then
    raise exception 'a lineup is % players', array_length(v_wk.slots, 1);
  end if;
  /* One man cannot fill two slots. Checked before the position tally, because six copies of
     one quarterback would otherwise fail on the SHAPE and report the wrong thing. */
  if (select count(distinct x) from unnest(p_picks) x) <> array_length(p_picks, 1) then
    raise exception 'a lineup cannot name the same player twice';
  end if;

  /* Every pick has to be on THIS week's board. A man whose club is idle is not, and neither
     is an id somebody typed. */
  select count(*) into v_found
    from public.fantasy_prices f
   where f.season = p_season and f.week = p_week
     and f.player_id = any (p_picks);
  if v_found <> array_length(p_picks, 1) then
    raise exception 'that lineup has somebody who is not on this week''s board';
  end if;

  /* The SHAPE, as a multiset. `slots` is {QB,RB,RB,WR,WR,TE}, so this asks that the six
     positions drafted are those six positions, in any order. Written as a full outer join
     rather than a loop so the first mismatch names the position that is wrong. */
  select string_agg(t.pos || ' ' || coalesce(t.got,0) || ' of ' || coalesce(t.want,0), ', ')
    into v_bad
    from (
      select coalesce(g.pos, w.pos) as pos, g.n as got, w.n as want
        from (select f.pos, count(*) n from public.fantasy_prices f
               where f.season = p_season and f.week = p_week
                 and f.player_id = any (p_picks) group by f.pos) g
        full outer join (select s as pos, count(*) n from unnest(v_wk.slots) s group by s) w
          on w.pos = g.pos
       where coalesce(g.n, 0) <> coalesce(w.n, 0)
    ) t;
  if v_bad is not null then
    raise exception 'that lineup is the wrong shape: %', v_bad;
  end if;

  select sum(f.price_musd), sum(f.proj) into v_spend, v_proj
    from public.fantasy_prices f
   where f.season = p_season and f.week = p_week
     and f.player_id = any (p_picks);
  if v_spend > v_wk.cap_musd then
    raise exception 'that lineup is over the cap';
  end if;

  /* `username`, WHICH IS WHAT AN ACCOUNT'S NAME IS CALLED. This read was written
     `p.display_name` and there is no such column: `supabase/10_accounts.sql` names it
     `username`, a citext, and every other board on this site copies it out as
     `select username::text`. It raised on the first real entry anybody tried to make.
     See 113 for the whole story, including why no test caught it. */
  select p.username::text into v_name from public.profiles p where p.id = v_user;

  begin
    insert into public.fantasy_entries
      (user_id, season, week, picks, spend, projected, display_name)
    values (v_user, p_season, p_week, p_picks, v_spend, v_proj, v_name);
  exception when unique_violation then
    /* The index is the rule and this is the sentence. */
    raise exception 'you have already entered this week';
  end;
end;
$$;

revoke all on function public.fantasy_submit(int,int,text[]) from public;
grant execute on function public.fantasy_submit(int,int,text[]) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Your own entry, any time
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The RLS policy above already allows this as a plain select, and the function exists so
-- the page makes ONE call rather than a select plus a join to the results: what a reader
-- wants on the entry screen is the six men, what they cost, and what they have scored so
-- far, which is three tables.

create or replace function public.fantasy_my_entry(p_season int, p_week int)
returns table (
  picks text[], spend numeric, projected numeric, score numeric,
  submitted_at timestamptz, scored boolean)
language sql
stable
security definer
set search_path = public
as $$
  select e.picks, e.spend, e.projected,
         (select coalesce(sum(r.half_ppr), 0)
            from unnest(e.picks) pid
            left join public.fantasy_results r
              on r.season = e.season and r.week = e.week and r.player_id = pid),
         e.created_at,
         (select w.scored_at is not null from public.fantasy_weeks w
           where w.season = e.season and w.week = e.week)
    from public.fantasy_entries e
   where e.user_id = auth.uid() and e.season = p_season and e.week = p_week;
$$;

revoke all on function public.fantasy_my_entry(int,int) from public;
grant execute on function public.fantasy_my_entry(int,int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. The standings
-- ─────────────────────────────────────────────────────────────────────────────
--
-- THE BOARD OPENS AT THE LOCK, which is a rule about the competition rather than about
-- privacy. Every entrant meets their own wheel, so before kickoff a list of everybody's
-- lineups and their projections is a list of the best lineups on offer, handed to whoever
-- enters last. After the lock there is nothing left to copy.
--
-- What IS answered before the lock is how many have entered, because a mode nobody can see
-- the size of reads as a mode nobody is playing. That is `fantasy_entry_count`.
--
-- THE SCORE IS THE JOIN, never a column. A corrected stat moves every row that names that
-- player, on the next read, with nothing to re-run.

create or replace function public.fantasy_entry_count(p_season int, p_week int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.fantasy_entries e
   where e.season = p_season and e.week = p_week;
$$;

grant execute on function public.fantasy_entry_count(int,int) to anon, authenticated;

-- DROPPED FIRST, SO THIS FILE CAN BE RUN A SECOND TIME. `create or replace` refuses to
-- change a function's return type, and a `returns table` function's row type IS its return
-- type, so 110 adding two columns to this one makes 109 un-re-runnable from that day on:
-- re-applying the chain against a database that already has it fails here, half way, with
-- "cannot change return type of existing function". 110 carries the identical drop directly
-- above its own copy, for the same reason and in the same words.
--
-- Nothing depends on this function in the catalog sense. 114's `fantasy_settle_week` calls
-- it, and plpgsql resolves a call at CALL time rather than recording a dependency, so the
-- drop is clean and the re-create a few lines down is what the caller finds.
--
-- WHICH MEANS THE ORDER OF THE CHAIN IS LOAD BEARING RATHER THAN TIDY. Run on its own
-- against a database on 110 or later this file installs the OLD three column shape and the
-- live board loses two columns. Run as the chain does it, 110 replaces it a moment later
-- inside the same transaction and nothing outside ever sees the older one.
drop function if exists public.fantasy_standings(int, int, int);

create or replace function public.fantasy_standings(
  p_season int, p_week int, p_limit int default 50)
returns table (
  place int, display_name text, score numeric, projected numeric,
  spend numeric, picks text[], is_me boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_locks timestamptz;
begin
  select w.locks_at into v_locks from public.fantasy_weeks w
   where w.season = p_season and w.week = p_week;
  /* No week, or the week has not locked: no rows. NOT an exception, because the page asks
     this on the way in and an empty board is a state it already draws a sentence for. */
  if v_locks is null or now() < v_locks then
    return;
  end if;

  return query
    with scored as (
      select e.id, e.user_id, e.display_name, e.projected, e.spend, e.picks,
             (select coalesce(sum(r.half_ppr), 0)
                from unnest(e.picks) pid
                left join public.fantasy_results r
                  on r.season = e.season and r.week = e.week and r.player_id = pid) as score
        from public.fantasy_entries e
       where e.season = p_season and e.week = p_week
    )
    select (row_number() over (order by s.score desc, s.id asc))::int,
           s.display_name, s.score, s.projected, s.spend, s.picks,
           /* COALESCED, because `user_id = auth.uid()` is NULL rather than false for a
              signed out reader, and this column is a yes or a no. The page would read the
              null as falsy and look right, which is what makes it worth fixing here: a
              three valued column nobody knows is three valued is the "absent is not zero"
              trap waiting for whoever next writes `is_me === false`. */
           coalesce(s.user_id = auth.uid(), false)
      from scored s
     order by s.score desc, s.id asc
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

grant execute on function public.fantasy_standings(int,int,int) to anon, authenticated;

-- YOUR PLACE IS COUNTED AGAINST EVERYBODY, not against the rows the board returned.
-- `commish_my_tenure` carries this argument at length: a page that worked out "you are
-- 51st" by failing to find itself in the top fifty tells the two hundredth entrant the same
-- thing as the fifty first. The ordering is written out a second time here by hand, which is
-- the thing most likely to rot, so the test walks every entry and asserts the two agree.

create or replace function public.fantasy_my_place(p_season int, p_week int)
returns table (place int, entries int, score numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_locks timestamptz;
begin
  select w.locks_at into v_locks from public.fantasy_weeks w
   where w.season = p_season and w.week = p_week;
  if v_locks is null or now() < v_locks or auth.uid() is null then
    return;
  end if;

  return query
    with scored as (
      select e.id, e.user_id,
             (select coalesce(sum(r.half_ppr), 0)
                from unnest(e.picks) pid
                left join public.fantasy_results r
                  on r.season = e.season and r.week = e.week and r.player_id = pid) as score
        from public.fantasy_entries e
       where e.season = p_season and e.week = p_week
    ), ranked as (
      select s.*, (row_number() over (order by s.score desc, s.id asc))::int as place
        from scored s
    )
    select r.place, (select count(*)::int from scored), r.score
      from ranked r where r.user_id = auth.uid();
end;
$$;

grant execute on function public.fantasy_my_place(int,int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Publishing, which is the workflow's half
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `.github/workflows/fantasy-pool.yml` connects with SUPABASE_DB_URL, which is the database
-- owner, so it needs no function and no grant: it upserts the three tables directly out of
-- the JSON it has just built. What it must not do is write a week row before the prices,
-- because the week row is what opens entries and a board with no prices refuses every
-- lineup as "somebody who is not on this week's board". `publish-week.mjs` emits both in one
-- transaction for that reason.

notify pgrst, 'reload schema';
