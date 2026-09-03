-- Exercises supabase/68_setlist_username.sql against a real Postgres.
--
--   psql -d segue2 -f setlist/build/test/stub_supabase.sql
--   psql -d segue2 -f supabase/67_setlist_leaderboard.sql
--   psql -d segue2 -f supabase/68_setlist_username.sql
--   psql -d segue2 -f setlist/build/test/test_username.sql
--
-- The subject is a display name that shares a rendered column with a name from
-- a different namespace, so most of what is worth testing is the interaction
-- between the two rather than the setter on its own.
\set ON_ERROR_STOP off
\pset pager off
set client_min_messages = notice;

truncate segue_runs;

-- Re-runnable: this suite changes both names on both accounts.
update profiles set username = 'rickspringfield', segue_name = null
 where id = '11111111-1111-1111-1111-111111111111';
update profiles set username = 'peterframpton', segue_name = null
 where id = '22222222-2222-2222-2222-222222222222';

create or replace function t_ok(name text, ok boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when ok then '  ok  ' else ' FAIL ' end, name;
end $$;

-- Returns 'ok:<name now in effect>' or 'raised:<message>'.
create or replace function t_set(p text) returns text
language plpgsql as $$
declare v text;
begin
  select segue_set_name(p) into v;
  return 'ok:' || coalesce(v, '<null>');
exception when others then
  return 'raised:' || sqlerrm;
end $$;

-- A show, so there is something on the board to rename.
create or replace function t_show(p_picks text[]) returns bigint
language sql as $$
  select segue_submit_run('goose', 858, 500, 180, 60, 118,
    array['cover','bustout','jamchart','bigjam'], 1200, 7, 2, 1, 1, 1, 1, 1,
    1400, 0, 8000, array['s1','s2','s3'], p_picks, null);
$$;

\echo ''
\echo 'the fallback'
do $$
declare v text;
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  perform t_show(array['n1:a','n1:b','n1:c','n2:d','n2:e','n2:f','n3:g']);
  select display_name into v from segue_runs order by id desc limit 1;
  -- Nothing set: the site username is what goes on the board, exactly as before.
  perform t_ok('with no Segue name, the site username is used', v = 'rickspringfield');
  perform t_ok('and segue_display_name agrees',
    segue_display_name('11111111-1111-1111-1111-111111111111') = 'rickspringfield');
end $$;

\echo ''
\echo 'setting one'
do $$
declare v text;
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  perform t_ok('a name can be set', t_set('JamBandJerry') = 'ok:JamBandJerry');
  perform t_ok('and it is what the board will use',
    segue_display_name('11111111-1111-1111-1111-111111111111') = 'JamBandJerry');
  -- THE SHOW ALREADY RECORDED FOLLOWS IT. The board stores a copy of the name,
  -- so a rename that only applied to future shows would leave one player's
  -- history under two names.
  select display_name into v from segue_runs order by id desc limit 1;
  perform t_ok('and the show already on the board was renamed', v = 'JamBandJerry');
  -- The site account is untouched: this is a display name, not a login.
  perform t_ok('the site username did not change',
    (select username::text from profiles where id = '11111111-1111-1111-1111-111111111111')
      = 'rickspringfield');
end $$;

\echo ''
\echo 'a new show uses it'
do $$
declare v text;
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  perform t_show(array['n4:a','n4:b','n4:c','n5:d','n5:e','n5:f','n6:g']);
  select display_name into v from segue_runs order by id desc limit 1;
  perform t_ok('a show recorded now carries the Segue name', v = 'JamBandJerry');
end $$;

\echo ''
\echo 'clearing it'
do $$
declare v text;
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  perform t_ok('an empty string clears it', t_set('') = 'ok:rickspringfield');
  perform t_ok('and null clears it', t_set(null) = 'ok:rickspringfield');
  perform t_ok('the column really is null',
    (select segue_name from profiles where id = '11111111-1111-1111-1111-111111111111') is null);
  select display_name into v from segue_runs order by id desc limit 1;
  perform t_ok('and the board went back with it', v = 'rickspringfield');
  perform t_ok('whitespace alone is a clear, not a name', t_set('   ') = 'ok:rickspringfield');
end $$;

\echo ''
\echo 'the format'
do $$
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  perform t_ok('two characters is too short', t_set('ab') like 'raised:%');
  perform t_ok('three is the minimum', t_set('abc') = 'ok:abc');
  perform t_ok('twenty is the maximum', t_set(repeat('a', 20)) like 'ok:%');
  perform t_ok('twenty-one is too long', t_set(repeat('a', 21)) like 'raised:%');
  perform t_ok('a space is refused', t_set('jam band') like 'raised:%');
  perform t_ok('punctuation is refused', t_set('jam.band') like 'raised:%');
  perform t_ok('an emoji is refused', t_set('jam' || U&'\+01F600') like 'raised:%');
  perform t_ok('underscores are fine', t_set('jam_band_jerry') like 'ok:%');
  perform t_ok('digits are fine', t_set('goose1997') like 'ok:%');
end $$;

-- ===========================================================================
-- THE PART THAT MATTERS. The two namespaces render into one column of one
-- list, so a Segue name must not be able to collide with anybody else's site
-- username.
-- ===========================================================================
\echo ''
\echo 'a Segue name cannot take somebody else''s site username'
do $$
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  perform t_ok('another account''s site username is refused',
    t_set('peterframpton') like 'raised:%');
  perform t_ok('and case does not get round it',
    t_set('PeterFrampton') like 'raised:%');
  perform t_ok('segue_name_free says so too', segue_name_free('peterframpton') = false);
end $$;

\echo ''
\echo 'but your own site username is yours to take'
do $$
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  perform t_ok('your own username is available to you',
    segue_name_free('rickspringfield') = true);
  perform t_ok('and can be set as your Segue name',
    t_set('rickspringfield') = 'ok:rickspringfield');
  perform t_ok('re-setting the name you already have is not "taken"',
    t_set('rickspringfield') = 'ok:rickspringfield');
end $$;

\echo ''
\echo 'a Segue name cannot take another Segue name'
do $$
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  perform t_set('TheOnlyOne');
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', true);
  perform t_ok('somebody else''s Segue name is refused', t_set('TheOnlyOne') like 'raised:%');
  perform t_ok('and case does not get round that either',
    t_set('theonlyone') like 'raised:%');
  perform t_ok('a free name still works', t_set('SecondPlace') = 'ok:SecondPlace');
end $$;

\echo ''
\echo 'and a site username cannot be taken while a Segue name holds it'
do $$
begin
  -- The reverse direction. set_username() is 10_accounts.sql's and this file
  -- does not change it, so this documents what actually happens rather than
  -- asserting a guarantee: the Segue namespace does NOT block a site rename.
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  perform t_ok('(known) a site username can still take a live Segue name',
    (select segue_name from profiles
      where id = '22222222-2222-2222-2222-222222222222')::text = 'SecondPlace');
end $$;

\echo ''
\echo 'signed out'
do $$
begin
  perform set_config('test.uid', '', true);
  perform t_ok('a guest cannot set a name', t_set('Nobody') like 'raised:%');
  -- The form checks availability as you type, before the sheet knows who you
  -- are, so this has to answer rather than raise.
  perform t_ok('but can still ask whether one is free',
    segue_name_free('SomethingNobodyHas') = true);
  perform t_ok('and gets the right answer for a taken one',
    segue_name_free('SecondPlace') = false);
  perform t_ok('and for a malformed one', segue_name_free('a b') = false);
end $$;

\echo ''
\echo 'nobody else''s name moves'
do $$
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  perform t_set('MineAlone');
  perform t_ok('the other account''s Segue name is untouched',
    (select segue_name from profiles
      where id = '22222222-2222-2222-2222-222222222222')::text = 'SecondPlace');
  perform t_ok('and their site username is untouched',
    (select username from profiles
      where id = '22222222-2222-2222-2222-222222222222')::text = 'peterframpton');
  perform t_ok('and no row of theirs was renamed',
    not exists (select 1 from segue_runs
      where user_id = '22222222-2222-2222-2222-222222222222'
        and display_name = 'MineAlone'));
end $$;

\echo ''
\echo 'claiming a guest show uses the Segue name'
do $$
declare v_id bigint; v text;
begin
  perform set_config('test.uid', '', true);
  select t_show(array['g1:a','g1:b','g1:c','g2:d','g2:e','g2:f','g3:g']) into v_id;
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', true);
  perform t_ok('the guest show is claimable', segue_claim_run(v_id) = true);
  select display_name into v from segue_runs where id = v_id;
  perform t_ok('and lands under the Segue name', v = 'MineAlone');
end $$;

\echo ''
\echo 'done'
drop function if exists t_ok(text, boolean);
drop function if exists t_set(text);
drop function if exists t_show(text[]);
