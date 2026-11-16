-- 172: 4th and What's launch events keep 120 days, and trim themselves.
--
-- The owner, 2026-11-16 (the Advisor's review, approved through the hub): a
-- purge job for old game_events rows. 170 only suggested one in a comment.
-- No migration here schedules pg_cron, so nothing depends on it: the insert
-- does the trimming. Every batch faw_events_add writes for 4th and What
-- also deletes at most 200 of the game's own rows older than 120 days, oldest
-- first, on the (game, created_at) index (170's game_events_time). Writes
-- keep pace with the purge: a busy day trims a lot, a quiet one a little.
-- 120 days covers the soft launch (about two weeks), the day 1 return and a
-- season's look back. Last Shot's rows are never touched: its retention is
-- its own call (170's comment).
--
-- Only the function changes, with the same signature and the same checks as
-- 171. Safe to run twice. Needs 170 and 171.

create or replace function public.faw_events_add(p_device text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int; cap constant int := 3000; keep constant interval := interval '120 days'; trim_n constant int := 200;
begin
  if p_device is null or p_device !~ '^[A-Za-z0-9-]{8,40}$' or jsonb_typeof(p_rows) is distinct from 'array' then return 0; end if;
  if jsonb_array_length(p_rows) > 40 then return 0; end if;
  if (select count(*) from game_events where game = '4th-and-what' and device_id = p_device and created_at > now() - interval '1 day') >= cap then return 0; end if;
  insert into game_events (game, device_id, session_id, name, client_ms, props)
    select '4th-and-what', p_device, r->>'session_id', r->>'name', (r->>'client_ms')::int, coalesce(r->'props', '{}'::jsonb)
      from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  /* the trim: this game's oldest rows past the keep, a few at a time */
  delete from game_events where id in (
    select id from game_events where game = '4th-and-what' and created_at < now() - keep
     order by created_at limit trim_n);
  return n;
end $$;

revoke all on function public.faw_events_add(text, jsonb) from public, anon, authenticated;
