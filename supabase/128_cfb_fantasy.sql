-- ---------------------------------------------------------------------------
-- 128_cfb_fantasy.sql : the COLLEGE Fantasy Challenge, a competition of its own
--
--   psql ... -f supabase/128_cfb_fantasy.sql
--
-- Needs 10 (accounts), 101 (premium_unlocks) and 111 (nfl_state_rank). Safe to run twice.
--
-- The NFL challenge (109 to 126) is the model and NOTHING HERE TOUCHES IT. Asked for by the
-- owner in as many words: a separate competition, living only in the college game, with its
-- own keys so no code has to wonder which of the two a row belongs to. So every table and
-- every function is `cfb_fantasy_*`, and the NFL chain's objects are never read or written.
--
-- WHAT IS THE SAME, and it is most of it: six picks against a cap, one entry an account a
-- week, the board opens at the first kickoff, a score is derived at read time and never
-- stored, the top three are settled when the week is marked final, and first place wins 30
-- days of Pro. Every rule below is the NFL file's rule with the table names changed, and the
-- comments that argue for them are in 109 to 120 rather than copied here.
--
-- WHAT IS DIFFERENT IS THE SWAP. The NFL swap (119) only takes a man a feed has already
-- ruled out, because the NFL publishes a league wide injury report. College football does
-- not, so the owner's call is the other way round: ANY man in a lineup can be swapped, by
-- the entrant, until his own game kicks off, for a man at his position whose game has not
-- kicked off either, who costs the SAME OR A LITTLE LESS. "A little less" is a band the
-- week carries (`swap_pct`, `swap_floor_musd`), written by the build off the same pool file
-- the page reads, so the page and this function can never disagree about who is in range.
-- A swap is never an upgrade in price, so it is never a way round the cap.
--
-- THE PRIZE IS THE NFL PRIZE. First place is granted `ps_premium` and `cfb_premium` for 30
-- days with a `fantasy:cfb-<season>-w<week>` source, so every rule that already reads a
-- `fantasy:` source (no gold name, checkout still sells the bundle, the receipt says Won)
-- covers it without a line changing anywhere else.
-- ---------------------------------------------------------------------------

create table if not exists public.cfb_fantasy_weeks (
  season           int  not null,
  week             int  not null,
  locks_at         timestamptz not null,
  cap_musd         numeric(7,2) not null,
  slots            text[] not null,
  swap_pct         numeric(4,3) not null default 0.25,
  swap_floor_musd  numeric(7,2) not null default 5,
  scored_at        timestamptz,
  built_at         timestamptz not null default now(),
  checked_at       timestamptz,
  results_at       timestamptz,
  results_sig      text,
  games_final      int,
  games_total      int,
  primary key (season, week)
);
alter table public.cfb_fantasy_weeks enable row level security;
drop policy if exists "cfb_fantasy_weeks read" on public.cfb_fantasy_weeks;
create policy "cfb_fantasy_weeks read" on public.cfb_fantasy_weeks for select using (true);
grant select on public.cfb_fantasy_weeks to anon, authenticated;

create table if not exists public.cfb_fantasy_prices (
  season      int  not null,
  week        int  not null,
  player_id   text not null,
  pos         text not null,
  price_musd  numeric(7,2) not null,
  proj        numeric(7,2) not null,
  team        text,
  kick        timestamptz,
  primary key (season, week, player_id),
  foreign key (season, week) references public.cfb_fantasy_weeks (season, week) on delete cascade
);
alter table public.cfb_fantasy_prices enable row level security;
drop policy if exists "cfb_fantasy_prices read" on public.cfb_fantasy_prices;
create policy "cfb_fantasy_prices read" on public.cfb_fantasy_prices for select using (true);
grant select on public.cfb_fantasy_prices to anon, authenticated;

create table if not exists public.cfb_fantasy_results (
  season      int  not null,
  week        int  not null,
  player_id   text not null,
  half_ppr    numeric(7,2) not null,
  line        text,
  primary key (season, week, player_id),
  foreign key (season, week) references public.cfb_fantasy_weeks (season, week) on delete cascade
);
alter table public.cfb_fantasy_results enable row level security;
drop policy if exists "cfb_fantasy_results read" on public.cfb_fantasy_results;
create policy "cfb_fantasy_results read" on public.cfb_fantasy_results for select using (true);
grant select on public.cfb_fantasy_results to anon, authenticated;

create table if not exists public.cfb_fantasy_entries (
  id             bigserial primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  season         int  not null,
  week           int  not null,
  picks          text[] not null,
  spend          numeric(7,2) not null,
  projected      numeric(7,2) not null,
  display_name   text,
  swaps          jsonb not null default '[]'::jsonb,
  result_seen_at timestamptz,
  created_at     timestamptz not null default now(),
  foreign key (season, week) references public.cfb_fantasy_weeks (season, week) on delete cascade
);
create unique index if not exists cfb_fantasy_entries_one_an_account
  on public.cfb_fantasy_entries (user_id, season, week);
create index if not exists cfb_fantasy_entries_week_idx
  on public.cfb_fantasy_entries (season, week);
alter table public.cfb_fantasy_entries enable row level security;
drop policy if exists "cfb_fantasy_entries read own" on public.cfb_fantasy_entries;
create policy "cfb_fantasy_entries read own" on public.cfb_fantasy_entries
  for select using (auth.uid() = user_id);
-- RLS narrows a grant, it does not make one (109's finding). No insert grant at all: the
-- only way in is cfb_fantasy_submit.
grant select on public.cfb_fantasy_entries to authenticated;

create table if not exists public.cfb_fantasy_games (
  season      int  not null,
  week        int  not null,
  game_id     text not null,
  away        text not null,
  home        text not null,
  kick        timestamptz,
  state       text not null default 'pre',
  away_score  int,
  home_score  int,
  period      int,
  clock       text,
  overtime    boolean,
  source      text,
  updated_at  timestamptz not null default now(),
  primary key (season, week, game_id),
  constraint cfb_fantasy_games_state_ck check (state in ('pre', 'in', 'post'))
);
create index if not exists cfb_fantasy_games_week_idx
  on public.cfb_fantasy_games (season, week, kick);
alter table public.cfb_fantasy_games enable row level security;
drop policy if exists cfb_fantasy_games_read on public.cfb_fantasy_games;
create policy cfb_fantasy_games_read on public.cfb_fantasy_games for select using (true);
grant select on public.cfb_fantasy_games to anon, authenticated;

create table if not exists public.cfb_fantasy_prizes (
  season       int  not null,
  week         int  not null,
  place        int  not null check (place between 1 and 3),
  user_id      uuid not null references auth.users(id) on delete cascade,
  entry_id     bigint not null references public.cfb_fantasy_entries(id) on delete cascade,
  display_name text,
  score        numeric(7,2) not null,
  promo_state  text not null default 'none'
                 check (promo_state in ('none', 'void', 'granted')),
  pass_until   timestamptz,
  granted_at   timestamptz,
  settled_at   timestamptz not null default now(),
  primary key (season, week, place)
);
create unique index if not exists cfb_fantasy_prizes_one_per_account
  on public.cfb_fantasy_prizes (season, week, user_id);
alter table public.cfb_fantasy_prizes enable row level security;
-- No policy and no grant: a prize row is read through cfb_fantasy_my_result and
-- cfb_fantasy_my_wins, which say only what is about the reader.

-- ─── the score, written once ────────────────────────────────────────────────

-- EVERY SCORE ON THIS BOARD IS THIS FUNCTION. The NFL chain writes the same subquery out in
-- five places; here it is one function so the standings, the reader's place, the result and
-- the settle can never sum a lineup two ways.
create or replace function public.cfb_fantasy_score(p_season int, p_week int, p_picks text[])
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(r.half_ppr), 0)
    from unnest(p_picks) pid
    left join public.cfb_fantasy_results r
      on r.season = p_season and r.week = p_week and r.player_id = pid;
$$;
revoke all on function public.cfb_fantasy_score(int,int,text[]) from public;

-- ─── the entry ──────────────────────────────────────────────────────────────

create or replace function public.cfb_fantasy_submit(
  p_season int, p_week int, p_picks text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_wk    public.cfb_fantasy_weeks%rowtype;
  v_spend numeric(7,2);
  v_proj  numeric(7,2);
  v_found int;
  v_name  text;
  v_bad   text;
begin
  if v_user is null then
    raise exception 'sign in to enter';
  end if;
  select * into v_wk from public.cfb_fantasy_weeks
   where season = p_season and week = p_week;
  if not found then
    raise exception 'that week is not open for entries';
  end if;
  if now() >= v_wk.locks_at then
    raise exception 'entries for that week are closed';
  end if;
  if p_picks is null or array_length(p_picks, 1) is distinct from array_length(v_wk.slots, 1) then
    raise exception 'a lineup is % players', array_length(v_wk.slots, 1);
  end if;
  if (select count(distinct x) from unnest(p_picks) x) <> array_length(p_picks, 1) then
    raise exception 'a lineup cannot name the same player twice';
  end if;
  select count(*) into v_found
    from public.cfb_fantasy_prices f
   where f.season = p_season and f.week = p_week and f.player_id = any (p_picks);
  if v_found <> array_length(p_picks, 1) then
    raise exception 'that lineup has somebody who is not on this week''s board';
  end if;
  select string_agg(t.pos || ' ' || coalesce(t.got,0) || ' of ' || coalesce(t.want,0), ', ')
    into v_bad
    from (
      select coalesce(g.pos, w.pos) as pos, g.n as got, w.n as want
        from (select f.pos, count(*) n from public.cfb_fantasy_prices f
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
    from public.cfb_fantasy_prices f
   where f.season = p_season and f.week = p_week and f.player_id = any (p_picks);
  if v_spend > v_wk.cap_musd then
    raise exception 'that lineup is over the cap';
  end if;
  select p.username::text into v_name from public.profiles p where p.id = v_user;
  begin
    insert into public.cfb_fantasy_entries
      (user_id, season, week, picks, spend, projected, display_name)
    values (v_user, p_season, p_week, p_picks, v_spend, v_proj, v_name);
  exception when unique_violation then
    raise exception 'you have already entered this week';
  end;
end;
$$;
revoke all on function public.cfb_fantasy_submit(int,int,text[]) from public;
grant execute on function public.cfb_fantasy_submit(int,int,text[]) to authenticated;

create or replace function public.cfb_fantasy_my_entry(p_season int, p_week int)
returns table (
  picks text[], spend numeric, projected numeric, score numeric,
  submitted_at timestamptz, scored boolean, swaps jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select e.picks, e.spend, e.projected,
         public.cfb_fantasy_score(e.season, e.week, e.picks),
         e.created_at,
         (select w.scored_at is not null from public.cfb_fantasy_weeks w
           where w.season = e.season and w.week = e.week),
         e.swaps
    from public.cfb_fantasy_entries e
   where e.user_id = auth.uid() and e.season = p_season and e.week = p_week;
$$;
revoke all on function public.cfb_fantasy_my_entry(int,int) from public;
grant execute on function public.cfb_fantasy_my_entry(int,int) to authenticated;

create or replace function public.cfb_fantasy_entry_count(p_season int, p_week int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.cfb_fantasy_entries e
   where e.season = p_season and e.week = p_week;
$$;
grant execute on function public.cfb_fantasy_entry_count(int,int) to anon, authenticated;

-- ─── the swap, which is the one rule that is the college game's own ─────────

create or replace function public.cfb_fantasy_swap(
  p_season int, p_week int, p_out text, p_in text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_wk    public.cfb_fantasy_weeks%rowtype;
  v_e     public.cfb_fantasy_entries%rowtype;
  v_o     public.cfb_fantasy_prices%rowtype;
  v_i     public.cfb_fantasy_prices%rowtype;
  v_low   numeric;
begin
  if v_user is null then
    raise exception 'sign in to swap a player';
  end if;
  select * into v_wk from public.cfb_fantasy_weeks
   where season = p_season and week = p_week;
  if not found then
    raise exception 'that week is not open';
  end if;
  select * into v_e from public.cfb_fantasy_entries
   where user_id = v_user and season = p_season and week = p_week
   for update;
  if not found then
    raise exception 'you have not entered this week';
  end if;
  if p_out is null or not (p_out = any (v_e.picks)) then
    raise exception 'that player is not in your lineup';
  end if;
  select * into v_o from public.cfb_fantasy_prices
   where season = p_season and week = p_week and player_id = p_out;
  -- AN UNKNOWN KICKOFF IS REFUSED, never read as not started, which is 119's rule.
  if not found or v_o.kick is null then
    raise exception 'his kickoff is not known yet, so he cannot be swapped';
  end if;
  if now() >= v_o.kick then
    raise exception 'his game has started, so he cannot be swapped';
  end if;
  select * into v_i from public.cfb_fantasy_prices
   where season = p_season and week = p_week and player_id = p_in;
  if not found then
    raise exception 'that player is not on this week''s board';
  end if;
  if v_i.pos <> v_o.pos then
    raise exception 'a swap has to be the same position';
  end if;
  if p_in = any (v_e.picks) then
    raise exception 'he is already in your lineup';
  end if;
  if v_i.kick is null or now() >= v_i.kick then
    raise exception 'his game has already started';
  end if;
  -- THE SAME TIER OR A LITTLE BELOW. Never dearer, so never a way round the cap, and never
  -- further below than the week's band.
  if v_i.price_musd > v_o.price_musd then
    raise exception 'a swap cannot cost more than the man going out';
  end if;
  v_low := v_o.price_musd - greatest(v_o.price_musd * v_wk.swap_pct, v_wk.swap_floor_musd);
  if v_i.price_musd < v_low then
    raise exception 'that player is too far below him in price';
  end if;
  update public.cfb_fantasy_entries
     set picks     = array_replace(v_e.picks, p_out, p_in),
         spend     = v_e.spend - v_o.price_musd + v_i.price_musd,
         projected = v_e.projected - v_o.proj + v_i.proj,
         swaps     = v_e.swaps || jsonb_build_array(jsonb_build_object(
                       'out', p_out, 'in', p_in, 'at', now()))
   where id = v_e.id;
end;
$$;
revoke all on function public.cfb_fantasy_swap(int,int,text,text) from public;
grant execute on function public.cfb_fantasy_swap(int,int,text,text) to authenticated;

-- ─── the board ──────────────────────────────────────────────────────────────

create or replace function public.cfb_fantasy_standings(
  p_season int, p_week int, p_limit int default 50)
returns table (
  place int, display_name text, score numeric, projected numeric,
  spend numeric, picks text[], is_me boolean, entry_no int, played int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_locks timestamptz;
begin
  select w.locks_at into v_locks from public.cfb_fantasy_weeks w
   where w.season = p_season and w.week = p_week;
  if v_locks is null or now() < v_locks then
    return;
  end if;
  return query
    with scored as (
      select e.id, e.user_id, e.display_name, e.projected, e.spend, e.picks,
             (dense_rank() over (order by e.id))::int as entry_no,
             public.cfb_fantasy_score(e.season, e.week, e.picks) as score,
             (select count(r.player_id)::int
                from unnest(e.picks) pid
                left join public.cfb_fantasy_results r
                  on r.season = e.season and r.week = e.week and r.player_id = pid) as played
        from public.cfb_fantasy_entries e
       where e.season = p_season and e.week = p_week
    )
    select (row_number() over (order by s.score desc, s.id asc))::int,
           s.display_name, s.score, s.projected, s.spend, s.picks,
           coalesce(s.user_id = auth.uid(), false),
           s.entry_no, s.played
      from scored s
     order by s.score desc, s.id asc
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;
grant execute on function public.cfb_fantasy_standings(int,int,int) to anon, authenticated;

create or replace function public.cfb_fantasy_my_place(p_season int, p_week int)
returns table (place int, entries int, score numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_locks timestamptz;
begin
  select w.locks_at into v_locks from public.cfb_fantasy_weeks w
   where w.season = p_season and w.week = p_week;
  if v_locks is null or now() < v_locks or auth.uid() is null then
    return;
  end if;
  return query
    with scored as (
      select e.id, e.user_id, public.cfb_fantasy_score(e.season, e.week, e.picks) as score
        from public.cfb_fantasy_entries e
       where e.season = p_season and e.week = p_week
    ), ranked as (
      select s.*, (row_number() over (order by s.score desc, s.id asc))::int as place
        from scored s
    )
    select r.place, (select count(*)::int from scored), r.score
      from ranked r where r.user_id = auth.uid();
end;
$$;
grant execute on function public.cfb_fantasy_my_place(int,int) to authenticated;

-- Names and nothing else before the lock (112's argument: the lineups are the answer key).
create or replace function public.cfb_fantasy_entrants(
  p_season int, p_week int, p_limit int default 200)
returns table (entry_no int, display_name text, is_me boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_locks timestamptz;
begin
  select w.locks_at into v_locks from public.cfb_fantasy_weeks w
   where w.season = p_season and w.week = p_week;
  if v_locks is null or now() >= v_locks then
    return;
  end if;
  return query
    select (dense_rank() over (order by e.id))::int,
           e.display_name,
           coalesce(e.user_id = auth.uid(), false)
      from public.cfb_fantasy_entries e
     where e.season = p_season and e.week = p_week
     order by e.id
     limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;
grant execute on function public.cfb_fantasy_entrants(int,int,int) to anon, authenticated;

create or replace function public.cfb_fantasy_board(
  p_season int, p_week int, p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_week     jsonb;
  v_rows     jsonb;
  v_me       jsonb;
  v_games    jsonb;
  v_entrants jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(g) order by g.kick nulls last, g.game_id), '[]'::jsonb)
    into v_games
    from (
      select n.game_id, n.away, n.home, n.kick, n.state,
             n.away_score, n.home_score, n.period, n.clock, n.overtime, n.updated_at
        from public.cfb_fantasy_games n
       where n.season = p_season and n.week = p_week
    ) g;
  select to_jsonb(x) into v_week from (
    select w.locks_at, w.scored_at, w.checked_at, w.results_at,
           w.games_final, w.games_total,
           (now() >= w.locks_at) as open,
           (select count(*)::int from public.cfb_fantasy_entries e
             where e.season = w.season and e.week = w.week) as entries
      from public.cfb_fantasy_weeks w
     where w.season = p_season and w.week = p_week
  ) x;
  if v_week is null then
    return jsonb_build_object('week', null, 'rows', '[]'::jsonb, 'me', null,
                              'games', v_games, 'entrants', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.place), '[]'::jsonb) into v_rows
    from public.cfb_fantasy_standings(p_season, p_week, p_limit) s;
  select coalesce(jsonb_agg(to_jsonb(n) order by n.entry_no), '[]'::jsonb) into v_entrants
    from public.cfb_fantasy_entrants(p_season, p_week, 500) n;
  select to_jsonb(m) into v_me
    from public.cfb_fantasy_my_place(p_season, p_week) m;
  if v_me is not null then
    v_me := v_me || jsonb_build_object('lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'player_id', pid,
               'half_ppr', coalesce(r.half_ppr, 0),
               'played', (r.player_id is not null))
             order by ord)
        from public.cfb_fantasy_entries e
        cross join lateral unnest(e.picks) with ordinality as u(pid, ord)
        left join public.cfb_fantasy_results r
          on r.season = e.season and r.week = e.week and r.player_id = u.pid
       where e.season = p_season and e.week = p_week and e.user_id = auth.uid()
    ), '[]'::jsonb));
  end if;
  return jsonb_build_object('week', v_week, 'rows', v_rows, 'me', v_me,
                            'games', v_games, 'entrants', v_entrants);
end;
$$;
grant execute on function public.cfb_fantasy_board(int,int,int) to anon, authenticated;

-- ─── the writers, which only the build's database user calls ────────────────

create or replace function public.cfb_fantasy_mark_results(
  p_season int, p_week int,
  p_games_final int, p_games_total int, p_final boolean)
returns table (changed boolean, rows_in int)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_sig  text;
  v_was  text;
  v_rows int;
begin
  select coalesce(md5(string_agg(t.player_id || ':' || t.half_ppr::text, ','
                                 order by t.player_id)), 'empty'),
         count(*)::int
    into v_sig, v_rows
    from public.cfb_fantasy_results t
   where t.season = p_season and t.week = p_week;
  select w.results_sig into v_was
    from public.cfb_fantasy_weeks w
   where w.season = p_season and w.week = p_week;
  update public.cfb_fantasy_weeks w
     set checked_at  = now(),
         results_at  = case when v_was is distinct from v_sig then now() else w.results_at end,
         results_sig = v_sig,
         games_final = p_games_final,
         games_total = p_games_total,
         scored_at   = case when p_final then coalesce(w.scored_at, now()) else w.scored_at end
   where w.season = p_season and w.week = p_week;
  return query select (v_was is distinct from v_sig), v_rows;
end;
$$;
revoke all on function public.cfb_fantasy_mark_results(int,int,int,int,boolean) from public;

-- A game only ever moves forwards (111's rule, and its argument).
create or replace function public.cfb_fantasy_put_games(
  p_season int, p_week int, p_games jsonb)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_moved int;
begin
  if p_games is null or jsonb_typeof(p_games) <> 'array' then
    return 0;
  end if;
  with incoming as (
    select g.game_id, g.away, g.home, g.kick,
           coalesce(g.state, 'pre') as state,
           g.away_score, g.home_score, g.period, g.clock, g.overtime,
           coalesce(g.source, 'unknown') as source
      from jsonb_to_recordset(p_games) as g(
        game_id text, away text, home text, kick timestamptz, state text,
        away_score int, home_score int, period int, clock text,
        overtime boolean, source text)
     where g.game_id is not null and g.away is not null and g.home is not null
  ),
  paired as materialized (
    select i.*,
           t.game_id as had, t.away as t_away_c, t.home as t_home_c, t.kick as t_kick,
           t.state as t_state, t.away_score as t_away, t.home_score as t_home,
           t.period as t_period, t.clock as t_clock, t.overtime as t_ot,
           t.source as t_source, t.updated_at as t_at,
           (t.game_id is null
            or public.nfl_state_rank(coalesce(i.state, 'pre'))
               >= public.nfl_state_rank(t.state)) as take
      from incoming i
      left join public.cfb_fantasy_games t
        on t.season = p_season and t.week = p_week and t.game_id = i.game_id
  ),
  merged as (
    select p.game_id,
           p.away, p.home, coalesce(p.kick, p.t_kick) as kick,
           case when p.take then p.state else p.t_state end as state,
           case when p.take then coalesce(p.away_score, p.t_away) else p.t_away end as away_score,
           case when p.take then coalesce(p.home_score, p.t_home) else p.t_home end as home_score,
           case when p.take and p.state = 'post' then null
                when p.take then coalesce(p.period, p.t_period)
                else p.t_period end as period,
           case when p.take and p.state = 'post' then null
                when p.take then coalesce(p.clock, p.t_clock)
                else p.t_clock end as clock,
           coalesce(p.overtime, p.t_ot) as overtime,
           case when p.take then p.source else p.t_source end as source,
           p.had, p.t_away_c, p.t_home_c, p.t_kick, p.t_state, p.t_away, p.t_home,
           p.t_period, p.t_clock, p.t_ot, p.t_at
      from paired p
  ),
  final as (
    select m.*,
           (m.had is null
            or (m.state, m.away_score, m.home_score, m.period, m.clock, m.overtime,
                m.away, m.home, m.kick)
               is distinct from
               (m.t_state, m.t_away, m.t_home, m.t_period, m.t_clock, m.t_ot,
                m.t_away_c, m.t_home_c, m.t_kick)) as moved
      from merged m
  ),
  put as (
    insert into public.cfb_fantasy_games
      (season, week, game_id, away, home, kick, state,
       away_score, home_score, period, clock, overtime, source, updated_at)
    select p_season, p_week, f.game_id, f.away, f.home, f.kick, f.state,
           f.away_score, f.home_score, f.period, f.clock, f.overtime, f.source,
           case when f.moved then now() else f.t_at end
      from final f
    on conflict (season, week, game_id) do update set
      away = excluded.away, home = excluded.home, kick = excluded.kick,
      state = excluded.state, away_score = excluded.away_score,
      home_score = excluded.home_score, period = excluded.period,
      clock = excluded.clock, overtime = excluded.overtime,
      source = excluded.source, updated_at = excluded.updated_at
    returning 1
  )
  select count(*)::int into v_moved from final where moved;
  return coalesce(v_moved, 0);
end;
$$;
revoke all on function public.cfb_fantasy_put_games(int, int, jsonb) from public, anon, authenticated;

-- ─── the prize ──────────────────────────────────────────────────────────────

create or replace function public.cfb_fantasy_grant_pass(
  p_season int, p_week int, p_force boolean default false)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_prize   public.cfb_fantasy_prizes%rowtype;
  v_entries int;
  v_tag     text := 'fantasy:cfb-' || p_season || '-w' || p_week;
  v_until   timestamptz;
begin
  select * into v_prize from public.cfb_fantasy_prizes
   where season = p_season and week = p_week and place = 1
   for update;
  if not found then return 'no winner'; end if;
  if v_prize.promo_state <> 'none' then return v_prize.promo_state; end if;
  select count(*)::int into v_entries from public.cfb_fantasy_entries
   where season = p_season and week = p_week;
  -- A field of one is voided, not paid (120's rule).
  if v_entries < 2 and not p_force then
    update public.cfb_fantasy_prizes set promo_state = 'void'
     where season = p_season and week = p_week and place = 1;
    return 'void';
  end if;
  -- A permanent row is never touched, and a running pass is extended from its END.
  insert into public.premium_unlocks
    (user_id, product, source, payload, expires_at, fulfilled_at)
  select v_prize.user_id, pr.product, v_tag,
         jsonb_build_object('season', p_season, 'week', p_week, 'league', 'cfb'),
         now() + interval '30 days', now()
    from unnest(array['ps_premium', 'cfb_premium']) as pr(product)
  on conflict (user_id, product) do update
     set expires_at   = greatest(public.premium_unlocks.expires_at, now()) + interval '30 days',
         source       = excluded.source,
         payload      = excluded.payload,
         granted_at   = now(),
         fulfilled_at = now()
   where public.premium_unlocks.expires_at is not null;
  select case when bool_or(u.expires_at is null) then null else max(u.expires_at) end
    into v_until
    from public.premium_unlocks u
   where u.user_id = v_prize.user_id and u.product in ('ps_premium', 'cfb_premium');
  update public.cfb_fantasy_prizes
     set promo_state = 'granted', pass_until = v_until, granted_at = now()
   where season = p_season and week = p_week and place = 1;
  return 'granted';
end;
$$;
revoke all on function public.cfb_fantasy_grant_pass(int, int, boolean) from public;

create or replace function public.cfb_fantasy_settle_week(p_season int, p_week int)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_scored timestamptz; v_n int;
begin
  select w.scored_at into v_scored from public.cfb_fantasy_weeks w
   where w.season = p_season and w.week = p_week;
  if v_scored is null then
    return 0;
  end if;
  with board as (
    select s.place, s.entry_no, s.score, s.display_name
      from public.cfb_fantasy_standings(p_season, p_week, 3) s
     where s.place <= 3
  ), ids as (
    select e.id, e.user_id, (dense_rank() over (order by e.id))::int as entry_no
      from public.cfb_fantasy_entries e
     where e.season = p_season and e.week = p_week
  )
  insert into public.cfb_fantasy_prizes
    (season, week, place, user_id, entry_id, display_name, score)
  select p_season, p_week, b.place, i.user_id, i.id, b.display_name, b.score
    from board b
    join ids i on i.entry_no = b.entry_no
  on conflict (season, week, place) do nothing;
  get diagnostics v_n = row_count;
  perform public.cfb_fantasy_grant_pass(p_season, p_week);
  return v_n;
end;
$$;
revoke all on function public.cfb_fantasy_settle_week(int,int) from public;

create or replace function public.cfb_fantasy_settle_on_scored()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scored_at is not null and old.scored_at is null then
    perform public.cfb_fantasy_settle_week(new.season, new.week);
  end if;
  return new;
end;
$$;
drop trigger if exists cfb_fantasy_settle_on_scored on public.cfb_fantasy_weeks;
create trigger cfb_fantasy_settle_on_scored
  after update on public.cfb_fantasy_weeks
  for each row execute function public.cfb_fantasy_settle_on_scored();

-- Nobody is told the result until first place has been paid (115's rule).
drop function if exists public.cfb_fantasy_my_result(int, int);
create function public.cfb_fantasy_my_result(p_season int, p_week int)
returns table (
  entered boolean, place int, entries int, score numeric, projected numeric,
  prize_place int, seen boolean, prize_state text, pass_until timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_scored timestamptz;
begin
  if v_user is null then return; end if;
  select w.scored_at into v_scored from public.cfb_fantasy_weeks w
   where w.season = p_season and w.week = p_week;
  if v_scored is null then return; end if;
  if not exists (select 1 from public.cfb_fantasy_prizes pz
                  where pz.season = p_season and pz.week = p_week and pz.place = 1
                    and pz.promo_state in ('void', 'granted')) then
    return;
  end if;
  return query
  with mine as (
    select e.id, e.projected, e.result_seen_at
      from public.cfb_fantasy_entries e
     where e.season = p_season and e.week = p_week and e.user_id = v_user
  ), all_rows as (
    select e.id, public.cfb_fantasy_score(e.season, e.week, e.picks) as score
      from public.cfb_fantasy_entries e
     where e.season = p_season and e.week = p_week
  ), ranked as (
    select a.id, a.score, (row_number() over (order by a.score desc, a.id asc))::int as place
      from all_rows a
  )
  select true, r.place, (select count(*)::int from all_rows), r.score, m.projected,
         pz.place, (m.result_seen_at is not null), pz.promo_state, pz.pass_until
    from mine m
    join ranked r on r.id = m.id
    left join public.cfb_fantasy_prizes pz
      on pz.season = p_season and pz.week = p_week and pz.user_id = v_user;
end;
$$;
grant execute on function public.cfb_fantasy_my_result(int,int) to authenticated;

create or replace function public.cfb_fantasy_ack_result(p_season int, p_week int)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return false; end if;
  update public.cfb_fantasy_entries e
     set result_seen_at = coalesce(e.result_seen_at, now())
   where e.season = p_season and e.week = p_week and e.user_id = v_user;
  return found;
end;
$$;
grant execute on function public.cfb_fantasy_ack_result(int,int) to authenticated;

create or replace function public.cfb_fantasy_my_wins()
returns table (season int, week int, place int)
language sql
stable
security definer
set search_path = public
as $$
  select p.season, p.week, p.place
    from public.cfb_fantasy_prizes p
   where p.user_id = auth.uid()
   order by p.season desc, p.week desc;
$$;
grant execute on function public.cfb_fantasy_my_wins() to authenticated;

notify pgrst, 'reload schema';
