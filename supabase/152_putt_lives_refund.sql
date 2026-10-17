-- ---------------------------------------------------------------------------
-- 152_putt_lives_refund.sql : a refunded or charged-back lives buy takes its lives back.
--
-- Safe to run more than once. Needs 149_putt_lives_buy.sql and 151_putt_lives_extra.sql.
--
-- The owner's call (2026-10-17): a full refund or a chargeback on a Putt Putt lives buy
-- removes the lives that buy gave. Before this a refund took nothing back (149).
--
-- WHAT IT TAKES. The pack's lives (putt_lives_buys.lives), extras first (151), then
-- hearts. A heart taken is a lost life: it goes on a 24 hour clock like any other, so it
-- comes back the way a lost life does. Never below nought: lives already played are
-- gone, and only what is still held can be taken.
--
-- ONCE A BUY. putt_lives_buys.reclaimed records what was taken, so Stripe delivering the
-- refund again, or a refund and then a chargeback on the same payment, takes nothing more.
--
-- WHO CALLS IT. Only the Stripe webhook, as service_role, like putt_lives_buy.
-- ---------------------------------------------------------------------------

alter table public.putt_lives_buys add column if not exists reclaimed int;
alter table public.putt_lives_buys add column if not exists reclaimed_at timestamptz;

-- the lives taken back, 0 when this buy was already reclaimed, null for a session never filed
create or replace function public.putt_lives_reclaim(p_session text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  b    putt_lives_buys;
  pl   putt_lives;
  kept timestamptz[];
  e    int;
  h    int;
begin
  select * into b from putt_lives_buys where session_id = p_session for update;
  if not found then return null; end if;
  if b.reclaimed is not null then return 0; end if;

  select * into pl from putt_lives where user_id = b.user_id for update;
  if not found then
    update putt_lives_buys set reclaimed = 0, reclaimed_at = now() where session_id = p_session;
    return 0;
  end if;

  -- the clocks still running; a heart is held for every one that has run out
  kept := coalesce((select array_agg(t order by t) from unnest(pl.back_at) t where t > now()), '{}');
  e := least(pl.extra, b.lives);
  -- hearts held: the stored count (the max less the clocks, as of the last ask) plus any clock
  -- that has run out since, capped so nothing is taken that is not there
  h := least(b.lives - e,
             greatest(0, pl.lives + coalesce(array_length(pl.back_at, 1), 0) - coalesce(array_length(kept, 1), 0)));

  update putt_lives l
     set extra      = l.extra - e,
         back_at    = kept || array_fill(now() + interval '24 hours', array[h]),
         lives      = greatest(0, l.lives + coalesce(array_length(pl.back_at, 1), 0) - coalesce(array_length(kept, 1), 0) - h),
         refill_at  = coalesce(kept[1], case when h > 0 then now() + interval '24 hours' end),
         updated_at = now()
   where l.user_id = b.user_id;
  update putt_lives_buys set reclaimed = e + h, reclaimed_at = now() where session_id = p_session;
  return e + h;
end $$;

revoke all on function public.putt_lives_reclaim(text) from public, anon, authenticated;
-- the webhook calls this as service_role, and revoking from public takes that away too
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.putt_lives_reclaim(text) to service_role';
  end if;
end $$;
