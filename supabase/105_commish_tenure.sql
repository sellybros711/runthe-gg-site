-- ---------------------------------------------------------------------------
-- 105_commish_tenure.sql : years in the chair, one board for everybody
--
-- Safe to run more than once. Depends on 96_commish_terms.sql and on `profiles`.
--
-- WHAT IT ADDS
--   * commish_tenure_board()  the longest serving commissioners, across every doctrine
--   * commish_my_tenure()     your own total, and where it stands
--
-- ---------------------------------------------------------------------------
-- WHY THIS ONE IS ALLOWED TO BE A SINGLE BOARD
-- ---------------------------------------------------------------------------
-- 96 argues, at length and correctly, against one leaderboard by score: the way to do well
-- on six report cards at once is to upset nobody, so a board like that quietly tells every
-- commissioner to play the same careful term. Nothing here reopens that. The doctrine boards
-- stay exactly as they are and the score is still ranked inside a doctrine.
--
-- Tenure is the one axis with no set of values behind it. You can last forty years as a
-- Landlord or as a Reformer; the room removes you for losing it, not for what you believed.
-- So "who has spent the most years running college football" can be asked of everybody at
-- once without telling anybody how to play, which is the test every global board has to pass
-- and the reason there is exactly one of them.
--
-- ---------------------------------------------------------------------------
-- IT SUMS, AND THAT IS A DECISION ABOUT WHAT `years` MEANS
-- ---------------------------------------------------------------------------
-- A row's `years` is ONE CONTRACT, not a career: renewTerm() sets world.startYear to the
-- current year, so a commissioner who served five years and was then renewed for eight files
-- two rows of 5 and 8 rather than one of 13. Ranking on max(years) would therefore rank the
-- longest CONTRACT and quietly punish the player the mode is most pleased with, the one the
-- room kept signing again.
--
-- So the board sums. What it measures is every year that account has spent in the chair,
-- across renewals and across careers, which is the honest reading of "longest serving" and
-- is also the number that goes up when somebody comes back.
--
-- THE TIEBREAK IS FEWER TERMS, and it is doing real work. Twenty years over two contracts and
-- twenty over six are not the same commissioner: the first survived, the second kept being
-- handed the job again. Both are on the board, the longer stints are above, and `terms` is
-- returned so a reader can see which is which rather than being asked to trust the order.
--
-- ---------------------------------------------------------------------------
-- A TERM WITH NO SCORE STILL COUNTS HERE
-- ---------------------------------------------------------------------------
-- commish_doctrine_board excludes a null score because a board sorted by score cannot rank a
-- row that has none. This one is not sorted by score, and a term that ended before a season
-- was played is still time somebody spent doing the job. Only `hidden` is excluded, which is
-- the moderation flag and means the same thing on every board.
-- ---------------------------------------------------------------------------

-- The board's own sort. Per user, so the group-by does not walk the whole table, and
-- partial on hidden for the same reason the 96 index is.
create index if not exists commish_terms_tenure_idx
  on public.commish_terms (user_id, years)
  where not hidden;

-- ---------- 1) the board ----------------------------------------------------
-- ONE ROW PER ACCOUNT, not one per term, because the question is about a person. `profiles`
-- is left joined the way 96 does it: an account with no profile row is still on the board,
-- with a null name the page renders as an anonymous commissioner rather than dropping.
create or replace function public.commish_tenure_board(p_limit int default 20)
returns table (
  place int, years bigint, terms int, longest smallint,
  removed int, champions bigint, first_at timestamptz,
  author_name text, author_color text, author_initials text
)
language sql
stable
security definer
set search_path = public
as $$
  with per_user as (
    select t.user_id,
           sum(t.years)::bigint            as years,
           count(*)::int                   as terms,
           max(t.years)::smallint          as longest,
           count(*) filter (where t.removed)::int as removed,
           sum(t.champions)::bigint        as champions,
           min(t.created_at)               as first_at
      from commish_terms t
     where not t.hidden
     group by t.user_id
  )
  select (row_number() over (order by u.years desc, u.terms, u.first_at))::int as place,
         u.years, u.terms, u.longest, u.removed, u.champions, u.first_at,
         p.username, p.avatar_color, p.avatar_initials
    from per_user u
    left join profiles p on p.id = u.user_id
   order by u.years desc, u.terms, u.first_at
   limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- ---------- 2) where you stand --------------------------------------------
-- YOUR PLACE IS COUNTED AGAINST EVERYBODY, not against the fifty rows the board returns.
-- A page that worked out "you are 51st" by failing to find you in the top fifty would tell
-- the two hundredth commissioner the same thing as the fifty first.
--
-- It answers for a signed OUT reader too, with nulls and a total, because the standings
-- screen is drawn before anybody has finished a term and "you have not served yet" is a
-- real answer rather than an error.
create or replace function public.commish_my_tenure()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_years bigint;
  v_terms int;
  v_longest smallint;
  v_place int;
  v_total int;
begin
  select count(distinct user_id)::int into v_total
    from commish_terms where not hidden;

  if v_user is null then
    return jsonb_build_object('served', false, 'total', coalesce(v_total, 0));
  end if;

  select sum(years)::bigint, count(*)::int, max(years)::smallint
    into v_years, v_terms, v_longest
    from commish_terms
   where user_id = v_user and not hidden;

  if v_years is null then
    return jsonb_build_object('served', false, 'total', coalesce(v_total, 0));
  end if;

  -- THE SAME ORDER THE BOARD USES, written out rather than reusing it, because a place that
  -- disagreed with the board it is drawn beside is worse than no place at all. One is above
  -- you if it has more years, or the same years in fewer terms, or both the same and got
  -- there first.
  select count(*)::int + 1 into v_place
    from (
      select user_id, sum(years) as years, count(*) as terms, min(created_at) as first_at
        from commish_terms where not hidden group by user_id
    ) u
   where u.user_id <> v_user
     and (u.years > v_years
       or (u.years = v_years and u.terms < v_terms)
       or (u.years = v_years and u.terms = v_terms
           and u.first_at < (select min(created_at) from commish_terms
                              where user_id = v_user and not hidden)));

  return jsonb_build_object(
    'served', true,
    'years', v_years,
    'terms', v_terms,
    'longest', v_longest,
    'place', v_place,
    'total', coalesce(v_total, 0)
  );
end $$;

-- ---------- 3) who may call them --------------------------------------------
-- The board is public: it is made of the same finished terms `commish_terms` already lets
-- anybody select. Your own standing needs a session, and answers honestly without one.
grant execute on function public.commish_tenure_board(int) to anon, authenticated;
grant execute on function public.commish_my_tenure() to anon, authenticated;
