-- Run The Arcade — complimentary Arcade Card passes (testers / friends).
--
-- WHAT: grants an unlimited Arcade Card to specific accounts by writing a
-- subscriptions row the same shape the Stripe webhook writes, so
-- arcade_card_active(uid) returns true for them (status active + a far-future
-- period end). No Stripe customer/subscription is involved - price_id 'comp'
-- marks these as hand-granted so they're easy to find and revoke later.
--
-- HOW TO RUN: paste into the Supabase SQL editor and run. Idempotent - safe to
-- re-run (re-runs just refresh the row). Each grantee must have ALREADY created
-- their RunThe account with the username below; a username with no account yet
-- is reported in the final SELECT and simply skipped (re-run after they sign up).
--
-- TO REVOKE later:
--   update public.subscriptions set status='canceled'
--   where price_id='comp' and user_id in (select id from profiles where username in (...));

insert into public.subscriptions (user_id, status, price_id, current_period_end, updated_at)
select p.id, 'active', 'comp', timestamptz '2100-01-01', now()
from profiles p
where p.username in ('hburg31', 'jaredl114', 'trashcan')
on conflict (user_id) do update
  set status             = 'active',
      price_id           = 'comp',
      current_period_end = timestamptz '2100-01-01',
      updated_at         = now();

-- Report: who got the pass, and flag any username that has no account yet.
select u.username,
       case when p.id is null then 'NO ACCOUNT YET — skipped'
            else 'granted (unlimited)' end as result
from (values ('hburg31'), ('jaredl114'), ('trashcan')) as u(username)
left join profiles p on p.username = u.username
order by u.username;
