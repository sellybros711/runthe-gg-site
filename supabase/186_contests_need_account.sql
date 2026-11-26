-- ---------------------------------------------------------------------------
-- 186_contests_need_account.sql : the weekly contests are for accounts, never guests.
--
-- The owner's rule (2026-11-23): "without an account, you should not be able to enter the
-- weekly contests". That is the NFL Fantasy Challenge (fantasy_entries, 109) and the College
-- Fantasy Challenge and its Playoff (cfb_fantasy_entries, 128).
--
-- WHY THIS EXISTS. Supabase's anonymous sign-ins give a guest the `authenticated` role and a
-- real auth.uid(). fantasy_submit, fantasy_swap, cfb_fantasy_submit and cfb_fantasy_swap
-- check only that auth.uid() is not null, so with anonymous sign-ins on, anyone holding the
-- anon key could mint throwaway sessions in a loop and enter a prize contest once per
-- session: "one entry and one prize per account" would become one per guest.
--
-- HOW. A trigger on the two entry tables, not an edit to the four functions: every way in
-- (submit, swap, and anything added later) writes a row, so one guard per table holds them
-- all, and none of the functions is restated here to drift from its own file. The trigger
-- reads the caller's JWT: an anonymous session carries is_anonymous = true. A write with no
-- JWT at all (the service role, the results jobs, psql) is not a guest and passes.
--
-- public.is_full_account() is the same test as a function, for any later guard that wants
-- it (a signed-in caller who is not anonymous).
--
-- Safe to run more than once. Needs 109 (fantasy_entries) and 128 (cfb_fantasy_entries).
-- Run it in Supabase before anonymous sign-ins are turned on. Turning them on first leaves
-- the contests open to guests until this runs.
-- ---------------------------------------------------------------------------

begin;

create or replace function public.is_full_account()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
     and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

create or replace function public.contests_need_account()
returns trigger
language plpgsql
as $$
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'make a free account to enter the weekly contest'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists fantasy_entries_need_account on public.fantasy_entries;
create trigger fantasy_entries_need_account
  before insert or update on public.fantasy_entries
  for each row execute function public.contests_need_account();

drop trigger if exists cfb_fantasy_entries_need_account on public.cfb_fantasy_entries;
create trigger cfb_fantasy_entries_need_account
  before insert or update on public.cfb_fantasy_entries
  for each row execute function public.contests_need_account();

commit;
