-- Run The Pitch: the Club Season's board. Run once in the Supabase SQL editor.
-- Idempotent: safe to re-run. Order: after 189_soccer_daily_guest.sql (the guest
-- name) and 02 (wc_players).
--
-- WHAT
-- The club side plays a ten club league season (the owner's call, 2026-11-26).
-- This is where a finished season is kept and ranked: season points (27 is a
-- perfect league), then goal difference, then The Club Cup, then goals scored.
-- Every finished season is a row, as every finished draft is on the World Cup
-- side. Accounts and guests share the one table and the one board.
--
-- WHO WRITES
--   an account  submit_club_season(...), as itself (auth.uid()).
--   a guest     functions/api/pitch-guest.js (action "season"), with the service
--               role, to soccer_season_guest_submit(...). No anonymous sign-in
--               (QA's audit, see 185 and 189). The guest's id is an HMAC of a
--               device id, the IP is only ever keyed, and the row is filed under
--               the guest's generated name (189's soccer_guest_name).
--   a claim     soccer_season_guest_claim(account, guest): when that device signs
--               in, its seasons become the account's, under the account's name.
--
-- WHAT THE SERVER CHECKS, AND WHAT IT CANNOT
-- A season is simulated in the page, so its result is the page's word, exactly as
-- a draft's "progress" is on the World Cup boards. The server holds it to what a
-- season can be: nine matches, points that follow from the results, goals that
-- follow from the goal difference, a cup only for the top four, a final only
-- after a semi-final won. The squad is 11 or 6 distinct players, each a World Cup
-- player (wc_players) or a club pool man (a Wikidata id, "Q" and digits): the
-- pool is a file the browser reads and has no table here. The squad rating shown
-- on the board is the page's, clamped. The board does not rank by it.
--
-- WHAT IT DOES NOT DO
-- No streak, badge, stat or profile is touched, for an account or a guest. Guests
-- enter no contest (186 guards those tables; nothing here writes them). No jsonb
-- column, and one insert per finished season (an event, not a save).

-- ---------- 1) the table -----------------------------------------------------------
create table if not exists public.soccer_club_seasons (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete cascade,   -- an account's season
  guest       uuid,                                              -- or a guest's: HMAC(server secret, device id). No foreign key.
  name        text,
  flag        text,
  draft_type  text not null default 'full',     -- 'full' (11) or 'quick' (6)
  mode        text not null default 'easy',     -- 'easy' or 'hard'
  points      int  not null,                    -- 0 to 27
  won         int  not null,
  drawn       int  not null,
  lost        int  not null,
  gf          int  not null,
  ga          int  not null,
  position    int  not null,                    -- 1 to 10
  cup         text not null default 'none',     -- 'winner', 'finalist', 'semi' or 'none'
  cup_rank    int  generated always as (case cup when 'winner' then 3 when 'finalist' then 2 when 'semi' then 1 else 0 end) stored,
  gd          int  generated always as (gf - ga) stored,
  overall     numeric(5,1),                     -- the squad rating the page showed. Shown, never ranked by.
  signings    int  not null default 0,
  player_ids  text[],
  slots       text[],
  created_at  timestamptz not null default now(),
  constraint soccer_club_seasons_owner check ((user_id is not null) <> (guest is not null))
);
-- A season the owner has taken off the board (a made-up result, say). One update hides it:
--   update soccer_club_seasons set hidden = true where id = <the row's id>;
-- The board and the rank leave hidden rows out. Added by alter so a re-run over an older copy
-- of this script gains it too.
alter table public.soccer_club_seasons add column if not exists hidden boolean not null default false;
-- The board's order, per draft size: points, goal difference, the cup, goals, then the earlier season.
create index if not exists soccer_club_seasons_board_idx
  on public.soccer_club_seasons (draft_type, points desc, gd desc, cup_rank desc, gf desc, created_at asc);
create index if not exists soccer_club_seasons_user_idx  on public.soccer_club_seasons (user_id) where user_id is not null;
create index if not exists soccer_club_seasons_guest_idx on public.soccer_club_seasons (guest)   where guest   is not null;
create index if not exists soccer_club_seasons_time_idx  on public.soccer_club_seasons (created_at);
alter table public.soccer_club_seasons enable row level security;
revoke all on public.soccer_club_seasons from public, anon, authenticated;

-- new guest rows per IP key per day
create table if not exists public.soccer_season_guest_posts (
  ip_key text    not null,                      -- HMAC of the caller's IP. The raw IP is never stored.
  day    date    not null,
  n      integer not null default 0,
  primary key (ip_key, day)
);
alter table public.soccer_season_guest_posts enable row level security;
revoke all on public.soccer_season_guest_posts from public, anon, authenticated;

-- ---------- 2) what a season can be ------------------------------------------------
-- Raises on a result no season can produce. Returns the squad size it accepted.
create or replace function public._soccer_season_check(
  p_draft_type text, p_mode text, p_won int, p_drawn int, p_lost int, p_gf int, p_ga int,
  p_position int, p_cup text, p_player_ids text[]
) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  n_ids      int := coalesce(cardinality(p_player_ids), 0);
  n_distinct int := coalesce(cardinality(array(select distinct unnest(p_player_ids))), 0);
  n_known    int;
begin
  if p_draft_type not in ('full', 'quick') then raise exception 'bad draft type'; end if;
  if p_mode not in ('easy', 'hard') then raise exception 'bad mode'; end if;
  if p_won is null or p_drawn is null or p_lost is null or p_won < 0 or p_drawn < 0 or p_lost < 0
     or p_won + p_drawn + p_lost <> 9 then raise exception 'a season is nine matches'; end if;
  if p_gf is null or p_ga is null or p_gf < 0 or p_ga < 0 or p_gf > 63 or p_ga > 63 then raise exception 'bad goals'; end if;
  -- a win is at least a goal scored, a defeat at least a goal conceded
  if p_gf < p_won or p_ga < p_lost then raise exception 'goals do not fit the results'; end if;
  if p_position is null or p_position < 1 or p_position > 10 then raise exception 'bad position'; end if;
  if p_cup not in ('winner', 'finalist', 'semi', 'none') then raise exception 'bad cup'; end if;
  -- The Club Cup is the top four's, and only theirs
  if (p_cup <> 'none') <> (p_position <= 4) then raise exception 'the cup is for the top four'; end if;
  -- nine wins is first and nine defeats is last, whatever the page says
  if (p_won = 9 and p_position <> 1) or (p_lost = 9 and p_position <> 10) then raise exception 'position does not fit the results'; end if;
  if n_ids <> (case when p_draft_type = 'full' then 11 else 6 end) then raise exception 'wrong squad size: %', n_ids; end if;
  if n_ids <> n_distinct then raise exception 'duplicate players not allowed'; end if;
  -- each a World Cup player, or a club pool man (a Wikidata id)
  select count(*) into n_known from unnest(p_player_ids) pid
   where pid ~ '^Q[0-9]{1,12}$' or exists (select 1 from wc_players w where w.player_id = pid);
  if n_known <> n_ids then raise exception 'unknown player id(s): % of % known', n_known, n_ids; end if;
  return n_ids;
end $$;

revoke all on function public._soccer_season_check(text, text, int, int, int, int, int, int, text, text[]) from public, anon, authenticated;

-- ---------- 3) an account's season -------------------------------------------------
create or replace function public.submit_club_season(
  p_draft_type text, p_mode text, p_won int, p_drawn int, p_lost int, p_gf int, p_ga int,
  p_position int, p_cup text, p_overall numeric, p_signings int, p_player_ids text[], p_slots text[] default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_n    int;
  v_name text;
  v_flag text;
  v_id   bigint;
begin
  if v_user is null then raise exception 'must be signed in'; end if;
  v_n := public._soccer_season_check(p_draft_type, p_mode, p_won, p_drawn, p_lost, p_gf, p_ga, p_position, p_cup, p_player_ids);
  -- one finished season at a time: a second row inside 60 seconds is a double post, not a season
  if exists (select 1 from soccer_club_seasons where user_id = v_user and created_at > now() - interval '60 seconds') then
    raise exception 'too soon';
  end if;
  select username::text, nullif(flag, '') into v_name, v_flag from profiles where id = v_user;
  insert into soccer_club_seasons (user_id, name, flag, draft_type, mode, points, won, drawn, lost, gf, ga, position, cup,
                                   overall, signings, player_ids, slots)
  values (v_user, v_name, v_flag, p_draft_type, p_mode, p_won * 3 + p_drawn, p_won, p_drawn, p_lost, p_gf, p_ga, p_position, p_cup,
          greatest(40, least(110, round(coalesce(p_overall, 40), 1))), greatest(0, least(2, coalesce(p_signings, 0))),
          p_player_ids, case when coalesce(cardinality(p_slots), 0) = v_n then p_slots else null end)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.submit_club_season(text, text, int, int, int, int, int, int, text, numeric, int, text[], text[]) from public, anon;
grant execute on function public.submit_club_season(text, text, int, int, int, int, int, int, text, numeric, int, text[], text[]) to authenticated;

-- ---------- 4) a guest's season (the Function's service role only) ------------------
create or replace function public.soccer_season_guest_submit(
  p_guest uuid, p_ip_key text,
  p_draft_type text, p_mode text, p_won int, p_drawn int, p_lost int, p_gf int, p_ga int,
  p_position int, p_cup text, p_overall numeric, p_signings int, p_player_ids text[], p_slots text[] default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_n     int;
  v_cnt   integer;
  v_name  text;
  v_salt  int := 0;
  v_id    bigint;
begin
  if p_guest is null then raise exception 'no guest'; end if;
  if p_ip_key is null or length(p_ip_key) < 16 then raise exception 'no ip key'; end if;
  -- a guest id is never an account's
  if exists (select 1 from auth.users where id = p_guest) then raise exception 'not a guest'; end if;
  v_n := public._soccer_season_check(p_draft_type, p_mode, p_won, p_drawn, p_lost, p_gf, p_ga, p_position, p_cup, p_player_ids);
  if exists (select 1 from soccer_club_seasons where guest = p_guest and created_at > now() - interval '60 seconds') then
    raise exception 'too soon';
  end if;

  -- At most 20 guest seasons a day from one IP key (a season takes about four minutes).
  insert into soccer_season_guest_posts (ip_key, day, n) values (p_ip_key, v_today, 1)
    on conflict (ip_key, day) do update set n = soccer_season_guest_posts.n + 1
    returning n into v_cnt;
  if v_cnt > 20 then raise exception 'guest limit'; end if;
  delete from soccer_season_guest_posts where day < v_today - 2;
  -- Guests never sign in, so unclaimed seasons past 60 days are pruned as new ones arrive.
  delete from soccer_club_seasons where guest is not null and created_at < now() - interval '60 days';

  -- one device, one name: the name its Daily or an earlier season was filed under, else a fresh
  -- one that no account holds
  select name into v_name from soccer_daily_guest where guest = p_guest order by date desc limit 1;
  if v_name is null then
    select name into v_name from soccer_club_seasons where guest = p_guest order by created_at desc limit 1;
  end if;
  if v_name is null then
    loop
      v_name := public.soccer_guest_name(p_guest, v_salt);
      exit when v_salt >= 20 or not exists (select 1 from profiles where lower(username::text) = lower(v_name));
      v_salt := v_salt + 1;
    end loop;
  end if;

  insert into soccer_club_seasons (guest, name, draft_type, mode, points, won, drawn, lost, gf, ga, position, cup,
                                   overall, signings, player_ids, slots)
  values (p_guest, v_name, p_draft_type, p_mode, p_won * 3 + p_drawn, p_won, p_drawn, p_lost, p_gf, p_ga, p_position, p_cup,
          greatest(40, least(110, round(coalesce(p_overall, 40), 1))), greatest(0, least(2, coalesce(p_signings, 0))),
          p_player_ids, case when coalesce(cardinality(p_slots), 0) = v_n then p_slots else null end)
  returning id into v_id;
  return json_build_object('id', v_id, 'name', v_name);
end $$;

revoke all on function public.soccer_season_guest_submit(uuid, text, text, text, int, int, int, int, int, int, text, numeric, int, text[], text[]) from public, anon, authenticated;
grant execute on function public.soccer_season_guest_submit(uuid, text, text, text, int, int, int, int, int, int, text, numeric, int, text[], text[]) to service_role;

-- ---------- 5) a guest's seasons follow the device onto an account ------------------
create or replace function public.soccer_season_guest_claim(p_account uuid, p_guest uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_name  text;
  v_flag  text;
  v_moved integer := 0;
begin
  if p_account is null or p_guest is null or p_account = p_guest then return json_build_object('moved', 0); end if;
  if not exists (select 1 from auth.users where id = p_account) then raise exception 'no account'; end if;
  if exists (select 1 from auth.users where id = p_guest) then return json_build_object('moved', 0); end if;
  select username::text, nullif(flag, '') into v_name, v_flag from profiles where id = p_account;
  -- every season moves: a season is not "one a day", so there is nothing of the account's to keep instead
  update soccer_club_seasons
     set user_id = p_account, guest = null, name = v_name, flag = v_flag
   where guest = p_guest;
  get diagnostics v_moved = row_count;
  return json_build_object('moved', v_moved);
end $$;

revoke all on function public.soccer_season_guest_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.soccer_season_guest_claim(uuid, uuid) to service_role;

-- ---------- 6) the board ------------------------------------------------------------
-- What the page reads: board columns only. No user id, no guest id, no hidden rows. It runs
-- as its owner on purpose (Supabase's advisor will flag a "security definer view"): it is the
-- only window onto the table, which has no policy of its own.
--
-- READ ONLY, AND THAT TAKES A REVOKE. A view over one table is auto-updatable, this one runs as
-- its owner (so the table's row level security does not apply), and Supabase's default
-- privileges hand anon and authenticated ALL on every new view in public. Without the revoke
-- below, anyone could update or delete the board through the view (QA's review, 2026-11-26).
create or replace view public.club_season_board as
  select s.id, s.name, s.flag, (s.guest is not null) as guest, s.draft_type, s.mode,
         s.points, s.won, s.drawn, s.lost, s.gf, s.ga, s.gd, s.position, s.cup, s.cup_rank,
         s.overall, s.signings, s.player_ids, s.slots, s.created_at
    from public.soccer_club_seasons s
   where not s.hidden;

revoke all on public.club_season_board from public, anon, authenticated;
grant select on public.club_season_board to anon, authenticated;

-- A season's rank on its board, and the board's size, in one call (two index counts).
-- p_since null is all time. The order is the board's: points, goal difference, the cup, goals.
create or replace function public.club_season_rank(
  p_draft_type text, p_points int, p_gd int, p_cup text, p_gf int, p_since timestamptz default null
) returns json
language sql stable security definer set search_path = public as $$
  with me as (select case p_cup when 'winner' then 3 when 'finalist' then 2 when 'semi' then 1 else 0 end as cr)
  select json_build_object(
    'rank', 1 + (select count(*) from soccer_club_seasons s, me
                  where s.draft_type = p_draft_type and not s.hidden and (p_since is null or s.created_at >= p_since)
                    and (s.points > p_points
                      or (s.points = p_points and s.gd > p_gd)
                      or (s.points = p_points and s.gd = p_gd and s.cup_rank > me.cr)
                      or (s.points = p_points and s.gd = p_gd and s.cup_rank = me.cr and s.gf > p_gf))),
    'total', (select count(*) from soccer_club_seasons s
               where s.draft_type = p_draft_type and not s.hidden and (p_since is null or s.created_at >= p_since)));
$$;

revoke all on function public.club_season_rank(text, int, int, text, int, timestamptz) from public;
grant execute on function public.club_season_rank(text, int, int, text, int, timestamptz) to anon, authenticated;

notify pgrst, 'reload schema';
