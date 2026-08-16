-- Run The Arcade — the answers we couldn't settle.
-- Run once in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- WHY THIS EXISTS
-- Sportegories grades an answer three ways: the facts confirm it, the facts
-- contradict it, or we cannot tell. The third case used to score nothing and
-- say "Real player — we couldn't verify this category", which is the game
-- admitting our data fell short and then charging the player for it. Rodney
-- McGruder is an NBA shooting guard; the register only knew he was a guard.
--
-- Two things changed. Answers where every gap is a soft one and something else
-- about the player checked out now COUNT. And every unresolved answer, counted
-- or not, lands here — because an answer we could not settle is a hole in the
-- register with a name already attached to it. The players are telling us
-- exactly which rows are missing; this is where we listen.
--
-- Read it with:
--   select * from answer_gap_review limit 50;
-- and the top of that list is the highest-value work: the answer the most
-- people have typed that we still cannot check.

create table if not exists answer_gaps (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  answer     text not null,          -- what they typed
  category   text,                   -- the category label it was typed against
  letter     text,                   -- that card's letter
  -- 'soft'       we counted it anyway (partial evidence, no contradiction)
  -- 'unverified' we could not, and said so
  kind       text not null default 'unverified',
  gaps       text,                   -- which predicate kinds were unresolved
  constraint answer_gaps_answer_len check (char_length(answer) between 1 and 60),
  constraint answer_gaps_kind_ck   check (kind in ('soft','unverified'))
);

create index if not exists answer_gaps_created_idx on answer_gaps (created_at desc);
create index if not exists answer_gaps_answer_idx  on answer_gaps (lower(answer));

alter table answer_gaps enable row level security;

-- Anyone playing may add a row and nobody may read one back. The table is a
-- suggestion box, not a data source: a readable one would leak the shape of
-- what we cannot verify, which is a map of where the game can be gamed.
do $$ begin
  if not exists (select 1 from pg_policies where tablename='answer_gaps' and policyname='answer_gaps_insert') then
    create policy answer_gaps_insert on answer_gaps for insert to anon, authenticated with check (true);
  end if;
end $$;

/* The working list: what came up most, still unsettled, most recently.
   Grouped by answer AND category, because "Rodney McGruder" against "NBA
   Shooting Guard" is a different missing fact from the same name against
   "Played college at Kansas State". */
create or replace view answer_gap_review as
  select lower(answer)          as answer,
         min(answer)            as as_typed,
         category,
         count(*)               as times,
         count(*) filter (where kind = 'soft')       as counted_anyway,
         count(*) filter (where kind = 'unverified') as scored_zero,
         max(gaps)              as unresolved,
         max(created_at)        as last_seen
    from answer_gaps
   group by lower(answer), category
   order by scored_zero desc, times desc, last_seen desc;

revoke all on answer_gap_review from anon, authenticated;

notify pgrst, 'reload schema';
