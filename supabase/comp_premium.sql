-- ---------------------------------------------------------------------------
-- comp_premium.sql : hand an account the paid unlocks, for testing the store
--
-- NOT A MIGRATION. Nothing runs this on deploy and nothing depends on it. It is
-- kept here rather than pasted into chat because the reverse of it matters just
-- as much as the forward, and both should live in the same file.
--
-- WHY THIS IS NEEDED TO TEST. The premium doors read premium_products(), which
-- reads premium_unlocks, and the ONLY writer of that table is the Stripe webhook
-- running as the service role. So there is no way to see the owner side of the
-- paywall (the Pro pill, the Your Pro access page, the receipt lines, an owner
-- reaching the store and being told they already own it) without a row, and no
-- way to get a row without a real payment. This writes one by hand.
--
-- SOURCE IS 'comp', DELIBERATELY. The webhook writes 'bundle:<key>'; this writes
-- 'comp', so a comped account is distinguishable from a paying one in the table
-- forever. The Your Pro access page treats them the same, which is right, except
-- that Receipts and billing correctly answers "no Stripe receipt for this
-- account" because there is no Stripe customer behind it. That is the comped
-- state working, not a bug.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. GRANT. Set the username, then run.
-- ---------------------------------------------------------------------------
-- Matching is on profiles.username, which is citext, so the casing does not
-- matter. An unknown username inserts NOTHING rather than erroring, so check the
-- row count: 4 means it worked, 0 means the name is wrong.
with me as (
  select id from public.profiles where username = 'REPLACE_WITH_YOUR_USERNAME'
)
insert into public.premium_unlocks (user_id, product, source, payload, expires_at, fulfilled_at)
select me.id, g.product, 'comp', '{}'::jsonb, g.expires_at, g.fulfilled_at
from me
cross join (values
  -- the two permanent modes, exactly as the bundle grants them
  ('ps_premium',       null::timestamptz, now()),
  ('cfb_premium',      null::timestamptz, now()),
  -- the Arcade year, dated twelve months out the way the webhook dates it
  ('arcade_card_year', now() + interval '365 days', now()),
  -- and the Run The Tour drop, left UNFULFILLED on purpose: that is the state
  -- the golf backend has not redeemed yet, and it is what makes the receipt
  -- page say "On its way to your account" on that line and only that line.
  ('runtour_pack',     null::timestamptz, null::timestamptz)
) as g(product, expires_at, fulfilled_at)
on conflict (user_id, product) do update
  set source = excluded.source,
      expires_at = excluded.expires_at,
      fulfilled_at = excluded.fulfilled_at,
      granted_at = now();

-- Grant only the football bundle instead, to see the two line version of the
-- receipt page: delete the two lines above for arcade_card_year and
-- runtour_pack, or run the revoke below and then this with those rows removed.

-- ---------------------------------------------------------------------------
-- 2. CHECK.
-- ---------------------------------------------------------------------------
select p.username, u.product, u.source, u.granted_at, u.expires_at, u.fulfilled_at
from public.premium_unlocks u
join public.profiles p on p.id = u.user_id
where p.username = 'REPLACE_WITH_YOUR_USERNAME'
order by u.product;

-- ---------------------------------------------------------------------------
-- 3. REVOKE, to get back to the free view.
-- ---------------------------------------------------------------------------
-- Scoped to source = 'comp' so this can never delete a real purchase, including
-- one made later by the same account.
delete from public.premium_unlocks u
using public.profiles p
where p.id = u.user_id
  and p.username = 'REPLACE_WITH_YOUR_USERNAME'
  and u.source = 'comp';
