-- ---------------------------------------------------------------------------
-- 186_contests_need_account: a guest cannot enter a weekly contest.
--
--   psql -d cfbf -f supabase/test/fantasy_base.sql
--   sed -n '20,$p' supabase/test/dynboard_base.sql | psql -d cfbf
--   psql -d cfbf -f supabase/98_football_gauntlet_board.sql
--   psql -d cfbf -c 'create table public.subscriptions(user_id uuid, status text, current_period_end timestamptz);'
--   psql -d cfbf -f supabase/101_premium_bundles.sql   (then 107, 109 to 115, 119, 120, 124, 126)
--   psql -d cfbf -f supabase/128_cfb_fantasy.sql
--   psql -d cfbf -f supabase/186_contests_need_account.sql
--   psql -d cfbf -f supabase/test/contests_need_account_test.sql
--
-- The owner's rule (2026-11-23): without an account you cannot enter the weekly contests.
-- A guest is an anonymous Supabase session: a real auth.uid() whose JWT says
-- is_anonymous = true. Every claim below is driven, never assumed:
--   - a guest's fantasy_submit is refused, through the real function;
--   - the same person as a full account gets in (only the flag decides);
--   - a guest cannot change an entry (the swap path is an update);
--   - a guest cannot write a College entry either;
--   - a write with no JWT at all (the service role and the results jobs) still passes;
--   - is_full_account() answers all three cases.
-- Season 2099 is this file's own, so nothing here touches another test's rows.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
\pset pager off

-- auth.jwt() and auth.claims come from fantasy_base.sql (Supabase's, driven by the test).
create or replace function public.guest_as(p uuid) returns void language sql as $$
  select public.become(p); delete from auth.claims; insert into auth.claims values ('{"is_anonymous":true}');
$$;
create or replace function public.member_as(p uuid) returns void language sql as $$
  select public.become(p); delete from auth.claims; insert into auth.claims values ('{"is_anonymous":false}');
$$;
create or replace function public.server_as() returns void language sql as $$
  select public.become_nobody(); delete from auth.claims;
$$;

create or replace function public.claim(p_label text, p_ok boolean)
returns void language plpgsql as $$
begin
  if p_ok then raise notice 'ok    %', p_label;
  else raise exception 'FAILED: %', p_label;
  end if;
end $$;

create or replace function public.refusal(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

\o /dev/null
select public.server_as();
insert into auth.users(id) values ('dddddddd-0000-0000-0000-00000000000d') on conflict do nothing;
insert into public.profiles(id, username) values ('dddddddd-0000-0000-0000-00000000000d', 'Dee')
on conflict (id) do update set username = excluded.username;

delete from public.fantasy_entries where season = 2099;
delete from public.fantasy_prices where season = 2099;
delete from public.fantasy_weeks where season = 2099;
delete from public.cfb_fantasy_entries where season = 2099;
delete from public.cfb_fantasy_weeks where season = 2099;

insert into public.fantasy_weeks (season, week, locks_at, cap_musd, slots) values
  (2099, 1, now() + interval '2 days', 90.00, array['QB','RB','RB','WR','WR','TE']::text[]);
insert into public.fantasy_prices (season, week, player_id, pos, price_musd, proj, team, kick) values
  (2099,1,'qb1','QB',20.0,15.0,'AAA', now() + interval '2 days'),
  (2099,1,'rb1','RB',10.0,8.0, 'AAA', now() + interval '2 days'),
  (2099,1,'rb2','RB',10.0,8.0, 'BBB', now() + interval '2 days'),
  (2099,1,'wr1','WR',10.0,8.0, 'AAA', now() + interval '2 days'),
  (2099,1,'wr2','WR',10.0,8.0, 'BBB', now() + interval '2 days'),
  (2099,1,'te1','TE', 8.0,6.0, 'AAA', now() + interval '2 days');
insert into public.cfb_fantasy_weeks (season, week, locks_at, cap_musd, slots) values
  (2099, 1, now() + interval '2 days', 90.00, array['QB','RB','RB','WR','WR','TE']::text[]);
\o

do $$
declare
  dee uuid := 'dddddddd-0000-0000-0000-00000000000d';
  picks text := $p$array['qb1','rb1','rb2','wr1','wr2','te1']::text[]$p$;
  r text;
  n int;
begin
  perform public.claim('the guard is on both entry tables',
    (select count(*) from pg_trigger where not tgisinternal and tgname in
      ('fantasy_entries_need_account', 'cfb_fantasy_entries_need_account')) = 2);

  -- A guest, through the real function.
  perform public.guest_as(dee);
  perform public.claim('is_full_account() is false for a guest', not public.is_full_account());
  r := public.refusal('select public.fantasy_submit(2099, 1, ' || picks || ')');
  perform public.claim('a guest''s NFL entry is refused: ' || coalesce(r, 'NOT REFUSED'),
    r = 'make a free account to enter the weekly contest');
  select count(*) into n from public.fantasy_entries where season = 2099;
  perform public.claim('and nothing was written', n = 0);

  -- The same person as a full account: only the flag decides.
  perform public.member_as(dee);
  perform public.claim('is_full_account() is true for an account', public.is_full_account());
  execute 'select public.fantasy_submit(2099, 1, ' || picks || ')';
  select count(*) into n from public.fantasy_entries where season = 2099 and user_id = dee;
  perform public.claim('an account''s NFL entry goes in', n = 1);

  -- Back as a guest, the entry cannot be changed (a swap is an update of this row).
  perform public.guest_as(dee);
  r := public.refusal($q$update public.fantasy_entries set swaps = '[{"out":"rb1","in":"rb2"}]'::jsonb
                         where season = 2099 and user_id = 'dddddddd-0000-0000-0000-00000000000d'$q$);
  perform public.claim('a guest cannot change an NFL entry: ' || coalesce(r, 'NOT REFUSED'),
    r = 'make a free account to enter the weekly contest');

  -- The College contest, the same way.
  r := public.refusal($q$insert into public.cfb_fantasy_entries (user_id, season, week, picks, spend, projected)
                         values ('dddddddd-0000-0000-0000-00000000000d', 2099, 1,
                                 array['qb1','rb1','rb2','wr1','wr2','te1'], 58, 40)$q$);
  perform public.claim('a guest cannot enter the College contest: ' || coalesce(r, 'NOT REFUSED'),
    r = 'make a free account to enter the weekly contest');

  -- The service role and the results jobs carry no JWT, and still write.
  perform public.server_as();
  perform public.claim('is_full_account() is false with nobody signed in', not public.is_full_account());
  insert into public.cfb_fantasy_entries (user_id, season, week, picks, spend, projected)
    values (dee, 2099, 1, array['qb1','rb1','rb2','wr1','wr2','te1'], 58, 40);
  update public.fantasy_entries set result_seen_at = now() where season = 2099 and user_id = dee;
  select count(*) into n from public.cfb_fantasy_entries where season = 2099 and user_id = dee;
  perform public.claim('a write with no JWT (the server) passes on both tables', n = 1);
end $$;

\o /dev/null
select public.server_as();
delete from public.fantasy_entries where season = 2099;
delete from public.fantasy_prices where season = 2099;
delete from public.fantasy_weeks where season = 2099;
delete from public.cfb_fantasy_entries where season = 2099;
delete from public.cfb_fantasy_weeks where season = 2099;
\o
