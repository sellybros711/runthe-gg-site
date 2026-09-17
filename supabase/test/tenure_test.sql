-- ---------------------------------------------------------------------------
-- 105_commish_tenure.sql against a real Postgres.
--
--   createdb tenure_test
--   psql -d tenure_test -c 'create role authenticated; create role anon;'
--   psql -d tenure_test -f supabase/test/terms_base.sql
--   psql -d tenure_test -f supabase/96_commish_terms.sql
--   psql -d tenure_test -f supabase/105_commish_tenure.sql
--   psql -d tenure_test -f supabase/test/tenure_test.sql
--
-- One line per check, every one starting " ok ". It reuses terms_base because 105 reads the
-- table 96 creates and nothing else.
--
-- WHAT IT IS ACTUALLY FOR. The board sums years across a person's terms and ranks on the sum,
-- and the standing is a SECOND implementation of that same order written out by hand, because
-- a place counted against the fifty rows a board returns is wrong for everybody past fiftieth.
-- Two implementations of one ordering is exactly the shape that drifts, so most of the checks
-- below are the two of them agreeing.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.ck(label text, cond boolean) returns void
language plpgsql as $$
begin
  raise notice '%', (case when cond then ' ok  ' else ' FAIL ' end) || label;
end $$;

-- ---------- the cast --------------------------------------------------------
-- a: 21 years over two contracts, the commissioner the room kept re-signing
-- b: 21 years over six, handed the job again and again
-- c: 12 years, one contract
-- d: one term, no score, ended in year one
-- e: a term that is HIDDEN, which must be invisible to both the board and the count
truncate public.commish_terms;
delete from public.profiles;
delete from auth.users;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333'),
  ('44444444-4444-4444-4444-444444444444'),
  ('55555555-5555-5555-5555-555555555555');
insert into public.profiles (id, username, avatar_color, avatar_initials) values
  ('11111111-1111-1111-1111-111111111111','ayes','#f00','AY'),
  ('22222222-2222-2222-2222-222222222222','bee','#0f0','BE'),
  ('33333333-3333-3333-3333-333333333333','cee','#00f','CE');
-- d deliberately has NO profile row, to prove the left join keeps them on the board.

insert into public.commish_terms
  (user_id, doctrine, purse, gate, stage, throne, score, grade, removed, years, rulings, champions, hidden, created_at)
values
  ('11111111-1111-1111-1111-111111111111','none',0,0,0,0,70,'B',false,13,40,2,false,'2026-01-01'),
  ('11111111-1111-1111-1111-111111111111','none',0,0,0,0,75,'B',false, 8,30,1,false,'2026-02-01'),
  ('22222222-2222-2222-2222-222222222222','none',0,0,0,0,50,'C',true , 4,10,0,false,'2026-01-02'),
  ('22222222-2222-2222-2222-222222222222','none',0,0,0,0,50,'C',true , 4,10,0,false,'2026-01-03'),
  ('22222222-2222-2222-2222-222222222222','none',0,0,0,0,50,'C',true , 4,10,0,false,'2026-01-04'),
  ('22222222-2222-2222-2222-222222222222','none',0,0,0,0,50,'C',true , 3,10,0,false,'2026-01-05'),
  ('22222222-2222-2222-2222-222222222222','none',0,0,0,0,50,'C',true , 3,10,0,false,'2026-01-06'),
  ('22222222-2222-2222-2222-222222222222','none',0,0,0,0,50,'C',true , 3,10,0,false,'2026-01-07'),
  ('33333333-3333-3333-3333-333333333333','none',0,0,0,0,90,'A',false,12,35,4,false,'2026-01-08'),
  ('44444444-4444-4444-4444-444444444444','none',0,0,0,0,null,null,true, 1, 3,0,false,'2026-01-09'),
  ('55555555-5555-5555-5555-555555555555','none',0,0,0,0,99,'A',false,40,90,9,true ,'2026-01-10');

-- ---------- the board -------------------------------------------------------
do $$
declare r record; n int;
begin
  select count(*)::int into n from commish_tenure_board(50);
  perform pg_temp.ck('four accounts on the board, the hidden term is nobody', n = 4);

  select * into r from commish_tenure_board(50) where place = 1;
  perform pg_temp.ck('  first is the 21 year commissioner', r.years = 21);
  perform pg_temp.ck('  and it is the one who did it in two contracts', r.terms = 2 and r.author_name = 'ayes');
  perform pg_temp.ck('  whose longest single contract is 13', r.longest = 13);

  select * into r from commish_tenure_board(50) where place = 2;
  perform pg_temp.ck('second is the other 21, on the tiebreak', r.years = 21 and r.terms = 6);
  perform pg_temp.ck('  and the board shows the six so a reader can tell them apart', r.author_name = 'bee');
  perform pg_temp.ck('  with every one of them a removal', r.removed = 6);

  select * into r from commish_tenure_board(50) where place = 3;
  perform pg_temp.ck('third is twelve years', r.years = 12 and r.author_name = 'cee');
  perform pg_temp.ck('  carrying the titles it won', r.champions = 4);

  -- A TERM WITH NO SCORE IS STILL TIME SERVED. The doctrine board drops it because it cannot
  -- sort a null; this one has no reason to.
  select * into r from commish_tenure_board(50) where place = 4;
  perform pg_temp.ck('the ungraded term is on the board', r.years = 1);
  perform pg_temp.ck('  and an account with no profile row still appears', r.author_name is null);

  select count(*)::int into n from commish_tenure_board(2);
  perform pg_temp.ck('the limit is honoured', n = 2);
end $$;

-- ---------- where you stand -------------------------------------------------
do $$
declare j jsonb;
begin
  delete from auth.session;
  insert into auth.session values ('11111111-1111-1111-1111-111111111111');
  j := commish_my_tenure();
  perform pg_temp.ck('your own standing agrees with the board', (j->>'place')::int = 1);
  perform pg_temp.ck('  on the years', (j->>'years')::int = 21);
  perform pg_temp.ck('  on the terms', (j->>'terms')::int = 2);
  perform pg_temp.ck('  and the total counts people, not terms', (j->>'total')::int = 4);

  -- THE TIEBREAK, FROM THE OTHER SIDE. b has the same years as a and more terms, so the
  -- hand-written order in my_tenure has to put them second exactly as the board does.
  delete from auth.session;
  insert into auth.session values ('22222222-2222-2222-2222-222222222222');
  j := commish_my_tenure();
  perform pg_temp.ck('the same years in more terms stands second', (j->>'place')::int = 2);

  delete from auth.session;
  insert into auth.session values ('33333333-3333-3333-3333-333333333333');
  j := commish_my_tenure();
  perform pg_temp.ck('and twelve years stands third', (j->>'place')::int = 3);

  -- A HIDDEN TERM IS NOT A CAREER. e has forty years and is moderated away, so they have
  -- never served as far as every board is concerned.
  delete from auth.session;
  insert into auth.session values ('55555555-5555-5555-5555-555555555555');
  j := commish_my_tenure();
  perform pg_temp.ck('a hidden term leaves you with no standing at all', (j->>'served')::boolean = false);

  -- SIGNED OUT IS A REAL ANSWER. The standings screen draws before anybody has finished a
  -- term, and an error there would take the screen down rather than saying "not yet".
  delete from auth.session;
  j := commish_my_tenure();
  perform pg_temp.ck('signed out answers rather than failing', (j->>'served')::boolean = false);
  perform pg_temp.ck('  and still says how many have served', (j->>'total')::int = 4);
end $$;

-- ---------- the two orderings cannot disagree -------------------------------
-- THE REAL GUARD. Every account's place from my_tenure, checked against the place the board
-- gives the same account. These are two implementations of one ordering and this is the only
-- thing that stops them drifting.
do $$
declare u record; j jsonb; bp int; bad int := 0;
begin
  for u in select distinct user_id from commish_terms where not hidden loop
    delete from auth.session;
    insert into auth.session values (u.user_id);
    j := commish_my_tenure();
    select place into bp from commish_tenure_board(50) b
      left join profiles p on p.username = b.author_name
     where coalesce(p.id, '44444444-4444-4444-4444-444444444444') = u.user_id;
    if (j->>'place')::int is distinct from bp then bad := bad + 1; end if;
  end loop;
  perform pg_temp.ck('every standing matches the board it is drawn beside', bad = 0);
end $$;

delete from auth.session;
