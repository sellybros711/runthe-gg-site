-- Shut The Door's ump shortlist (177): a tester shortlists, only the owner puts a call in the game.
-- Chain, after 176 and its test:
--   psql -d std -f supabase/177_shut_the_door_ump_shortlist.sql   (twice: it is safe to rerun)
--   psql -d std -f supabase/test/shut_the_door_ump_shortlist_test.sql
-- The test seeds a call approved the way 176 wrote it, then runs 177 twice more itself (\ir), so
-- "a call approved before 177 stays live" is checked against a real upgrade.
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

-- BEFORE 177 (the database as 176 leaves it, which the CI chain has just built): a call the
-- owner approved, live in the game. Built here by hand, the way 176's review wrote it.
set role authenticated;
insert into paths values ('old', pg_temp.clip('00000000-0000-0000-0000-0000000000f1', 'safe'));
reset role;
update shutdoor_ump_clips set status = 'approved', reviewed_at = now() - interval '2 days',
       reviewed_by = '00000000-0000-0000-0000-0000000000c9'
 where storage_path = (select p from paths where k = 'old');

-- 177, twice: it is safe to rerun
\ir ../177_shut_the_door_ump_shortlist.sql
\ir ../177_shut_the_door_ump_shortlist.sql

select pg_temp.claim((select status = 'approved' and live_by = '00000000-0000-0000-0000-0000000000c9' and live_at = reviewed_at
                        and shortlisted_by is null from shutdoor_ump_clips where storage_path = (select p from paths where k = 'old')),
  'a call approved before 177 stays approved (live), put live by its reviewer');
select pg_temp.claim(json_array_length(shutdoor_ump_approved()) = 1, 'the game still plays the call approved before 177');
select pg_temp.claim(pg_temp.err($$update shutdoor_ump_clips set status = 'live' where storage_path = (select p from paths where k = 'old')$$) like '%status_ck%',
  'the status check knows only the four statuses');

-- a player sends four calls, and the tester sends one of their own
set role authenticated;
insert into paths values
  ('a', pg_temp.clip('00000000-0000-0000-0000-0000000000f1', 'strike')),
  ('b', pg_temp.clip('00000000-0000-0000-0000-0000000000f1', 'ball')),
  ('c', pg_temp.clip('00000000-0000-0000-0000-0000000000f1', 'out')),
  ('d', pg_temp.clip('00000000-0000-0000-0000-0000000000f1', 'foul')),
  ('t', pg_temp.clip('00000000-0000-0000-0000-0000000000f2', 'time'));
reset role;
create temporary table ids as select k, c.id from paths join shutdoor_ump_clips c on c.storage_path = paths.p;
grant select on ids to anon, authenticated;
select pg_temp.claim((select count(*) from shutdoor_ump_clips where shortlisted_by is not null or live_by is not null or shortlisted_at is not null or live_at is not null) = 1,
  'a new call names no decider, whatever the insert sent (only the old live call has one)');

-- a tester: shortlists (Approve), shortlists their own, cannot set approved, cannot touch a live call
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000f2';
select pg_temp.claim((shutdoor_ump_counts()->>'pending')::int = 5 and (shutdoor_ump_counts()->>'shortlisted')::int = 0, 'a tester reads the counts: 5 waiting, none shortlisted');
select pg_temp.claim((shutdoor_ump_review((select id from ids where k = 'a'), 'shortlisted')->>'status') = 'shortlisted', 'a tester shortlists');
select pg_temp.claim((shutdoor_ump_review((select id from ids where k = 'b'), 'approved')->>'status') = 'shortlisted',
  'a tester''s approved is a shortlist (the page before 177 sends approved): a tester cannot set approved');
select pg_temp.claim((shutdoor_ump_review((select id from ids where k = 't'), 'shortlisted')->>'status') = 'shortlisted', 'a tester shortlists their own call (no block)');
select pg_temp.claim(json_array_length(shutdoor_ump_queue('shortlisted', 50)) = 3, 'the shortlisted list holds the three');
select pg_temp.claim((select bool_and(e->>'shortlistedBy' = 'tess_tester' and e->>'shortlistedAt' is not null and e->>'liveBy' is null)
                        from json_array_elements(shutdoor_ump_queue('shortlisted', 50)) e), 'the shortlisted list says who shortlisted each, and none is live');
select pg_temp.claim(json_array_length(shutdoor_ump_queue('pending', 50)) = 2, 'two calls still wait');
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 6,
  'a tester reads every file: the pending, the shortlisted, the live one');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_review((select id from ids where k = 'old'), 'rejected')$$) = 'only the owner changes a call in the game',
  'a tester cannot reject a live call');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_review((select id from ids where k = 'old'), 'shortlisted')$$) = 'only the owner changes a call in the game',
  'a tester cannot take a live call out');
select pg_temp.claim((shutdoor_ump_review((select id from ids where k = 'c'), 'rejected')->>'status') = 'rejected', 'a tester still rejects');
reset role;
select pg_temp.claim((select status = 'shortlisted' and live_by is null and live_at is null from shutdoor_ump_clips where id = (select id from ids where k = 'b')),
  'in the table too, the tester''s approve left it shortlisted');

-- the game's list leaves the shortlisted calls out
set role anon;
set test.uid = '';
select pg_temp.claim((select string_agg(e->>'line', ',') from json_array_elements(shutdoor_ump_approved()) e) = 'safe',
  'the game''s approved list is the live call alone, no shortlisted one');
-- the read policy: a player reads only approved files (and their own pending), never a shortlisted one
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 1, 'signed out: the live file alone');
reset role;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000f3';
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 1, 'a player: the live file alone, no shortlisted one');
select pg_temp.claim(shutdoor_ump_counts() is null, 'a player gets no counts');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_queue('shortlisted', 50)$$) = 'testers only', 'a player cannot list the shortlist');
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_review((select id from ids where k = 'a'), 'approved')$$) = 'testers only', 'a player cannot put a call in the game');
set test.uid = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices') = 2,
  'the uploader: the live file and their own pending one, not their shortlisted ones');
select pg_temp.claim((select count(*) from shutdoor_ump_clips) = 3, 'the uploader sees their own calls still waiting: one pending, two shortlisted');
reset role;
set role anon;
select pg_temp.claim(pg_temp.err($$select shutdoor_ump_counts()$$) is not null, 'signed out: the counts are not callable');
reset role;

-- the owner: hears the shortlist, puts one in, puts a pending one straight in, takes a live one out
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c9';
select pg_temp.claim((shutdoor_ump_counts()->>'shortlisted')::int = 3, 'the owner''s count: 3 shortlisted');
select pg_temp.claim((select count(*) from storage.objects where bucket_id = 'shutdoor-ump-voices' and name in (select p from paths where k in ('a', 'b', 't'))) = 3,
  'the owner reads the shortlisted files');
select pg_temp.claim((shutdoor_ump_review((select id from ids where k = 'a'), 'approved')->>'status') = 'approved', 'the owner puts a shortlisted call in the game');
select pg_temp.claim((shutdoor_ump_review((select id from ids where k = 'd'), 'approved')->>'status') = 'approved', 'the owner puts a pending call straight in');
select pg_temp.claim((select e->>'shortlistedBy' = 'tess_tester' and e->>'liveBy' = 'the_owner' and e->>'liveAt' is not null
                        from json_array_elements(shutdoor_ump_queue('approved', 50)) e where e->>'line' = 'strike'),
  'the live list names both deciders: shortlisted by the tester, put in the game by the owner');
select pg_temp.claim((select e->>'shortlistedBy' is null and e->>'liveBy' = 'the_owner'
                        from json_array_elements(shutdoor_ump_queue('approved', 50)) e where e->>'line' = 'foul'),
  'straight in from waiting: no shortlister, put in by the owner');
select pg_temp.claim((shutdoor_ump_review((select id from ids where k = 'a'), 'shortlisted')->>'status') = 'shortlisted', 'the owner takes a live call out, back to the shortlist');
select pg_temp.claim((select e->>'shortlistedBy' = 'tess_tester' and e->>'liveBy' is null
                        from json_array_elements(shutdoor_ump_queue('shortlisted', 50)) e where e->>'line' = 'strike'),
  'taken out: it keeps its shortlister, and is no longer live');
select pg_temp.claim((shutdoor_ump_review((select id from ids where k = 'a'), 'approved')->>'status') = 'approved', 'and back in');
select pg_temp.claim((shutdoor_ump_review((select id from ids where k = 't'), 'rejected')->>'status') = 'rejected', 'the owner rejects a shortlisted call');
reset role;
select pg_temp.claim((select reviewed_by = '00000000-0000-0000-0000-0000000000c9' and shortlisted_by = '00000000-0000-0000-0000-0000000000f2'
                        and live_by = '00000000-0000-0000-0000-0000000000c9' from shutdoor_ump_clips where id = (select id from ids where k = 'a')),
  'reviewed_by is the last decider; shortlisted_by and live_by each keep theirs');
select pg_temp.claim((select string_agg(e->>'line', ',' order by e->>'line') from json_array_elements(shutdoor_ump_approved()) e) = 'foul,safe,strike',
  'the game plays the three live calls, and still no shortlisted one');
select pg_temp.claim((select count(*) from shutdoor_ump_clips where status = 'rejected' and storage_path is not null) = 0, 'a rejected call still loses its path (175)');

reset test.uid;
delete from storage.objects where bucket_id = 'shutdoor-ump-voices';
delete from public.shutdoor_ump_clips;
