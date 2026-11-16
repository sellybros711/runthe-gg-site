-- ---------------------------------------------------------------------------
-- 174_ps_save_put_skip_equal.sql : a save that changes nothing writes nothing.
--
-- WHY. After the Disk IO outage of 2026-11-12 the Advisor's review found the shared save
-- rewriting equal rows: a dynasty draft re-saves the same run on every spin, the Commissioner
-- re-saves after every week, and ps_save_put (143) wrote every one of them, payload and all.
-- An UPDATE that changes nothing still writes a new row version, WAL and a dirty page.
--
-- WHAT. Before the row is locked, an equal save (same payload, same progress) is answered
-- from what is stored, with ok = true, and nothing is written. The lock itself would dirty the
-- page, so the check comes first: two devices sending the same bytes at once is harmless.
-- Everything else is 143 unchanged: the signature, the return shape, the progress rule, the
-- grants. No page changes. The client (assets/cloudsave.js v4) also stops resending an equal
-- save, so this is the second net.
--
-- SAFE TO RUN TWICE: create or replace, and the same grants.
-- ---------------------------------------------------------------------------

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

  /* AN EQUAL SAVE, ANSWERED WITHOUT A WRITE. Read without a lock: a lock is a write too. */
  select s.* into v_row from public.ps_saves s
   where s.user_id = v_user and s.game = p_game and s.slot = p_slot;
  if found and v_row.progress = v_prog and v_row.payload = p_payload then
    return query select true, v_row.slot, v_row.progress, v_row.payload, v_row.saved_at;
    return;
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

notify pgrst, 'reload schema';
