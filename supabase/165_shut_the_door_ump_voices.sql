-- ---------------------------------------------------------------------------
-- 165_shut_the_door_ump_voices.sql : the voice of the ump.
--
-- Players record or upload an umpire's call ("Strike!", "Yer out!"), the owner
-- listens and approves or rejects it, and the game plays a random approved
-- clip for that call. One table, one PRIVATE storage bucket, five functions.
--
-- WHO IS THE OWNER: a row in stumpire_testers with role 'admin' (133), the
-- one list every tester-only page reads (Stumpire, Arcade Lab, Last Shot, Sky
-- World). Read directly, never through stumpire_access(), which follows
-- Stumpire's own mode switch. Without 133 nobody is the owner.
--
-- WHAT A PLAYER CAN DO (RLS): insert their own clip (a trigger sets the id,
-- the owner, the status, the path and checks the consent, the line, the type,
-- the size and the 40 pending limit), and read only their own pending rows.
-- Nobody updates or deletes a row except through shutdoor_ump_review(), which
-- checks the owner. Anyone lists the approved ones through shutdoor_ump_approved()
-- (no user ids in it).
--
-- THE BUCKET (shutdoor-ump-voices, private, 300 KB, audio types only): a
-- signed-in player uploads only to <their id>/<clip id>.<ext>, and only for a
-- pending row of their own that has no file yet. An object is readable only
-- when its row is approved, by the owner, or by its own uploader while it is
-- pending (storage's upload reads the new row back).
--
-- Safe to run more than once. Needs nothing before it except Supabase's auth
-- and storage schemas. Run it BEFORE the site PR merges: until it runs, the
-- page's record sheet says it could not save, and the game stays silent.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.shutdoor_ump_clips (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  line_id         text not null,
  status          text not null default 'pending',
  consent_text    text not null,
  consent_version integer not null,
  credit          text,
  storage_path    text not null,
  mime            text not null,
  bytes           integer not null,
  duration_ms     integer not null,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz,
  reviewed_by     uuid,
  constraint shutdoor_ump_clips_status_ck check (status in ('pending', 'approved', 'rejected')),
  constraint shutdoor_ump_clips_bytes_ck check (bytes between 1 and 307200),
  constraint shutdoor_ump_clips_ms_ck check (duration_ms between 1 and 3000),
  constraint shutdoor_ump_clips_credit_ck check (credit is null or char_length(credit) <= 30),
  constraint shutdoor_ump_clips_path_uq unique (storage_path)
);
create index if not exists shutdoor_ump_clips_status on public.shutdoor_ump_clips (status, line_id);
create index if not exists shutdoor_ump_clips_user on public.shutdoor_ump_clips (user_id, status);

/* the script, in the order the page reads it */
create or replace function public.shutdoor_ump_lines() returns text[]
language sql immutable as $$
  select array['strike', 'strike3', 'ball', 'ball4', 'out', 'yer_out', 'safe', 'foul', 'time', 'play_ball',
               'steerike', 'thats_a_strike']
$$;

/* the consent a player ticks, word for word, by version. The page sends the
   text and the version; a row stores both. A new wording is a new version. */
create or replace function public.shutdoor_ump_consent(p_version integer) returns text
language sql immutable as $$
  select case p_version
    when 1 then 'I recorded this myself. I''m 18 or older. I give Run The Games permission to use, edit and play this recording in its games, for free and forever.'
  end
$$;

create or replace function public.shutdoor_ump_mimes() returns text[]
language sql immutable as $$
  select array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/x-m4a']
$$;

create or replace function public.shutdoor_ump_ext(p_mime text) returns text
language sql immutable as $$
  select case p_mime
    when 'audio/webm' then '.webm' when 'audio/ogg' then '.ogg' when 'audio/mp4' then '.m4a'
    when 'audio/x-m4a' then '.m4a' when 'audio/mpeg' then '.mp3' when 'audio/aac' then '.aac'
    else '.wav' end
$$;

/* the owner: stumpire_testers role 'admin' (133). plpgsql, so it is created
   without 133 and answers false until that table exists */
create or replace function public.shutdoor_ump_is_owner(p_uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_uid is null then return false; end if;
  return exists (select 1 from stumpire_testers t where t.user_id = p_uid and t.role = 'admin');
exception when undefined_table then
  return false;
end $$;

/* every insert: whatever the page sent, the row is the caller's, pending, at
   its own path, with the current consent word for word */
create or replace function public.shutdoor_ump_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n integer;
begin
  if uid is null then raise exception 'sign in first'; end if;
  perform pg_advisory_xact_lock(hashtext('shutdoor_ump:' || uid::text));
  new.id := gen_random_uuid();
  new.user_id := uid;
  new.status := 'pending';
  new.created_at := now();
  new.reviewed_at := null;
  new.reviewed_by := null;
  if new.line_id is null or not (new.line_id = any (shutdoor_ump_lines())) then
    raise exception 'that is not a line on the script';
  end if;
  if new.consent_version is null or shutdoor_ump_consent(new.consent_version) is null
     or new.consent_text is distinct from shutdoor_ump_consent(new.consent_version) then
    raise exception 'tick the consent box first';
  end if;
  new.mime := lower(btrim(split_part(coalesce(new.mime, ''), ';', 1)));
  if not (new.mime = any (shutdoor_ump_mimes())) then raise exception 'audio files only'; end if;
  new.credit := nullif(btrim(regexp_replace(coalesce(new.credit, ''), '[[:cntrl:]]', '', 'g')), '');
  /* a row whose upload never landed (a dropped connection) goes after 15 minutes */
  delete from shutdoor_ump_clips c
   where c.user_id = uid and c.status = 'pending' and c.created_at < now() - interval '15 minutes'
     and not exists (select 1 from storage.objects o where o.bucket_id = 'shutdoor-ump-voices' and o.name = c.storage_path);
  select count(*) into n from shutdoor_ump_clips c where c.user_id = uid and c.status = 'pending';
  if n >= 40 then raise exception 'you have 40 calls waiting for review'; end if;
  new.storage_path := uid::text || '/' || new.id::text || shutdoor_ump_ext(new.mime);
  return new;
end $$;

drop trigger if exists shutdoor_ump_clips_before_insert on public.shutdoor_ump_clips;
create trigger shutdoor_ump_clips_before_insert before insert on public.shutdoor_ump_clips
  for each row execute function public.shutdoor_ump_before_insert();

alter table public.shutdoor_ump_clips enable row level security;
drop policy if exists shutdoor_ump_clips_insert on public.shutdoor_ump_clips;
create policy shutdoor_ump_clips_insert on public.shutdoor_ump_clips for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
drop policy if exists shutdoor_ump_clips_mine on public.shutdoor_ump_clips;
create policy shutdoor_ump_clips_mine on public.shutdoor_ump_clips for select to authenticated
  using (user_id = auth.uid() and status = 'pending');
revoke all on public.shutdoor_ump_clips from anon, authenticated;
grant select, insert on public.shutdoor_ump_clips to authenticated;

/* ---- the bucket and its policies ----------------------------------------- */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shutdoor-ump-voices', 'shutdoor-ump-voices', false, 307200, public.shutdoor_ump_mimes())
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

/* an upload: the caller's own pending row at exactly this path, with no file yet */
create or replace function public.shutdoor_ump_can_upload(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from shutdoor_ump_clips c
     where c.storage_path = p_name and c.user_id = auth.uid() and c.status = 'pending'
       and not exists (select 1 from storage.objects o where o.bucket_id = 'shutdoor-ump-voices' and o.name = p_name))
$$;
/* a read: approved, the owner, or the uploader's own pending file */
create or replace function public.shutdoor_ump_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from shutdoor_ump_clips c where c.storage_path = p_name
                   and (c.status = 'approved' or (c.status = 'pending' and c.user_id = auth.uid())))
      or shutdoor_ump_is_owner(auth.uid())
$$;

drop policy if exists shutdoor_ump_upload on storage.objects;
create policy shutdoor_ump_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'shutdoor-ump-voices'
              and (storage.foldername(name))[1] = auth.uid()::text
              and coalesce((metadata->>'size')::bigint, 0) <= 307200
              and public.shutdoor_ump_can_upload(name));
drop policy if exists shutdoor_ump_read on storage.objects;
create policy shutdoor_ump_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'shutdoor-ump-voices' and public.shutdoor_ump_can_read(name));

/* ---- the calls ------------------------------------------------------------ */

/* every approved clip: [{id, line, path, credit}], newest first. No user ids. */
create or replace function public.shutdoor_ump_approved() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', c.id, 'line', c.line_id, 'path', c.storage_path, 'credit', c.credit)
                           order by c.reviewed_at desc nulls last), '[]'::json)
    from (select * from shutdoor_ump_clips where status = 'approved' order by reviewed_at desc nulls last limit 600) c
$$;

/* may this account review? */
create or replace function public.shutdoor_ump_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select shutdoor_ump_is_owner(auth.uid())
$$;

/* the owner's lists: pending (only rows whose file landed), approved or rejected */
create or replace function public.shutdoor_ump_queue(p_status text default 'pending', p_limit integer default 100) returns json
language plpgsql stable security definer set search_path = public as $$
declare out json;
begin
  if not shutdoor_ump_is_owner(auth.uid()) then raise exception 'owner only'; end if;
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'unknown list'; end if;
  select coalesce(json_agg(json_build_object(
           'id', c.id, 'line', c.line_id, 'status', c.status, 'path', c.storage_path, 'credit', c.credit,
           'username', p.username, 'mime', c.mime, 'bytes', c.bytes, 'ms', c.duration_ms,
           'consentVersion', c.consent_version, 'createdAt', c.created_at, 'reviewedAt', c.reviewed_at)
         order by c.created_at), '[]'::json)
    into out
    from (select * from shutdoor_ump_clips x
           where x.status = p_status
             and (p_status <> 'pending' or exists (select 1 from storage.objects o
                    where o.bucket_id = 'shutdoor-ump-voices' and o.name = x.storage_path))
           order by case when p_status = 'pending' then x.created_at end asc,
                    x.reviewed_at desc nulls last
           limit greatest(1, least(coalesce(p_limit, 100), 500))) c
    left join profiles p on p.id = c.user_id;
  return out;
end $$;

/* approve or reject (or put back to pending). Owner only. */
create or replace function public.shutdoor_ump_review(p_id uuid, p_status text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r shutdoor_ump_clips;
begin
  if not shutdoor_ump_is_owner(uid) then raise exception 'owner only'; end if;
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'unknown status'; end if;
  update shutdoor_ump_clips
     set status = p_status,
         reviewed_at = case when p_status = 'pending' then null else now() end,
         reviewed_by = case when p_status = 'pending' then null else uid end
   where id = p_id
   returning * into r;
  if r.id is null then raise exception 'no such clip'; end if;
  return json_build_object('id', r.id, 'line', r.line_id, 'status', r.status, 'reviewedAt', r.reviewed_at);
end $$;

revoke all on function public.shutdoor_ump_is_owner(uuid) from public, anon, authenticated;
revoke all on function public.shutdoor_ump_before_insert() from public, anon, authenticated;
revoke all on function public.shutdoor_ump_queue(text, integer) from public, anon;
revoke all on function public.shutdoor_ump_review(uuid, text) from public, anon;
revoke all on function public.shutdoor_ump_owner() from public, anon;
grant execute on function public.shutdoor_ump_can_upload(text) to authenticated;
grant execute on function public.shutdoor_ump_can_read(text) to anon, authenticated;
grant execute on function public.shutdoor_ump_approved() to anon, authenticated;
grant execute on function public.shutdoor_ump_owner() to authenticated;
grant execute on function public.shutdoor_ump_queue(text, integer) to authenticated;
grant execute on function public.shutdoor_ump_review(uuid, text) to authenticated;

commit;
