-- 69_runtour_daily_holes.sql
-- PLAYER CARDS (owner): the back of a player's DAILY card shows their hole-by-hole SCORECARD.
-- Your own card reads the scorecard from local storage immediately; for OTHER players tapped on a
-- daily/Play 18/Course Records board, the board must carry the round. This adds a compact `holes`
-- jsonb ([{par,toPar}, ...], ~18 tiny objects) to runtour_daily_scores, threads an optional
-- p_holes through runtour_submit_daily, and returns `holes` from runtour_daily_board.
--
-- Cheap: the daily board is day-scoped (<=200 rows), so the extra jsonb is a tiny read (no relation
-- to the 61 TOAST concern on the big season/career tables). Run AFTER 66. Idempotent.

alter table public.runtour_daily_scores add column if not exists holes jsonb;

-- ---- submit: accept + store the hole-by-hole (appended param, so old callers still resolve) ----
create or replace function public.runtour_submit_daily(
  p_day         int,
  p_course      text,
  p_to_par      int,
  p_ovr         int,
  p_won         boolean default false,
  p_golfer      text    default 'Your Golfer',
  p_skills      jsonb   default null,
  p_decisions   jsonb   default null,
  p_is_legend   boolean default false,
  p_is_spotlight boolean default false,
  p_look        jsonb   default null,
  p_holes       jsonb   default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_ovr   int  := greatest(40, least(99, coalesce(p_ovr, 80)));
  v_floor int  := -((v_ovr - 60) * 6 / 10);
  v_topar int  := greatest(v_floor, least(40, coalesce(p_to_par, 0)));
  v_id    bigint;
begin
  if v_uid is null then
    raise exception 'sign in to post a daily score';
  end if;
  select username into v_name from profiles where id = v_uid;
  if v_name is null or length(trim(v_name)) = 0 then
    raise exception 'set a username on RunThe.GG first';
  end if;
  insert into public.runtour_daily_scores(
    user_id, display_name, golfer_name, day, course_key, to_par, ovr, won, skills, decisions, is_legend, is_spotlight, look, holes)
  values (
    v_uid, v_name,
    coalesce(nullif(left(regexp_replace(coalesce(p_golfer,''), '[<>&]', '', 'g'), 24), ''), 'Your Golfer'),
    p_day,
    left(regexp_replace(coalesce(p_course,''), '[<>&]', '', 'g'), 48),
    v_topar, v_ovr, coalesce(p_won, false), p_skills, p_decisions,
    coalesce(p_is_legend, false), coalesce(p_is_spotlight, false), p_look, p_holes)
  on conflict (user_id, day, is_legend, is_spotlight) do update
    set to_par     = excluded.to_par,
        ovr        = excluded.ovr,
        won        = excluded.won,
        course_key = excluded.course_key,
        golfer_name= excluded.golfer_name,
        display_name = excluded.display_name,
        skills     = excluded.skills,
        decisions  = excluded.decisions,
        look       = excluded.look,
        holes      = excluded.holes,
        created_at = now()
    where excluded.to_par < public.runtour_daily_scores.to_par
  returning id into v_id;
  return v_id;
end; $$;

grant execute on function public.runtour_submit_daily(int,text,int,int,boolean,text,jsonb,jsonb,boolean,boolean,jsonb,jsonb) to anon, authenticated;

-- ---- today's board: also return `holes` ----
drop function if exists public.runtour_daily_board(int,int,boolean,boolean);

create or replace function public.runtour_daily_board(
  p_day int, p_limit int default 50, p_legend boolean default false, p_spotlight boolean default false)
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              course_key text, ovr int, to_par int, won boolean, look jsonb, skills jsonb, holes jsonb)
language sql stable security definer set search_path = public as $$
  select (row_number() over (order by s.to_par asc, s.created_at asc))::int as rank,
         s.user_id, s.display_name, s.golfer_name, s.course_key, s.ovr, s.to_par, s.won, s.look, s.skills, s.holes
  from public.runtour_daily_scores s
  where s.day = p_day
    and s.is_legend    = coalesce(p_legend, false)
    and s.is_spotlight = coalesce(p_spotlight, false)
  order by s.to_par asc, s.created_at asc
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;

grant execute on function public.runtour_daily_board(int,int,boolean,boolean) to anon, authenticated;
