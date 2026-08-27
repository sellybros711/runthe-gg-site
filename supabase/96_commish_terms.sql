-- ---------------------------------------------------------------------------
-- 96_commish_terms.sql : finished terms, and the doctrine each one turned out to have
--
-- Safe to run more than once. Depends on nothing in 95, but it is the same idea one level
-- up: 95 records what you did with ONE item, this records what a whole term added up to.
--
-- WHAT IT ADDS
--   * commish_terms            one row per finished term
--   * commish_finish_term()    record a term and get back where it stands
--   * commish_doctrine_split() how many commissioners came out each way
--   * commish_doctrine_board() the best terms inside one doctrine
--   * commish_my_terms()       your own, newest first
--   * commish_term_standing()  where one term sits inside its own doctrine
--   * commish_move_doctrine()  the owner's hand, for a doctrine that gets renamed
--
-- ---------------------------------------------------------------------------
-- WHY RANK INSIDE A DOCTRINE RATHER THAN ACROSS ALL OF THEM
-- ---------------------------------------------------------------------------
-- One leaderboard by score puts every commissioner on the same line, and the line rewards
-- one way of playing: report.js grades the books, the audience, the room, the competition,
-- access and the map, and the way to do well on six cards at once is to upset nobody. A
-- board like that quietly tells everybody to play the same careful term.
--
-- What this game is actually about is which side you took. So the doctrine comes first and
-- the score comes second: the question is not "who was the best commissioner" but "of the
-- people who believed what you believe, who did it best". Nine boards, nine ways to be
-- top of one, and no way to be top of all of them at once.
--
-- ---------------------------------------------------------------------------
-- THE SPLIT COUNTS PEOPLE. THE BOARD COUNTS TERMS.
-- ---------------------------------------------------------------------------
-- Two different questions and they need two different denominators.
--
-- "15% of commissioners were Landlords" is a claim about PEOPLE, so it counts each account
-- once, at its most recent term. Counting every term would let one player who replayed
-- eleven times as a Landlord move the number the rest are measured against, which is the
-- same replay-farming problem 95_commish_choices.sql solved with a primary key.
--
-- "Your term is 4th of 61" is a claim about TERMS, and every term is a real one that was
-- really played. Both are kept, deliberately, and the RPCs are named for which is which.
-- ---------------------------------------------------------------------------

-- ---------- 1) the doctrines ------------------------------------------------
-- ONE LIST, HERE, and the check constraint reads it. The ids are slugs rather than the
-- display names in cfb/commish/doctrine.js on purpose: renaming "The Landlord" on the card
-- must not orphan every term recorded under it. If doctrine.js gains a tenth archetype this
-- is the line that has to change with it, and until it does the insert is refused rather
-- than silently filed under something else.
create or replace function public.commish_doctrine_ok(p text)
returns boolean
language sql immutable as $$
  select p in ('purse+','purse-','gate+','gate-','stage+','stage-',
               'throne+','throne-','none');
$$;

-- ---------- 2) the terms ----------------------------------------------------
create table if not exists public.commish_terms (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  doctrine   text not null,
  -- THE FOUR AXES, IN THE ORDER doctrine.js PACKS THEM: purse, gate, stage, throne. Each
  -- -100..100. Stored as columns rather than as one array so a board can sort or filter on
  -- any of them later without rewriting every row.
  purse      smallint not null,
  gate       smallint not null,
  stage      smallint not null,
  throne     smallint not null,
  -- What report.js made of it, kept beside the doctrine rather than instead of it. A term
  -- ungraded (no season played) records as null and simply does not appear on a board.
  score      smallint,
  grade      text,
  removed    boolean not null default false,
  years      smallint not null default 0,
  rulings    smallint not null default 0,
  champions  smallint not null default 0,
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'commish_terms_doctrine_ck') then
    alter table public.commish_terms add constraint commish_terms_doctrine_ck
      check (commish_doctrine_ok(doctrine));
  end if;
  -- THE AXES ARE BOUNDED AND THE TABLE SAYS SO. doctrine.js clamps to -100..100, but this
  -- is reachable with the anon key and a row at 32000 would stretch every bar drawn from
  -- this table for everybody.
  if not exists (select 1 from pg_constraint where conname = 'commish_terms_axes_ck') then
    alter table public.commish_terms add constraint commish_terms_axes_ck
      check (purse between -100 and 100 and gate between -100 and 100
         and stage between -100 and 100 and throne between -100 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'commish_terms_score_ck') then
    alter table public.commish_terms add constraint commish_terms_score_ck
      check (score is null or score between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'commish_terms_grade_ck') then
    alter table public.commish_terms add constraint commish_terms_grade_ck
      check (grade is null or grade in ('A','B','C','D','F'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'commish_terms_count_ck') then
    alter table public.commish_terms add constraint commish_terms_count_ck
      check (years between 0 and 40 and rulings between 0 and 400
         and champions between 0 and 40);
  end if;
end $$;

-- The board's own sort: best term inside one doctrine. Partial on hidden and on a null
-- score because both are invisible to every board query, so the index should not carry them.
create index if not exists commish_terms_board_idx
  on public.commish_terms (doctrine, score desc, created_at)
  where not hidden and score is not null;
-- "Mine", the rate limit, and the one-row-per-person split below.
create index if not exists commish_terms_user_idx
  on public.commish_terms (user_id, created_at desc);

-- ---------- 3) who may read what --------------------------------------------
alter table public.commish_terms enable row level security;

-- A FINISHED TERM IS A PUBLIC RESULT, the same way a leaderboard row is: the doctrine, the
-- four axes and the score are what the boards are made of. What is NOT here is any record
-- of which items produced them, which lives in commish_choices and is readable only by the
-- person who ruled.
drop policy if exists "commish_terms read" on public.commish_terms;
create policy "commish_terms read" on public.commish_terms for select using (not hidden);

-- No insert, update or delete policy. Writes go through commish_finish_term().
grant select on public.commish_terms to anon, authenticated;

-- ---------- 4) recording one ------------------------------------------------
-- ONE ROUND TRIP DOES BOTH, the same bargain commish_rule() makes: the ending screen wants
-- the standing the instant the term is over, and asking for it separately means painting
-- that screen twice. The rank it returns INCLUDES this term, because this term is one of
-- the ones that were played.
create or replace function public.commish_finish_term(
  p_doctrine text,
  p_axes     smallint[],
  p_score    smallint default null,
  p_grade    text default null,
  p_removed  boolean default false,
  p_years    smallint default 0,
  p_rulings  smallint default 0,
  p_champions smallint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_recent integer;
  v_id bigint;
begin
  if not commish_doctrine_ok(p_doctrine) then
    raise exception 'that is not a doctrine';
  end if;
  if p_axes is null or array_length(p_axes, 1) <> 4 then
    raise exception 'a doctrine has four axes';
  end if;

  -- NOT SIGNED IN IS NOT AN ERROR, per commish_rule(): the ending screen still gets the
  -- split and the board, the term just does not join them, and the page says which.
  if v_user is null then
    return commish_doctrine_split() || jsonb_build_object('recorded', false);
  end if;

  -- A term is five seasons and about forty five rulings. Nobody finishes twenty in an hour.
  select count(*) into v_recent from commish_terms
   where user_id = v_user and created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    raise exception 'that is a lot of terms for one hour';
  end if;

  insert into commish_terms (user_id, doctrine, purse, gate, stage, throne,
                             score, grade, removed, years, rulings, champions)
  values (v_user, p_doctrine, p_axes[1], p_axes[2], p_axes[3], p_axes[4],
          p_score, p_grade, coalesce(p_removed, false),
          coalesce(p_years, 0), coalesce(p_rulings, 0), coalesce(p_champions, 0))
  returning id into v_id;

  return commish_doctrine_split()
    || commish_term_standing(p_doctrine, p_score)
    || jsonb_build_object('recorded', true, 'id', v_id);
end $$;

-- ---------- 5) the split ----------------------------------------------------
-- HOW MANY COMMISSIONERS CAME OUT EACH WAY, counting each account ONCE at its most recent
-- term. See the note at the top for why this denominator is people and the board's is terms.
--
-- Comes back the same shape commish_split() uses in 95, so a page that can draw one can
-- draw the other:
--   { "total": 214, "counts": { "purse-": 41, "throne+": 33, ... } }
create or replace function public.commish_doctrine_split()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select distinct on (user_id) user_id, doctrine
      from commish_terms
     where not hidden
     order by user_id, created_at desc
  ), tally as (
    select doctrine, count(*)::int as n from latest group by doctrine
  )
  select jsonb_build_object(
    'total',  coalesce((select sum(n) from tally), 0),
    'counts', coalesce((select jsonb_object_agg(doctrine, n) from tally), '{}'::jsonb)
  );
$$;

-- WHERE ONE TERM STANDS INSIDE ITS OWN DOCTRINE. Counting terms, not people: every row here
-- was a term somebody really played.
--
-- An ungraded term (no season finished, so report.js had nothing to grade) gets a place of
-- null rather than of last. It is not a bad term, it is an unfinished one, and putting it
-- bottom of a board would be a claim the data does not support.
create or replace function public.commish_term_standing(p_doctrine text, p_score smallint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'doctrine', p_doctrine,
    'terms', (select count(*)::int from commish_terms
               where doctrine = p_doctrine and not hidden and score is not null),
    'place', case when p_score is null then null else
      (select count(*)::int + 1 from commish_terms
        where doctrine = p_doctrine and not hidden and score > p_score) end
  );
$$;

-- ---------- 6) the board ----------------------------------------------------
-- THE BEST TERMS INSIDE ONE DOCTRINE. The author joins on for the crest the rest of the
-- site draws. SECURITY INVOKER on the join would be the careful choice, but this is a
-- function rather than a view and it selects only the profile fields that are already world
-- readable on every other leaderboard here.
create or replace function public.commish_doctrine_board(p_doctrine text, p_limit int default 20)
returns table (
  place int, score smallint, grade text, removed boolean,
  years smallint, rulings smallint, champions smallint,
  purse smallint, gate smallint, stage smallint, throne smallint,
  created_at timestamptz,
  author_name text, author_color text, author_initials text
)
language sql
stable
security definer
set search_path = public
as $$
  select (row_number() over (order by t.score desc, t.created_at))::int as place,
         t.score, t.grade, t.removed, t.years, t.rulings, t.champions,
         t.purse, t.gate, t.stage, t.throne, t.created_at,
         p.username, p.avatar_color, p.avatar_initials
    from commish_terms t
    left join profiles p on p.id = t.user_id
   where t.doctrine = p_doctrine and not t.hidden and t.score is not null
   order by t.score desc, t.created_at
   limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- YOUR OWN TERMS, newest first, so a returning commissioner can be shown that they have
-- been a Landlord three times and a Reformer once.
create or replace function public.commish_my_terms(p_limit int default 20)
returns table (
  id bigint, doctrine text, score smallint, grade text, removed boolean,
  years smallint, rulings smallint, champions smallint,
  purse smallint, gate smallint, stage smallint, throne smallint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.doctrine, t.score, t.grade, t.removed, t.years, t.rulings, t.champions,
         t.purse, t.gate, t.stage, t.throne, t.created_at
    from commish_terms t
   where t.user_id = auth.uid()
   order by t.created_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- ---------- 6a) who may call these ------------------------------------------
-- REVOKE FROM PUBLIC FIRST. Postgres grants EXECUTE on a new function to PUBLIC, and anon
-- and authenticated are both members of PUBLIC, so revoking from those two role names takes
-- away a grant they never held and leaves the one they are using. Every function here is
-- security definer. See the same note in 95_commish_choices.sql, where this shipped wrong.
revoke execute on function public.commish_doctrine_split() from public;
revoke execute on function public.commish_term_standing(text, smallint) from public;
revoke execute on function public.commish_doctrine_board(text, int) from public;
revoke execute on function public.commish_my_terms(int) from public;
revoke execute on function public.commish_finish_term(text, smallint[], smallint, text,
  boolean, smallint, smallint, smallint) from public;

grant execute on function public.commish_doctrine_split() to anon, authenticated;
grant execute on function public.commish_term_standing(text, smallint) to anon, authenticated;
grant execute on function public.commish_doctrine_board(text, int) to anon, authenticated;
grant execute on function public.commish_finish_term(text, smallint[], smallint, text,
  boolean, smallint, smallint, smallint) to anon, authenticated;
-- Asking for YOUR terms needs an account, because without one there is no you to ask about.
grant execute on function public.commish_my_terms(int) to authenticated;

-- ---------- 7) fixing it ----------------------------------------------------
-- WHEN AN ARCHETYPE IS RENAMED OR RETIRED. The ids are slugs so the display name can change
-- freely, but if a doctrine is ever SPLIT or MERGED the rows filed under the old id are
-- describing a question that is no longer being asked. Owner's hand only.
create or replace function public.commish_move_doctrine(p_from text, p_to text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_rows integer;
begin
  if not commish_doctrine_ok(p_to) then
    raise exception 'that is not a doctrine';
  end if;
  update commish_terms set doctrine = p_to where doctrine = p_from;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

revoke execute on function public.commish_move_doctrine(text, text) from public;
