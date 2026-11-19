-- ---------------------------------------------------------------------------
-- 168_dynasty_board_table.sql : the Dynasty board reads one row per dynasty.
--
-- WHY. On 2026-11-12 the project ran out of its Disk IO budget and stopped answering
-- (Cloudflare 522, every game lost sign in). pg_stat_statements put the two heaviest reads
-- on `ps_dynasty_board`: the board and the "my dynasty" read, about 1.6 seconds and 70 MB
-- each. The view (108) ran DISTINCT ON over every dynasty row in ps_runs and then a
-- row_number() window over the result, and neither the user_id filter nor the board's
-- ORDER BY ... LIMIT can be pushed below a window. So every read, including one player's
-- own two rows, scanned and sorted the whole dynasty history.
--
-- WHAT. `ps_dynasty_best` holds the row 108's DISTINCT ON picked for each dynasty (its
-- furthest season, then its best score) and whether it is its owner's latest dynasty in
-- its slot (the window, precomputed). Triggers on ps_runs keep it current on every insert,
-- update and delete. The view keeps its name, its columns, their order and their meaning,
-- and now reads the table, so a board read touches only the rows it returns.
--
-- SAFE TO RUN TWICE: every object is created with "if not exists" or "or replace", the
-- backfill is an upsert, and the second run leaves the same rows.
-- ---------------------------------------------------------------------------

create table if not exists public.ps_dynasty_best (
  dynasty_id       uuid primary key,
  seasons          integer,
  score            bigint,
  display_name     text,
  created_at       timestamptz not null,
  user_id          uuid,
  display_color    text,
  display_initials text,
  display_mark     text,
  display_rung     smallint,
  display_tier     text,
  display_ring     text,
  dynasty_over     boolean,
  display_pro      boolean,
  dynasty_slot     text,
  -- 108's window: true for the newest dynasty (created_at desc, dynasty_id) per owner and
  -- slot. The view's dynasty_current is still the same CASE over this.
  slot_latest      boolean not null default false
);

-- The board's two sort orders, the window filter, and one player's rows.
create index if not exists ps_dynasty_best_seasons_idx
  on public.ps_dynasty_best (seasons desc, score desc, created_at);
create index if not exists ps_dynasty_best_score_idx
  on public.ps_dynasty_best (score desc, seasons desc, created_at);
create index if not exists ps_dynasty_best_created_idx
  on public.ps_dynasty_best (created_at);
create index if not exists ps_dynasty_best_owner_idx
  on public.ps_dynasty_best (user_id, (coalesce(dynasty_slot, '')), created_at desc, dynasty_id);

alter table public.ps_dynasty_best enable row level security;
drop policy if exists "ps_dynasty_best read" on public.ps_dynasty_best;
create policy "ps_dynasty_best read" on public.ps_dynasty_best for select using (true);
grant select on public.ps_dynasty_best to anon, authenticated;
-- No write grant: only the trigger functions below (security definer) write it.

-- One owner's slot: mark the newest dynasty, clear the rest. 108's row_number() was
-- partitioned by (user_id, coalesce(dynasty_slot, '')) and ordered by created_at desc,
-- dynasty_id, which is exactly this.
create or replace function public.ps_dynasty_best_slot(p_user uuid, p_slot text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_top uuid;
begin
  if p_user is null then return; end if;
  select dynasty_id into v_top
    from public.ps_dynasty_best
   where user_id = p_user and coalesce(dynasty_slot, '') = coalesce(p_slot, '')
   order by created_at desc, dynasty_id
   limit 1;
  update public.ps_dynasty_best
     set slot_latest = (dynasty_id = v_top)
   where user_id = p_user and coalesce(dynasty_slot, '') = coalesce(p_slot, '')
     and slot_latest is distinct from (dynasty_id = v_top);
end $$;

-- One dynasty: re-pick its row the way 108's DISTINCT ON did, then fix the slot flags of
-- the owner and slot it left (if they changed) and the ones it is in now.
create or replace function public.ps_dynasty_best_refresh(p_dynasty uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old public.ps_dynasty_best%rowtype;
  v_new public.ps_dynasty_best%rowtype;
begin
  if p_dynasty is null then return; end if;
  select * into v_old from public.ps_dynasty_best where dynasty_id = p_dynasty;

  select r.dynasty_id, r.dynasty_season, r.dynasty_score, r.display_name, r.created_at,
         r.user_id, r.display_color, r.display_initials, r.display_mark, r.display_rung,
         r.display_tier, r.display_ring, r.dynasty_over, r.display_pro, r.dynasty_slot,
         coalesce(v_old.slot_latest, false)
    into v_new
    from public.ps_runs r
   where r.dynasty_id = p_dynasty and r.display_name is not null
   order by r.dynasty_season desc, r.dynasty_score desc, r.id desc
   limit 1;

  if v_new.dynasty_id is null then
    delete from public.ps_dynasty_best where dynasty_id = p_dynasty;
  else
    insert into public.ps_dynasty_best values (v_new.*)
    on conflict (dynasty_id) do update set
      seasons = excluded.seasons, score = excluded.score,
      display_name = excluded.display_name, created_at = excluded.created_at,
      user_id = excluded.user_id, display_color = excluded.display_color,
      display_initials = excluded.display_initials, display_mark = excluded.display_mark,
      display_rung = excluded.display_rung, display_tier = excluded.display_tier,
      display_ring = excluded.display_ring, dynasty_over = excluded.dynasty_over,
      display_pro = excluded.display_pro, dynasty_slot = excluded.dynasty_slot;
  end if;

  if v_old.dynasty_id is not null
     and (v_new.dynasty_id is null or v_old.user_id is distinct from v_new.user_id
          or coalesce(v_old.dynasty_slot, '') <> coalesce(v_new.dynasty_slot, '')) then
    perform public.ps_dynasty_best_slot(v_old.user_id, v_old.dynasty_slot);
  end if;
  if v_new.dynasty_id is not null then
    perform public.ps_dynasty_best_slot(v_new.user_id, v_new.dynasty_slot);
  end if;
end $$;

-- ONCE PER DYNASTY PER STATEMENT, not once per row: a migration that touches every season
-- (120 stamped display_pro on all of them) would otherwise re-pick each dynasty once per
-- season. Measured on 195k dynasty rows: a row trigger added 9 seconds to that update,
-- this one adds about half a second on top of the update's own 4.
-- An UPDATE that changes no column the board reads re-picks nothing. Postgres allows
-- transition tables only on single-event triggers, hence three.
create or replace function public.ps_runs_dynasty_best_ins()
returns trigger language plpgsql security definer set search_path = public as $$
declare d uuid;
begin
  for d in select distinct dynasty_id from new_rows where dynasty_id is not null loop
    perform public.ps_dynasty_best_refresh(d);
  end loop;
  return null;
end $$;

create or replace function public.ps_runs_dynasty_best_upd()
returns trigger language plpgsql security definer set search_path = public as $$
declare d uuid;
begin
  for d in
    select distinct x.dynasty_id from (
      select o.dynasty_id as a, n.dynasty_id as b
        from old_rows o join new_rows n on n.id = o.id
       where (o.dynasty_id is not null or n.dynasty_id is not null)
         and (o.dynasty_id, o.dynasty_season, o.dynasty_score, o.display_name, o.created_at,
              o.user_id, o.display_color, o.display_initials, o.display_mark, o.display_rung,
              o.display_tier, o.display_ring, o.dynasty_over, o.display_pro, o.dynasty_slot)
             is distinct from
             (n.dynasty_id, n.dynasty_season, n.dynasty_score, n.display_name, n.created_at,
              n.user_id, n.display_color, n.display_initials, n.display_mark, n.display_rung,
              n.display_tier, n.display_ring, n.dynasty_over, n.display_pro, n.dynasty_slot)
    ) c cross join lateral (values (c.a), (c.b)) as x(dynasty_id)
     where x.dynasty_id is not null
  loop
    perform public.ps_dynasty_best_refresh(d);
  end loop;
  return null;
end $$;

create or replace function public.ps_runs_dynasty_best_del()
returns trigger language plpgsql security definer set search_path = public as $$
declare d uuid;
begin
  for d in select distinct dynasty_id from old_rows where dynasty_id is not null loop
    perform public.ps_dynasty_best_refresh(d);
  end loop;
  return null;
end $$;

drop trigger if exists ps_runs_dynasty_best on public.ps_runs;
drop function if exists public.ps_runs_dynasty_best_trg();
drop trigger if exists ps_runs_dynasty_best_ins on public.ps_runs;
create trigger ps_runs_dynasty_best_ins after insert on public.ps_runs
  referencing new table as new_rows
  for each statement execute function public.ps_runs_dynasty_best_ins();
drop trigger if exists ps_runs_dynasty_best_upd on public.ps_runs;
create trigger ps_runs_dynasty_best_upd after update on public.ps_runs
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.ps_runs_dynasty_best_upd();
drop trigger if exists ps_runs_dynasty_best_del on public.ps_runs;
create trigger ps_runs_dynasty_best_del after delete on public.ps_runs
  referencing old table as old_rows
  for each statement execute function public.ps_runs_dynasty_best_del();

-- BACKFILL, the same pick and the same window 108 computed on every read, done once.
insert into public.ps_dynasty_best
select b.*, false
  from (select distinct on (r.dynasty_id)
               r.dynasty_id, r.dynasty_season, r.dynasty_score, r.display_name, r.created_at,
               r.user_id, r.display_color, r.display_initials, r.display_mark, r.display_rung,
               r.display_tier, r.display_ring, r.dynasty_over, r.display_pro, r.dynasty_slot
          from public.ps_runs r
         where r.dynasty_id is not null and r.display_name is not null
         order by r.dynasty_id, r.dynasty_season desc, r.dynasty_score desc, r.id desc) b
on conflict (dynasty_id) do update set
  seasons = excluded.seasons, score = excluded.score,
  display_name = excluded.display_name, created_at = excluded.created_at,
  user_id = excluded.user_id, display_color = excluded.display_color,
  display_initials = excluded.display_initials, display_mark = excluded.display_mark,
  display_rung = excluded.display_rung, display_tier = excluded.display_tier,
  display_ring = excluded.display_ring, dynasty_over = excluded.dynasty_over,
  display_pro = excluded.display_pro, dynasty_slot = excluded.dynasty_slot;

-- A dynasty whose every season has since lost its display name is no longer on the board.
delete from public.ps_dynasty_best b
 where not exists (select 1 from public.ps_runs r
                    where r.dynasty_id = b.dynasty_id and r.display_name is not null);

update public.ps_dynasty_best b
   set slot_latest = (w.rn = 1)
  from (select dynasty_id,
               row_number() over (partition by user_id, coalesce(dynasty_slot, '')
                                  order by created_at desc, dynasty_id) as rn
          from public.ps_dynasty_best) w
 where w.dynasty_id = b.dynasty_id
   and b.slot_latest is distinct from (w.rn = 1);

-- THE VIEW, same name, same columns in the same order, same meaning. It reads the table,
-- so PostgREST's filters, ORDER BY and LIMIT reach the indexes above.
create or replace view public.ps_dynasty_board
with (security_invoker = true) as
  select dynasty_id, seasons, score, display_name, created_at, user_id,
         display_color, display_initials, display_mark, display_rung,
         display_tier, display_ring, dynasty_over, display_pro,
         case
           when dynasty_over is distinct from false then false
           when user_id is null then true
           else slot_latest
         end as dynasty_current
    from public.ps_dynasty_best;

grant select on public.ps_dynasty_board to anon, authenticated;

analyze public.ps_dynasty_best;

notify pgrst, 'reload schema';
