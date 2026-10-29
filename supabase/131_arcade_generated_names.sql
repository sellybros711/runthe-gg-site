-- Run The Arcade: a name for every row on the board.
-- Run once in the Supabase SQL editor. Idempotent: safe to re-run.
-- Order: after 75_alltime_paging.sql (it restates both all-time functions).
--
-- WHY
-- An account with no username was filed on the board with no name, and every
-- reader of grid_runs.display_name printed the same fallback: "Player". A
-- daily board of six "Player" rows tells nobody who is who, including the
-- player looking for their own. A null username is the normal state right
-- after a Google sign-up, so this was not rare.
--
-- WHAT
--   1. arcade_generated_name(uuid): a stable, readable name derived from the
--      account id, e.g. "Swift Shortstop 482". The same account always gets the
--      same name, and arcade/board.js derives the identical string in the
--      browser (boardName) so the page can mark that row "(you)".
--      It contains spaces, which username_ok() never allows, so it can never
--      collide with or impersonate a real username.
--   2. A trigger on grid_runs fills display_name when the submit writes none.
--      No submit function is restated: grid_submit_run keeps writing the
--      username exactly as before, and the trigger only fills a blank.
--   3. Existing blank rows are backfilled.
--   4. The two all-time functions used 'Player' as their fallback; they now
--      use the generated name. Their bodies are otherwise 75's, unchanged.
--
-- KEEP IN STEP WITH arcade/board.js (ADJ, NOUN, generatedName). The two word
-- lists and the arithmetic must match exactly, or the page will not find its
-- own row. scripts/check-arcade-names.mjs fails if they drift.

create or replace function public.arcade_generated_name(p uuid)
returns text
language sql
immutable
as $$
  select (array['Swift','Clutch','Steady','Bold','Quick','Sharp','Lucky','Calm',
                'Fearless','Fresh','Veteran','Golden','Iron','Silent','Rapid','Brave',
                'Crafty','Mighty','Nimble','Gritty','Slick','Sneaky','Smooth','Wild',
                'Cool','Hot','Prime','Super','Fast','Big','Little','Sly'])[(n % 32) + 1]
      || ' ' ||
         (array['Shortstop','Closer','Slugger','Pitcher','Catcher','Rookie','Captain','Point Guard',
                'Center','Forward','Quarterback','Linebacker','Receiver','Kicker','Safety','Tackle',
                'Coach','Scout','Umpire','Ace','Sixth Man','Leadoff','Anchor','Playmaker',
                'Rebounder','Shooter','Blocker','Runner','Batter','Fielder','Striker','Keeper'])[((n / 32) % 32) + 1]
      || ' ' || ((n / 1024) % 900 + 100)::text
  from (select ('x' || substr(replace(p::text, '-', ''), 1, 7))::bit(28)::int as n) t;
$$;

grant execute on function public.arcade_generated_name(uuid) to anon, authenticated;

create or replace function public.grid_runs_fill_name()
returns trigger
language plpgsql
as $$
begin
  if new.display_name is null or btrim(new.display_name) = '' then
    new.display_name := public.arcade_generated_name(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists grid_runs_fill_name on public.grid_runs;
create trigger grid_runs_fill_name
  before insert or update on public.grid_runs
  for each row execute function public.grid_runs_fill_name();

update public.grid_runs
   set display_name = public.arcade_generated_name(user_id)
 where display_name is null or btrim(display_name) = '';

-- 75's all-time board, with the generated name in place of 'Player'.
create or replace function public.grid_alltime_board(p_game text, p_limit int default 10,
                                                     p_offset int default 0)
returns table(display_name text, run_len smallint, base_seconds integer,
              flawless boolean, played_on date, score integer)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(p.username, ''), public.arcade_generated_name(best.user_id)) as display_name,
         best.run_len,
         best.base_seconds,
         best.flawless,
         best.puzzle_date as played_on,
         best.score
  from (
    select distinct on (r.user_id)
           r.user_id, r.run_len, r.base_seconds, r.flawless, r.puzzle_date, r.score
    from grid_runs r
    where r.game = p_game
    order by r.user_id, r.score asc, r.created_at asc
  ) best
  left join profiles p on p.id = best.user_id
  order by best.score asc, best.puzzle_date asc
  limit least(greatest(coalesce(p_limit, 10), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.grid_alltime_board(text, int, int) from public;
grant execute on function public.grid_alltime_board(text, int, int) to anon, authenticated;

create or replace function public.grid_alltime_stats(p_game text)
returns table(total integer, my_rank integer, display_name text,
              run_len smallint, base_seconds integer, flawless boolean,
              played_on date, score integer)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select distinct on (r.user_id)
           r.user_id, r.run_len, r.base_seconds, r.flawless, r.puzzle_date, r.score
    from grid_runs r
    where r.game = p_game
    order by r.user_id, r.score asc, r.created_at asc
  ),
  mine as (
    select * from best where user_id = auth.uid()
  )
  select (select count(*)::int from best) as total,
         case when m.user_id is null then null else (
           select count(*)::int + 1 from best b
           where b.score < m.score
              or (b.score = m.score and b.puzzle_date < m.puzzle_date)
         ) end as my_rank,
         case when m.user_id is null then null
              else coalesce(nullif(p.username, ''), public.arcade_generated_name(m.user_id)) end as display_name,
         m.run_len, m.base_seconds, m.flawless, m.puzzle_date as played_on, m.score
  from (select 1) anchor(x)
  left join mine m on true
  left join profiles p on p.id = m.user_id;
$$;

revoke all on function public.grid_alltime_stats(text) from public;
grant execute on function public.grid_alltime_stats(text) to anon, authenticated;

notify pgrst, 'reload schema';
