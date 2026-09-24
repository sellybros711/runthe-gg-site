-- ---------------------------------------------------------------------------
-- 113_fantasy_submit_username.sql : an account's name is `username`
--
--   psql ... -f supabase/113_fantasy_submit_username.sql
--
-- Needs 109. Independent of 110, 111 and 112: it restates one function and touches no
-- table, no view and no grant, so it is safe in any order against a database that has 109.
--
-- WHAT WAS WRONG
-- ---------------------------------------------------------------------------
-- `fantasy_submit` copies the entrant's name out of `profiles` at submit time rather than
-- taking one as an argument, which is right and is unchanged. It read the wrong column:
--
--     select p.display_name into v_name from public.profiles p where p.id = v_user;
--
-- `supabase/10_accounts.sql` has no `display_name`. An account's name is `username`, a
-- citext, and every other board on this site copies it out with `select username::text`:
-- 108 for hoops, 97 for baseball, 53 and 66 when they denormalise it onto a run.
--
-- So EVERY ENTRY EVER ATTEMPTED RAISED `column p.display_name does not exist`, which is not
-- one of the nine sentences this function writes for a person and is not something the page
-- would pass on to a reader. Reported by a player as "nothing happens when I press submit",
-- because at the time the page had nowhere on screen to say it.
--
-- WHY NOTHING CAUGHT IT
-- ---------------------------------------------------------------------------
-- `supabase/test/fantasy_base.sql` built its own `profiles` with a `display_name` column,
-- under a comment that said in as many words "Only the column 109 reads". That is a fixture
-- written to agree with the code it stands in for rather than with the table that exists, so
-- all four suites (109, 110, 111, 112) passed against a database production does not have.
-- The fixture is the real shape now, citext and all, and the 109 suite fails on the old read.
--
-- A fixture that is allowed to invent the schema can only ever certify that a function
-- agrees with itself. That is this repo's oldest lesson arriving at the account layer.
-- ---------------------------------------------------------------------------

create or replace function public.fantasy_submit(
  p_season int, p_week int, p_picks text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_wk    public.fantasy_weeks%rowtype;
  v_spend numeric(7,2);
  v_proj  numeric(7,2);
  v_found int;
  v_name  text;
  v_bad   text;
begin
  if v_user is null then
    raise exception 'sign in to enter';
  end if;

  select * into v_wk from public.fantasy_weeks
   where season = p_season and week = p_week;
  /* FAILS CLOSED. See the header: this is the one allowance on the site that refuses when
     it cannot answer, because what is on the other side is a prize. */
  if not found then
    raise exception 'that week is not open for entries';
  end if;
  if now() >= v_wk.locks_at then
    raise exception 'entries for that week are closed';
  end if;

  if p_picks is null or array_length(p_picks, 1) is distinct from array_length(v_wk.slots, 1) then
    raise exception 'a lineup is % players', array_length(v_wk.slots, 1);
  end if;
  /* One man cannot fill two slots. Checked before the position tally, because six copies of
     one quarterback would otherwise fail on the SHAPE and report the wrong thing. */
  if (select count(distinct x) from unnest(p_picks) x) <> array_length(p_picks, 1) then
    raise exception 'a lineup cannot name the same player twice';
  end if;

  /* Every pick has to be on THIS week's board. A man whose club is idle is not, and neither
     is an id somebody typed. */
  select count(*) into v_found
    from public.fantasy_prices f
   where f.season = p_season and f.week = p_week
     and f.player_id = any (p_picks);
  if v_found <> array_length(p_picks, 1) then
    raise exception 'that lineup has somebody who is not on this week''s board';
  end if;

  /* The SHAPE, as a multiset. `slots` is {QB,RB,RB,WR,WR,TE}, so this asks that the six
     positions drafted are those six positions, in any order. Written as a full outer join
     rather than a loop so the first mismatch names the position that is wrong. */
  select string_agg(t.pos || ' ' || coalesce(t.got,0) || ' of ' || coalesce(t.want,0), ', ')
    into v_bad
    from (
      select coalesce(g.pos, w.pos) as pos, g.n as got, w.n as want
        from (select f.pos, count(*) n from public.fantasy_prices f
               where f.season = p_season and f.week = p_week
                 and f.player_id = any (p_picks) group by f.pos) g
        full outer join (select s as pos, count(*) n from unnest(v_wk.slots) s group by s) w
          on w.pos = g.pos
       where coalesce(g.n, 0) <> coalesce(w.n, 0)
    ) t;
  if v_bad is not null then
    raise exception 'that lineup is the wrong shape: %', v_bad;
  end if;

  select sum(f.price_musd), sum(f.proj) into v_spend, v_proj
    from public.fantasy_prices f
   where f.season = p_season and f.week = p_week
     and f.player_id = any (p_picks);
  if v_spend > v_wk.cap_musd then
    raise exception 'that lineup is over the cap';
  end if;

  /* `username`, WHICH IS WHAT AN ACCOUNT'S NAME IS CALLED. This read was written
     `p.display_name` and there is no such column: `supabase/10_accounts.sql` names it
     `username`, a citext, and every other board on this site copies it out as
     `select username::text`. It raised on the first real entry anybody tried to make.
     See 113 for the whole story, including why no test caught it. */
  select p.username::text into v_name from public.profiles p where p.id = v_user;

  begin
    insert into public.fantasy_entries
      (user_id, season, week, picks, spend, projected, display_name)
    values (v_user, p_season, p_week, p_picks, v_spend, v_proj, v_name);
  exception when unique_violation then
    /* The index is the rule and this is the sentence. */
    raise exception 'you have already entered this week';
  end;
end;
$$;

revoke all on function public.fantasy_submit(int,int,text[]) from public;
grant execute on function public.fantasy_submit(int,int,text[]) to authenticated;

notify pgrst, 'reload schema';
