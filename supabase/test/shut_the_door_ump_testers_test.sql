-- Shut The Door's ump calls reviewed by testers (176). Chain, after 175 and its test:
--   psql -d std -f supabase/176_shut_the_door_ump_testers.sql
--   psql -d std -f supabase/176_shut_the_door_ump_testers.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_ump_testers_test.sql
-- Checked as the authenticated and anon roles, not as the superuser (who skips RLS).
\set ON_ERROR_STOP on
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000000f3'), ('00000000-0000-0000-0000-0000000000c9')
  on conflict do nothing;
create table if not exists public.stumpire_testers (user_id uuid primary key, role text not null default 'tester', note text);
insert into public.stumpire_testers (user_id, role) values ('00000000-0000-0000-0000-0000000000c9', 'admin')
  on conflict (user_id) do update set role = 'admin';
insert into public.stumpire_testers (user_id, role) values ('00000000-0000-0000-0000-0000000000f2', 'tester')
  on conflict (user_id) do update set role = 'tester';
delete from public.stumpire_testers where user_id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3');
insert into public.profiles (id, username) values
  ('00000000-0000-0000-0000-0000000000f1', 'pat_player'), ('00000000-0000-0000-0000-0000000000f2', 'tess_tester'),
  ('00000000-0000-0000-0000-0000000000f3', 'other_player'), ('00000000-0000-0000-0000-0000000000c9', 'the_owner')
  on conflict (id) do update set username = excluded.username;
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

-- a player sends three calls
set role authenticated;
insert into paths values
  ('a', pg_temp.clip('00000000-0000-0000-0000-0000000000f1', 'strike')),
  ('b', pg_temp.clip('00000000-0000-0000-0000-0000000000f1', 'ball')),
  ('c', pg_temp.clip('00000000-0000-0000-0000-0000000000f1', 'out'));
reset role;
create temporary table ids as select k, c.id from paths join shutdoor_ump_clips c on c.storage_path = paths.p;
grant select on ids to anon, authenticated;
-- an orphan (a file no row names, waiting for the purge)
insert into storage.objects (bucket_id, name, metadata) values ('shutdoor-ump-voices', '00000000-0000-0000-0000-0000000000f1/orphan.webm', '{"size": 1000}');

select pg_temp.claim(shutdoor_ump_is_reviewer('00000000-0000-0000-0000-0000000000f2') and shutdoor_ump_is_reviewer('00000000-0000-0000-0000-0000000000c9')
  and not shutdoor_ump_is_reviewer('00000000-0000-0000-0000-0000000000f1') and not shutdoor_ump_is_reviewer(null),
  'a reviewer is any tester row, the admin included; a player and nobody are not');
select pg_temp.claim(not shutdoor_ump_is_owner('00000000-0000-0000-0000-0000000000f2') and shutdoor_ump_is_owner('00000000-0000-0000-0000-0000000000c9'),
  'the owner is still the admin alone');

-- a normal signed in player (not the uploader): nothing
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000f3';
select pg_temp.claim(shutdoor_ump_reviewer() is null and not shutdoor_ump_owner(), 'a player is not a reviewer');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_queue('pending', 50)$$) = 'testers only', 'a player cannot read the queue');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_review((select id from ids where k = 'a'), 'approved')$$) = 'testers only', 'a player cannot approve');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_review((select id from ids where k = 'a'), 'rejected')$$) = 'testers only', 'a player cannot reject');
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 0, 'a player reads no pending file');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_is_reviewer(auth.uid())$$) is not null, 'a player cannot call the reviewer check directly');
-- the uploader still reads their own pending files, and only those
set test.uid = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.claim(shutdoor_ump_reviewer() is null, 'the uploader is not a reviewer');
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 3, 'the uploader reads their own three pending files, not the orphan');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_review((select id from ids where k = 'a'), 'approved')$$) = 'testers only', 'the uploader cannot approve their own');

-- signed out: nothing
reset role;
set role anon;
set test.uid = '';
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_reviewer()$$) is not null, 'signed out: the reviewer check is not callable');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_queue('pending', 50)$$) is not null, 'signed out: the queue is not callable');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_review((select id from ids where k = 'a'), 'approved')$$) is not null, 'signed out: the review is not callable');
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 0, 'signed out: no pending file');

-- a tester: the queue, the pending files, approve and reject, and the row says who
reset role;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000f2';
select pg_temp.claim(shutdoor_ump_reviewer() = 'tester' and not shutdoor_ump_owner(), 'a tester is a reviewer, not the owner');
select pg_temp.claim(json_array_length(shutdoor_ump_queue('pending', 50)) = 3, 'a tester lists the three pending calls');
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 3, 'a tester reads the pending files, so can play them');
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices' and name like '%orphan%') = 0, 'an orphan stays the owner''s alone');
select pg_temp.claim((shutdoor_ump_review((select id from ids where k = 'a'), 'approved')->>'status') = 'approved', 'a tester approves');
select pg_temp.claim((shutdoor_ump_review((select id from ids where k = 'b'), 'rejected')->>'status') = 'rejected', 'a tester rejects');
select pg_temp.claim((shutdoor_ump_queue('approved', 50)->0->>'reviewedBy') = 'tess_tester', 'the approved list says who approved it');
select pg_temp.claim((shutdoor_ump_queue('rejected', 50)->0->>'reviewedBy') = 'tess_tester'
  and (shutdoor_ump_queue('rejected', 50)->0->>'path') is null, 'the rejected list says who rejected it, and the audio is gone');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_review((select id from ids where k = 'b'), 'approved')$$) = 'that call''s audio was deleted',
  'a tester cannot bring a rejected call back (175 kept)');
reset role;
select pg_temp.claim((select reviewed_by = '00000000-0000-0000-0000-0000000000f2' and reviewed_at is not null from shutdoor_ump_clips where id = (select id from ids where k = 'a'))
  and (select reviewed_by = '00000000-0000-0000-0000-0000000000f2' from shutdoor_ump_clips where id = (select id from ids where k = 'b')),
  'reviewed_by is the tester on both');

-- the owner keeps everything: the queue, the orphan, approve, and their name on it
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c9';
select pg_temp.claim(shutdoor_ump_reviewer() = 'owner' and shutdoor_ump_owner(), 'the admin is the owner');
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices' and name like '%orphan%') = 1, 'the owner still reads an orphan');
select pg_temp.claim((shutdoor_ump_review((select id from ids where k = 'c'), 'approved')->>'status') = 'approved', 'the owner approves');
select pg_temp.claim((select string_agg(e->>'reviewedBy', ',' order by e->>'reviewedBy') from json_array_elements(shutdoor_ump_queue('approved', 50)) e) = 'tess_tester,the_owner',
  'the approved list names each reviewer');

-- a tester taken off the list loses it at once
reset role;
delete from public.stumpire_testers where user_id = '00000000-0000-0000-0000-0000000000f2';
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000f2';
select pg_temp.claim(shutdoor_ump_reviewer() is null and pg_temp.err($$select shutdoor_ump_queue('pending', 50)$$) = 'testers only',
  'a tester taken off the list is a player again');
reset role;
insert into public.stumpire_testers (user_id, role) values ('00000000-0000-0000-0000-0000000000f2', 'tester') on conflict do nothing;

reset test.uid;
delete from storage.objects where bucket_id = 'shutdoor-ump-voices';
delete from public.shutdoor_ump_clips;
