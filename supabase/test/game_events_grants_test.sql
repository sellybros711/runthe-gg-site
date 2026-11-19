-- Checks for 183_game_events_service_grants.sql. Every line printed starts ' ok ' or ' FAIL '.
--   after 170, 171, 173, 175 and 183 (twice): the server role can call the
--   four event functions, and no browser role can.
\set QUIET on
\pset tuples_only on
\pset format unaligned
create temp table f (sig text);
insert into f values
 ('public.last_shot_events_add(uuid,text,jsonb)'),
 ('public.game_round_report(text,timestamptz,timestamptz,boolean)'),
 ('public.faw_events_add(text,jsonb)'),
 ('public.faw_round_report(timestamptz,timestamptz)');
select case when has_function_privilege('service_role', sig, 'execute') then ' ok ' else ' FAIL ' end || 'service_role can call ' || sig from f;
select case when not has_function_privilege('anon', sig, 'execute') then ' ok ' else ' FAIL ' end || 'anon cannot call ' || sig from f;
select case when not has_function_privilege('authenticated', sig, 'execute') then ' ok ' else ' FAIL ' end || 'authenticated cannot call ' || sig from f;
