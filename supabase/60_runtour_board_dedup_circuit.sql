-- ============================================================================
-- 60_runtour_board_dedup_circuit.sql — leaderboard integrity: idempotent season
-- submission (one row per user+career+year), de-duped history, and the date-scoped
-- boards, all in ONE migration so the leaderboard stores + displays cleanly.
-- ============================================================================
-- Problems this fixes (owner: "I don't know how users are playing more than 42
-- seasons ... make sure all data is being stored and displayed properly"):
--
--  1) runtour_submit_season did a plain INSERT with no dedup. The client's durable
--     submission queue (bag_pending_seasons) re-flushes on many triggers (new
--     season, sign-in, app init, online event) with no lock, so the SAME season
--     (user_id, career_id, year) could be inserted MORE THAN ONCE — inflating the
--     career board's count(*) far past a career's real length (a 30-year career
--     showing 117 "seasons"). Fix: a partial UNIQUE index on
--     (user_id, career_id, year) + `on conflict do update` so a re-submit UPDATES
--     the existing row instead of adding a duplicate. Submission is now idempotent.
--
--  2) Existing duplicate rows are collapsed (keep the latest/highest per
--     user+career+year) so already-inflated careers correct themselves immediately.
--
--  3) The date-scoped Today / This week / All-Time boards (p_since) are (re)defined
--     here too — identical to 58_runtour_board_scoped.sql — so applying THIS one
--     migration makes the windows work even if 58 was never applied (that's why
--     "Today" was matching "All-time": pre-58 the client falls back to the all-time
--     board). Also groups the Legend Circuit's own posted seasons into the SAME
--     career (the client now posts circuit seasons under the tour career_id).
--
-- Requires the columns added by earlier migrations (skills, followers, look,
-- rep_pts, is_guest) — all already live (podium golfers, Fans sort, archetype all
-- render). Idempotent. Apply in the Supabase SQL editor.
-- ----------------------------------------------------------------------------

-- ---- 1) collapse existing duplicates: keep one row per (user_id, career_id, year) ----
-- Only for real career rows (a non-empty career_id and a signed-in user); guest rows
-- (null user_id) and legacy empty-career_id rows are left as-is. Keeps the newest
-- (highest id) row for each group — that's the most recent, authoritative submission.
do $$ begin
  if to_regclass('public.runtour_scores') is not null then
    delete from public.runtour_scores s
    using public.runtour_scores keep
    where s.user_id is not null
      and coalesce(s.career_id,'') <> ''
      and keep.user_id = s.user_id
      and keep.career_id = s.career_id
      and keep.year = s.year
      and keep.id > s.id;   -- delete every row that has a newer sibling in the same group
  end if;
end $$;

-- ---- 2) partial unique index so future submits can upsert (idempotent per season) ----
create unique index if not exists runtour_scores_career_year_uidx
  on public.runtour_scores (user_id, career_id, year)
  where user_id is not null and career_id <> '';

-- ---- 3) signed-in submit: UPSERT (no OVR cap, keep 51's behavior) ----
-- Drop EVERY prior overload first so a single 12-arg function remains — otherwise a
-- named-arg call (the client always uses named args) is ambiguous between this and the
-- older 9-arg (22) / 10-arg (51) signatures, both of which accept the same named args
-- via their trailing defaults. One function → every named-arg call resolves cleanly.
drop function if exists public.runtour_submit_season(text,int,int,bigint,bigint,int,int,jsonb,text);
drop function if exists public.runtour_submit_season(text,int,int,bigint,bigint,int,int,jsonb,text,int);
drop function if exists public.runtour_submit_season(text,int,int,bigint,bigint,int,int,jsonb,text,int,bigint,jsonb);
create or replace function public.runtour_submit_season(
  p_golfer    text,
  p_ovr       int,
  p_year      int,
  p_earnings  bigint,
  p_net       bigint,
  p_wins      int   default 0,
  p_majors    int   default 0,
  p_skills    jsonb default null,
  p_career_id text  default null,
  p_rep_pts   int   default 0,
  p_followers bigint default 0,
  p_look      jsonb default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid   := auth.uid();
  v_name text;
  v_ovr  int    := greatest(40, least(99, coalesce(p_ovr, 80)));
  v_year int    := greatest(1, least(99, coalesce(p_year, 1)));
  v_earn bigint := greatest(0, coalesce(p_earnings, 0));   -- no OVR cap (owner)
  v_net  bigint := coalesce(p_net, 0);
  v_rep  int    := greatest(0, least(1000000, coalesce(p_rep_pts, 0)));
  v_fol  bigint := greatest(0, least(2000000000, coalesce(p_followers, 0)));
  v_cid  text   := left(coalesce(p_career_id,''),40);
  v_gname text  := coalesce(nullif(left(regexp_replace(coalesce(p_golfer,''), '[<>&]', '', 'g'), 24), ''), 'Your Golfer');
  v_id   bigint;
begin
  if v_uid is null then raise exception 'sign in to post a score'; end if;
  select username into v_name from profiles where id = v_uid;
  if v_name is null or length(trim(v_name)) = 0 then
    raise exception 'set a username on RunThe.GG first';
  end if;
  if v_cid <> '' then
    -- real career season → idempotent upsert (a re-submit updates the row, never duplicates)
    insert into public.runtour_scores(
      user_id, display_name, golfer_name, career_id, ovr, year,
      season_earnings, season_net, wins, majors, skills, rep_pts, followers, look)
    values (
      v_uid, v_name, v_gname, v_cid, v_ovr, v_year,
      v_earn, v_net, greatest(0, coalesce(p_wins,0)), greatest(0, coalesce(p_majors,0)),
      p_skills, v_rep, v_fol, p_look)
    on conflict (user_id, career_id, year) where user_id is not null and career_id <> '' do update set
      display_name = excluded.display_name,
      golfer_name  = excluded.golfer_name,
      ovr          = excluded.ovr,
      season_earnings = excluded.season_earnings,
      season_net   = excluded.season_net,
      wins         = excluded.wins,
      majors       = excluded.majors,
      skills       = coalesce(excluded.skills, runtour_scores.skills),
      rep_pts      = greatest(runtour_scores.rep_pts, excluded.rep_pts),
      followers    = greatest(runtour_scores.followers, excluded.followers),
      look         = coalesce(excluded.look, runtour_scores.look)
    returning id into v_id;
  else
    -- legacy / no career_id → plain insert (each its own entry, as before)
    insert into public.runtour_scores(
      user_id, display_name, golfer_name, career_id, ovr, year,
      season_earnings, season_net, wins, majors, skills, rep_pts, followers, look)
    values (
      v_uid, v_name, v_gname, '', v_ovr, v_year,
      v_earn, v_net, greatest(0, coalesce(p_wins,0)), greatest(0, coalesce(p_majors,0)),
      p_skills, v_rep, v_fol, p_look)
    returning id into v_id;
  end if;
  return v_id;
end; $$;

grant execute on function public.runtour_submit_season(text,int,int,bigint,bigint,int,int,jsonb,text,int,bigint,jsonb) to authenticated;

-- ---- 4) guest submit: plain insert (guests are anonymous, each season its own row) ----
-- Same single-overload approach: drop the old 8-arg (37) so a named-arg call resolves cleanly.
drop function if exists public.runtour_submit_season_guest(int,int,bigint,bigint,int,int,jsonb,text);
drop function if exists public.runtour_submit_season_guest(int,int,bigint,bigint,int,int,jsonb,text,bigint,jsonb);
do $$ begin
  if to_regclass('public.runtour_scores') is not null then
    create or replace function public.runtour_submit_season_guest(
      p_ovr int, p_year int, p_earnings bigint, p_net bigint,
      p_wins int default 0, p_majors int default 0, p_skills jsonb default null,
      p_career_id text default null, p_followers bigint default 0, p_look jsonb default null
    ) returns bigint language plpgsql security definer set search_path = public as $f$
    declare
      v_ovr int := greatest(40, least(99, coalesce(p_ovr, 80)));
      v_year int := greatest(1, least(99, coalesce(p_year, 1)));
      v_earn bigint := greatest(0, coalesce(p_earnings, 0));
      v_net bigint := coalesce(p_net, 0);
      v_fol bigint := greatest(0, least(2000000000, coalesce(p_followers, 0)));
      v_id bigint;
    begin
      insert into public.runtour_scores(
        user_id, display_name, golfer_name, career_id, ovr, year,
        season_earnings, season_net, wins, majors, skills, rep_pts, followers, look, is_guest)
      values (
        null, 'Anonymous', 'Guest Player', left(coalesce(p_career_id,''),40), v_ovr, v_year,
        v_earn, v_net, greatest(0, coalesce(p_wins,0)), greatest(0, coalesce(p_majors,0)),
        p_skills, 0, v_fol, p_look, true)
      returning id into v_id;
      return v_id;
    end; $f$;
    grant execute on function public.runtour_submit_season_guest(int,int,bigint,bigint,int,int,jsonb,text,bigint,jsonb) to anon, authenticated;
  end if;
end $$;

-- ---- 5) date-scoped boards (identical to 58; included so ONE migration fixes windows) ----
drop function if exists public.runtour_season_board(int,text,text);
drop function if exists public.runtour_career_board(int,text,text);
drop function if exists public.runtour_season_board(int,text,text,timestamptz);
drop function if exists public.runtour_career_board(int,text,text,timestamptz);

create or replace function public.runtour_season_board(
    p_limit int default 100, p_sort text default 'earnings', p_dir text default 'desc',
    p_since timestamptz default null)
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              ovr int, year int, season_earnings bigint, season_net bigint, wins int, majors int,
              rep_pts int, skills jsonb, followers bigint, look jsonb)
language sql stable security definer set search_path = public as $$
  with ranked as (
    select s.*,
      (case lower(coalesce(p_sort,'earnings'))
         when 'net'     then s.season_net::numeric
         when 'wins'    then s.wins::numeric
         when 'majors'  then s.majors::numeric
         when 'ovr'     then s.ovr::numeric
         when 'rep'     then s.rep_pts::numeric
         when 'fans'    then s.followers::numeric
         else                s.season_earnings::numeric
       end) as sortk
    from runtour_scores s
    where (p_since is null or s.created_at >= p_since)
  ), numbered as (
    select (row_number() over (order by sortk desc, season_earnings desc, id))::int as rank,
           user_id, display_name, golfer_name, ovr, year, season_earnings, season_net, wins, majors, rep_pts, skills, followers, look
    from ranked
  )
  select rank, user_id, display_name, golfer_name, ovr, year, season_earnings, season_net, wins, majors, rep_pts, skills, followers, look
  from numbered
  order by (case when lower(coalesce(p_dir,'desc'))='asc' then -rank else rank end)
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;

create or replace function public.runtour_career_board(
    p_limit int default 100, p_sort text default 'earnings', p_dir text default 'desc',
    p_since timestamptz default null)
returns table(rank int, user_id uuid, display_name text, golfer_name text, seasons int,
              career_earnings bigint, career_net bigint, wins int, majors int, rep_pts int, skills jsonb, followers bigint, look jsonb)
language sql stable security definer set search_path = public as $$
  with per_career as (
    select s.user_id,
           coalesce(s.career_id, 'legacy:'||s.id::text)      as cid,
           max(s.display_name)                               as display_name,
           (array_agg(s.golfer_name order by s.year desc))[1] as golfer_name,
           (array_agg(s.skills order by s.year desc))[1]      as skills,
           (array_agg(s.look order by s.year desc))[1]        as look,
           count(*)::int                                     as seasons,
           sum(s.season_earnings)::bigint                    as career_earnings,
           sum(s.season_net)::bigint                         as career_net,
           sum(s.wins)::int                                  as wins,
           sum(s.majors)::int                                as majors,
           max(s.followers)::bigint                          as followers
    from runtour_scores s
    where (p_since is null or s.created_at >= p_since)
    group by s.user_id, coalesce(s.career_id, 'legacy:'||s.id::text)
  ), urep as ( select user_id, max(rep_pts) as rep_pts from runtour_scores group by user_id ),
  joined as (
    select pc.*, coalesce(u.rep_pts,0) as rep_pts,
      (case lower(coalesce(p_sort,'earnings'))
         when 'net'     then pc.career_net::numeric
         when 'wins'    then pc.wins::numeric
         when 'majors'  then pc.majors::numeric
         when 'seasons' then pc.seasons::numeric
         when 'rep'     then coalesce(u.rep_pts,0)::numeric
         when 'fans'    then pc.followers::numeric
         else                pc.career_earnings::numeric
       end) as sortk
    from per_career pc left join urep u on u.user_id = pc.user_id
  ), numbered as (
    select (row_number() over (order by sortk desc, career_earnings desc))::int as rank,
           user_id, display_name, golfer_name, seasons, career_earnings, career_net, wins, majors, rep_pts, skills, followers, look
    from joined
  )
  select rank, user_id, display_name, golfer_name, seasons, career_earnings, career_net, wins, majors, rep_pts, skills, followers, look
  from numbered
  order by (case when lower(coalesce(p_dir,'desc'))='asc' then -rank else rank end)
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;

grant execute on function public.runtour_season_board(int,text,text,timestamptz) to anon, authenticated;
grant execute on function public.runtour_career_board(int,text,text,timestamptz) to anon, authenticated;
