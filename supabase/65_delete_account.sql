-- ============================================================================
-- 65_delete_account.sql  —  let a signed-in player delete their own account
-- ============================================================================
-- The profile screen grew a "Delete my account" button and there was nothing behind it:
-- no RPC, and no RLS delete policy on any table, so the client could not remove a single
-- row of its own. A button that cannot do what it says is worse than no button.
--
-- WHY ONE FUNCTION AND NOT A SET OF DELETE POLICIES. The account is one row in
-- auth.users and everything else hangs off it, already wired: four tables cascade when it
-- goes and seven set their user_id to null, which is the schema saying, correctly, that a
-- score can outlive the person who set it. Opening a delete policy on each of a dozen game
-- tables would be a much larger blast radius for the same result. So the client deletes the
-- ONE row it owns, through a function that can reach auth.users, and the foreign keys that
-- were designed for this do the rest.
--
-- WHAT A PLAYER LOSES: their sign-in, their name and circle, and their claim on every run
-- they have posted in every game. Runs on cascade tables go; runs on set-null tables stay
-- on the leaderboard with nobody's name against them, because ps_runs and friends never
-- stored a name -- the board joins profiles for it, and the profile is gone.
--
-- THIS IS NOT FOOTBALL-ONLY. One RunThe.GG account plays every game on the site, so this
-- ends the account everywhere: The Perfect Season, RunTheTour, RunThePitch, the college
-- game, all of it. The button says so before it does anything.
-- ----------------------------------------------------------------------------

create or replace function public.rtg_delete_my_account()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid  uuid := auth.uid();
  v_sub  text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  /* BILLING FIRST, AND IT REFUSES.
     `subscriptions` cascades off auth.users, so deleting the account here would drop the
     only local record of a live Stripe subscription while Stripe carried on charging the
     card, with nothing left to reconcile it against. There is no cancel endpoint on this
     site yet -- functions/api/stripe/ has checkout and webhook and nothing else -- so this
     cannot end the subscription itself and must not pretend to. It stops and says so, and
     the player cancels first. Refusing is recoverable; silently billing somebody for an
     account they deleted is not. */
  select status into v_sub
    from public.subscriptions
   where user_id = v_uid
     and status in ('active', 'trialing', 'past_due')
   limit 1;

  if v_sub is not null then
    return json_build_object('ok', false, 'reason', 'active_subscription', 'status', v_sub);
  end if;

  /* The profile goes explicitly rather than by cascade, so that the runs which survive on
     set-null tables have already lost their name by the time this returns. */
  delete from public.profiles where id = v_uid;

  delete from auth.users where id = v_uid;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.rtg_delete_my_account() from public, anon;
grant execute on function public.rtg_delete_my_account() to authenticated;

comment on function public.rtg_delete_my_account() is
  'Deletes the calling user''s own account across every RunThe.GG game. Refuses while a '
  'Stripe subscription is active, trialing or past_due, because nothing here can cancel it.';
