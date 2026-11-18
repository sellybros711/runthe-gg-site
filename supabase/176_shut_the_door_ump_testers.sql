-- ---------------------------------------------------------------------------
-- 176_shut_the_door_ump_testers.sql : testers review the ump calls too.
--
-- The owner (2026-11-17): "Can we let testers view clips and make decisions on
-- a page in their settings in the game? Only testers."
--
-- WHO IS A TESTER: any row in stumpire_testers (133), role 'tester' or 'admin'.
-- It is the one list every tester-only feature reads: Stumpire, Arcade Lab,
-- Last Shot (functions/_lastshot/gate.js ROLES) and Sky World
-- (functions/_skyworld/db.js). Read directly, never through stumpire_access(),
-- which follows Stumpire's own mode switch. The owner is still the 'admin' row
-- (shutdoor_ump_is_owner, 165), unchanged.
--
-- WHAT CHANGES (everything else in 165 and 175 stays):
--   shutdoor_ump_is_reviewer(uid)  new: true for any tester (admin included).
--   shutdoor_ump_reviewer()        new: the page's question, 'owner', 'tester' or null.
--   shutdoor_ump_queue()           a reviewer, not only the owner; each row also
--                                  carries reviewedBy, the username of who decided.
--   shutdoor_ump_review()          a reviewer, not only the owner (175's rules kept:
--                                  a rejected call has lost its file and stays rejected).
--   shutdoor_ump_can_read()        a reviewer reads a PENDING file, so testers can
--                                  play the queue. A file no row names (an orphan
--                                  waiting for the purge) stays the owner's alone.
-- Never anon, never a player who is not on the list: every function checks the
-- caller again, and the grants keep anon out.
--
-- Safe to run more than once. Needs 165 and 175 before it (it replaces 175's
-- shutdoor_ump_review). Running 165 or 175 again after this puts the owner
-- only versions back, so run this one again after either. Run it BEFORE the
-- site PR merges: the page asks shutdoor_ump_reviewer() to show the settings
-- row, and without it a tester sees no row (the owner still does, through 165's
-- shutdoor_ump_owner()).
-- ---------------------------------------------------------------------------

begin;

/* a tester: any stumpire_testers row (133). plpgsql, so it is created without
   133 and answers false until that table exists */
create or replace function public.shutdoor_ump_is_reviewer(p_uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_uid is null then return false; end if;
  return exists (select 1 from stumpire_testers t where t.user_id = p_uid and t.role in ('tester', 'admin'));
exception when undefined_table then
  return false;
end $$;

/* the page's question: 'owner' (the admin), 'tester', or null for everyone else */
create or replace function public.shutdoor_ump_reviewer() returns text
language sql stable security definer set search_path = public as $$
  select case when shutdoor_ump_is_owner(auth.uid()) then 'owner'
              when shutdoor_ump_is_reviewer(auth.uid()) then 'tester' end
$$;

/* a read: approved; a pending file, by its uploader or a reviewer; anything else, the owner */
create or replace function public.shutdoor_ump_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from shutdoor_ump_clips c where c.storage_path = p_name
                   and (c.status = 'approved'
                        or (c.status = 'pending' and (c.user_id = auth.uid() or shutdoor_ump_is_reviewer(auth.uid())))))
      or shutdoor_ump_is_owner(auth.uid())
$$;

/* the reviewers' lists: pending (only rows whose file landed), approved or rejected.
   As 165, plus reviewedBy: the username of who approved or rejected it. */
create or replace function public.shutdoor_ump_queue(p_status text default 'pending', p_limit integer default 100) returns json
language plpgsql stable security definer set search_path = public as $$
declare out json;
begin
  if not shutdoor_ump_is_reviewer(auth.uid()) then raise exception 'testers only'; end if;
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'unknown list'; end if;
  select coalesce(json_agg(json_build_object(
           'id', c.id, 'line', c.line_id, 'status', c.status, 'path', c.storage_path, 'credit', c.credit,
           'username', p.username, 'mime', c.mime, 'bytes', c.bytes, 'ms', c.duration_ms,
           'consentVersion', c.consent_version, 'createdAt', c.created_at, 'reviewedAt', c.reviewed_at,
           'reviewedBy', r.username)
         order by c.created_at), '[]'::json)
    into out
    from (select * from shutdoor_ump_clips x
           where x.status = p_status
             and (p_status <> 'pending' or exists (select 1 from storage.objects o
                    where o.bucket_id = 'shutdoor-ump-voices' and o.name = x.storage_path))
           order by case when p_status = 'pending' then x.created_at end asc,
                    x.reviewed_at desc nulls last
           limit greatest(1, least(coalesce(p_limit, 100), 500))) c
    left join profiles p on p.id = c.user_id
    left join profiles r on r.id = c.reviewed_by;
  return out;
end $$;

/* approve or reject (or put back to pending). A reviewer. As 175: a rejected
   clip has lost its file, so it stays rejected. reviewed_by is the caller. */
create or replace function public.shutdoor_ump_review(p_id uuid, p_status text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r shutdoor_ump_clips;
begin
  if not shutdoor_ump_is_reviewer(uid) then raise exception 'testers only'; end if;
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

revoke all on function public.shutdoor_ump_is_reviewer(uuid) from public, anon, authenticated;
revoke all on function public.shutdoor_ump_reviewer() from public, anon;
revoke all on function public.shutdoor_ump_queue(text, integer) from public, anon;
revoke all on function public.shutdoor_ump_review(uuid, text) from public, anon;
grant execute on function public.shutdoor_ump_reviewer() to authenticated;
grant execute on function public.shutdoor_ump_can_read(text) to anon, authenticated;
grant execute on function public.shutdoor_ump_queue(text, integer) to authenticated;
grant execute on function public.shutdoor_ump_review(uuid, text) to authenticated;

commit;
