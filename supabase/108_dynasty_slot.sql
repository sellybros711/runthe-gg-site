-- 108_dynasty_slot.sql
--
-- ONE ACCOUNT HAD FOUR LIVE DYNASTIES ON THE BOARD, AND IT CAN ONLY EVER HAVE TWO.
--
-- Reported with a screenshot: rows 13, 18, 19 and 20 of the Dynasty board all wore the LIVE
-- badge and all belonged to one player. The football page has exactly two dynasty slots
-- (`open` and `club` in FB_SLOTS), so at most two of an account's runs can be in progress.
--
-- WHAT LIVE MEANT BEFORE THIS. 107 added `dynasty_over`, written false when a season is
-- filed and true when `dynClear` posts `ps_dynasty_end`. The page then refused to call
-- anything live whose furthest season was over 48 hours old. So the badge really said "not
-- explicitly ended, and played recently", and the first half is the weak one:
--
--   * `dynClear` finds the dynasty id by reading the LOCAL SAVE. Clear site data, come back
--     on another device, or simply close the tab and never return, and there is no save to
--     read: the id is unfindable, nothing is ever posted, and the run reads live until the
--     48 hours run out.
--   * A new draft ends only the run in the SLOT IT TAKES, which is correct and is not
--     enough: it says nothing about a run whose save has already gone.
--
-- So a tester who played four runs in two days lit four badges, and every one of them was
-- a true statement of "played recently" wearing a word that means something else.
--
-- WHAT THE SERVER WAS MISSING IS THE SLOT. It knows every dynasty and when each one's
-- furthest season landed. It does not know which of the two slots a run occupied, so it
-- cannot tell the newest run in a slot from one abandoned behind it. With the slot, live
-- becomes exactly what a reader thinks it means: THE NEWEST UNFINISHED RUN IN EACH SLOT.
-- Two an account, enforced by arithmetic on rows the server already has, rather than by
-- hoping a fire-and-forget client call got through.
--
-- IT REPAIRS THE ROWS ALREADY THERE, which is the reason the fallback bucket below is not
-- a loose end. Every dynasty filed before today has a null slot, and they all fall into one
-- bucket, so an account's older unfinished runs stop being current the moment a newer one
-- exists. Joeyb2000's four become one. An account that genuinely had two going before today
-- loses one badge until its next season is filed, which is the small error in the quiet
-- direction, and it is self-healing.
--
-- WITHOUT THIS MIGRATION NOTHING CHANGES. `ps_dynasty_board` gains a column, the page reads
-- it as "the server has no opinion" when it is absent, and the badge behaves exactly as it
-- did under 107 alone. Same shape as every other optional column on these rows.
--
--   psql ... -f supabase/108_dynasty_slot.sql
--
-- Needs: 98_football_gauntlet_board.sql, 107_board_pro_and_live.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The column
-- ─────────────────────────────────────────────────────────────────────────────
--
-- TEXT AND NOT AN ENUM, deliberately. `FB_SLOTS` is a page-side object and a third dynasty
-- slot is a page-side decision; an enum would make adding one a migration, and the server
-- has no opinion about what the slots are called. What it needs is only that two runs in
-- different slots are told apart.
--
-- NULL IS THE HONEST DEFAULT and never a backfilled guess. Every row written before today
-- was filed by a client that did not know to send this, and inventing `open` for all of
-- them would say that a club dynasty was an open one. Null means "not recorded", which is
-- exactly true, and the view below treats the whole of that history as one bucket.

alter table public.ps_runs
  add column if not exists dynasty_slot text;

-- The view below ranks a user's dynasties within a slot by when each one's furthest season
-- landed. Everything it needs beyond the existing dynasty index is on this one.
create index if not exists ps_runs_dynasty_slot_idx
  on public.ps_runs (user_id, dynasty_slot, created_at desc)
  where dynasty_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The tag takes the slot
-- ─────────────────────────────────────────────────────────────────────────────
--
-- RESTATED FROM 107 RATHER THAN ALTERED, and the note 107 carries about restating 98
-- applies again: the body below is 107's with one column added and one argument in front of
-- it. Every clause it already had is still here, including the `if not found then raise`,
-- which is the one a careless restatement drops and which turns tagging somebody else's row
-- from an error into a silent no-op.
--
-- A DEFAULT, so a browser one deploy behind still files its seasons rather than failing on
-- an argument it has never heard of.
--
-- A SLOT BELONGS TO THE DYNASTY AND IS STORED ON A SEASON, which is the join this function
-- has to close and the first draft of it did not. Every season is its OWN ROW, so a
-- `coalesce(p_slot, dynasty_slot)` on the row being written looks at a row that was inserted
-- a moment ago and is null by construction: it reads like it defends the recorded slot and
-- defends nothing. One season filed by a stale browser would then be the furthest season,
-- the view reads the slot off that row, and a perfectly well recorded dynasty drops into the
-- null bucket. So a null argument INHERITS the slot the dynasty already carries, which also
-- covers a tag replayed over a season that recorded one, because the lookup reads that row
-- too.
--
-- THE OLD SIGNATURE IS DROPPED, and that is the choice worth reading. Left in place,
-- PostgREST would have two `ps_dynasty_tag` overloads and would resolve a four-argument call
-- to the old one, which writes no slot: the page could be updated, look correct, and go on
-- filing rows the view cannot rank. One function, one behaviour.

drop function if exists public.ps_dynasty_tag(bigint, uuid, int, bigint);

create or replace function public.ps_dynasty_tag(
  p_row bigint, p_dynasty_id uuid, p_season int, p_score bigint, p_slot text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_slot text := p_slot;
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
  /* A slot is a short name the page chose, so the only thing worth refusing is something
     long enough to be somebody probing. An unknown name is not an error: a fourth slot
     would arrive here before this file had heard of it, and the view ranks by whatever
     string it is given. */
  if p_slot is not null and length(p_slot) > 16 then
    raise exception 'that is not a slot';
  end if;

  /* The dynasty's own answer, when this season did not bring one. Scoped to the caller for
     the same reason the update below is: a dynasty id is a guess away and nothing here may
     read a row somebody else owns. Furthest season rather than newest row, because that is
     the row the board reads the slot off. */
  if v_slot is null then
    select r.dynasty_slot into v_slot
      from public.ps_runs r
     where r.dynasty_id = p_dynasty_id
       and r.user_id = v_user
       and r.dynasty_slot is not null
     order by r.dynasty_season desc
     limit 1;
  end if;

  update public.ps_runs
     set dynasty_id     = p_dynasty_id,
         dynasty_season = p_season,
         dynasty_score  = p_score,
         /* NOT a plain false. A season filed after the run has already been
            marked finished must not resurrect it, and a replayed tag on an old
            row must not either. */
         dynasty_over   = coalesce(dynasty_over, false),
         /* NOT `coalesce(v_slot, dynasty_slot)`, which was written here first and is dead:
            the lookup above reads the dynasty's rows INCLUDING this one once it has been
            tagged, so a row that carries a slot is a row whose dynasty carries one, and
            `v_slot` is null only when nothing anywhere has an answer. A defence that cannot
            be reached is a defence nothing can prove, and its comment is a claim. */
         dynasty_slot   = v_slot
   where id = p_row
     and user_id = v_user
     and run_mode = 'dynasty';

  if not found then
    raise exception 'no dynasty run of yours to tag';
  end if;
end;
$$;

revoke all on function public.ps_dynasty_tag(bigint,uuid,int,bigint,text) from public;
grant execute on function public.ps_dynasty_tag(bigint,uuid,int,bigint,text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The board answers whether a run is the CURRENT one in its slot
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `dynasty_over` keeps meaning exactly what it meant: was this run explicitly ended.
-- `dynasty_current` is the new and separate question: of this account's runs in this slot,
-- is this the latest one. The page needs both, and folding them into one column would make
-- "ended" un-askable and take 107's own test with it.
--
-- TWO LEVELS, because the window has to run over the COLLAPSED set. `distinct on` keeps one
-- row per dynasty (its furthest season), and ranking has to happen after that or a long run
-- would out-rank a newer short one on the strength of having more rows.
--
-- RANKED OVER ALL OF THE ACCOUNT'S RUNS IN THE SLOT, not only the unfinished ones, and that
-- is the clause most likely to be "simplified" wrongly. Rank the unfinished alone and an
-- abandoned run whose slot was later taken by a run that has since FINISHED comes back to
-- the top and wears the badge again. Rank everything and require `dynasty_over is false`,
-- and a finished newer run correctly retires the stale one behind it.
--
-- A GUEST IS NOT RANKED. `user_id` is null for a run filed by nobody, so a partition on it
-- would put every guest run in the world into one bucket and leave exactly one of them
-- current. There is no account to own two slots, so the cap does not apply and the answer
-- falls back to 107's.
--
-- THE COLUMN ORDER IS 107'S, WITH THE NEW ONE APPENDED, and that is load-bearing rather than
-- tidy. `create or replace view` may add columns to the END and may not rename or reorder
-- what is there, so writing the select in a more natural order fails outright with "cannot
-- change name of view column". A `drop view` first would work and is worse: it takes the
-- grants with it and leaves a window where the board does not exist.

create or replace view public.ps_dynasty_board
with (security_invoker = true) as
  with runs as (
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
           r.display_pro,
           r.dynasty_slot
      from public.ps_runs r
     where r.dynasty_id is not null
       and r.display_name is not null
     order by r.dynasty_id, r.dynasty_season desc, r.dynasty_score desc
  )
  select dynasty_id, seasons, score, display_name, created_at, user_id,
         display_color, display_initials, display_mark, display_rung,
         display_tier, display_ring, dynasty_over, display_pro,
         case
           when dynasty_over is distinct from false then false
           when user_id is null then true
           else row_number() over (
                  partition by user_id, coalesce(dynasty_slot, '')
                  order by created_at desc, dynasty_id
                ) = 1
         end as dynasty_current
    from runs;

grant select on public.ps_dynasty_board to anon, authenticated;

-- security_invoker means the reader's own privileges apply to ps_runs too. Already granted
-- for the classic board, so this is a no-op on a live database and the net on a fresh one.
grant select on public.ps_runs to anon, authenticated;

analyze public.ps_runs;

-- The tag gained an argument and the board gained a column, and PostgREST answers out of a
-- cached schema. Without this the page's five argument call resolves to nothing for as long
-- as that cache is warm, which is a season filed and not tagged: a run that vanishes off the
-- board with nothing on screen to say so.
notify pgrst, 'reload schema';
