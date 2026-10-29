-- ---------------------------------------------------------------------------
-- 130_hoops_careers.sql: Run The Floor's Career board
-- ---------------------------------------------------------------------------
--
-- A Career is one invented player's whole life in the league, from the draft
-- (or a high school sophomore year) to the Hall of Fame vote. It is not a
-- season and it is not a play, so it is its own table rather than a mode on
-- rtf_runs or rtf_plays: every column here is about a career, and none of
-- theirs is.
--
-- THE SCORE IS DERIVED HERE AND NEVER SENT, the rule 108 argues at length.
-- The page sends the career's TOTALS and this file works out the legacy
-- score with the same arithmetic as legacyScore() in hoops/career.js:
--
--   pts*14 + reb*5 + ast*7, plus 10000 for every point of
--     rings*4 + mvp*13 + fmvp*6 + an1*5 + star*2 + dpoy*4 + roy*2
--     + olympic*2 + ncaa*2 + npoy*3 + aa1,
--   plus 25000 for every other All-NBA team,
--   then rounded half up to the nearest 10000.
--
-- IT IS INTEGER ARITHMETIC ON PURPOSE, on both sides. Written as a decimal
-- the page computes a float and this computes a numeric, and a total that
-- lands exactly on a half rounds one way in each: the board and the Hall card
-- would disagree by a point about one career. hoops/check-career.mjs holds
-- the two equal over every career it plays.
--
-- WHAT IT DOES NOT DO is replay the career. A career is twenty seasons of the
-- engine and a hundred cards, and none of that belongs in plpgsql. So the
-- totals are trusted within their bounds, which is 108's position on a
-- season's record, and what IS checked is everything that can be: no more
-- rings than seasons, no more Finals MVPs than rings, a first team is an
-- All-NBA team, a retired number belongs to a club the player was on.
--
-- One row per career. The career's seed identifies it, so a second submit of
-- the same career hands back the first row.
--
-- Idempotent: safe to run twice.
-- ---------------------------------------------------------------------------

create table if not exists rtf_careers (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  -- Nullable, so a career finished signed out records and can be claimed.
  user_id       uuid,
  -- Read out of profiles for auth.uid(), never sent.
  display_name  text,
  client_id     text not null,
  score         integer not null,

  -- The player. Invented by whoever played him, so the name is checked for
  -- shape and nothing else, and may be null.
  player        text,
  pos           text not null,
  num           smallint,
  road          boolean not null default false,
  college       text,
  pick          smallint not null default 0,   -- 0 is undrafted
  first_year    smallint not null,
  last_year     smallint not null,
  clubs         text[] not null,
  jersey        text,                           -- the club that retired his number
  peak          numeric(4,1),                   -- best points a game in a season of 20 games

  seasons       smallint not null,
  gp            integer not null,
  pts           integer not null,
  reb           integer not null,
  ast           integer not null,
  rings         smallint not null default 0,
  mvp           smallint not null default 0,
  fmvp          smallint not null default 0,
  an            smallint not null default 0,
  an1           smallint not null default 0,
  star          smallint not null default 0,
  dpoy          smallint not null default 0,
  roy           smallint not null default 0,
  olympic       smallint not null default 0,
  ncaa          smallint not null default 0,
  npoy          smallint not null default 0,
  aa1           smallint not null default 0,

  constraint rtf_careers_pos_chk check (pos in ('PG','SG','SF','PF','C'))
);

alter table rtf_careers enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'rtf_careers'
                    and policyname = 'rtf_careers_read') then
    create policy rtf_careers_read on rtf_careers for select using (true);
  end if;
end $$;

-- RLS narrows a grant, it does not make one. Read only for both roles; the
-- submit and the claim below are the only writers.
revoke all on rtf_careers from anon, authenticated;
grant select on rtf_careers to anon, authenticated;

-- One index per order the page asks for: the legacy board, the points board
-- and the rings board, plus an account's own.
create index if not exists rtf_careers_score_idx on rtf_careers (score desc, created_at asc);
create index if not exists rtf_careers_pts_idx   on rtf_careers (pts desc, created_at asc);
create index if not exists rtf_careers_rings_idx on rtf_careers (rings desc, score desc, created_at asc);
create index if not exists rtf_careers_user_idx  on rtf_careers (user_id, created_at desc) where user_id is not null;
create index if not exists rtf_careers_client_idx on rtf_careers (client_id);

-- ---------------------------------------------------------------------------
-- The score, once. Read by the submit and by the test, so the two cannot
-- disagree about the arithmetic they are both checking.
-- ---------------------------------------------------------------------------
create or replace function rtf_career_score(
  p_pts int, p_reb int, p_ast int, p_rings int, p_mvp int, p_fmvp int,
  p_an int, p_an1 int, p_star int, p_dpoy int, p_roy int, p_olympic int,
  p_ncaa int, p_npoy int, p_aa1 int
) returns integer
language sql immutable as $$
  select ((p_pts::bigint * 14 + p_reb::bigint * 5 + p_ast::bigint * 7
    + (p_rings * 4 + p_mvp * 13 + p_fmvp * 6 + p_an1 * 5 + p_star * 2 + p_dpoy * 4
       + p_roy * 2 + p_olympic * 2 + p_ncaa * 2 + p_npoy * 3 + p_aa1)::bigint * 10000
    + (p_an - p_an1)::bigint * 25000 + 5000) / 10000)::int
$$;

-- ---------------------------------------------------------------------------
-- rtf_submit_career
-- ---------------------------------------------------------------------------
create or replace function rtf_submit_career(
  p_id text, p_player text, p_pos text, p_num int, p_road boolean, p_college text,
  p_pick int, p_from int, p_to int, p_clubs text[], p_jersey text, p_peak numeric,
  p_seasons int, p_gp int, p_pts int, p_reb int, p_ast int,
  p_rings int, p_mvp int, p_fmvp int, p_an int, p_an1 int, p_star int,
  p_dpoy int, p_roy int, p_olympic int, p_ncaa int, p_npoy int, p_aa1 int
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_id bigint;
  v_i int;
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9:._-]{1,40}$' then raise exception 'career id looks wrong'; end if;
  if p_player is not null and p_player !~ '^[[:alpha:]][[:alpha:] .''-]{0,27}$' then
    raise exception 'player name looks wrong';
  end if;
  if p_pos is null or p_pos not in ('PG','SG','SF','PF','C') then raise exception 'position looks wrong'; end if;
  if p_num is not null and (p_num < 0 or p_num > 99) then raise exception 'number must be 0 to 99'; end if;
  if p_college is not null and length(p_college) > 40 then raise exception 'college looks wrong'; end if;
  if p_pick is null or p_pick < 0 or p_pick > 60 then raise exception 'pick must be 0 to 60'; end if;
  if p_seasons is null or p_seasons < 1 or p_seasons > 30 then raise exception 'seasons must be 1 to 30'; end if;
  if p_from is null or p_to is null or p_from < 1946 or p_to > 2200 or p_to < p_from then
    raise exception 'years look wrong';
  end if;
  if p_to - p_from + 1 < p_seasons then raise exception 'more seasons than years'; end if;
  if p_gp is null or p_gp < 1 or p_gp > p_seasons * 82 + p_seasons * 28 then raise exception 'games look wrong'; end if;
  if p_pts is null or p_pts < 0 or p_pts > p_gp * 60 then raise exception 'points look wrong'; end if;
  if p_reb is null or p_reb < 0 or p_reb > p_gp * 30 then raise exception 'rebounds look wrong'; end if;
  if p_ast is null or p_ast < 0 or p_ast > p_gp * 25 then raise exception 'assists look wrong'; end if;
  if p_peak is not null and (p_peak < 0 or p_peak > 60) then raise exception 'peak looks wrong'; end if;
  if coalesce(p_rings, -1) < 0 or p_rings > p_seasons then raise exception 'more rings than seasons'; end if;
  if coalesce(p_mvp, -1) < 0 or p_mvp > p_seasons then raise exception 'more MVPs than seasons'; end if;
  if coalesce(p_fmvp, -1) < 0 or p_fmvp > p_rings then raise exception 'more Finals MVPs than rings'; end if;
  if coalesce(p_an, -1) < 0 or p_an > p_seasons then raise exception 'more All-NBA teams than seasons'; end if;
  if coalesce(p_an1, -1) < 0 or p_an1 > p_an then raise exception 'a first team is an All-NBA team'; end if;
  if coalesce(p_star, -1) < 0 or p_star > p_seasons then raise exception 'more All-Star games than seasons'; end if;
  if coalesce(p_dpoy, -1) < 0 or p_dpoy > p_seasons then raise exception 'more DPOYs than seasons'; end if;
  if coalesce(p_roy, -1) < 0 or p_roy > 1 then raise exception 'one Rookie of the Year at most'; end if;
  if coalesce(p_olympic, -1) < 0 or p_olympic > 6 then raise exception 'olympic golds look wrong'; end if;
  if coalesce(p_ncaa, -1) < 0 or p_ncaa > 4 or coalesce(p_npoy, -1) < 0 or p_npoy > 4
     or coalesce(p_aa1, -1) < 0 or p_aa1 > 4 then
    raise exception 'college honours look wrong';
  end if;
  if not coalesce(p_road, false) and (p_ncaa > 0 or p_npoy > 0 or p_aa1 > 0) then
    raise exception 'college honours need a road career';
  end if;
  if p_clubs is null or coalesce(array_length(p_clubs, 1), 0) < 1 or array_length(p_clubs, 1) > 30 then
    raise exception 'clubs look wrong';
  end if;
  for v_i in 1 .. array_length(p_clubs, 1) loop
    if p_clubs[v_i] is null or p_clubs[v_i] !~ '^[A-Z]{2,4}$' then raise exception 'club looks wrong: %', p_clubs[v_i]; end if;
  end loop;
  if p_jersey is not null and not (p_jersey = any(p_clubs)) then
    raise exception 'a number is retired by a club he played for';
  end if;

  -- The same career twice is the first row, whoever sends it.
  select id into v_id from rtf_careers
   where client_id = p_id and user_id is not distinct from v_user limit 1;
  if v_id is not null then return v_id; end if;

  if v_user is not null then
    select username::text into v_name from profiles where id = v_user;
  end if;

  insert into rtf_careers (user_id, display_name, client_id, score,
    player, pos, num, road, college, pick, first_year, last_year, clubs, jersey, peak,
    seasons, gp, pts, reb, ast, rings, mvp, fmvp, an, an1, star, dpoy, roy, olympic, ncaa, npoy, aa1)
  values (v_user, v_name, p_id,
    rtf_career_score(p_pts, p_reb, p_ast, p_rings, p_mvp, p_fmvp, p_an, p_an1, p_star,
      p_dpoy, p_roy, p_olympic, p_ncaa, p_npoy, p_aa1),
    p_player, p_pos, p_num, coalesce(p_road, false), p_college, p_pick, p_from, p_to, p_clubs, p_jersey,
    round(p_peak, 1), p_seasons, p_gp, p_pts, p_reb, p_ast, p_rings, p_mvp, p_fmvp, p_an, p_an1,
    p_star, p_dpoy, p_roy, p_olympic, p_ncaa, p_npoy, p_aa1)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function rtf_submit_career(text,text,text,int,boolean,text,int,int,int,text[],text,numeric,
  int,int,int,int,int,int,int,int,int,int,int,int,int,int,int,int,int) from public;
grant execute on function rtf_submit_career(text,text,text,int,boolean,text,int,int,int,text[],text,numeric,
  int,int,int,int,int,int,int,int,int,int,int,int,int,int,int,int,int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- A career finished signed out, claimed on the way in, and a rename. Same
-- guards as rtf_claim_run: only an unowned row, and only by somebody.
-- ---------------------------------------------------------------------------
create or replace function rtf_claim_career(p_id bigint)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_rows int;
begin
  if v_user is null then return false; end if;
  select username::text into v_name from profiles where id = v_user;
  update rtf_careers set user_id = v_user, display_name = v_name
   where id = p_id and user_id is null;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke all on function rtf_claim_career(bigint) from public;
grant execute on function rtf_claim_career(bigint) to authenticated;

create or replace function rtf_rename_careers()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_rows int;
begin
  if v_user is null then return 0; end if;
  select username::text into v_name from profiles where id = v_user;
  update rtf_careers set display_name = v_name where user_id = v_user;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke all on function rtf_rename_careers() from public;
grant execute on function rtf_rename_careers() to authenticated;
