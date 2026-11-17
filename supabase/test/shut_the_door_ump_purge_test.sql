-- Shut The Door's ump purge (175). Chain, after 165 and its test:
--   psql -d std -f supabase/175_shut_the_door_ump_purge.sql
--   psql -d std -f supabase/175_shut_the_door_ump_purge.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_ump_purge_test.sql
-- It also replays a clip rejected before 175 (path kept) through 175 and the one-off backfill
-- (supabase/shut_the_door_ump_backfill.sql), twice each.
\set ON_ERROR_STOP on
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2'), ('00000000-0000-0000-0000-0000000000c9')
  on conflict do nothing;
create table if not exists public.stumpire_testers (user_id uuid primary key, role text not null default 'tester', note text);
insert into public.stumpire_testers (user_id, role) values ('00000000-0000-0000-0000-0000000000c9', 'admin')
  on conflict (user_id) do update set role = 'admin';
delete from storage.objects where bucket_id = 'shutdoor-ump-voices';
delete from public.shutdoor_ump_clips;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$
begin execute q; return null; exception when others then return sqlerrm; end $$;
grant execute on function pg_temp.claim(boolean, text) to anon, authenticated;
grant execute on function pg_temp.err(text) to anon, authenticated;

/* a clip for a player, row then file, as the page does it */
create or replace function pg_temp.clip(p_uid text, p_line text) returns text language plpgsql as $$
declare p text;
begin
  perform set_config('test.uid', p_uid, false);
  insert into shutdoor_ump_clips (line_id, consent_text, consent_version, mime, bytes, duration_ms, storage_path)
    values (p_line, shutdoor_ump_consent(1), 1, 'audio/webm', 1000, 900, 'x') returning storage_path into p;
  insert into storage.objects (bucket_id, name, metadata) values ('shutdoor-ump-voices', p, '{"size": 1000}');
  return p;
end $$;
grant execute on function pg_temp.clip(text, text) to authenticated;
create temporary table paths (k text primary key, p text);
grant select, insert on paths to authenticated;

set role authenticated;
insert into paths values
  ('a1', pg_temp.clip('00000000-0000-0000-0000-0000000000d1', 'strike')),
  ('a2', pg_temp.clip('00000000-0000-0000-0000-0000000000d1', 'ball')),
  ('b1', pg_temp.clip('00000000-0000-0000-0000-0000000000d2', 'out')),
  ('b2', pg_temp.clip('00000000-0000-0000-0000-0000000000d2', 'safe'));
reset role;
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 4
  and json_array_length(shutdoor_ump_orphans()) = 0, 'four clips, four files, no orphans');

-- the orphan list is the service role's alone
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c9';
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_orphans()$$) is not null, 'even the owner cannot call the orphan list from the page');
reset role;
set role anon;
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_orphans()$$) is not null, 'signed out: the orphan list is not callable');
reset role;
select pg_temp.claim(has_function_privilege('service_role', 'public.shutdoor_ump_orphans(integer)', 'execute'), 'the service role calls the orphan list');

-- the owner approves one and rejects one: the rejected row keeps its status and loses its path
create temporary table ids as select k, c.id from paths join shutdoor_ump_clips c on c.storage_path = paths.p;
grant select on ids to authenticated;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c9';
select pg_temp.claim((shutdoor_ump_review((select id from ids where k = 'b1'), 'approved')->>'status') = 'approved', 'the owner approves b1');
select pg_temp.claim((shutdoor_ump_review((select id from ids where k = 'b2'), 'rejected')->>'status') = 'rejected', 'the owner rejects b2');
select pg_temp.claim(json_array_length(shutdoor_ump_queue('rejected', 50)) = 1 and (shutdoor_ump_queue('rejected', 50)->0->>'path') is null,
  'it is on the owner''s rejected list, with no path');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_review((select id from ids where k = 'b2'), 'approved')$$) = 'that call''s audio was deleted', 'a rejected clip cannot be approved again');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_review((select id from ids where k = 'b2'), 'pending')$$) = 'that call''s audio was deleted', 'or put back to pending');
select pg_temp.claim((shutdoor_ump_review((select id from ids where k = 'b2'), 'rejected')->>'status') = 'rejected', 'rejecting it again is harmless');
reset role;
select pg_temp.claim((select storage_path is null and status = 'rejected' and reviewed_at is not null from shutdoor_ump_clips where id = (select id from ids where k = 'b2')),
  'the rejected row stays, rejected, with no path');
select pg_temp.claim(json_array_length(shutdoor_ump_orphans()) = 1 and (shutdoor_ump_orphans()->>0) = (select p from paths where k = 'b2'),
  'its file is the one orphan');

-- any way to rejected drops the path, not only the review call; and the check holds it
update shutdoor_ump_clips set status = 'rejected' where storage_path = (select p from paths where k = 'b1');
select pg_temp.claim((select count(*) from shutdoor_ump_clips where status = 'rejected' and storage_path is null) = 2, 'a direct update to rejected drops the path too');
select pg_temp.claim(pg_temp.err($$update shutdoor_ump_clips set status = 'approved' where line_id = 'out'$$) = 'that call''s audio was deleted',
  'a row with no path cannot leave rejected');
-- the check, under the triggers: with them off, a pending row with no path is still refused
set session_replication_role = replica;
select pg_temp.claim(pg_temp.err($$insert into shutdoor_ump_clips (user_id, line_id, status, consent_text, consent_version, storage_path, mime, bytes, duration_ms)
  values ('00000000-0000-0000-0000-0000000000d1', 'strike', 'pending', 'c', 1, null, 'audio/webm', 1, 1)$$) like '%shutdoor_ump_clips_rejected_ck%',
  'no row is ever approved or pending with no path (the check)');
select pg_temp.claim(pg_temp.err($$update shutdoor_ump_clips set status = 'approved' where line_id = 'out'$$) like '%shutdoor_ump_clips_rejected_ck%',
  'nor leaves rejected without one, triggers or not');
set session_replication_role = origin;
select pg_temp.claim((select convalidated from pg_constraint where conname = 'shutdoor_ump_clips_rejected_ck'), 'with no old rejected paths, 175 validated its check itself');

-- the account goes: its rows cascade, and both its files are orphans
delete from auth.users where id = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.claim((select count(*) from shutdoor_ump_clips where user_id = '00000000-0000-0000-0000-0000000000d1') = 0, 'a deleted account''s clips go');
select pg_temp.claim((select array_agg(x order by x) from json_array_elements_text(shutdoor_ump_orphans()) x)
  = (select array_agg(p order by p) from paths where k in ('a1', 'a2', 'b1', 'b2')), 'its two files and the two rejected ones are the orphans');
select pg_temp.claim(json_array_length(shutdoor_ump_orphans(2)) = 2, 'the list takes a limit');

-- the purge (the Storage API, stubbed here by the delete it does) leaves no orphans
delete from storage.objects o where o.bucket_id = 'shutdoor-ump-voices' and o.name in (select json_array_elements_text(shutdoor_ump_orphans()));
select pg_temp.claim(json_array_length(shutdoor_ump_orphans()) = 0 and (select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 0,
  'after the purge: no orphans, and no file for a rejected or deleted clip');

-- a clip rejected BEFORE 175 kept its path. 175 again leaves its check unvalidated, the backfill fixes both
alter table shutdoor_ump_clips drop constraint shutdoor_ump_clips_rejected_ck;
set role authenticated;
insert into paths values ('c1', pg_temp.clip('00000000-0000-0000-0000-0000000000d2', 'foul'));
reset role;
set session_replication_role = replica;
update shutdoor_ump_clips set status = 'rejected' where storage_path = (select p from paths where k = 'c1');
set session_replication_role = origin;
select pg_temp.claim((select storage_path is not null from shutdoor_ump_clips where status = 'rejected' and line_id = 'foul'), 'an old rejected clip, path kept');
\ir ../175_shut_the_door_ump_purge.sql
\ir ../175_shut_the_door_ump_purge.sql
select pg_temp.claim(not (select convalidated from pg_constraint where conname = 'shutdoor_ump_clips_rejected_ck'), '175 with an old rejected path: the check waits for the backfill');
select pg_temp.claim(json_array_length(shutdoor_ump_orphans()) = 0, 'before the backfill its file is still named');
\ir ../shut_the_door_ump_backfill.sql
\ir ../shut_the_door_ump_backfill.sql
select pg_temp.claim((select convalidated from pg_constraint where conname = 'shutdoor_ump_clips_rejected_ck')
  and (select count(*) from shutdoor_ump_clips where status = 'rejected' and storage_path is not null) = 0,
  'the backfill (twice): no rejected clip keeps a path, and the check is validated');
select pg_temp.claim((shutdoor_ump_orphans()->>0) = (select p from paths where k = 'c1'), 'the old rejected file is now an orphan for the purge');

reset test.uid;
delete from storage.objects where bucket_id = 'shutdoor-ump-voices';
delete from public.shutdoor_ump_clips;
