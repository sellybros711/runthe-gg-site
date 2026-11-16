-- ═══════════════════════════════════════════════════════════════════════════
-- 172: Run The Diamond's career, written only when something is new
-- ═══════════════════════════════════════════════════════════════════════════
-- Before this, every signed-in page open sent the device's whole career (up to
-- 1,000 seasons at about 1.2 KB each) to rtd_career_merge, at boot, on every
-- auth event (the hourly token refresh too) and after every season. The function
-- rewrote the whole row every time, new seasons or not, and returned all of it.
-- That is the shape of the 2026-11-12 Disk IO outage (the Advisor's review of
-- 2026-11-16, recommendation 1).
--
-- 1. rtd_career_sync(p_rows, p_since): the page's call from now on.
--    - p_rows is only the seasons this device has not yet seen the server keep.
--      Usually none, or the one season just finished.
--    - The row is locked and rewritten ONLY when a season in p_rows is new.
--      Nothing new, no write.
--    - It returns {rows, top, n}: only the seasons newer than p_since (the newest
--      ts this device already holds from the server), the newest ts kept, and how
--      many seasons are kept. So a page open with nothing new costs one read by
--      primary key and sends back []. n lets the page notice a season another
--      device filed late, under an older ts, and ask once for the whole career.
-- 2. rtd_career_merge keeps its signature for pages a browser still has cached,
--    but it no longer rewrites the row when the merge changed nothing.
--
-- Each update carries `rows is distinct from v_out`, the form scripts/check-saves.mjs
-- reads as a guarded save (platform/platform-database-saves.md).
--
-- Safe to run twice: both are create or replace, and the grants repeat.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.rtd_career_sync(p_rows jsonb default '[]'::jsonb, p_since bigint default 0)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_have jsonb;
  v_new  int;
  v_out  jsonb;
begin
  if v_uid is null then raise exception 'sign in to keep your career'; end if;
  if p_rows is null then p_rows := '[]'::jsonb; end if;
  if p_since is null then p_since := 0; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'too many rows at once'; end if;
  if octet_length(p_rows::text) > 2500000 then raise exception 'rows too large'; end if;

  if jsonb_array_length(p_rows) > 0 then
    select rows into v_have from public.rtd_career where user_id = v_uid;
    if v_have is null then
      insert into public.rtd_career (user_id) values (v_uid) on conflict (user_id) do nothing;
    end if;
    -- Is any season in p_rows one the server does not hold? Read without a lock
    -- first, so a device resending what is already kept never writes.
    select count(*) into v_new
    from jsonb_array_elements(p_rows) as r
    where jsonb_typeof(r) = 'object'
      and (r->>'ts') ~ '^[0-9]{10,15}$'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(v_have, '[]'::jsonb)) as h
        where (h->>'ts') = (r->>'ts')
      );

    if v_new > 0 then
      select rows into v_have from public.rtd_career where user_id = v_uid for update;
      with incoming as (
        select jsonb_set(r, '{u}', to_jsonb(v_uid::text)) as r, (r->>'ts')::bigint as ts
        from jsonb_array_elements(p_rows) as r
        where jsonb_typeof(r) = 'object'
          and (r->>'ts') ~ '^[0-9]{10,15}$'
      ),
      held as (
        select r, (r->>'ts')::bigint as ts from jsonb_array_elements(v_have) as r
      ),
      unioned as (
        select distinct on (ts) r, ts, pri from (
          select r, ts, 0 as pri from held
          union all
          select r, ts, 1 as pri from incoming
        ) x
        order by ts, pri
      ),
      kept as (
        select r, ts from unioned order by ts desc limit 1000
      )
      select coalesce(jsonb_agg(r order by ts), '[]'::jsonb) into v_out from kept;
      update public.rtd_career set rows = v_out, updated_at = now()
        where user_id = v_uid and rows is distinct from v_out;
    end if;
  end if;

  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(r order by (r->>'ts')::bigint)
      from jsonb_array_elements(c.rows) as r
      where (r->>'ts')::bigint > p_since
    ), '[]'::jsonb),
    'top', coalesce((
      select max((r->>'ts')::bigint) from jsonb_array_elements(c.rows) as r
    ), 0),
    'n', jsonb_array_length(c.rows)
  ) into v_out
  from public.rtd_career c where c.user_id = v_uid;

  return coalesce(v_out, jsonb_build_object('rows', '[]'::jsonb, 'top', 0, 'n', 0));
end $$;
revoke all on function public.rtd_career_sync(jsonb, bigint) from public;
grant execute on function public.rtd_career_sync(jsonb, bigint) to authenticated;

-- The old call, kept for cached pages: same answer, but no write when nothing changed.
create or replace function public.rtd_career_merge(p_rows jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_have jsonb;
  v_out  jsonb;
begin
  if v_uid is null then raise exception 'sign in to keep your career'; end if;
  if p_rows is null then p_rows := '[]'::jsonb; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'too many rows at once'; end if;
  if octet_length(p_rows::text) > 2500000 then raise exception 'rows too large'; end if;

  insert into public.rtd_career (user_id) values (v_uid) on conflict (user_id) do nothing;
  select rows into v_have from public.rtd_career where user_id = v_uid for update;

  with incoming as (
    select jsonb_set(r, '{u}', to_jsonb(v_uid::text)) as r, (r->>'ts')::bigint as ts
    from jsonb_array_elements(p_rows) as r
    where jsonb_typeof(r) = 'object'
      and (r->>'ts') ~ '^[0-9]{10,15}$'
  ),
  held as (
    select r, (r->>'ts')::bigint as ts from jsonb_array_elements(v_have) as r
  ),
  unioned as (
    select distinct on (ts) r, ts, pri from (
      select r, ts, 0 as pri from held
      union all
      select r, ts, 1 as pri from incoming
    ) x
    order by ts, pri
  ),
  kept as (
    select r, ts from unioned order by ts desc limit 1000
  )
  select coalesce(jsonb_agg(r order by ts), '[]'::jsonb) into v_out from kept;

  update public.rtd_career set rows = v_out, updated_at = now()
    where user_id = v_uid and rows is distinct from v_out;
  return v_out;
end $$;
revoke all on function public.rtd_career_merge(jsonb) from public;
grant execute on function public.rtd_career_merge(jsonb) to authenticated;
