-- ---------------------------------------------------------------------------
-- 177_shut_the_door_ump_shortlist.sql : a tester's Approve is a shortlist; only the owner puts a call in the game.
--
-- The owner (2026-11-17): a tester's Approve becomes a shortlist. The owner hears
-- each shortlisted call in the game's own ump mix, then puts it in the game or
-- rejects it. Only the owner's tap makes a clip live. Testers can approve
-- anything, their own clips included.
--
-- THE STATUSES (shutdoor_ump_clips.status):
--   pending      new.
--   shortlisted  a tester (or the owner) approved it. Not in the game.
--   approved     live: the only status the game plays (shutdoor_ump_approved,
--                unchanged). The name stays, so the game's read keeps its meaning.
--   rejected     unchanged: its file goes (175) and it cannot come back.
--
-- WHO DOES WHAT (shutdoor_ump_review, every call checks the caller again):
--   A tester (any stumpire_testers row, 176) shortlists a pending call, or rejects
--   a pending or shortlisted one, or puts a shortlisted one back to pending. A
--   tester's 'approved' is taken as 'shortlisted': that is the owner's ruling, and
--   it keeps the page from before this file working (its Approve button sends
--   'approved') in the gap between this SQL and the site PR. A tester never sets
--   'approved', and never changes a live call.
--   The owner (the 'admin' row, 165) puts a pending or shortlisted call in the
--   game ('approved'), takes a live one out by moving it back to 'shortlisted'
--   (the file stays, so it can go back in), or rejects anything.
--
-- WHO DECIDED (new columns; reviewed_by and reviewed_at keep meaning the last decider):
--   shortlisted_by, shortlisted_at   who shortlisted it, and when
--   live_by, live_at                 who put it in the game, and when
--   Rows already approved before this file were put live by their reviewer, so
--   live_by and live_at are filled from reviewed_by and reviewed_at. Their status
--   does not move: they stay live.
--
-- THE READ POLICY (shutdoor_ump_can_read, behind the bucket's read policy):
--   approved anyone; pending its uploader or a reviewer; shortlisted a reviewer;
--   anything else (an orphan waiting for the purge) the owner.
--
-- ALSO: shutdoor_ump_queue lists 'shortlisted' and names both deciders;
-- shutdoor_ump_counts() gives a reviewer the waiting counts (the owner's
-- settings row says "3 shortlisted for you."); a player still sees their own
-- shortlisted calls as waiting (the record sheet's "calls wait for review").
--
-- Safe to run more than once. Needs 165, 175 and 176 before it (it replaces
-- 176's queue, review and read). Running 165, 175 or 176 again after this puts
-- the older versions back, so run this one again after any of them. Run it
-- BEFORE the site PR merges: the page before it keeps working (a tester's
-- Approve shortlists), and the new page needs the 'shortlisted' list.
-- ---------------------------------------------------------------------------

begin;

/* the status, with 'shortlisted' */
alter table public.shutdoor_ump_clips drop constraint if exists shutdoor_ump_clips_status_ck;
alter table public.shutdoor_ump_clips add constraint shutdoor_ump_clips_status_ck
  check (status in ('pending', 'shortlisted', 'approved', 'rejected'));

/* the two deciders */
alter table public.shutdoor_ump_clips add column if not exists shortlisted_by uuid;
alter table public.shutdoor_ump_clips add column if not exists shortlisted_at timestamptz;
alter table public.shutdoor_ump_clips add column if not exists live_by uuid;
alter table public.shutdoor_ump_clips add column if not exists live_at timestamptz;

/* a row already approved was put live by whoever approved it. Its status stays. */
update public.shutdoor_ump_clips
   set live_by = reviewed_by, live_at = coalesce(reviewed_at, created_at)
 where status = 'approved' and live_at is null;

/* an insert never names a decider. A second before insert trigger, after 165's
   (triggers fire in name order), so 165 stays as it is. */
create or replace function public.shutdoor_ump_before_insert_deciders() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.shortlisted_by := null; new.shortlisted_at := null;
  new.live_by := null; new.live_at := null;
  return new;
end $$;
drop trigger if exists shutdoor_ump_clips_before_insert_deciders on public.shutdoor_ump_clips;
create trigger shutdoor_ump_clips_before_insert_deciders before insert on public.shutdoor_ump_clips
  for each row execute function public.shutdoor_ump_before_insert_deciders();

/* a player sees their own calls still waiting: pending or shortlisted */
drop policy if exists shutdoor_ump_clips_mine on public.shutdoor_ump_clips;
create policy shutdoor_ump_clips_mine on public.shutdoor_ump_clips for select to authenticated
  using (user_id = auth.uid() and status in ('pending', 'shortlisted'));

/* a read: approved, anyone; pending, its uploader or a reviewer; shortlisted, a
   reviewer; anything else, the owner */
create or replace function public.shutdoor_ump_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from shutdoor_ump_clips c where c.storage_path = p_name
                   and (c.status = 'approved'
                        or (c.status = 'pending' and (c.user_id = auth.uid() or shutdoor_ump_is_reviewer(auth.uid())))
                        or (c.status = 'shortlisted' and shutdoor_ump_is_reviewer(auth.uid()))))
      or shutdoor_ump_is_owner(auth.uid())
$$;

/* the reviewers' lists: pending (only rows whose file landed), shortlisted,
   approved (live) or rejected. As 176, plus who shortlisted it and who put it live. */
create or replace function public.shutdoor_ump_queue(p_status text default 'pending', p_limit integer default 100) returns json
language plpgsql stable security definer set search_path = public as $$
declare out json;
begin
  if not shutdoor_ump_is_reviewer(auth.uid()) then raise exception 'testers only'; end if;
  if p_status not in ('pending', 'shortlisted', 'approved', 'rejected') then raise exception 'unknown list'; end if;
  select coalesce(json_agg(json_build_object(
           'id', c.id, 'line', c.line_id, 'status', c.status, 'path', c.storage_path, 'credit', c.credit,
           'username', p.username, 'mime', c.mime, 'bytes', c.bytes, 'ms', c.duration_ms,
           'consentVersion', c.consent_version, 'createdAt', c.created_at, 'reviewedAt', c.reviewed_at,
           'reviewedBy', r.username, 'shortlistedBy', s.username, 'shortlistedAt', c.shortlisted_at,
           'liveBy', l.username, 'liveAt', c.live_at)
         order by c.created_at), '[]'::json)
    into out
    from (select * from shutdoor_ump_clips x
           where x.status = p_status
             and (p_status <> 'pending' or exists (select 1 from storage.objects o
                    where o.bucket_id = 'shutdoor-ump-voices' and o.name = x.storage_path))
           order by case when p_status in ('pending', 'shortlisted') then x.created_at end asc,
                    x.reviewed_at desc nulls last
           limit greatest(1, least(coalesce(p_limit, 100), 500))) c
    left join profiles p on p.id = c.user_id
    left join profiles r on r.id = c.reviewed_by
    left join profiles s on s.id = c.shortlisted_by
    left join profiles l on l.id = c.live_by;
  return out;
end $$;

/* the decisions. A reviewer; the owner alone sets 'approved' (live) or touches a
   live call. As 175: a rejected call has lost its file and stays rejected. */
create or replace function public.shutdoor_ump_review(p_id uuid, p_status text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); own boolean; r shutdoor_ump_clips; st text := p_status;
begin
  if not shutdoor_ump_is_reviewer(uid) then raise exception 'testers only'; end if;
  if st not in ('pending', 'shortlisted', 'approved', 'rejected') then raise exception 'unknown status'; end if;
  own := shutdoor_ump_is_owner(uid);
  /* a tester's Approve is a shortlist (the page before 177 sends 'approved') */
  if st = 'approved' and not own then st := 'shortlisted'; end if;
  select * into r from shutdoor_ump_clips where id = p_id for update;
  if r.id is null then raise exception 'no such clip'; end if;
  if r.storage_path is null and st <> 'rejected' then raise exception 'that call''s audio was deleted'; end if;
  if r.status = 'approved' and not own then raise exception 'only the owner changes a call in the game'; end if;
  update shutdoor_ump_clips
     set status = st,
         reviewed_at = case when st = 'pending' then null else now() end,
         reviewed_by = case when st = 'pending' then null else uid end,
         shortlisted_by = case when st = 'pending' then null
                               when st = 'shortlisted' and r.status = 'pending' then uid
                               when st = 'shortlisted' then coalesce(r.shortlisted_by, uid)
                               else r.shortlisted_by end,
         shortlisted_at = case when st = 'pending' then null
                               when st = 'shortlisted' and r.status = 'pending' then now()
                               when st = 'shortlisted' then coalesce(r.shortlisted_at, now())
                               else r.shortlisted_at end,
         live_by = case when st = 'approved' and r.status = 'approved' then r.live_by
                        when st = 'approved' then uid
                        when st in ('pending', 'shortlisted') then null
                        else r.live_by end,
         live_at = case when st = 'approved' and r.status = 'approved' then r.live_at
                        when st = 'approved' then now()
                        when st in ('pending', 'shortlisted') then null
                        else r.live_at end
   where id = p_id
   returning * into r;
  return json_build_object('id', r.id, 'line', r.line_id, 'status', r.status, 'reviewedAt', r.reviewed_at);
end $$;

/* a reviewer's waiting counts: {"pending": n, "shortlisted": n}; null for anyone else */
create or replace function public.shutdoor_ump_counts() returns json
language sql stable security definer set search_path = public as $$
  select case when shutdoor_ump_is_reviewer(auth.uid()) then json_build_object(
    'pending', (select count(*) from shutdoor_ump_clips x where x.status = 'pending'
                  and exists (select 1 from storage.objects o where o.bucket_id = 'shutdoor-ump-voices' and o.name = x.storage_path)),
    'shortlisted', (select count(*) from shutdoor_ump_clips where status = 'shortlisted')) end
$$;

revoke all on function public.shutdoor_ump_before_insert_deciders() from public, anon, authenticated;
revoke all on function public.shutdoor_ump_queue(text, integer) from public, anon;
revoke all on function public.shutdoor_ump_review(uuid, text) from public, anon;
revoke all on function public.shutdoor_ump_counts() from public, anon;
grant execute on function public.shutdoor_ump_can_read(text) to anon, authenticated;
grant execute on function public.shutdoor_ump_queue(text, integer) to authenticated;
grant execute on function public.shutdoor_ump_review(uuid, text) to authenticated;
grant execute on function public.shutdoor_ump_counts() to authenticated;

commit;
