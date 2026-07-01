-- ============================================================================
-- 30_runtour_legend.sql — Legend Token rounds get their own board + course records
-- ============================================================================
-- A signed-in player who finishes a full 40-year career at an elite level (Career
-- Grand Slam, 5+ majors, or 3x Player of the Year — gated client-side against that
-- career's own tracked stats) banks a one-time Daily Challenge entry: skip the draft
-- and play as that career's PEAK build instead. Product decision (discussed with the
-- owner): a maxed 40-year build shouldn't just steamroll everyone else's shot at a
-- human-drafted course record, so legend rounds are tagged and kept on a SEPARATE
-- board/record set rather than mixed into the existing one.
--
-- Adds a single boolean column to the existing runtour_daily_scores table (no new
-- table) and threads a p_legend filter through the two read functions, matching the
-- p_sort pattern from 28_runtour_sort.sql. Fully backward compatible: every existing
-- row defaults is_legend=false, and every existing caller of runtour_daily_board /
-- runtour_course_records that doesn't pass p_legend keeps seeing exactly the human
-- board it always has (p_legend defaults false).
--
-- Integrity note: is_legend is client-declared, same pragmatic launch posture as the
-- rest of this table (see 24_runtour_daily.sql) — the server has no visibility into
-- career-completion state (that lives in the client's localStorage, not this
-- database), so there's no way to verify a submission's legend claim server-side yet.
-- The score itself is still server-recomputed/clamped exactly as before; only the
-- board a round appears on can be misdeclared, not the value of the score. Revisit if
-- career state ever moves server-side.
--
-- Idempotent: safe to re-run. Apply in the Supabase SQL editor AFTER 24_runtour_daily.sql.
-- ----------------------------------------------------------------------------

alter table public.runtour_daily_scores add column if not exists is_legend boolean not null default false;
create index if not exists runtour_daily_legend_idx on public.runtour_daily_scores (day, is_legend, to_par);

-- ---------------------------------------------------------------------------
-- submit (upsert) — now also carries is_legend; same "keep the lower to_par" upsert
-- ---------------------------------------------------------------------------
drop function if exists public.runtour_submit_daily(int,text,int,int,boolean,text,jsonb,jsonb);

create or replace function public.runtour_submit_daily(
  p_day       int,
  p_course    text,
  p_to_par    int,
  p_ovr       int,
  p_won       boolean default false,
  p_golfer    text    default 'Your Golfer',
  p_skills    jsonb   default null,
  p_decisions jsonb   default null,
  p_is_legend boolean default false
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_ovr   int  := greatest(40, least(99, coalesce(p_ovr, 80)));
  -- plausible floor: a great build can go low, but not impossibly low. ~0.6 strokes
  -- per overall point below par → OVR 80 ≈ -12, OVR 90 ≈ -18, OVR 99 ≈ -23.
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
    user_id, display_name, golfer_name, day, course_key, to_par, ovr, won, skills, decisions, is_legend)
  values (
    v_uid, v_name,
    coalesce(nullif(left(regexp_replace(coalesce(p_golfer,''), '[<>&]', '', 'g'), 24), ''), 'Your Golfer'),
    p_day,
    left(regexp_replace(coalesce(p_course,''), '[<>&]', '', 'g'), 48),
    v_topar, v_ovr, coalesce(p_won, false), p_skills, p_decisions, coalesce(p_is_legend, false))
  on conflict (user_id, day) do update
    set to_par     = excluded.to_par,
        ovr        = excluded.ovr,
        won        = excluded.won,
        course_key = excluded.course_key,
        golfer_name= excluded.golfer_name,
        display_name = excluded.display_name,
        skills     = excluded.skills,
        decisions  = excluded.decisions,
        is_legend  = excluded.is_legend,
        created_at = now()
    where excluded.to_par < public.runtour_daily_scores.to_par   -- only when it's actually better
  returning id into v_id;
  return v_id;   -- null if the existing score was already as good or better
end; $$;

-- ---------------------------------------------------------------------------
-- today's global board — now filterable by legend/human (defaults to human, unchanged)
-- ---------------------------------------------------------------------------
drop function if exists public.runtour_daily_board(int,int);

create or replace function public.runtour_daily_board(p_day int, p_limit int default 50, p_legend boolean default false)
returns table(rank int, user_id uuid, display_name text, golfer_name text,
              course_key text, ovr int, to_par int, won boolean)
language sql stable security definer set search_path = public as $$
  select (row_number() over (order by s.to_par asc, s.created_at asc))::int as rank,
         s.user_id, s.display_name, s.golfer_name, s.course_key, s.ovr, s.to_par, s.won
  from public.runtour_daily_scores s
  where s.day = p_day and s.is_legend = coalesce(p_legend, false)
  order by s.to_par asc, s.created_at asc
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;

-- ---------------------------------------------------------------------------
-- all-time course records — now filterable by legend/human (defaults to human, unchanged)
-- ---------------------------------------------------------------------------
drop function if exists public.runtour_course_records();

create or replace function public.runtour_course_records(p_legend boolean default false)
returns table(course_key text, user_id uuid, display_name text, golfer_name text,
              to_par int, ovr int, day int)
language sql stable security definer set search_path = public as $$
  select distinct on (s.course_key)
         s.course_key, s.user_id, s.display_name, s.golfer_name, s.to_par, s.ovr, s.day
  from public.runtour_daily_scores s
  where s.is_legend = coalesce(p_legend, false)
  order by s.course_key, s.to_par asc, s.created_at asc;
$$;

-- ---------------------------------------------------------------------------
-- grants — unchanged shape, just re-granted against the new function signatures
-- ---------------------------------------------------------------------------
revoke all on function public.runtour_submit_daily(int,text,int,int,boolean,text,jsonb,jsonb,boolean) from public;
grant execute on function public.runtour_submit_daily(int,text,int,int,boolean,text,jsonb,jsonb,boolean) to authenticated;
grant execute on function public.runtour_daily_board(int,int,boolean)    to anon, authenticated;
grant execute on function public.runtour_course_records(boolean)        to anon, authenticated;
