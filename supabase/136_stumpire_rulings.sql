-- Run The Arcade: Stumpire challenges, ruled live and remembered.
-- Run once in the Supabase SQL editor (after 133). Idempotent, safe to re-run.
--
-- WHY THIS EXISTS
-- A Stumpire strike is a real player the slate did not list for the prompt.
-- When he is challenged, the server now looks him up on the spot
-- (functions/_stumpire/livecheck.js) and settles the challenge itself when the
-- record can: upheld, as an admin upholding it would, or denied. The ruling is
-- kept here, one row per (prompt, player), so the next slate that deals the
-- same prompt takes the answer without a challenge, and a repeat challenge is
-- answered without asking again. What the record cannot settle stays in the
-- admin queue (stumpire_challenges), exactly as before.
--
-- An admin's resolution is written here too, with source = 'admin', and the
-- server can never write over it: a trigger holds that.
--
-- WHO MAY WRITE. Only the server, with the service role. No page may read or
-- write a row: a readable table would hand out answers, a writable one would
-- let anybody make any player count.
--
-- Read it with:
--   select * from stumpire_ruling_review limit 50;
-- Overrule one with:
--   update stumpire_rulings set verdict = 'denied', source = 'admin'
--    where prompt_id = 'nfl-lb-pro-bowl' and entity_id = '...';

create table if not exists public.stumpire_rulings (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  prompt_id   text not null,
  entity_id   text not null,
  name        text,
  verdict     text not null,               -- 'upheld' or 'denied'
  source      text not null default 'wikidata',   -- 'wikidata' or 'admin'
  qid         text,                        -- the Wikidata item it was ruled on
  wd_name     text,
  constraint stumpire_rulings_key unique (prompt_id, entity_id),
  constraint stumpire_rulings_verdict_ck check (verdict in ('upheld', 'denied')),
  constraint stumpire_rulings_source_ck  check (source in ('wikidata', 'admin'))
);

create index if not exists stumpire_rulings_upheld_idx on public.stumpire_rulings (prompt_id) where verdict = 'upheld';

alter table public.stumpire_rulings enable row level security;
revoke all on public.stumpire_rulings from anon, authenticated;
revoke all on sequence public.stumpire_rulings_id_seq from anon, authenticated;

create or replace function public.stumpire_rulings_keep_admin() returns trigger
language plpgsql as $$
begin
  if old.source = 'admin' and new.source is distinct from 'admin' then
    return old;
  end if;
  new.created_at := old.created_at;
  return new;
end $$;

drop trigger if exists stumpire_rulings_keep_admin on public.stumpire_rulings;
create trigger stumpire_rulings_keep_admin
  before update on public.stumpire_rulings
  for each row execute function public.stumpire_rulings_keep_admin();

create or replace view public.stumpire_ruling_review as
  select prompt_id, entity_id, name, verdict, source, wd_name, qid, updated_at
    from public.stumpire_rulings
   order by updated_at desc;

revoke all on public.stumpire_ruling_review from anon, authenticated;

notify pgrst, 'reload schema';
