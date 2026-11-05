-- ---------------------------------------------------------------------------
-- 164_shut_the_door_vote_anytime.sql : vote for tomorrow without playing today.
--
-- The owner's call (2026-11-04): a signed-in player votes for tomorrow's daily
-- from the home page, whether or not they finished today's. 160 asked for
-- today's daily first (a row in shutdoor_outings); this recreates the two
-- functions without that. Everything else stays: signed in, one vote per
-- account (the first stands), only for tomorrow, only for a candidate.
--
-- Safe to run more than once. Needs 160 (and 163). Run it AFTER the site PR
-- merges and redeploys. Before it runs, the new home vote block shows the
-- server's old answer ("finish today's daily to vote") to a player who has not
-- played, so nothing breaks in between. After any rerun of 160, run 164 again.
-- ---------------------------------------------------------------------------

begin;

-- what the page shows for a day's vote:
-- {day, epoch, open, candidates [A, B], myVote, votes {a, b} | null, winner, canVote, why}.
-- votes are shown once the day is locked, or to a player who has voted
create or replace function public.shutdoor_vote(p_day date) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text[]; w text; mine text; va int; vb int; can boolean := false; why text;
begin
  c := shutdoor_vote_candidates(p_day);
  if c is null then
    return json_build_object('day', p_day, 'epoch', shutdoor_vote_epoch(), 'open', false, 'candidates', null,
                             'myVote', null, 'votes', null, 'winner', null, 'canVote', false, 'why', 'no vote for that day');
  end if;
  w := shutdoor_vote_lock(p_day);
  if uid is not null then select x.pack into mine from shutdoor_votes x where x.day = p_day and x.user_id = uid; end if;
  select count(*) filter (where x.pack = c[1]), count(*) filter (where x.pack = c[2]) into va, vb
    from shutdoor_votes x where x.day = p_day;
  if p_day <> shutdoor_today() + 1 then why := 'voting is closed';
  elsif uid is null then why := 'sign in to vote';
  elsif mine is not null then why := 'you voted';
  else can := true;
  end if;
  return json_build_object('day', p_day, 'epoch', shutdoor_vote_epoch(), 'open', p_day = shutdoor_today() + 1,
    'candidates', c, 'myVote', mine,
    'votes', case when w is not null or mine is not null then json_build_object('a', va, 'b', vb) end,
    'winner', w, 'canVote', can, 'why', why);
end $$;

-- one vote for tomorrow, signed in, played today or not. The first vote stands.
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
  insert into shutdoor_votes (day, user_id, pack) values (p_day, uid, p_pack) on conflict (day, user_id) do nothing;
  return shutdoor_vote(p_day);
end $$;

revoke all on function public.shutdoor_vote(date) from public;
revoke all on function public.shutdoor_vote_cast(date, text) from public;
grant execute on function public.shutdoor_vote(date) to anon, authenticated;
grant execute on function public.shutdoor_vote_cast(date, text) to authenticated;

commit;
