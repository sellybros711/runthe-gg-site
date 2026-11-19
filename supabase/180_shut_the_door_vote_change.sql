-- ---------------------------------------------------------------------------
-- 180_shut_the_door_vote_change.sql : change your vote for tomorrow.
--
-- The owner's call (2026-11-18): a signed-in player who voted may move the vote
-- to the other candidate until the vote closes (the same cutoff as a first vote:
-- only for tomorrow, so it closes when tomorrow begins, Eastern). Still one vote
-- per account per day: the change rewrites the player's one row in
-- shutdoor_votes, so the tally moves a vote and never adds one. The lock
-- (shutdoor_vote_lock, 160) is unchanged: it counts the rows when the day begins.
--
-- What changes, over 164:
--   shutdoor_vote        adds canChange: signed in, voted, and the vote still open.
--                        canVote keeps its meaning (a first vote is open) and why
--                        stays 'you voted', so a page from before this reads the
--                        same answer as before and shows the vote as final.
--   shutdoor_vote_cast   a second cast for the other candidate moves the vote.
--                        A cast for the same candidate changes nothing.
--
-- Safe to run more than once. Needs 160, 163 and 164. Run it before or after the
-- site PR merges: the page reads canChange only when the server sends it, and
-- the server's canVote is the same as before. After any rerun of 160 or 164,
-- run 180 again. It does not touch shutdoor_vote_candidates.
-- ---------------------------------------------------------------------------

begin;

-- what the page shows for a day's vote:
-- {day, epoch, open, candidates [A, B], myVote, votes {a, b} | null, winner, canVote, canChange, why}.
-- votes are shown once the day is locked, or to a player who has voted
create or replace function public.shutdoor_vote(p_day date) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text[]; w text; mine text; va int; vb int;
        can boolean := false; chg boolean := false; why text;
begin
  c := shutdoor_vote_candidates(p_day);
  if c is null then
    return json_build_object('day', p_day, 'epoch', shutdoor_vote_epoch(), 'open', false, 'candidates', null,
                             'myVote', null, 'votes', null, 'winner', null, 'canVote', false, 'canChange', false,
                             'why', 'no vote for that day');
  end if;
  w := shutdoor_vote_lock(p_day);
  if uid is not null then select x.pack into mine from shutdoor_votes x where x.day = p_day and x.user_id = uid; end if;
  select count(*) filter (where x.pack = c[1]), count(*) filter (where x.pack = c[2]) into va, vb
    from shutdoor_votes x where x.day = p_day;
  if p_day <> shutdoor_today() + 1 then why := 'voting is closed';
  elsif uid is null then why := 'sign in to vote';
  elsif mine is not null then why := 'you voted'; chg := true;
  else can := true;
  end if;
  return json_build_object('day', p_day, 'epoch', shutdoor_vote_epoch(), 'open', p_day = shutdoor_today() + 1,
    'candidates', c, 'myVote', mine,
    'votes', case when w is not null or mine is not null then json_build_object('a', va, 'b', vb) end,
    'winner', w, 'canVote', can, 'canChange', chg, 'why', why);
end $$;

-- one vote for tomorrow, signed in, played today or not. A second cast moves it to the
-- other candidate while the vote is open: the same row, so the tally never gains a vote.
-- Answers shutdoor_vote(p_day)
create or replace function public.shutdoor_vote_cast(p_day date, p_pack text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text[];
begin
  if uid is null then raise exception 'sign in to vote'; end if;
  if p_day is distinct from shutdoor_today() + 1 then raise exception 'voting is closed'; end if;
  c := shutdoor_vote_candidates(p_day);
  if c is null then raise exception 'no vote for that day'; end if;
  if p_pack is null or not (p_pack = any(c)) then raise exception 'not a candidate'; end if;
  insert into shutdoor_votes (day, user_id, pack) values (p_day, uid, p_pack)
    on conflict (day, user_id) do update set pack = excluded.pack
    where shutdoor_votes.pack is distinct from excluded.pack;
  return shutdoor_vote(p_day);
end $$;

revoke all on function public.shutdoor_vote(date) from public;
revoke all on function public.shutdoor_vote_cast(date, text) from public;
grant execute on function public.shutdoor_vote(date) to anon, authenticated;
grant execute on function public.shutdoor_vote_cast(date, text) to authenticated;

commit;
