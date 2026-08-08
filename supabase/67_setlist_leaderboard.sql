-- ============================================================================
-- 67_setlist_leaderboard.sql : accounts, the leaderboard, and the shows you
--                              were at, for Segue: The Setlist Builder (/setlist)
-- ============================================================================
-- New and self-contained. Touches nothing that already exists: no existing
-- table, function, policy or grant is altered. Safe and idempotent, re-running
-- it does nothing new.
--
-- Run it once in the Supabase SQL editor. Until it is run, setlist/board.js gets
-- a 404 from every call, reports itself unavailable, and the game says the board
-- is offline rather than showing wrong numbers. The game itself is unaffected:
-- it is a static page reading a CSV and it never needed a database to be played.
--
-- THIS ADDS NO NEW ACCOUNT SYSTEM. The site already has one: `profiles` from
-- 10_accounts.sql, with a citext-unique username, a handle_new_user trigger that
-- makes a row the moment somebody signs up, and set_username/username_available
-- helpers. Email-and-password and Google are already configured on the project
-- because the other games use them. A RunThe.GG account IS the account here.
--
-- THE NAME IS NEVER SENT BY THE CLIENT. segue_submit_run() reads it out of
-- profiles for auth.uid(), which is what the football, college and soccer games
-- do and for the same reason: a client-supplied name on a public board is a
-- forgery and an abuse surface at once. There is no free-text column here that a
-- player can write into. The picks are archive ids, rendered by the client
-- against its own copy of the setlist data.
--
-- Guests still record and appear as Anonymous. A run is nineteen picks and the
-- best part of ten minutes, and demanding an account before the board will admit
-- it happened is the wrong friction for a game that has none anywhere else.
--
-- WHAT IS TRUSTED AND WHAT IS NOT
-- -------------------------------
-- The score is computed in the browser by setlist/scoring.js against a CSV of
-- 7,504 performances that lives in the browser and not in this database. There
-- is no way for this function to recompute a total without that data, so the
-- total IS client-reported and a determined person can post a show they did not
-- draft.
--
-- What this function does instead is refuse any row that is not internally
-- coherent, and own every field it can derive. Specifically:
--
--   * the four component totals have to ADD UP to the total. scoreShow() returns
--     total = songTotal + timeTotal + flowTotal + breadthTotal, so a row where
--     they do not sum is not a score this game can produce.
--   * time points are capped by TIME_POINTS_PER_SET * 3, which is a constant and
--     not a function of the data.
--   * breadth points are recomputed HERE from the list of cards claimed, against
--     this file's own copy of the card values. The client sends which cards it
--     got; it does not get to say what they were worth.
--   * stage time cannot exceed the three set budgets less what respins burned,
--     and respins burn a fixed escalating amount.
--   * a segue count cannot exceed the number of adjacent pairs nineteen picks
--     across three sets can produce.
--   * picks have to be distinct and well-formed, and there cannot be more of
--     them than the sets hold.
--   * the ceiling has to be at least the total. bestPossible() searches the same
--     shows under the same rules and is never beaten by the line it contains.
--
-- WHY THE BOARD HAS TWO AXES, and this is the part worth reading. The shows are
-- DRAWN AT RANDOM from the archive. A player handed three nights of jamcharts
-- and twenty-minute versions will out-total a better player handed three thin
-- ones, every time. Raw score is therefore partly a measure of luck, which is
-- fine for a headline and wrong for a ranking on its own.
--
-- So `pct_of_best` is a first-class axis and not a decoration. bestPossible()
-- replays the EXACT shows the player drew, in the order they came up, with the
-- same picks remaining and the same time already burned, and searches for the
-- best line through them. The percentage of that a player actually took is the
-- one number here that the draw cannot inflate: it asks how well you played the
-- night you were given, and a thin night played perfectly beats a great night
-- played badly. Both boards ship, and the percentage board is the one to point a
-- competitive player at.
--
-- The honest fix for the remaining hole is an edge function holding the archive
-- that replays (picks, rng_seed) through scoring.js, which is why those columns
-- are stored even though nothing reads them yet. Until then the board is a
-- participation and comparison board, and should not be the basis for a prize.
-- ----------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The runs
-- ---------------------------------------------------------------------------
create table if not exists segue_runs (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  -- Nullable so a guest's run records now and can be claimed on sign-in, the
  -- same shape 17_claim_draft.sql and 51_football_accounts.sql use.
  user_id       uuid,
  -- Denormalised on purpose, and segue_rename_runs() below is what keeps it
  -- honest. The alternative is embedding profiles in every board read, which
  -- turns each count query into a join; those counts are index-only scans today.
  display_name  text,

  -- WHICH BAND. Every band is its own competition: the shows, the songs and the
  -- reachable totals are all different, so one mixed board would rank people
  -- against a game they were not playing. Leads every index for that reason.
  band          text not null,

  -- The score, and its four parts. The parts are checked to sum to the total.
  total         integer not null,
  song_pts      integer not null,
  time_pts      integer not null,
  flow_pts      integer not null,
  breadth_pts   integer not null,

  -- The ceiling, and the axis that the draw cannot inflate. pct_of_best is
  -- computed here from total and best_total rather than taken from the client,
  -- because it is the column the second board sorts on.
  best_total    integer,
  pct_of_best   numeric(5,2),

  -- What the night contained. Descriptive, bounded, never free text.
  songs         smallint not null,
  segues        smallint not null default 0,
  sandwiches    smallint not null default 0,
  covers        smallint not null default 0,
  jamcharts     smallint not null default 0,
  bustouts      smallint not null default 0,
  cooldowns     smallint not null default 0,
  longest_sec   integer  not null default 0,
  respins       smallint not null default 0,
  seconds_used  integer  not null default 0,

  -- The breadth cards, as ids. breadth_pts is recomputed from these.
  cards         text[] not null default '{}',
  cards_got     smallint not null default 0,

  -- The show ids drawn, and the picks as "<show_id>:<song_id>". Rendered by the
  -- client against its own copy of the archive, so no player-supplied text is
  -- ever stored or displayed.
  shows         text[],
  picks         text[] not null,

  -- For the replay verifier described in the header. Nothing reads these yet.
  rng_seed      text,

  constraint segue_runs_parts_sum
    check (total = song_pts + time_pts + flow_pts + breadth_pts)
);

comment on table segue_runs is
  'Completed shows drafted in Segue (/setlist). Written only by segue_submit_run().';

-- ---------------------------------------------------------------------------
-- Indexes. Every query the client makes, and nothing speculative.
--
-- The shape is taken from ps_runs and cfb_runs, whose numbers were measured at
-- two million rows: a leading equality column followed by the sort column is
-- what lets Postgres satisfy the filter and the order from one index scan, and
-- the trailing created_at is what lets a time window be tested from INSIDE the
-- index rather than as a filter with a heap fetch per candidate row. On ps_runs
-- that difference was 1,081 buffers against 59,917 for the same windowed query.
--
-- THERE IS NO ASCENDING TWIN, and that only works because the client reverses
-- the TIEBREAK along with the sort key. Postgres reads an index backwards as
-- happily as forwards, but only when every sort key reverses together. See
-- ORDER_TIEBREAK in setlist/board.js.
-- ---------------------------------------------------------------------------
create index if not exists segue_runs_total_idx
  on segue_runs (band, total desc, created_at asc);
create index if not exists segue_runs_pct_idx
  on segue_runs (band, pct_of_best desc, created_at asc);
create index if not exists segue_runs_created_idx
  on segue_runs (band, created_at desc, total desc);
-- Claiming a guest run once signed in, the profile's own history, and the
-- rename below.
create index if not exists segue_runs_user_idx
  on segue_runs (user_id, created_at desc) where user_id is not null;
-- NAMED RUNS ONLY, which is what every ranking list asks for. A guest run counts
-- towards how many shows have been drafted and does not belong on a board whose
-- whole job is to say who did what. Partial, because on a young board that is a
-- handful of rows out of everything: measured on ps_runs at 2,000,000 rows of
-- which 20 were named, the top-500 read went from 246ms scanning 666,726 rows to
-- 0.03ms off 16kB.
create index if not exists segue_runs_named_total_idx
  on segue_runs (band, total desc, created_at asc) where display_name is not null;
create index if not exists segue_runs_named_pct_idx
  on segue_runs (band, pct_of_best desc, created_at asc) where display_name is not null;

-- ---------------------------------------------------------------------------
-- RLS: everyone reads, nobody writes directly. The RPC is the only writer.
-- ---------------------------------------------------------------------------
alter table segue_runs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies
                 where tablename='segue_runs' and policyname='segue_runs_read') then
    create policy segue_runs_read on segue_runs for select using (true);
  end if;
end $$;

revoke all on segue_runs from anon, authenticated;
grant select on segue_runs to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The shows you were at
-- ---------------------------------------------------------------------------
-- The one thing here that is genuinely PERSONAL rather than public. A player
-- marks a show in the archive as one they were actually at, and it comes back
-- with a tag every time that show is drawn.
--
-- It works with no account at all: the game keeps the same list in localStorage
-- under `segue_were_there` and that is what a signed-out player uses. This table
-- is what makes it survive a new phone. segue_sync_attended() below merges the
-- two rather than picking a winner, because both sides are additions a real
-- person made and there is no version of "resolving" that should lose one.
--
-- READABLE ONLY BY ITS OWNER, unlike everything else in this file. A public list
-- of which nights somebody was physically at is a different kind of fact from a
-- score, and nothing on the leaderboard needs it. The profile shows a COUNT to
-- its owner and the board shows nothing at all.
-- ---------------------------------------------------------------------------
create table if not exists segue_attended (
  user_id    uuid not null references auth.users(id) on delete cascade,
  band       text not null,
  show_id    text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, band, show_id)
);

comment on table segue_attended is
  'Shows a player has marked as ones they were at. Private to its owner.';

alter table segue_attended enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies
                 where tablename='segue_attended' and policyname='segue_attended_own') then
    create policy segue_attended_own on segue_attended
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

revoke all on segue_attended from anon, authenticated;
grant select, insert, delete on segue_attended to authenticated;

-- ---------------------------------------------------------------------------
-- segue_display_name(): the one place that answers "what name goes on a row"
-- ---------------------------------------------------------------------------
-- Three lines, and its own function on purpose. Three callers below need this
-- answer, and a later migration needs to CHANGE it: 68_setlist_username.sql
-- gives players a name for this game specifically, and does it by replacing
-- this function and nothing else. The alternative was restating
-- segue_submit_run()'s three hundred lines of validation to edit one lookup in
-- the middle of it, which is how two copies of the rules start drifting apart.
create or replace function segue_display_name(p_user uuid)
returns text
language sql security definer set search_path = public stable as $$
  select username::text from profiles where id = p_user;
$$;
revoke all on function segue_display_name(uuid) from public;
grant execute on function segue_display_name(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- segue_submit_run()
-- ---------------------------------------------------------------------------
-- Returns the new row id. Raises with a readable message on anything incoherent,
-- so a client bug shows up as a failed submit rather than as a wrong board.
--
-- The constants below MUST match setlist/scoring.js. They are literals rather
-- than a read from a config table so this file is a complete statement of the
-- rules. If a set budget or a breadth card's value changes, change it here in
-- the same deploy or legitimate shows will start being refused.
-- ---------------------------------------------------------------------------
create or replace function segue_submit_run(
  p_band        text,
  p_total       int,
  p_song_pts    int,
  p_time_pts    int,
  p_flow_pts    int,
  p_breadth_pts int,
  p_cards       text[]  default '{}',
  p_best_total  int     default null,
  p_songs       int     default 0,
  p_segues      int     default 0,
  p_sandwiches  int     default 0,
  p_covers      int     default 0,
  p_jamcharts   int     default 0,
  p_bustouts    int     default 0,
  p_cooldowns   int     default 0,
  p_longest_sec int     default 0,
  p_respins     int     default 0,
  p_seconds_used int    default 0,
  p_shows       text[]  default null,
  p_picks       text[]  default null,
  p_rng_seed    text    default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  -- setlist/scoring.js SETS: 75, 70 and 10 minutes, capped at 8, 8 and 3 songs.
  SEG_MAX_SONGS      constant int := 19;
  SEG_SETS           constant int := 3;
  SEG_BUDGET_SEC     constant int := (75 + 70 + 10) * 60;
  -- RESPIN_COSTS = [5, 10, 15] minutes, and a fourth is never offered.
  SEG_MAX_RESPINS    constant int := 3;
  -- TIME_POINTS_PER_SET = 65, over three sets.
  SEG_MAX_TIME_PTS   constant int := 65 * SEG_SETS;
  -- A structural sanity bound, not a fairness guarantee. The best single
  -- performance the archive holds scores about 250 (a 75 crowd rating through
  -- the version and placement multipliers), so 500 a song leaves real headroom
  -- and still refuses a number no run can reach.
  SEG_MAX_SONG_PTS   constant int := SEG_MAX_SONGS * 500;
  -- Segue points, cooldowns and the arc bonus. ARC_MAX is 60 and the segue
  -- family tops out near 150 a link before decay; the same kind of bound.
  SEG_MAX_FLOW_PTS   constant int := 3000;
  SEG_MAX_LEN_SEC    constant int := 5400;

  -- BREADTH, id by id. Recomputed here so the card values are this file's and
  -- not the client's.
  CARD_IDS    constant text[] := array['cover','bustout','jamchart','bigjam','roles'];
  CARD_POINTS constant int[]  := array[34, 32, 26, 26, 44];

  v_band    text := lower(trim(coalesce(p_band, '')));
  v_cards   text[];
  v_breadth int := 0;
  v_pct     numeric;
  v_pairs   int;
  v_respin_sec int;
  v_dupe    bigint;
  v_id      bigint;
  v_user    uuid := auth.uid();
  v_name    text;
  i         int;
begin
  -- ---- the band ----
  -- Format-checked rather than checked against a list, so adding a band to the
  -- game needs no migration. The band id is a slug the client owns.
  if v_band !~ '^[a-z0-9][a-z0-9_-]{0,31}$' then
    raise exception 'not a band id: %', p_band;
  end if;

  -- ---- the shape of the night ----
  if p_songs is null or p_songs < 1 or p_songs > SEG_MAX_SONGS then
    raise exception 'a show has 1..% songs, got %', SEG_MAX_SONGS, p_songs;
  end if;
  if coalesce(p_respins, 0) < 0 or coalesce(p_respins, 0) > SEG_MAX_RESPINS then
    raise exception 'respins must be 0..%, got %', SEG_MAX_RESPINS, p_respins;
  end if;
  -- EVERY RESPIN COMES OUT OF THE STAGE TIME, so the two are one budget and this
  -- is one check. RESPIN_COSTS is [5, 10, 15] minutes and they escalate, so the
  -- n-th respin has already burned the sum of the first n.
  v_respin_sec := (array[0, 300, 900, 1800])[coalesce(p_respins, 0) + 1];
  if coalesce(p_seconds_used, 0) < 0
     or coalesce(p_seconds_used, 0) + v_respin_sec > SEG_BUDGET_SEC then
    raise exception 'stage time of %s plus %s of respins is more than the % second night',
      p_seconds_used, v_respin_sec, SEG_BUDGET_SEC;
  end if;
  if coalesce(p_longest_sec, 0) < 0 or coalesce(p_longest_sec, 0) > SEG_MAX_LEN_SEC then
    raise exception 'longest song out of range: %', p_longest_sec;
  end if;

  -- ---- the picks ----
  if p_picks is null or cardinality(p_picks) <> p_songs then
    raise exception 'picks (%) do not match the songs played (%)',
      coalesce(cardinality(p_picks), 0), p_songs;
  end if;
  if cardinality(array(select distinct unnest(p_picks))) <> p_songs then
    raise exception 'the same performance cannot be played twice';
  end if;
  if exists (select 1 from unnest(p_picks) k where k !~ '^[0-9A-Za-z_-]{1,32}:[0-9A-Za-z_-]{1,32}$') then
    raise exception 'a pick is not of the form <show_id>:<song_id>';
  end if;

  -- ---- the counts have to fit the night ----
  -- Segues only count between songs adjacent INSIDE one set, so three sets of
  -- n songs offer n - 3 adjacent pairs at most.
  v_pairs := greatest(0, p_songs - SEG_SETS);
  if coalesce(p_segues, 0) < 0 or coalesce(p_segues, 0) > v_pairs then
    raise exception '% segues in a % song show, which has at most % adjacent pairs',
      p_segues, p_songs, v_pairs;
  end if;
  -- A sandwich is A > B > A closed, so it takes two of those pairs.
  if coalesce(p_sandwiches, 0) < 0 or coalesce(p_sandwiches, 0) * 2 > coalesce(p_segues, 0) then
    raise exception '% sandwiches need more segues than the % played',
      p_sandwiches, p_segues;
  end if;
  foreach i in array array[coalesce(p_covers,0), coalesce(p_jamcharts,0),
                           coalesce(p_bustouts,0), coalesce(p_cooldowns,0)] loop
    if i < 0 or i > p_songs then
      raise exception 'a per-song count of % in a % song show', i, p_songs;
    end if;
  end loop;

  -- ---- the breadth cards, valued here ----
  v_cards := coalesce(array(select distinct unnest(coalesce(p_cards, '{}'::text[]))), '{}');
  if exists (select 1 from unnest(v_cards) c where c <> all (CARD_IDS)) then
    raise exception 'unknown breadth card';
  end if;
  for i in 1 .. array_length(CARD_IDS, 1) loop
    if CARD_IDS[i] = any (v_cards) then v_breadth := v_breadth + CARD_POINTS[i]; end if;
  end loop;
  -- The client sends breadth_pts too, and disagreeing with it is a client bug
  -- worth surfacing rather than papering over: the two are computed from the
  -- same list and should never differ.
  if coalesce(p_breadth_pts, -1) <> v_breadth then
    raise exception 'breadth points say % but those cards are worth %',
      p_breadth_pts, v_breadth;
  end if;
  -- A card cannot be claimed by a night that contains nothing to claim it with.
  if 'cover' = any (v_cards) and coalesce(p_covers, 0) = 0 then
    raise exception 'the cover card on a night with no covers';
  end if;
  if 'jamchart' = any (v_cards) and coalesce(p_jamcharts, 0) = 0 then
    raise exception 'the jamchart card on a night with no jamcharts';
  end if;
  if 'bustout' = any (v_cards) and coalesce(p_bustouts, 0) = 0 then
    raise exception 'the bustout card on a night with no bustouts';
  end if;
  -- BREADTH_BIG_JAM is twenty minutes.
  if 'bigjam' = any (v_cards) and coalesce(p_longest_sec, 0) < 1200 then
    raise exception 'the 20-minute jam card on a night whose longest song ran %s',
      p_longest_sec;
  end if;
  -- Six kinds of song need at least six songs to carry them.
  if 'roles' = any (v_cards) and p_songs < 6 then
    raise exception 'every kind of song in a % song night', p_songs;
  end if;

  -- ---- the parts have to be parts of the total ----
  if p_time_pts is null or p_time_pts < 0 or p_time_pts > SEG_MAX_TIME_PTS then
    raise exception 'time points must be 0..%, got %', SEG_MAX_TIME_PTS, p_time_pts;
  end if;
  if p_song_pts is null or p_song_pts < 0 or p_song_pts > SEG_MAX_SONG_PTS then
    raise exception 'song points out of range: %', p_song_pts;
  end if;
  -- The arc bonus is the one part that can go negative, so the floor is not zero.
  if p_flow_pts is null or p_flow_pts < -SEG_MAX_FLOW_PTS or p_flow_pts > SEG_MAX_FLOW_PTS then
    raise exception 'flow points out of range: %', p_flow_pts;
  end if;
  if p_total is null or p_total <> p_song_pts + p_time_pts + p_flow_pts + v_breadth then
    raise exception 'the total (%) is not the sum of its parts (% + % + % + %)',
      p_total, p_song_pts, p_time_pts, p_flow_pts, v_breadth;
  end if;

  -- ---- the ceiling ----
  -- bestPossible() searches the same shows under the same rules, and the line
  -- the player played is walked alongside the beam and never pruned, so it can
  -- never come back below the total. Equal is normal and means a perfect run.
  if p_best_total is not null then
    if p_best_total < p_total then
      raise exception 'a ceiling of % below a score of %', p_best_total, p_total;
    end if;
    if p_best_total > SEG_MAX_SONG_PTS + SEG_MAX_TIME_PTS + SEG_MAX_FLOW_PTS + 162 then
      raise exception 'ceiling out of range: %', p_best_total;
    end if;
    v_pct := round(100.0 * p_total / greatest(1, p_best_total), 2);
  end if;

  -- ---- swallow an accidental double submit ----
  -- A retry after a timeout, or a second tap on Share, should not put the same
  -- show on the board twice. Same picks, same total, inside a minute: return the
  -- row that is already there. This is NOT a rate limiter, it is idempotency.
  select id into v_dupe from segue_runs
   where band = v_band and picks = p_picks and total = p_total
     and created_at > now() - interval '1 minute'
   limit 1;
  if v_dupe is not null then return v_dupe; end if;

  -- The name is read here and never accepted from the client.
  if v_user is not null then
    v_name := segue_display_name(v_user);
  end if;

  insert into segue_runs (
    user_id, display_name, band,
    total, song_pts, time_pts, flow_pts, breadth_pts,
    best_total, pct_of_best,
    songs, segues, sandwiches, covers, jamcharts, bustouts, cooldowns,
    longest_sec, respins, seconds_used,
    cards, cards_got, shows, picks, rng_seed
  ) values (
    v_user, v_name, v_band,
    p_total, p_song_pts, p_time_pts, p_flow_pts, v_breadth,
    p_best_total, v_pct,
    p_songs, coalesce(p_segues,0), coalesce(p_sandwiches,0), coalesce(p_covers,0),
    coalesce(p_jamcharts,0), coalesce(p_bustouts,0), coalesce(p_cooldowns,0),
    coalesce(p_longest_sec,0), coalesce(p_respins,0), coalesce(p_seconds_used,0),
    v_cards, coalesce(array_length(v_cards, 1), 0), p_shows, p_picks, p_rng_seed
  ) returning id into v_id;

  return v_id;
end $$;

revoke all on function segue_submit_run(text,int,int,int,int,int,text[],int,int,int,int,int,int,int,int,int,int,int,text[],text[],text) from public;
grant execute on function segue_submit_run(text,int,int,int,int,int,text[],int,int,int,int,int,int,int,int,int,int,int,text[],text[],text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- segue_claim_run(): the show you drafted before you signed in
-- ---------------------------------------------------------------------------
-- Only ever stamps a row that is still unowned, which is what makes it
-- impossible to take somebody else's. Same guard as ps_claim_run(), and the same
-- reason: the id travels through the browser, so the id alone must not be enough
-- to own a row.
create or replace function segue_claim_run(p_id bigint)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_rows int;
begin
  if v_user is null then return false; end if;
  v_name := segue_display_name(v_user);
  update segue_runs set user_id = v_user, display_name = v_name
   where id = p_id and user_id is null;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke all on function segue_claim_run(bigint) from public;
grant execute on function segue_claim_run(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- segue_rename_runs(): what keeps the denormalised copy honest
-- ---------------------------------------------------------------------------
-- Call it after set_username(). Without it a rename leaves every past show under
-- the old name, which is the one real cost of not joining profiles on every read.
create or replace function segue_rename_runs()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_rows int;
begin
  if v_user is null then return 0; end if;
  v_name := segue_display_name(v_user);
  update segue_runs set display_name = v_name where user_id = v_user;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke all on function segue_rename_runs() from public;
grant execute on function segue_rename_runs() to authenticated;

-- ---------------------------------------------------------------------------
-- segue_sync_attended(): the shows you were at, on every device
-- ---------------------------------------------------------------------------
-- MERGES, never replaces, and that is the whole design. Both sides of this are
-- additions a real person made: a list built on a phone before signing in, and a
-- list built on a laptop after. Treating either as authoritative silently
-- forgets shows somebody was actually at, which is the one thing this feature
-- must not do. Removing a show is therefore its own call, below, rather than
-- something a sync can infer from an absence.
--
-- Returns the merged list for the band, so the client can write it straight back
-- into localStorage and the two agree from that point on.
create or replace function segue_sync_attended(p_band text, p_shows text[])
returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_band text := lower(trim(coalesce(p_band, '')));
  v_out  text[];
begin
  if v_user is null then return null; end if;
  if v_band !~ '^[a-z0-9][a-z0-9_-]{0,31}$' then
    raise exception 'not a band id: %', p_band;
  end if;
  -- A show id is an archive key, so the format is checked and the count is
  -- capped: a merge is not a place to accept an unbounded array.
  if p_shows is not null then
    if cardinality(p_shows) > 5000 then
      raise exception 'too many shows in one sync';
    end if;
    if exists (select 1 from unnest(p_shows) s where s !~ '^[0-9A-Za-z_-]{1,32}$') then
      raise exception 'not a show id';
    end if;
    insert into segue_attended (user_id, band, show_id)
    select v_user, v_band, s from unnest(p_shows) s
    on conflict do nothing;
  end if;
  select coalesce(array_agg(show_id order by show_id), '{}')
    into v_out from segue_attended where user_id = v_user and band = v_band;
  return v_out;
end $$;
revoke all on function segue_sync_attended(text, text[]) from public;
grant execute on function segue_sync_attended(text, text[]) to authenticated;

-- Unmarking is explicit, for the reason the merge above explains.
create or replace function segue_forget_attended(p_band text, p_show text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_rows int;
begin
  if v_user is null then return false; end if;
  delete from segue_attended
   where user_id = v_user and band = lower(trim(p_band)) and show_id = p_show;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke all on function segue_forget_attended(text, text) from public;
grant execute on function segue_forget_attended(text, text) to authenticated;

analyze segue_runs;
analyze segue_attended;
