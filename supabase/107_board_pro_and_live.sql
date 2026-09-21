-- ---------------------------------------------------------------------------
-- 107_board_pro_and_live.sql : two things a leaderboard row cannot say yet
--
-- Run AFTER 101_premium_bundles.sql and 98_football_gauntlet_board.sql.
-- Safe to run more than once.
--
-- Both of these are decoration on a board row and neither moves a score, a rank
-- or an allowance. They are here because the page has no way to work either of
-- them out on its own: a row on the board belongs to somebody else, and nothing
-- the browser holds can answer a question about that account.
--
--   ps_runs.display_pro    whether that account holds the bundle
--   ps_runs.dynasty_over   whether that dynasty has finished
--
-- ---------------------------------------------------------------------------
-- WHAT display_pro DISCLOSES, said out loud because it is a decision
-- ---------------------------------------------------------------------------
-- premium_unlocks is RLS'd to its owner and premium_products() answers only for
-- the caller, so today NOBODY can see who else has paid. This column publishes
-- that, for anybody who has a row on a public leaderboard. It is one boolean and
-- it names no product, no price and no date: it cannot say which bundle, when it
-- was bought, or whether it has run out. That is the whole of what a mark beside
-- a name needs, and it is deliberately the least the feature can be built on.
--
-- IT IS DERIVED AND NEVER TYPED. Nothing anywhere may set it from the client, so
-- it cannot be forged into a gold name the way a crest ring can be forged into a
-- gold circle (see 90's note on taking the honour on trust). The two triggers
-- below are the only writers and both read premium_unlocks directly.
--
-- ---------------------------------------------------------------------------
-- WHY dynasty_over IS THREE-VALUED AND NOT A BOOLEAN WITH A DEFAULT
-- ---------------------------------------------------------------------------
-- null   nobody ever said. Every row written before this file is this, and a
--        board full of LIVE badges on runs from six months ago is worse than no
--        badge at all, so null draws nothing.
-- false  the run was going when this season was filed.
-- true   the run is finished: fired, or ended by the owner.
--
-- That is the "absent is not zero" rule the daily meter already runs on. A
-- default of false would have lit every historical row on the day this deployed.
--
-- WHAT IT CANNOT KNOW is a run somebody simply walked away from. Nothing reaches
-- the server when a player closes the tab for the last time, so an abandoned run
-- stays false for ever. That is handled in the PAGE rather than here, by refusing
-- to call anything live whose last season is old, because a cutoff is a judgement
-- that should be tunable without a migration.
-- ---------------------------------------------------------------------------

-- ---------- 1) the two columns ---------------------------------------------
alter table public.ps_runs add column if not exists display_pro  boolean;
alter table public.ps_runs add column if not exists dynasty_over boolean;

-- ---------- 2) display_pro, written by the database and nobody else ---------
-- Whether an account holds a permanent unlock right now. arcade_card_year is the
-- one grant that ends (see the bundle catalog), so an expiry is honoured here:
-- a mark beside a name has to stop when the thing it marks stops.
create or replace function public.ps_is_pro(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.premium_unlocks u
     where u.user_id = p_user
       /* THE TWO GAME UNLOCKS AND NOT THE OTHER TWO. arcade_card_year and
          runtour_pack are bought out of the same catalog and are not what a mark
          on a FOOTBALL leaderboard means: an Arcade Card buyer has no Pro tier in
          this game and would be marked as something they are not. Either bundle
          grants both game unlocks, so naming both is one product either way. */
       and u.product in ('ps_premium', 'cfb_premium')
       and (u.expires_at is null or u.expires_at > now())
  );
$$;

-- ON THE WAY IN, so a row is stamped with what was true when it was filed and no
-- board read ever has to join. BEFORE INSERT rather than a view, because the
-- classic board selects columns off ps_runs by name and a view would be a second
-- shape for the same table.
create or replace function public.ps_runs_stamp_pro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.display_pro := public.ps_is_pro(new.user_id);
  return new;
end;
$$;

drop trigger if exists ps_runs_stamp_pro_trg on public.ps_runs;
create trigger ps_runs_stamp_pro_trg
  before insert on public.ps_runs
  for each row execute function public.ps_runs_stamp_pro();

-- AND WHEN SOMEBODY BUYS, their old rows light up too. Without this the mark
-- would mean "was Pro when this season was played", which reads as a bug to the
-- person who just paid and then looked at their own board row. Same shape as
-- 90's backfill of a changed crest.
create or replace function public.premium_unlocks_backfill_pro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ps_runs r
     set display_pro = true
   where r.user_id = new.user_id
     and r.display_pro is distinct from true;
  return new;
end;
$$;

drop trigger if exists premium_unlocks_backfill_pro_trg on public.premium_unlocks;
create trigger premium_unlocks_backfill_pro_trg
  after insert on public.premium_unlocks
  for each row execute function public.premium_unlocks_backfill_pro();

-- The rows that already exist, once.
update public.ps_runs r
   set display_pro = public.ps_is_pro(r.user_id)
 where r.display_pro is null
   and r.user_id is not null;

-- ---------- 3) a dynasty says when it is still going ------------------------
-- ps_dynasty_tag is restated with THE SAME SIGNATURE, because the grant below
-- names it in full and 98's header explains at length why widening a function
-- here is the thing to avoid. All that changes is one more column written.
create or replace function public.ps_dynasty_tag(
  p_row bigint, p_dynasty_id uuid, p_season int, p_score bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'sign in to record a run';
  end if;
  if p_dynasty_id is null then
    raise exception 'a run needs an id';
  end if;
  if p_season is null or p_season < 1 or p_season > 500 then
    raise exception 'that is not a number of seasons';
  end if;
  if p_score is null or p_score < 0 or p_score > 100000000000 then
    raise exception 'that is not a score';
  end if;
  update public.ps_runs
     set dynasty_id     = p_dynasty_id,
         dynasty_season = p_season,
         dynasty_score  = p_score,
         /* NOT a plain false. A season filed after the run has already been
            marked finished must not resurrect it, and a replayed tag on an old
            row must not either. */
         dynasty_over   = coalesce(dynasty_over, false)
   where id = p_row
     and user_id = v_user
     and run_mode = 'dynasty';

  /* RESTATED FROM 98 RATHER THAN REWRITTEN, and this clause is why that matters.
     Dropping it would turn a tag of somebody else's row from an error into a
     silent no-op, which is the 105-restating-102 mistake this repo has already
     made once. Everything above is 98's body with one column added. */
  if not found then
    raise exception 'no dynasty run of yours to tag';
  end if;
end;
$$;

revoke all on function public.ps_dynasty_tag(bigint,uuid,int,bigint) from public;
grant execute on function public.ps_dynasty_tag(bigint,uuid,int,bigint) to authenticated;

-- AND WHEN IT ENDS. Its own function rather than a fifth argument on the tag,
-- because the two happen at different moments: a tag lands with each season and
-- this lands once, after the last one, from the screen that reports the fate.
-- It stamps every row of the run so the board's DISTINCT ON reads it whichever
-- season happens to be furthest.
create or replace function public.ps_dynasty_end(p_dynasty_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'sign in to record a run';
  end if;
  if p_dynasty_id is null then
    raise exception 'a run needs an id';
  end if;
  /* NO `if not found then raise`, and that is the one place this deliberately parts from
     the tag above. The tag's caller has a row id it was just handed and a raise is how a
     wrong one is found; this is fire and forget from a screen that never reads the answer,
     and it runs a second time whenever somebody presses Draft again after a firing, by
     which point the save is gone and the id may be the one already stamped. A no-op is the
     correct outcome there, not an error nobody is listening for. */
  update public.ps_runs
     set dynasty_over = true
   where dynasty_id = p_dynasty_id
     and user_id = v_user;
end;
$$;

revoke all on function public.ps_dynasty_end(uuid) from public;
grant execute on function public.ps_dynasty_end(uuid) to authenticated;
revoke all on function public.ps_is_pro(uuid) from public;

-- ---------- 4) the view carries both ----------------------------------------
-- Added at the END of the select list, which is what lets create or replace take
-- it: an existing column may not change name, type or position.
create or replace view public.ps_dynasty_board
with (security_invoker = true) as
  select distinct on (r.dynasty_id)
         r.dynasty_id,
         r.dynasty_season as seasons,
         r.dynasty_score  as score,
         r.display_name,
         r.created_at,
         r.user_id,
         r.display_color,
         r.display_initials,
         r.display_mark,
         r.display_rung,
         r.display_tier,
         r.display_ring,
         r.dynasty_over,
         r.display_pro
    from public.ps_runs r
   where r.dynasty_id is not null
     and r.display_name is not null
   order by r.dynasty_id, r.dynasty_season desc, r.dynasty_score desc;

grant select on public.ps_dynasty_board to anon, authenticated;
grant select on public.ps_runs to anon, authenticated;

analyze public.ps_runs;

notify pgrst, 'reload schema';
