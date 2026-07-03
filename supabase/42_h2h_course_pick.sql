-- ============================================================================
-- 42_h2h_course_pick.sql — let a PRIVATE room's creator pick the course
-- ============================================================================
-- The course + conditions are a pure function of the match `seed` (derived identically
-- on every client: course = DAILY_KEYS[seed % N]). To let a friend-match host pick the
-- course, h2h_create now accepts an optional client-supplied `p_seed`: the client picks
-- a seed whose (seed % N) maps to the chosen course, and we store it.
--
-- Scoped to PRIVATE rooms only (p_public = false): Quick-Match / public lobbies stay
-- server-random so nobody can farm a favorable course on the public boards. If p_seed is
-- null or out of range, we fall back to the random server seed (so old clients + the
-- "Random course" option keep working unchanged).
--
-- Replaces the 3-arg h2h_create with a 4-arg version (the old one is dropped so there's no
-- overload ambiguity). PostgREST still accepts calls that omit p_seed (it has a default).
-- Idempotent. Apply in the Supabase SQL editor after 41_h2h_phase1.sql.
-- ----------------------------------------------------------------------------

drop function if exists public.h2h_create(text, int, boolean);

create or replace function public.h2h_create(
  p_mode text, p_holes int, p_public boolean default false, p_seed bigint default null)
returns table(match_id bigint, join_code text)
language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_name text; v_cap int; v_id bigint; v_code text; v_seed bigint;
begin
  if v_uid is null then raise exception 'sign in to play online'; end if;
  v_name := public._h2h_username(v_uid);
  if v_name is null or length(trim(v_name))=0 then raise exception 'set a username on RunThe.GG first'; end if;
  if p_mode not in ('1v1','bestball','scramble','ffa') then raise exception 'bad mode'; end if;
  if p_holes not in (9,18) then raise exception 'bad hole count'; end if;
  v_cap := case when p_mode='1v1' then 2 else 4 end;
  -- only a private room may pin the course; validate the client seed is in range
  if coalesce(p_public,false) = false and p_seed is not null and p_seed >= 0 and p_seed <= 2147483646 then
    v_seed := p_seed;
  else
    v_seed := public._h2h_seed();
  end if;
  v_code := public._h2h_code();
  insert into public.h2h_matches(mode,holes,seed,join_code,is_public,capacity,created_by)
    values (p_mode,p_holes,v_seed,v_code,coalesce(p_public,false),v_cap,v_uid)
    returning id into v_id;
  insert into public.h2h_players(match_id,user_id,username,slot,wheel_seed)
    values (v_id,v_uid,v_name,0,public._h2h_seed());
  return query select v_id, v_code;
end $$;

grant execute on function public.h2h_create(text,int,boolean,bigint) to authenticated;
