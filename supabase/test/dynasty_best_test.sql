-- ---------------------------------------------------------------------------
-- dynasty_best_test.sql : 168's table answers what 108's view computed, after every write.
--
--   createdb dyn_best
--   psql -d dyn_best -f supabase/test/dynboard_base.sql
--   psql -d dyn_best -f supabase/98_football_gauntlet_board.sql
--   psql -d dyn_best -c 'create table public.subscriptions(user_id uuid,
--                        status text, current_period_end timestamptz);'
--   psql -d dyn_best -f supabase/101_premium_bundles.sql
--   psql -d dyn_best -f supabase/107_board_pro_and_live.sql
--   psql -d dyn_best -f supabase/108_dynasty_slot.sql
--   psql -d dyn_best -f supabase/168_dynasty_board_table.sql
--   psql -d dyn_best -f supabase/test/dynasty_best_test.sql
--
-- `ref_board` is 108's view body, verbatim, read straight off ps_runs. After each kind of
-- write the trigger has to handle (a new season, a better season, the run ending, a name
-- cleared, a slot moved, a season deleted, a whole dynasty deleted), the board must equal
-- it row for row.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off

create or replace function public.claim(p_label text, p_ok boolean)
returns void language plpgsql as $$
begin
  if p_ok then raise notice 'ok    %', p_label;
  else raise exception 'FAILED: %', p_label;
  end if;
end $$;

create or replace view public.ref_board as
  with runs as (
    select distinct on (r.dynasty_id)
           r.dynasty_id, r.dynasty_season as seasons, r.dynasty_score as score,
           r.display_name, r.created_at, r.user_id, r.display_color, r.display_initials,
           r.display_mark, r.display_rung, r.display_tier, r.display_ring, r.dynasty_over,
           r.display_pro, r.dynasty_slot
      from public.ps_runs r
     where r.dynasty_id is not null and r.display_name is not null
     order by r.dynasty_id, r.dynasty_season desc, r.dynasty_score desc
  )
  select dynasty_id, seasons, score, display_name, created_at, user_id,
         display_color, display_initials, display_mark, display_rung,
         display_tier, display_ring, dynasty_over, display_pro,
         case
           when dynasty_over is distinct from false then false
           when user_id is null then true
           else row_number() over (partition by user_id, coalesce(dynasty_slot, '')
                                   order by created_at desc, dynasty_id) = 1
         end as dynasty_current
    from runs;

create or replace function public.same_board() returns boolean language sql as $$
  select not exists (select * from public.ref_board except select * from public.ps_dynasty_board)
     and not exists (select * from public.ps_dynasty_board except select * from public.ref_board)
$$;

-- Two players, three dynasties, in both slots.
insert into public.ps_runs (user_id, display_name, created_at, dynasty_id, dynasty_season,
                            dynasty_score, dynasty_over, dynasty_slot)
values ('00000000-0000-0000-0000-00000000000a', 'Ann', now() - interval '3 days',
        '10000000-0000-0000-0000-000000000001', 1, 900, false, 'a'),
       ('00000000-0000-0000-0000-00000000000a', 'Ann', now() - interval '2 days',
        '10000000-0000-0000-0000-000000000002', 1, 800, false, 'a'),
       ('00000000-0000-0000-0000-00000000000b', 'Bo',  now() - interval '1 day',
        '10000000-0000-0000-0000-000000000003', 1, 700, null,  'b');
select public.claim('three dynasties on the board', (select count(*) from public.ps_dynasty_board) = 3);
select public.claim('first inserts match the old view', public.same_board());

insert into public.ps_runs (user_id, display_name, created_at, dynasty_id, dynasty_season,
                            dynasty_score, dynasty_over, dynasty_slot)
values ('00000000-0000-0000-0000-00000000000a', 'Ann', now(),
        '10000000-0000-0000-0000-000000000001', 2, 1950, false, 'a');
select public.claim('a new season moves the dynasty up and makes it the slot''s latest',
  public.same_board() and (select seasons from public.ps_dynasty_board
                            where dynasty_id = '10000000-0000-0000-0000-000000000001') = 2);

update public.ps_runs set dynasty_over = true
 where dynasty_id = '10000000-0000-0000-0000-000000000001' and dynasty_season = 2;
select public.claim('the run ending is read', public.same_board());

update public.ps_runs set display_name = null
 where dynasty_id = '10000000-0000-0000-0000-000000000001' and dynasty_season = 2;
select public.claim('a cleared name falls back to the season that still has one', public.same_board());

update public.ps_runs set dynasty_slot = 'b'
 where dynasty_id = '10000000-0000-0000-0000-000000000002';
select public.claim('a slot moved fixes both slots', public.same_board());

update public.ps_runs set user_id = '00000000-0000-0000-0000-00000000000b'
 where dynasty_id = '10000000-0000-0000-0000-000000000002';
select public.claim('an owner changed fixes both owners', public.same_board());

delete from public.ps_runs
 where dynasty_id = '10000000-0000-0000-0000-000000000001' and dynasty_season = 1;
select public.claim('a season deleted', public.same_board());

delete from public.ps_runs where dynasty_id = '10000000-0000-0000-0000-000000000003';
select public.claim('a whole dynasty deleted leaves the board',
  public.same_board() and not exists (select 1 from public.ps_dynasty_best
                                       where dynasty_id = '10000000-0000-0000-0000-000000000003'));

insert into public.ps_runs (user_id, display_name, created_at, run_mode)
values ('00000000-0000-0000-0000-00000000000a', 'Ann', now(), 'free');
select public.claim('a classic run touches nothing', public.same_board());

set role anon;
select public.claim('anon reads the board', (select count(*) from public.ps_dynasty_board) >= 0);
reset role;

drop view public.ref_board;
drop function public.same_board();
