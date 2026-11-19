-- ---------------------------------------------------------------------------
-- 181_shut_the_door_pro.sql : Shut The Door Pro goes on sale
--
--   psql ... -f supabase/181_shut_the_door_pro.sql
--
-- Needs 101 (premium_unlocks), 142 (the constraint's current list) and 160
-- (shutdoor_is_pro, the one gate). Safe to run more than once.
--
-- RUN THIS BEFORE STRIPE_PRICE_STD_PRO OR STRIPE_PRICE_RTD_STD_PRO IS SET, for
-- 101's and 142's reason: the webhook grants a paid Pro by writing
-- premium_unlocks, and until the constraint allows 'std_premium' that write is
-- refused, the webhook answers 500 and Stripe retries into the same wall.
--
-- WHAT IS SOLD (the owner, 2026-11-18). 'std_premium' is Shut The Door Pro:
-- $9.99 a year, renewing (the `door-pro` row in functions/api/stripe/_bundles.js),
-- or with Run The Diamond Pro for $19.99 a year (`diamond-door-pro`, which grants
-- this and rtd_premium). It is one row whose end follows the subscription, the
-- way Diamond Pro's is. Diamond Pro on its own does NOT include it.
--
-- WHAT PRO OPENS is everything 160 and 178 already gate on shutdoor_is_pro, and
-- nothing in them changes here:
--   * Survivor: another run as soon as the last is over, every day, no cap.
--     Only run 0 goes on the Survivor board (160), so the board stays fair.
--   * the archive: any past daily, never on the daily board (160).
--   * the Diamond plate (178's shutdoor_unlocked), on the account and the boards.
--   * no video break between Survivor spots (shut-the-door/ads.js, the page).
-- The engine, the grade and the daily are the same for everybody.
--
-- What changes:
--   premium_unlocks_product_ck   142's list plus 'std_premium'
--   shutdoor_is_pro              160's body with PRO_LIVE true
-- ---------------------------------------------------------------------------

-- 142's list plus one. scripts/stripe/verify-bundles.mjs reads the LAST
-- definition of this constraint across every migration.
alter table public.premium_unlocks
  drop constraint if exists premium_unlocks_product_ck;
alter table public.premium_unlocks
  add constraint premium_unlocks_product_ck
    check (product in ('ps_premium', 'cfb_premium', 'arcade_card_year', 'runtour_pack', 'rtd_premium', 'rtf_premium', 'rtf_pass', 'std_premium'));

-- The one gate, switched on. A live std_premium row (no end date, or an end
-- still ahead) is Pro. Re-running 160 after this puts PRO_LIVE back to false,
-- so run 181 again after any re-run of 160 (launch_preflight.sql row 69 asks).
create or replace function public.shutdoor_is_pro(p_uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  PRO_LIVE constant boolean := true;
  ok boolean := false;
begin
  if not PRO_LIVE or p_uid is null or to_regclass('public.premium_unlocks') is null then return false; end if;
  execute 'select exists (select 1 from public.premium_unlocks u where u.user_id = $1 and u.product = ''std_premium''
             and (u.expires_at is null or u.expires_at > now()))' into ok using p_uid;
  return coalesce(ok, false);
end $$;
revoke all on function public.shutdoor_is_pro(uuid) from public;
