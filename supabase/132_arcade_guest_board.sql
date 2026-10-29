-- Run The Arcade: guest scores on the daily board, and keeping them on sign-up.
-- Run once in the Supabase SQL editor. Idempotent: safe to re-run.
-- Order: after 131_arcade_generated_names.sql.
--
-- ALSO NEEDS A DASHBOARD SWITCH: Authentication > Sign In / Providers >
-- "Allow anonymous sign-ins". Without it the page's signInAnonymously() is
-- refused, the guest's run stays on the device exactly as before, and nothing
-- in this file is ever called. So the order of the two does not matter.
--
-- WHY
-- A guest (no account) finished a puzzle and posted nothing, so the daily
-- board only ever showed people with accounts. arcade/board.js now posts a
-- guest's run through a SEPARATE anonymous Supabase session (its own storage
-- key, so the page's real session, the play tokens and the Arcade Card are
-- untouched). grid_submit_run already accepts any auth.uid(), and an anonymous
-- user is one, so no submit function is restated. The row is filed under the
-- generated name from 131 ("Swift Shortstop 482"), because an anonymous user's
-- profile row has no username.
--
-- The part this file adds is the hand-over. When that guest makes an account,
-- their guest rows and streaks move onto it, which is what the "save your
-- streak" prompt promises.
--
-- WHAT
--   1. arcade_guest_tickets: one secret per anonymous user. No policies, so no
--      browser role can read it; only the two functions below touch it.
--   2. arcade_guest_ticket(): called BY the anonymous session, returns its
--      secret (made once, then the same one). Refuses a real account.
--   3. arcade_claim_guest(guest, secret): called BY the real account after
--      sign-in. With the right secret it moves the guest's days onto the
--      account (only days the account has no row for, so nothing the account
--      already posted is overwritten), drops the leftovers, rebuilds the
--      account's streak for each game from the dates it now holds, and spends
--      the ticket. A wrong or used secret moves nothing and is not an error,
--      so a stale browser never shows a failure.
--
-- WHY A SECRET AND NOT JUST THE GUEST'S ID
-- The id alone would let anyone who learned it claim that guest's runs. The
-- secret only ever exists in the guest's own browser.
--
-- WHAT IT DOES NOT DO
-- The anonymous auth user itself is left in place (deleting auth users from
-- SQL is a dashboard job); with its rows moved it owns nothing.

create table if not exists public.arcade_guest_tickets (
  guest      uuid primary key,
  secret     text not null,
  created_at timestamptz not null default now()
);
alter table public.arcade_guest_tickets enable row level security;
revoke all on public.arcade_guest_tickets from public, anon, authenticated;

create or replace function public.arcade_is_anon()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

create or replace function public.arcade_guest_ticket()
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_secret text;
begin
  if v_uid is null then raise exception 'no guest session'; end if;
  if not public.arcade_is_anon() then raise exception 'guests only'; end if;
  insert into arcade_guest_tickets (guest, secret)
    values (v_uid, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
    on conflict (guest) do nothing;
  select secret into v_secret from arcade_guest_tickets where guest = v_uid;
  return v_secret;
end $$;

revoke all on function public.arcade_guest_ticket() from public, anon;
grant execute on function public.arcade_guest_ticket() to authenticated;

create or replace function public.arcade_claim_guest(p_guest uuid, p_secret text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_moved integer := 0;
  v_games text[];
  r       record;
begin
  if v_uid is null then raise exception 'sign in to keep your guest runs'; end if;
  if public.arcade_is_anon() then raise exception 'an account is needed to keep guest runs'; end if;
  if p_guest is null or p_guest = v_uid then return json_build_object('moved', 0); end if;
  if not exists (select 1 from arcade_guest_tickets where guest = p_guest and secret = p_secret) then
    return json_build_object('moved', 0, 'claimed', false);
  end if;

  select username into v_name from profiles where id = v_uid;
  v_games := array(select game from grid_runs where user_id = p_guest
                   union select game from grid_streaks where user_id = p_guest);

  -- A day moves only where the account has no row for that game and date. The
  -- name is the account's (the 131 trigger fills a generated one if it has
  -- none), never the guest's generated name.
  update grid_runs g
     set user_id = v_uid, display_name = v_name
   where g.user_id = p_guest
     and not exists (select 1 from grid_runs a
                      where a.user_id = v_uid and a.game = g.game and a.puzzle_date = g.puzzle_date);
  get diagnostics v_moved = row_count;
  delete from grid_runs where user_id = p_guest;

  -- Streaks are rebuilt from the dates the account now holds, per game, so a
  -- guest week and an account week either join up or do not, exactly as they
  -- would have if they had been one player all along. The best never goes down.
  for r in
    select game,
           max(puzzle_date) as last_date,
           max(isl_len)     as longest,
           max(isl_len) filter (where isl_end = max_date) as current_len
      from (
        select game, puzzle_date, max_date,
               count(*) over (partition by game, isl) as isl_len,
               max(puzzle_date) over (partition by game, isl) as isl_end
          from (
            select game, puzzle_date,
                   puzzle_date - (row_number() over (partition by game order by puzzle_date))::int as isl,
                   max(puzzle_date) over (partition by game) as max_date
              from (select distinct game, puzzle_date from grid_runs where user_id = v_uid) d
          ) s
      ) t
     where game = any(v_games)
     group by game
  loop
    insert into grid_streaks (user_id, game, streak, best_streak, last_date)
    values (v_uid, r.game, coalesce(r.current_len, 1),
            greatest(r.longest, coalesce((select best_streak from grid_streaks where user_id = p_guest and game = r.game), 0)),
            r.last_date)
    on conflict (user_id, game) do update
      set streak      = excluded.streak,
          best_streak = greatest(grid_streaks.best_streak, excluded.best_streak),
          last_date   = excluded.last_date,
          updated_at  = now();
  end loop;
  delete from grid_streaks where user_id = p_guest;
  delete from arcade_guest_tickets where guest = p_guest;

  return json_build_object('moved', v_moved, 'claimed', true);
end $$;

revoke all on function public.arcade_claim_guest(uuid, text) from public, anon;
grant execute on function public.arcade_claim_guest(uuid, text) to authenticated;
