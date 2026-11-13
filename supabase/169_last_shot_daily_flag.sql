-- 169: the Daily Last Shot on the Arcade Lab's daily service (2026-11-13).
--
-- Last Shot files its daily runs in arcade_runs and pays gems through
-- gem_ledger like any Arcade Lab game (functions/_arcadelab/registry.js
-- EXTERNAL). All it needs is its own flag. Testers only, the same as every
-- Lab game: an admin can turn it off at /arcade/lab/admin/ or with
--   update arcade_lab_flags set mode = 'off' where flag = 'arcade_last_shot';
--
-- Safe to run twice: the insert does nothing if the row exists, so an admin's
-- later switch is never undone by a re-run.

insert into public.arcade_lab_flags (flag, mode) values ('arcade_last_shot', 'testers')
  on conflict (flag) do nothing;

do $$ begin
  if not exists (select 1 from public.arcade_lab_flags where flag = 'arcade_last_shot') then
    raise exception 'arcade_last_shot flag is missing';
  end if;
end $$;
