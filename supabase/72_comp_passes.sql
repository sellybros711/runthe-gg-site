-- Run The Arcade — complimentary Arcade Card passes (testers / friends).
--
-- WHAT: grants an unlimited Arcade Card to specific accounts by writing a
-- subscriptions row the same shape the Stripe webhook writes, so
-- arcade_card_active(uid) returns true for them (status active + a far-future
-- period end). No Stripe customer/subscription is involved - price_id 'comp'
-- marks these as hand-granted so they're easy to find and revoke later.
--
-- HOW TO RUN: paste into the Supabase SQL editor and run. Idempotent - safe to
-- re-run (re-runs just refresh the row). A grantee must already have a RunThe
-- account; the final SELECT reports anyone not matched so you can re-run later.
--
-- NOTE ON MATCHING: match on lower(username) AND email. Usernames are stored
-- with their original casing (e.g. "Hburg31"), so an exact-case username match
-- silently misses them - lower() fixes that, and email is the unambiguous
-- fallback for anyone who never set a username.
--
-- TO REVOKE later:
--   update public.subscriptions set status='canceled'
--   where price_id='comp' and user_id in (
--     select id from auth.users where lower(email) in ( ... )
--   );

-- Edit these two lists as testers come and go.
with grantees as (
  select array['jaredl114', 'trashcan']::text[]  as usernames,   -- lowercased handles (Jared, Addison="Trashcan")
         array['hburger31@gmail.com']::text[]     as emails       -- Harris (handle is "Hburg31")
)
insert into public.subscriptions (user_id, status, price_id, current_period_end, updated_at)
select u.id, 'active', 'comp', timestamptz '2100-01-01', now()
from auth.users u
left join profiles p on p.id = u.id
cross join grantees g
where lower(coalesce(p.username, '')) = any (g.usernames)
   or lower(u.email)                  = any (g.emails)
on conflict (user_id) do update
  set status             = 'active',
      price_id           = 'comp',
      current_period_end = timestamptz '2100-01-01',
      updated_at         = now();

-- Report: confirm who now holds a comp pass.
select coalesce(p.username, '(no username)') as username, u.email, s.status, s.current_period_end
from public.subscriptions s
join auth.users u on u.id = s.user_id
left join profiles p on p.id = u.id
where s.price_id = 'comp'
order by s.updated_at desc;
