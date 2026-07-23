-- ============================================================================
-- 65_runtour_live_profile_look.sql — LIVE profile golfer on the leaderboards
-- ============================================================================
-- Owner: "profile pictures should update anytime somebody updates their
-- character, but the top 3 full body characters should show what that career
-- golfer was wearing in that career."
--
-- The per-row `look` (52/53) is frozen at submit time - correct for the podium
-- figures, but the small row avatars should track the player's CURRENT golfer.
-- The cloud-save blob does hold the current look, but it's a huge jsonb (the
-- whole profile bundle) - joining it per board row would re-create the exact
-- TOAST-read problem 61 fixed. So: a dedicated LIGHTWEIGHT table holding just
-- the render-relevant look (~200 bytes), upserted by the client whenever the
-- player changes their golfer (and on sign-in), and joined by the boards for
-- the returned top-N rows only.
--
-- The boards gain a `cur_look` column APPENDED to the return shape (drop +
-- recreate is required for a return-type change; deployed clients read fields
-- by name, so the extra column is harmless until the new client uses it).
-- Season body = 62 (circuit exclusion + fans gain), career body = 64 (fans
-- non-zero having). Safe + idempotent. Run AFTER 62 and 64.
-- ============================================================================

create table if not exists public.runtour_profile_look (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  look       jsonb,
  updated_at timestamptz not null default now()
);
alter table public.runtour_profile_look enable row level security;

-- ---- the client posts its current golfer here on every closet change + sign-in ----
create or replace function public.runtour_set_look(p_look jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or p_look is null then return; end if;
  if pg_column_size(p_look) > 8192 then return; end if;   -- a real look is ~200 bytes; reject junk
  insert into public.runtour_profile_look(user_id, look, updated_at)
    values (v_uid, p_look, now())
  on conflict (user_id) do update set look = excluded.look, updated_at = now();
end; $$;
grant execute on function public.runtour_set_look(jsonb) to authenticated;

-- ============================================================================
-- SEASON BOARD (62's body) + cur_look for the returned N rows
-- ============================================================================
drop function if exists public.runtour_season_board(int,text,text,timestamptz);
create function public.runtour_season_board(
    p_limit int default 100, p_sort text default 'earnings', p_dir text default 'desc',
    p_since timestamptz default null)
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              ovr int, year int, season_earnings bigint, season_net bigint, wins int, majors int,
              rep_pts int, skills jsonb, followers bigint, look jsonb, cur_look jsonb)
language sql stable security definer set search_path = public as $$
  with gains as (          -- per-season fan GAIN, derived from the running totals (scalar cols only)
    select s.id, s.user_id, s.display_name, s.golfer_name, s.ovr, s.year,
           s.season_earnings, s.season_net, s.wins, s.majors, s.rep_pts, s.created_at,
           greatest(0::bigint,
             coalesce(s.followers,0)
             - coalesce(lag(s.followers) over (partition by s.user_id, s.career_id
                                               order by coalesce(s.year,1), s.id), 0)
           ) as fol_gain
    from runtour_scores s
    where coalesce(s.year, 1) <= 30      -- tour seasons only; Legend Circuit years (31+) stay off THIS board
  ), ranked as (
    select g.*,
      (case lower(coalesce(p_sort,'earnings'))
         when 'net'     then g.season_net::numeric
         when 'wins'    then g.wins::numeric
         when 'majors'  then g.majors::numeric
         when 'ovr'     then g.ovr::numeric
         when 'rep'     then g.rep_pts::numeric
         when 'fans'    then g.fol_gain::numeric
         else                g.season_earnings::numeric
       end) as sortk
    from gains g
    where (p_since is null or g.created_at >= p_since)
  ), numbered as (
    select (row_number() over (order by sortk desc, season_earnings desc, id))::int as rank, ranked.*
    from ranked
  ), top as (        -- pick the N rows (scalar only) BEFORE touching any jsonb.
    select * from numbered   -- desc -> top-N; asc -> bottom-N (true worst, CS95)
    order by (case when lower(coalesce(p_dir,'desc'))='asc' then -rank else rank end)
    limit greatest(1, least(500, coalesce(p_limit, 100)))
  )
  select t.rank, t.user_id, t.display_name, t.golfer_name, t.ovr, t.year,
         t.season_earnings, t.season_net, t.wins, t.majors, t.rep_pts,
         sc.skills, t.fol_gain as followers, sc.look, pl.look as cur_look
  from top t
  join runtour_scores sc on sc.id = t.id      -- jsonb fetched for the N rows only
  left join runtour_profile_look pl on pl.user_id = t.user_id
  order by (case when lower(coalesce(p_dir,'desc'))='asc' then -t.rank else t.rank end);
$$;

-- ============================================================================
-- CAREER BOARD (64's body: fans category hides 0-fan legacy careers) + cur_look
-- ============================================================================
drop function if exists public.runtour_career_board(int,text,text,timestamptz);
create function public.runtour_career_board(
    p_limit int default 100, p_sort text default 'earnings', p_dir text default 'desc',
    p_since timestamptz default null)
returns table(rank int, user_id uuid, display_name text, golfer_name text, seasons int,
              career_earnings bigint, career_net bigint, wins int, majors int, rep_pts int, skills jsonb, followers bigint, look jsonb, cur_look jsonb)
language sql stable security definer set search_path = public as $$
  with per_career as (    -- scalar aggregates only (no jsonb array_agg over the whole table)
    select s.user_id,
           coalesce(s.career_id, 'legacy:'||s.id::text)   as cid,
           max(s.display_name)                            as display_name,
           count(*)::int                                  as seasons,
           sum(s.season_earnings)::bigint                 as career_earnings,
           sum(s.season_net)::bigint                      as career_net,
           sum(s.wins)::int                               as wins,
           sum(s.majors)::int                             as majors,
           max(s.followers)::bigint                       as followers
    from runtour_scores s
    where (p_since is null or s.created_at >= p_since)
    group by s.user_id, coalesce(s.career_id, 'legacy:'||s.id::text)
    -- 64: pre-fans legacy careers (0/null followers) stay off the FANS category only
    having (lower(coalesce(p_sort,'')) <> 'fans' or max(coalesce(s.followers,0)) > 0)
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
    select (row_number() over (order by sortk desc, career_earnings desc))::int as rank, joined.*
    from joined
  ), top as (        -- pick the N careers (scalar only) BEFORE touching any jsonb.
    select * from numbered   -- desc -> top-N; asc -> bottom-N (true worst, CS95)
    order by (case when lower(coalesce(p_dir,'desc'))='asc' then -rank else rank end)
    limit greatest(1, least(500, coalesce(p_limit, 100)))
  )
  select t.rank, t.user_id, t.display_name, lat.golfer_name, t.seasons,
         t.career_earnings, t.career_net, t.wins, t.majors, t.rep_pts,
         lat.skills, t.followers, lat.look, pl.look as cur_look
  from top t
  cross join lateral (            -- latest season of THIS career WITHIN the window, N rows only
    select s2.golfer_name, s2.skills, s2.look
    from runtour_scores s2
    where s2.user_id is not distinct from t.user_id
      and coalesce(s2.career_id, 'legacy:'||s2.id::text) = t.cid
      and (p_since is null or s2.created_at >= p_since)
    order by s2.year desc, s2.id desc
    limit 1
  ) lat
  left join runtour_profile_look pl on pl.user_id = t.user_id
  order by (case when lower(coalesce(p_dir,'desc'))='asc' then -t.rank else t.rank end);
$$;

grant execute on function public.runtour_season_board(int,text,text,timestamptz) to anon, authenticated;
grant execute on function public.runtour_career_board(int,text,text,timestamptz) to anon, authenticated;
