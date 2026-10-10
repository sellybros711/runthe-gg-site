-- Run The Arcade: Sportegories challenges, remembered.
-- Run once in the Supabase SQL editor. Idempotent, safe to re-run.
--
-- WHY THIS EXISTS
-- A player who thinks Sportegories marked them wrong can challenge. The server
-- (functions/api/sportegories-challenge.js) looks the answer up in a public
-- record on the spot and rules: upheld, denied, or cannot tell. An upheld
-- ruling is a fact about the world ("Rodney Stuckey played for the Pacers"),
-- so it is kept here and every later card takes the answer without asking our
-- file again, which was the thing that got it wrong.
--
-- One row per (name, category). The name is the game's own "first|last" key,
-- so a ruling on Josh Allen holds for whoever types Josh Allen, the way the
-- game already judges a name that is several people. The category is its
-- LABEL, not its index, because an index moves when the library is rebuilt.
--
-- WHO MAY WRITE. Only the server, with the service role. Nobody else may read
-- or write a row: a table a page could write would let anybody make any name
-- count for any category. The route hands a page the upheld rulings for the
-- categories on its card, and nothing more.
--
-- AN ADMIN HAS THE LAST WORD. Set source = 'admin' on a row (and verdict to
-- whatever is right) and the server will never write over it. A trigger holds
-- that, because a clause in the server is a thing somebody deletes.
--
-- Read it with:
--   select * from sportegories_ruling_review limit 50;
-- Overrule one with:
--   update sportegories_rulings set verdict = 'denied', source = 'admin'
--    where answer_key = 'first|last' and category = 'Label';

create table if not exists sportegories_rulings (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  answer_key  text not null,              -- "first|last", sportegories.js nameKey()
  as_typed    text not null,              -- the first spelling challenged
  category    text not null,              -- the category label
  letter      text,
  verdict     text not null,              -- 'upheld' or 'denied'
  source      text not null default 'wikidata',   -- 'wikidata' or 'admin'
  qid         text,                       -- the Wikidata item it was ruled on
  wd_name     text,                       -- that item's name
  constraint sportegories_rulings_key unique (answer_key, category),
  constraint sportegories_rulings_verdict_ck check (verdict in ('upheld', 'denied')),
  constraint sportegories_rulings_source_ck  check (source in ('wikidata', 'admin')),
  constraint sportegories_rulings_len check (char_length(answer_key) between 3 and 80
                                             and char_length(as_typed) between 1 and 60
                                             and char_length(category) between 1 and 80)
);

create index if not exists sportegories_rulings_cat_idx on sportegories_rulings (category) where verdict = 'upheld';

alter table sportegories_rulings enable row level security;
revoke all on sportegories_rulings from anon, authenticated;
revoke all on sequence sportegories_rulings_id_seq from anon, authenticated;

/* An admin's ruling is final. An upsert from the server lands here as an
   UPDATE; on an admin row it hands back the old row whatever was asked, so
   the server cannot overturn a person. An admin can still edit their own row,
   because their update carries source = 'admin'. */
create or replace function sportegories_rulings_keep_admin() returns trigger
language plpgsql as $$
begin
  if old.source = 'admin' and new.source is distinct from 'admin' then
    return old;
  end if;
  -- the first spelling stays the record of how it was first challenged
  new.as_typed := old.as_typed;
  new.created_at := old.created_at;
  return new;
end $$;

drop trigger if exists sportegories_rulings_keep_admin on sportegories_rulings;
create trigger sportegories_rulings_keep_admin
  before update on sportegories_rulings
  for each row execute function sportegories_rulings_keep_admin();

create or replace view sportegories_ruling_review as
  select category, answer_key, as_typed, verdict, source, wd_name, qid, updated_at
    from sportegories_rulings
   order by updated_at desc;

revoke all on sportegories_ruling_review from anon, authenticated;

notify pgrst, 'reload schema';
