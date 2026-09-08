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
-- WHY ONLY runnyj: the tester rehearsal (2026-09) is one premium account and
-- one free-view account. runnyj plays the site as somebody who bought the
-- bundle; csel8 is on the tester lists in code and holds NO row, so he plays
-- the site as somebody who has not bought. DO NOT grant csel8 here, or the
-- free view he exists to judge has nobody looking at it.
--
-- THE OTHER TWO TESTERS ARE A DECISION, NOT AN OVERSIGHT. malikwillislover and
-- slimeyb3 hold no row either, so from this migration on they see the paywall
-- at every dynasty door and the free tier of Commish, same as csel8. If they
-- should be premium instead, add their names to the usernames array and re-run.
--
-- MATCHING: lower(username), the lesson 72_comp_passes.sql wrote down. The
-- final SELECT reports who matched, so a name that matched nobody is seen
-- rather than assumed.
--
-- TO REVOKE later:
--   delete from public.premium_unlocks
--   where source = 'comp' and user_id in (
--     select id from public.profiles where lower(username) in ('runnyj')
--   );
-- ---------------------------------------------------------------------------

with grantees as (
  select array['runnyj']::text[] as usernames   -- add 'malikwillislover','slimeyb3' to make them premium too
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
