-- ---------------------------------------------------------------------------
-- 102_premium_comp.sql : complimentary premium bundle rows (testers)
--
-- Safe to run more than once.
--
-- WHAT: hand-grants the Perfect Season Premium Bundle's two product rows
-- (ps_premium, cfb_premium) to named tester accounts, by writing the same
-- premium_unlocks rows the Stripe webhook writes. source 'comp' marks these as
-- hand-granted so they are easy to find and revoke, exactly the way
-- 72_comp_passes.sql marks comp Arcade Cards.
--
-- WHO GETS WHAT, per the owner (2026-09-08), one account per path so every
-- path has somebody looking at it:
--   runnyj            premium: plays the site as somebody who bought the bundle
--   malikwillislover  premium: access to everything, same as runnyj
--   slimeyb3          premium, added 2026-09-10 at the owner's request: the
--                     tester accounts should be able to hold a pro account.
--   csel8             NO ROW, on purpose, and he is now the ONLY one: plays the
--                     site as a signed-in user who has not bought, which after
--                     launch means the paywall at every dynasty door and the
--                     pitch at the Commish gate. DO NOT grant csel8 here, or the
--                     not-bought view he exists to judge has nobody looking at
--                     it, and that view is half of what was built.
--
-- MATCHING: lower(username), the lesson 72_comp_passes.sql wrote down. The
-- final SELECT reports who matched, so a name that matched nobody is seen
-- rather than assumed.
--
-- TO REVOKE later:
--   delete from public.premium_unlocks
--   where source = 'comp' and user_id in (
--     select id from public.profiles where lower(username) in ('runnyj','malikwillislover','slimeyb3')
--   );
-- ---------------------------------------------------------------------------

with grantees as (
  select array['runnyj','malikwillislover','slimeyb3']::text[] as usernames
),
products as (
  select unnest(array['ps_premium','cfb_premium']) as product
)
insert into public.premium_unlocks (user_id, product, source, payload, expires_at, fulfilled_at)
select u.id, pr.product, 'comp', '{}'::jsonb, null, now()
from auth.users u
join public.profiles pf on pf.id = u.id
cross join grantees g
cross join products pr
where lower(coalesce(pf.username, '')) = any (g.usernames)
on conflict (user_id, product) do update
  set source       = 'comp',
      fulfilled_at = now();

-- Who actually got rows. An empty result means the username matched nobody:
-- check the casing on the leaderboard, or use the account id printed by the
-- gate screen at /cfb/commish/ instead.
select pf.username, pu.product, pu.source, pu.granted_at
from public.premium_unlocks pu
join public.profiles pf on pf.id = pu.user_id
where pu.source = 'comp'
order by pf.username, pu.product;
