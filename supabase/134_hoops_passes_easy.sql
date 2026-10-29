-- ---------------------------------------------------------------------------
-- 134_hoops_passes_easy.sql: Six Passes easy mode costs a pass on the board
--
--   psql ... -f supabase/134_hoops_passes_easy.sql
--
-- Needs 116 (rtf_plays and the old rtf_submit_passes). Safe to run twice.
--
-- The picker hides the years by default. "Too hard?" spends ONE pass of the
-- shot clock to show the years every teammate played for each club, for the
-- rest of that puzzle. The page counts it, and this is what makes the board
-- count it too: 116 worked the passes out of the chain's length, so a chain
-- solved in easy mode would have been filed a pass cheaper than it was played.
--
-- p_easy DEFAULTS TO FALSE, so a page that never sends it files exactly what
-- it filed before. The old four argument function is dropped first, because
-- a second overload whose fifth argument has a default makes every four
-- argument call ambiguous and PostgREST refuses it.
--
-- A PAGE AHEAD OF THIS DATABASE. hoops/board.js sends p_easy only when it is
-- true, so a normal chain files against 116 as it always has, and an easy
-- chain is refused (no function takes p_easy) rather than filed a pass short.
-- ---------------------------------------------------------------------------

drop function if exists rtf_submit_passes(int, text[], int, boolean);

create or replace function rtf_submit_passes(
  p_day int, p_chain text[], p_par int, p_solved boolean, p_easy boolean default false
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_id bigint;
  v_hops int;
  v_passes int;
  v_i int;
begin
  if not rtf_play_day_ok(p_day) then
    raise exception 'day % is not close enough to today (day %)', p_day, rtf_play_today();
  end if;
  -- The chain includes the man who starts with the ball, so the hops are its
  -- length minus one, and easy mode is one pass more. Ten is the shot clock.
  v_hops := coalesce(array_length(p_chain, 1), 0) - 1;
  v_passes := v_hops + case when coalesce(p_easy, false) then 1 else 0 end;
  if v_hops < 1 or v_passes > 10 then raise exception 'a chain is 1 to 10 passes'; end if;
  if p_par is null or p_par < 1 or p_par > 6 then raise exception 'par must be 1 to 6'; end if;
  if p_solved is null then raise exception 'solved must be said'; end if;
  -- Solved cannot beat par, because par is the shortest chain there is.
  if p_solved and v_hops < p_par then raise exception 'a solved chain cannot be under par'; end if;
  for v_i in 1 .. array_length(p_chain, 1) loop
    if p_chain[v_i] is null or p_chain[v_i] !~ '^[a-z0-9.''-]{2,16}$' then
      raise exception 'player id looks wrong: %', p_chain[v_i];
    end if;
  end loop;

  if v_user is not null then
    select username::text into v_name from profiles where id = v_user;
    select id into v_id from rtf_plays
     where user_id = v_user and mode = 'passes' and day = p_day order by created_at limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  select id into v_id from rtf_plays
   where mode = 'passes' and day = p_day and chain = p_chain
     and user_id is not distinct from v_user and created_at > now() - interval '1 minute'
   limit 1;
  if v_id is not null then return v_id; end if;

  insert into rtf_plays (user_id, display_name, mode, day, score, passes, par, solved, chain)
  values (v_user, v_name, 'passes', p_day,
    case when p_solved then 100 - v_passes else 0 end,
    v_passes, p_par, p_solved, p_chain)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function rtf_submit_passes(int,text[],int,boolean,boolean) from public;
grant execute on function rtf_submit_passes(int,text[],int,boolean,boolean) to anon, authenticated;
