-- ---------------------------------------------------------------------------
-- 175_shut_the_door_ump_purge.sql : a deleted or rejected ump call loses its audio file.
--
-- Safe to run more than once. Needs 165 (shutdoor_ump_clips and the bucket
-- shutdoor-ump-voices). Run it BEFORE the site PR merges: the purge job the PR
-- adds (.github/workflows/shut-the-door-ump-purge.yml) calls the function
-- below, and fails loudly until it exists.
--
-- THE GAP (QA, 2026-11-16). A clip row goes when its account goes (user_id
-- cascades from auth.users, 65's rtg_delete_my_account), but its file in the
-- bucket stayed. A rejected clip only changed its status, and its file stayed
-- too. Both left a player's voice on disk with nothing pointing at it.
--
-- WHY NOT A TRIGGER THAT DELETES FROM storage.objects. Supabase says to treat
-- the storage tables as read only from SQL: a delete there removes the row and
-- leaves the file in the backing store, orphaned, and newer Supabase projects
-- refuse the delete outright (a statement trigger on the storage tables, unless
-- storage.allow_delete_query is set, which only the Storage API sets). Only
-- the Storage API removes the file. A trigger calling that API through pg_net
-- would need the service role key stored in the database, and a failed call
-- would never be retried.
--
-- SO: THE ROW SAYS WHICH FILES MAY LIVE, AND A JOB REMOVES THE REST.
--   1. A file may live only while a row names it. A deleted row (for any
--      reason, the account cascade included) names nothing. A rejected row
--      names nothing either: rejecting a clip nulls its storage_path, here in
--      the row, by a trigger, so any path to 'rejected' does it. The row stays
--      with its status, so the owner's Rejected list still shows the call.
--   2. shutdoor_ump_orphans() lists every object in the bucket that no row
--      names. Service role only.
--   3. shut-the-door/ump-purge.mjs, hourly in GitHub Actions with the service
--      role, deletes those through the Storage API (DELETE
--      /storage/v1/object/shutdoor-ump-voices) and asks again: anything still
--      listed fails the run. A missed hour is caught the next hour, because the
--      list is worked out fresh each time.
--   Nothing new is readable meanwhile: 165's read policy needs an approved row,
--   the uploader's own pending row or the owner, so an orphan is the owner's
--   alone until it goes.
--
-- A REJECTED CLIP CANNOT COME BACK. Its file is gone, so approving it or
-- putting it back to pending is refused. The check below holds it: rejected
-- if and only if there is no path. It is added NOT VALID, because rejected
-- rows from before this still carry their path; the one-off backfill nulls
-- those and validates it (and this file validates it itself once none are left).
-- ---------------------------------------------------------------------------

begin;

alter table public.shutdoor_ump_clips alter column storage_path drop not null;

/* every update: rejected drops the path; a row with no path stays rejected */
create or replace function public.shutdoor_ump_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'rejected' then
    new.storage_path := null;
  elsif old.storage_path is null then
    raise exception 'that call''s audio was deleted';
  end if;
  return new;
end $$;

drop trigger if exists shutdoor_ump_clips_before_update on public.shutdoor_ump_clips;
create trigger shutdoor_ump_clips_before_update before update on public.shutdoor_ump_clips
  for each row execute function public.shutdoor_ump_before_update();

alter table public.shutdoor_ump_clips drop constraint if exists shutdoor_ump_clips_rejected_ck;
alter table public.shutdoor_ump_clips add constraint shutdoor_ump_clips_rejected_ck
  check ((status = 'rejected') = (storage_path is null)) not valid;
do $$ begin
  if not exists (select 1 from public.shutdoor_ump_clips where status = 'rejected' and storage_path is not null) then
    alter table public.shutdoor_ump_clips validate constraint shutdoor_ump_clips_rejected_ck;
  end if;
end $$;

/* approve or reject (or put back to pending). Owner only. As 165, plus: a
   rejected clip has lost its file, so it stays rejected. */
create or replace function public.shutdoor_ump_review(p_id uuid, p_status text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r shutdoor_ump_clips;
begin
  if not shutdoor_ump_is_owner(uid) then raise exception 'owner only'; end if;
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'unknown status'; end if;
  select * into r from shutdoor_ump_clips where id = p_id for update;
  if r.id is null then raise exception 'no such clip'; end if;
  if r.storage_path is null and p_status <> 'rejected' then raise exception 'that call''s audio was deleted'; end if;
  update shutdoor_ump_clips
     set status = p_status,
         reviewed_at = case when p_status = 'pending' then null else now() end,
         reviewed_by = case when p_status = 'pending' then null else uid end
   where id = p_id
   returning * into r;
  return json_build_object('id', r.id, 'line', r.line_id, 'status', r.status, 'reviewedAt', r.reviewed_at);
end $$;

/* every file in the bucket that no row names, oldest first: ["<uid>/<clip id>.<ext>", ...] */
create or replace function public.shutdoor_ump_orphans(p_limit integer default 1000) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(o.name order by o.created_at, o.name), '[]'::json)
    from (select x.name, x.created_at from storage.objects x
           where x.bucket_id = 'shutdoor-ump-voices'
             and not exists (select 1 from shutdoor_ump_clips c where c.storage_path = x.name)
           order by x.created_at, x.name
           limit greatest(1, least(coalesce(p_limit, 1000), 1000))) o
$$;

revoke all on function public.shutdoor_ump_before_update() from public, anon, authenticated;
revoke all on function public.shutdoor_ump_review(uuid, text) from public, anon;
grant execute on function public.shutdoor_ump_review(uuid, text) to authenticated;
revoke all on function public.shutdoor_ump_orphans(integer) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.shutdoor_ump_orphans(integer) to service_role';
  end if;
end $$;

commit;
