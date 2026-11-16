-- ---------------------------------------------------------------------------
-- shut_the_door_ump_backfill.sql : one off, after 175. The ump calls already orphaned.
--
-- Run in Supabase, SQL Editor, New query, AFTER 175 and before or after the site
-- PR merges. Safe to run more than once: the second run finds nothing to change.
--
-- 1 counts. 2 drops the path of every clip rejected before 175 (175's trigger
-- would on any later update; this does it now) and validates 175's check. The
-- files themselves can only go through the Storage API, so 3 is the purge job:
-- GitHub, Actions, "Shut The Door ump purge", Run workflow. 4 confirms.
-- ---------------------------------------------------------------------------

-- 1. how many, before anything changes
select
  (select count(*) from storage.objects o
    where o.bucket_id = 'shutdoor-ump-voices'
      and not exists (select 1 from public.shutdoor_ump_clips c where c.storage_path = o.name)) as files_with_no_row,
  (select count(*) from public.shutdoor_ump_clips c
    where c.status = 'rejected' and c.storage_path is not null
      and exists (select 1 from storage.objects o where o.bucket_id = 'shutdoor-ump-voices' and o.name = c.storage_path)) as rejected_with_file,
  (select count(*) from public.shutdoor_ump_clips where status = 'rejected' and storage_path is not null) as rejected_with_path;

-- 2. a rejected clip names no file; then 175's check holds for every row
begin;
update public.shutdoor_ump_clips set storage_path = null where status = 'rejected' and storage_path is not null;
alter table public.shutdoor_ump_clips validate constraint shutdoor_ump_clips_rejected_ck;
commit;

-- 3. run the purge job (Actions, "Shut The Door ump purge", Run workflow). It deletes
--    every file step 1 counted, through the Storage API.

-- 4. after the job: all three are 0, and the check is validated
select
  json_array_length(public.shutdoor_ump_orphans(1000)) as files_with_no_row,
  (select count(*) from public.shutdoor_ump_clips where status = 'rejected' and storage_path is not null) as rejected_with_path,
  (select convalidated from pg_constraint where conname = 'shutdoor_ump_clips_rejected_ck') as check_validated;
