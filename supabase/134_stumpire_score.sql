-- Stumpire: the score on the play row, so a daily board can rank it.
--
-- The score is the rules engine's (functions/_stumpire/game.js, SCORE and
-- boxScore): 10 per total base, 5 per hit, 10 per home run, 15 per run, minus
-- 10 per strikeout. This file only stores what the API computed; the client
-- never sends a score.
--
-- stumpire_save_play keeps its signature (133 is re-applied nightly and would
-- otherwise leave two overloads PostgREST cannot choose between), so the
-- score arrives through a second function with its own name.

alter table public.stumpire_plays add column if not exists score smallint not null default 0;
alter table public.stumpire_plays add column if not exists runs  smallint not null default 0;
alter table public.stumpire_plays add column if not exists hits  smallint not null default 0;
alter table public.stumpire_plays add column if not exists hr    smallint not null default 0;
alter table public.stumpire_plays add column if not exists ks    smallint not null default 0;

create index if not exists stumpire_plays_board on public.stumpire_plays (slate_date, score desc) where over and user_id is not null;
create index if not exists stumpire_plays_streak on public.stumpire_plays (user_id, slate_date desc) where over and user_id is not null;

create or replace function public.stumpire_save_play_v2(
  p_id bigint, p_version integer, p_state jsonb,
  p_bases integer, p_outs integer, p_strikes integer, p_over boolean, p_won boolean,
  p_score integer, p_runs integer, p_hits integer, p_hr integer, p_ks integer
) returns integer
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  update stumpire_plays
     set state = p_state, version = version + 1, bases = p_bases, outs = p_outs,
         strikes = p_strikes, over = p_over, won = p_won,
         score = p_score, runs = p_runs, hits = p_hits, hr = p_hr, ks = p_ks, updated_at = now()
   where id = p_id and version = p_version
   returning version into v;
  return v;
end $$;

revoke all on function public.stumpire_save_play_v2(bigint,integer,jsonb,integer,integer,integer,boolean,boolean,integer,integer,integer,integer,integer) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.stumpire_save_play_v2(bigint,integer,jsonb,integer,integer,integer,boolean,boolean,integer,integer,integer,integer,integer) to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
