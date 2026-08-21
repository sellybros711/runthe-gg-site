-- ---------------------------------------------------------------------------
-- The checks for 88_football_crests.sql. See crests_base.sql for how to run it.
-- Every line this prints should start with " ok ".
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off
\pset footer off
create or replace function ok(lbl text, got text, want text) returns void
  language plpgsql as $$
begin
  raise notice '%  %  got=% want=%',
    case when got is not distinct from want then ' ok  ' else 'FAIL ' end, lbl, got, want;
end $$;

truncate ps_runs; delete from profiles; delete from auth.session;
insert into profiles(id,username) values
  ('11111111-1111-1111-1111-111111111111','runnyj');
insert into auth.session values ('11111111-1111-1111-1111-111111111111');

-- a run helper that goes through the real insert path
create or replace function play(mode text, club text, playoffs boolean, title boolean)
returns void language sql as $$
  insert into ps_runs(user_id,run_mode,franchise,made_playoffs,title_won,wins,losses,games)
  values (auth.uid(), mode, club, playoffs, title, 10, 7, 17);
$$;

-- 1. no club, no runs. 0 rather than null: the insert trigger fires on a new
--    profile too, so a row can be read without a coalesce at every call site.
select ok('fresh account rung', (select crest_rung::text from profiles), '0');

-- 2. pick a club with no history: rung 0
select ps_set_avatar('MIA','RJ');
select ok('club picked, never drafted', (select crest_rung::text from profiles), '0');

-- 3. one One Franchise draft with them: rung 1, and the row that did it says 1
select play('club','MIA',false,false);
select ok('after one draft', (select crest_rung::text from profiles), '1');
select ok('the run that earned it', (select display_rung::text from ps_runs order by id desc limit 1), '1');

-- 4. a playoff berth: rung 2, and older rows catch up
select play('club','MIA',true,false);
select ok('after a playoff berth', (select crest_rung::text from profiles), '2');
select ok('older rows caught up', (select min(display_rung)::text from ps_runs where run_mode='club'), '2');

-- 5. a title: rung 3
select play('club','MIA',true,true);
select ok('after a title', (select crest_rung::text from profiles), '3');

-- 6. a FREE run with the same franchise must not count
select play('free','MIA',true,true);
select ok('free runs do not count', (select ps_crest_rung(auth.uid(),'MIA')::text), '3');
delete from ps_runs where run_mode='free';

-- 7. a different club is a different ladder
select ps_set_avatar('GB','RJ');
select ok('swapped to a club never drafted', (select crest_rung::text from profiles), '0');
select ok('and the rows followed', (select max(display_rung)::text from ps_runs), '0');
select ps_set_avatar('MIA','RJ');
select ok('swapped back', (select crest_rung::text from profiles), '3');
select ok('rows followed back', (select min(display_rung)::text from ps_runs), '3');

-- 8. the mark
select ps_set_crest('dog');
select ok('mark stored', (select crest_mark from profiles), 'dog');
select ok('mark on the rows', (select min(display_mark) from ps_runs), 'dog');
select ok('setter returns the rung too', (select rung::text from ps_set_crest('crown')), '3');
select ok('the monogram is null', (select mark from ps_set_crest('init')), null);
select ok('cleared', (select mark from ps_set_crest('')), null);

-- 9. a mark that is not one of the thirteen
do $$ begin
  perform ps_set_crest('helmet');
  raise notice 'FAIL  a bogus mark was accepted';
exception when others then
  raise notice ' ok   a bogus mark is refused: %', sqlerrm;
end $$;

-- 10. a guest run carries nothing and breaks nothing
delete from auth.session;
insert into ps_runs(user_id,run_mode,franchise,made_playoffs,title_won,wins,losses,games)
  values (null,'free',null,false,false,9,8,17);
select ok('guest row has no mark', (select display_mark from ps_runs order by id desc limit 1), null);
select ok('guest row has no rung', (select display_rung::text from ps_runs order by id desc limit 1), null);


-- 11. THE BACKFILL, which is the only part of this file that touches somebody who
--     was already playing. Rows and a profile made with the triggers off, exactly
--     as they exist today on a database that has never seen this migration.
delete from ps_runs; delete from profiles; delete from auth.session;
alter table profiles disable trigger profiles_crest_rung;
alter table profiles disable trigger profiles_crest_rows;
alter table ps_runs disable trigger ps_runs_avatar_stamp;
insert into profiles(id,username,avatar_color,avatar_initials)
  values ('22222222-2222-2222-2222-222222222222','old timer','PIT','OT');
insert into ps_runs(user_id,run_mode,franchise,made_playoffs,title_won,wins,losses,games,
                    display_name,display_color,display_initials)
  values ('22222222-2222-2222-2222-222222222222','club','PIT',true,true,14,3,17,
          'old timer','PIT','OT');
insert into ps_runs(user_id,run_mode,franchise,made_playoffs,title_won,wins,losses,games,
                    display_name,display_color,display_initials)
  values ('22222222-2222-2222-2222-222222222222','club','PIT',false,false,7,10,17,
          'old timer','PIT','OT');
alter table profiles enable trigger profiles_crest_rung;
alter table profiles enable trigger profiles_crest_rows;
alter table ps_runs enable trigger ps_runs_avatar_stamp;

select ok('before the backfill', (select crest_rung::text from profiles), null);

update profiles p
   set crest_rung = case when p.avatar_color is null then 0::smallint
                         else ps_crest_rung(p.id, p.avatar_color) end
 where p.crest_rung is distinct from
       (case when p.avatar_color is null then 0::smallint
             else ps_crest_rung(p.id, p.avatar_color) end);
update ps_runs r
   set display_mark = p.crest_mark,
       display_rung = coalesce(p.crest_rung, 0)
  from profiles p
 where p.id = r.user_id and r.user_id is not null
   and (r.display_mark is distinct from p.crest_mark
     or r.display_rung is distinct from coalesce(p.crest_rung, 0));

select ok('backfilled the account', (select crest_rung::text from profiles), '3');
select ok('backfilled every row', (select min(display_rung)::text from ps_runs), '3');
select ok('and both rows, not one', (select count(*)::text from ps_runs where display_rung=3), '2');
