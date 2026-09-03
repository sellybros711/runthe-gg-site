-- Run The Arcade Card — table privilege grants
-- Run once in the Supabase SQL editor (after 53_grid_pro.sql and 69_arcade_card.sql).
--
-- WHY: RLS controls WHICH ROWS a role may touch, but a role still needs a
-- table-level GRANT to touch the table at all. The Stripe webhook writes with
-- the `service_role` key; without these grants every write fails with
-- Postgres 42501 "permission denied for table subscriptions" and the
-- checkout.session.completed delivery 500s. The `authenticated` grants let
-- board.js read a signed-in user's own subscription row (RLS still restricts
-- it to their own row).

-- Webhook / server (service_role bypasses RLS but still needs the grant)
grant select, insert, update, delete on public.subscriptions to service_role;
grant select, insert, update, delete on public.stripe_events  to service_role;
grant select, insert, update, delete on public.arcade_plays   to service_role;

-- Signed-in users read their own subscription row (RLS: "subscriptions read own")
grant select on public.subscriptions to authenticated;

-- Keep future tables covered too (Supabase's usual defaults for the public schema)
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
