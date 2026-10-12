-- 143_ps_save_put_fix.sql : the account's save shelf has never accepted a save.
--
-- ps_save_put (103) is declared `returns table (ok, slot, progress, payload,
-- saved_at)`, and in plpgsql every name in a returns table is an OUT
-- parameter, which is a variable. So the function's own
--
--   where user_id = v_user and game = p_game and slot = p_slot
--
-- names `slot` twice over, and Postgres refuses the statement outright:
--
--   column reference "slot" is ambiguous
--
-- on EVERY call, before anything is written. It is 102's `used = used + 1`
-- arriving at a second function, and it was found the same way: the shelf was
-- read and it was empty. Not one row, for any game, for any account.
--
-- NOTHING SAID SO, because every caller fails soft by design. The football
-- dynasty, the commissioner's term, Run The Floor's career, the Putt Putt
-- Tour and every other slot all keep their copy in the browser and treat a
-- null from the server as "no opinion". So every run played since 103 was
-- deployed has lived in one browser only, and a tester on a second device, or
-- whose phone cleared the site, came back to the start. That was reported as
-- Putt Putt progress resetting to hole 1, and the page was not the cause.
--
-- The fix is to qualify every column and name the conflict target by its
-- constraint, so no name in the body can be read as a variable. The signature,
-- the return shape, the progress rule and the grants are exactly 103's, so no
-- page changes. Idempotent: run it twice and nothing moves.

create or replace function public.ps_save_put(
  p_game text, p_slot text, p_payload jsonb, p_progress int)
returns table (ok boolean, slot text, progress int, payload jsonb, saved_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.ps_saves%rowtype;
  v_prog int := greatest(0, coalesce(p_progress, 0));
begin
  if v_user is null then
    raise exception 'sign in to save';
  end if;
  if p_game is null or p_game !~ '^[a-z0-9_]{1,32}$' then
    raise exception 'unknown game';
  end if;
  if p_slot is null or p_slot !~ '^[a-z0-9_-]{1,32}$' then
    raise exception 'unknown slot';
  end if;
  if p_payload is null then
    raise exception 'nothing to save';
  end if;
  if octet_length(p_payload::text) > 524288 then
    raise exception 'save too large';
  end if;

  /* Locked for the rest of the statement, so two devices writing in the same
     second cannot both read the old progress and both decide they are ahead.
     Every column is qualified: an unqualified one is also an OUT parameter. */
  select s.* into v_row from public.ps_saves s
   where s.user_id = v_user and s.game = p_game and s.slot = p_slot
   for update;

  if found and v_row.progress > v_prog then
    return query select false, v_row.slot, v_row.progress, v_row.payload, v_row.saved_at;
    return;
  end if;

  insert into public.ps_saves as s (user_id, game, slot, progress, payload, saved_at)
  values (v_user, p_game, p_slot, v_prog, p_payload, now())
  on conflict on constraint ps_saves_pkey do update
    set progress = excluded.progress,
        payload  = excluded.payload,
        saved_at = excluded.saved_at
  returning s.* into v_row;

  return query select true, v_row.slot, v_row.progress, v_row.payload, v_row.saved_at;
end $$;

revoke all on function public.ps_save_put(text, text, jsonb, int) from public;
grant execute on function public.ps_save_put(text, text, jsonb, int) to authenticated;
