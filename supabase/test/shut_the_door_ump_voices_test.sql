-- Shut The Door's voice of the ump (165). Chain, after 164 and its test:
--   psql -d std -f supabase/test/storage_base.sql            (in CI: the storage schema a bare cluster lacks)
--   psql -d std -f supabase/165_shut_the_door_ump_voices.sql
--   psql -d std -f supabase/165_shut_the_door_ump_voices.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_ump_voices_test.sql
-- The RLS and the storage policies are checked as the authenticated and anon roles, not as the
-- superuser (who skips them).
\set ON_ERROR_STOP on
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2'), ('00000000-0000-0000-0000-0000000000c9')
  on conflict do nothing;
-- the owner: 133's tester list, stubbed when 133 is not in the chain
create table if not exists public.stumpire_testers (user_id uuid primary key, role text not null default 'tester', note text);
insert into public.stumpire_testers (user_id, role) values ('00000000-0000-0000-0000-0000000000c9', 'admin')
  on conflict (user_id) do update set role = 'admin';
insert into public.stumpire_testers (user_id, role) values ('00000000-0000-0000-0000-0000000000c2', 'tester')
  on conflict (user_id) do update set role = 'tester';
delete from storage.objects where bucket_id = 'shutdoor-ump-voices';
delete from public.shutdoor_ump_clips;

create or replace function pg_temp.claim(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$
begin execute q; return null; exception when others then return sqlerrm; end $$;
grant execute on function pg_temp.claim(boolean, text) to anon, authenticated;
grant execute on function pg_temp.err(text) to anon, authenticated;
create temporary table consent as select shutdoor_ump_consent(1) as t;
grant select on consent to anon, authenticated;

select pg_temp.claim(shutdoor_ump_consent(1) = 'I recorded this myself. I''m 18 or older. I give Run The Games permission to use, edit and play this recording in its games, for free and forever.',
  'the consent, word for word');
select pg_temp.claim(array_length(shutdoor_ump_lines(), 1) = 12, 'twelve lines on the script');
select pg_temp.claim((select not public and file_size_limit = 307200 and 'audio/webm' = any (allowed_mime_types)
  and not ('image/png' = any (allowed_mime_types)) from storage.buckets where id = 'shutdoor-ump-voices'),
  'the bucket is private, 300 KB, audio only');

-- a player, as the authenticated role
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.claim(pg_temp.err($$insert into shutdoor_ump_clips (line_id, consent_text, consent_version, mime, bytes, duration_ms, storage_path)
  values ('strike', 'I agree', 1, 'audio/webm', 1000, 900, 'x')$$) = 'tick the consent box first', 'a changed consent is refused');
select pg_temp.claim(pg_temp.err($$insert into shutdoor_ump_clips (line_id, consent_text, consent_version, mime, bytes, duration_ms, storage_path)
  values ('hello', (select t from consent), 1, 'audio/webm', 1000, 900, 'x')$$) = 'that is not a line on the script', 'a line off the script is refused');
select pg_temp.claim(pg_temp.err($$insert into shutdoor_ump_clips (line_id, consent_text, consent_version, mime, bytes, duration_ms, storage_path)
  values ('strike', (select t from consent), 1, 'video/mp4', 1000, 900, 'x')$$) = 'audio files only', 'a video is refused');
select pg_temp.claim(pg_temp.err($$insert into shutdoor_ump_clips (line_id, consent_text, consent_version, mime, bytes, duration_ms, storage_path)
  values ('strike', (select t from consent), 1, 'audio/webm', 1000, 3400, 'x')$$) is not null, 'longer than 3 seconds is refused');
select pg_temp.claim(pg_temp.err($$insert into shutdoor_ump_clips (line_id, consent_text, consent_version, mime, bytes, duration_ms, storage_path)
  values ('strike', (select t from consent), 1, 'audio/webm', 400000, 900, 'x')$$) is not null, 'bigger than 300 KB is refused');

-- a good one: whatever user, status and path were sent, the trigger sets its own
insert into shutdoor_ump_clips (user_id, status, line_id, consent_text, consent_version, mime, bytes, duration_ms, storage_path, credit)
  values ('00000000-0000-0000-0000-0000000000c2', 'approved', 'strike', (select t from consent), 1, 'audio/webm;codecs=opus', 20000, 1200, 'evil/path', '  Big Al  ');
select pg_temp.claim((select user_id = '00000000-0000-0000-0000-0000000000c1' and status = 'pending' and mime = 'audio/webm'
  and credit = 'Big Al' and consent_version = 1 and storage_path = '00000000-0000-0000-0000-0000000000c1/' || id || '.webm'
  from shutdoor_ump_clips), 'the row is the caller''s, pending, at its own path, the codec dropped and the credit trimmed');
create temporary table clip1 as select id, storage_path from shutdoor_ump_clips;

-- the upload: only at that path, only once, only into the caller's folder
select pg_temp.claim(pg_temp.err($$insert into storage.objects (bucket_id, name, metadata) values ('shutdoor-ump-voices',
  '00000000-0000-0000-0000-0000000000c1/someother.webm', '{"size": 20000}')$$) is not null, 'an upload with no row of its own is refused');
select pg_temp.claim(pg_temp.err($$insert into storage.objects (bucket_id, name, metadata) values ('shutdoor-ump-voices',
  '00000000-0000-0000-0000-0000000000c2/x.webm', '{"size": 20000}')$$) is not null, 'an upload into another player''s folder is refused');
select pg_temp.claim(pg_temp.err($$insert into storage.objects (bucket_id, name, metadata) values ('shutdoor-ump-voices',
  (select storage_path from clip1), '{"size": 400000}')$$) is not null, 'an upload over 300 KB is refused');
insert into storage.objects (bucket_id, name, metadata) values ('shutdoor-ump-voices', (select storage_path from clip1), '{"size": 20000}');
select pg_temp.claim(pg_temp.err($$insert into storage.objects (bucket_id, name, metadata) values ('shutdoor-ump-voices',
  (select storage_path from clip1), '{"size": 20000}')$$) is not null, 'a second upload to the same path is refused');
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 1, 'the uploader reads their own pending file');

-- the player cannot approve, update or delete
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_review((select id from clip1), 'approved')$$) = 'owner only', 'a player cannot approve');
select pg_temp.claim(pg_temp.err($$update shutdoor_ump_clips set status = 'approved'$$) is not null, 'a player cannot update a row');
select pg_temp.claim(pg_temp.err($$delete from shutdoor_ump_clips$$) is not null, 'a player cannot delete a row');
select pg_temp.claim((select count(*) from shutdoor_ump_clips) = 1 and (select status from shutdoor_ump_clips) = 'pending',
  'a player''s update and delete change nothing');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_queue('pending', 50)$$) = 'owner only', 'a player cannot read the queue');
select pg_temp.claim(not shutdoor_ump_owner(), 'a player is not the owner');

-- a tester is not the owner, and sees nobody else's pending row or file
set test.uid = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.claim(not shutdoor_ump_owner(), 'a tester is not the owner');
select pg_temp.claim((select count(*) from shutdoor_ump_clips) = 0, 'another player sees no pending row');
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 0, 'another player reads no pending file');
select pg_temp.claim(json_array_length(shutdoor_ump_approved()) = 0, 'nothing approved yet');

-- signed out: no insert at all
reset role;
set role anon;
set test.uid = '';
select pg_temp.claim(pg_temp.err($$insert into shutdoor_ump_clips (line_id, consent_text, consent_version, mime, bytes, duration_ms, storage_path)
  values ('strike', (select t from consent), 1, 'audio/webm', 1000, 900, 'x')$$) is not null, 'signed out: an insert is refused');
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 0, 'signed out: a pending file is unreadable');

-- the owner: the queue, approve, then everybody reads it
reset role;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c9';
select pg_temp.claim(shutdoor_ump_owner(), 'the admin is the owner');
select pg_temp.claim(json_array_length(shutdoor_ump_queue('pending', 50)) = 1, 'the owner''s queue holds the uploaded clip');
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 1, 'the owner reads a pending file');
select pg_temp.claim((shutdoor_ump_review((select id from clip1), 'approved')->>'status') = 'approved', 'the owner approves');
select pg_temp.claim(json_array_length(shutdoor_ump_queue('approved', 50)) = 1 and json_array_length(shutdoor_ump_queue('pending', 50)) = 0,
  'it moves to the approved list');
reset role;
set role anon;
set test.uid = '';
select pg_temp.claim(json_array_length(shutdoor_ump_approved()) = 1 and (shutdoor_ump_approved()->0->>'line') = 'strike'
  and (shutdoor_ump_approved()->0->>'credit') = 'Big Al' and (shutdoor_ump_approved()->0->'user_id') is null,
  'signed out: the approved list, with the credit and no user id');
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 1, 'signed out: an approved file is readable');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_owner()$$) is not null, 'signed out: the owner check is not callable');

-- rejected: unreadable again, on the rejected list
reset role;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c9';
select pg_temp.claim((shutdoor_ump_review((select id from clip1), 'rejected')->>'status') = 'rejected', 'the owner rejects');
select pg_temp.claim(json_array_length(shutdoor_ump_queue('rejected', 50)) = 1, 'it is on the rejected list');
set test.uid = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 0
  and json_array_length(shutdoor_ump_approved()) = 0, 'a rejected file is unreadable and not listed');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_review((select id from clip1), 'approved')$$) = 'owner only', 'a tester cannot approve');

-- the limit: 40 pending a player
set test.uid = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  for i in 1..40 loop
    insert into shutdoor_ump_clips (line_id, consent_text, consent_version, mime, bytes, duration_ms, storage_path)
      values ('ball', shutdoor_ump_consent(1), 1, 'audio/mp4', 1000, 900, 'x');
  end loop;
end $$;
select pg_temp.claim(pg_temp.err($$insert into shutdoor_ump_clips (line_id, consent_text, consent_version, mime, bytes, duration_ms, storage_path)
  values ('ball', (select t from consent), 1, 'audio/mp4', 1000, 900, 'x')$$) = 'you have 40 calls waiting for review', 'the 41st pending clip is refused');
select pg_temp.claim((select count(*) from shutdoor_ump_clips where storage_path like '%.m4a') = 40, 'an mp4 is stored as .m4a');
reset role;

-- a row whose upload never landed goes after 15 minutes, so it never holds a slot
update shutdoor_ump_clips set created_at = now() - interval '20 minutes' where line_id = 'ball';
set role authenticated;
insert into shutdoor_ump_clips (line_id, consent_text, consent_version, mime, bytes, duration_ms, storage_path)
  values ('ball', (select t from consent), 1, 'audio/mp4', 1000, 900, 'x');
select pg_temp.claim((select count(*) from shutdoor_ump_clips) = 1, 'the stale rows with no file are gone, the new one is in');
reset role;
reset test.uid;
delete from storage.objects where bucket_id = 'shutdoor-ump-voices';
delete from public.shutdoor_ump_clips;
