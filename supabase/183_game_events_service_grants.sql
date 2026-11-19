-- 183: the server may call the game events functions again (2026-11-19).
--
-- 170, 171, 173 and 175 each ended with
--   revoke all on function ... from public, anon, authenticated;
-- and granted nothing back. On Supabase the service role reached these
-- functions only through PUBLIC, so the revoke took it away too:
-- has_function_privilege('service_role', 'public.last_shot_events_add(uuid,text,jsonb)', 'execute')
-- read false in production. Every Last Shot event (and 4th and What's) was
-- refused and dropped without a sound, because both games hide a store error
-- from the player on purpose; the reports could not be read by the server.
--
-- This grants execute to service_role only. No browser role gets anything.
-- Safe to run twice. Needs 170, 171 and 175 (173 only replaces faw_events_add).

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.last_shot_events_add(uuid, text, jsonb) to service_role';
    execute 'grant execute on function public.game_round_report(text, timestamptz, timestamptz, boolean) to service_role';
    execute 'grant execute on function public.faw_events_add(text, jsonb) to service_role';
    execute 'grant execute on function public.faw_round_report(timestamptz, timestamptz) to service_role';
  end if;
end $$;
