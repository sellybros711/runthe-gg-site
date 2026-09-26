-- ---------------------------------------------------------------------------
-- 119_fantasy_swap.sql : a man ruled out can be swapped before his game starts.
--
--   psql ... -f supabase/119_fantasy_swap.sql
--
-- Needs: 109 to 115. Safe to run twice.
--
-- Asked for by the owner: if a player in your lineup is marked out, you should be able to
-- replace him before his game starts. Until now an entry was final at the moment it was
-- sent, so a man ruled out on the Friday was a guaranteed zero on a lineup its owner could
-- do nothing about, and the injury report the page already draws said so in red beside him.
--
-- ─── THE RULE, WHICH IS CHECKED HERE AND NOWHERE ELSE ────────────────────────────────
--
--   * The man going out has to be ON THE OUT LIST for this week (below), and his game has
--     not kicked off.
--   * The man coming in plays the SAME POSITION, is on this week's board, is not already in
--     the lineup, is not on the out list himself, and his game has not kicked off either.
--   * The lineup after the swap is still under the week's cap.
--
-- EVERY ONE OF THOSE IS ANSWERED FROM ROWS, which is `fantasy_submit`'s own rule: a client
-- that can swap any man for any man at any time is a client that can rewrite a lineup after
-- watching the Thursday game. So the page offers the swap and this function decides it.
--
-- IT WORKS BEFORE THE LOCK AS WELL AS AFTER IT. A lineup is final once sent, and a man can
-- be ruled out on the Wednesday of a week somebody entered on the Tuesday.
--
-- ─── WHAT IT GIVES AWAY, SAID RATHER THAN IMPLIED ────────────────────────────────────
--
-- After the first kickoff the board shows everybody's lineups, so a reader swapping on a
-- Sunday morning can see what the field picked. That is a real edge and a small one: it is
-- only ever available to somebody holding a man who cannot play, and it only picks one man
-- at one position with the money his loss freed.
--
-- A SWAP REWRITES `picks`, AND THAT IS WHY NOTHING ELSE HAD TO CHANGE. Every score on this
-- site is derived from `picks` at read time (the standings, your place, the settle in 114,
-- the lineup under a board row), so the new man is scored everywhere the moment the row
-- changes. `spend` and `projected` are restated for the lineup as it now stands, and what
-- was replaced is kept in `swaps`, so the history is on the row rather than lost.
-- ---------------------------------------------------------------------------

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. When each man plays
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The page has always known this (every pool row carries its club and kickoff) and the
-- server never needed to until now. Nullable, because every week published before this
-- file has no value in them, and a NULL kickoff is refused by the swap rather than read as
-- "not started": failing closed is this mode's rule wherever there is a prize.
--
-- WRITTEN BY `football/build/publish-out.mjs`, which only ever touches these two columns
-- and the out list. Neither is a price, so the rule that a price may never move once
-- anybody has drafted against it is untouched.

alter table public.fantasy_prices add column if not exists team text;
alter table public.fantasy_prices add column if not exists kick timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Who is out
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The same set the page takes off the wheel: injured reserve and friends (`off`), Out,
-- Doubtful, and a man the site itself has ruled out before the Friday report can. ONE
-- DEFINITION, because a page that offered a swap the server then refused would be a button
-- that does nothing. `publish-out.mjs` reads the same injury file the page reads.
--
-- REPLACED WHOLE FOR A WEEK ON EVERY RUN, so a man cleared by a later report comes off it.
-- A swap already made stands: it was legal when it was made.
--
-- PUBLIC READ. It is the injury report, which the page already publishes as a static file.

create table if not exists public.fantasy_out (
  season      int  not null,
  week        int  not null,
  player_id   text not null,
  status      text not null,
  by_site     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (season, week, player_id),
  foreign key (season, week) references public.fantasy_weeks (season, week) on delete cascade,
  constraint fantasy_out_status_ck check (status in ('off', 'out', 'doubtful'))
);

alter table public.fantasy_out enable row level security;

drop policy if exists "fantasy_out read" on public.fantasy_out;
create policy "fantasy_out read" on public.fantasy_out for select using (true);
/* RLS narrows a grant, it does not make one: 110's lesson about three read policies that
   were granting nothing. Nobody is granted a write. */
grant select on public.fantasy_out to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The history, on the row
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fantasy_entries
  add column if not exists swaps jsonb not null default '[]'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The swap
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every refusal is a sentence written for a person, raised as P0001, which is how
-- `entries.js` tells a sentence from machinery (see 113). They start lowercase because the
-- page closes and capitalises them.

create or replace function public.fantasy_swap(
  p_season int, p_week int, p_out text, p_in text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_wk    public.fantasy_weeks%rowtype;
  v_e     public.fantasy_entries%rowtype;
  v_o     public.fantasy_prices%rowtype;
  v_i     public.fantasy_prices%rowtype;
  v_spend numeric(7,2);
begin
  if v_user is null then
    raise exception 'sign in to swap a player';
  end if;

  select * into v_wk from public.fantasy_weeks
   where season = p_season and week = p_week;
  if not found then
    raise exception 'that week is not open';
  end if;

  /* FOR UPDATE, so two presses from two tabs cannot both read the same six and both
     write: the second waits, then finds the man it was replacing is no longer there. */
  select * into v_e from public.fantasy_entries
   where user_id = v_user and season = p_season and week = p_week
   for update;
  if not found then
    raise exception 'you have not entered this week';
  end if;

  if p_out is null or not (p_out = any (v_e.picks)) then
    raise exception 'that player is not in your lineup';
  end if;
  if not exists (select 1 from public.fantasy_out f
                  where f.season = p_season and f.week = p_week and f.player_id = p_out) then
    raise exception 'only a player ruled out can be swapped';
  end if;

  select * into v_o from public.fantasy_prices
   where season = p_season and week = p_week and player_id = p_out;
  /* FAILS CLOSED ON AN UNKNOWN KICKOFF. A NULL here is a week nobody has run
     `publish-out.mjs` for, and reading it as "not started" would let a swap through after
     the game. */
  if not found or v_o.kick is null then
    raise exception 'his kickoff is not known yet, so he cannot be swapped';
  end if;
  if now() >= v_o.kick then
    raise exception 'his game has started, so he cannot be swapped';
  end if;

  select * into v_i from public.fantasy_prices
   where season = p_season and week = p_week and player_id = p_in;
  if not found then
    raise exception 'that player is not on this week''s board';
  end if;
  if v_i.pos <> v_o.pos then
    raise exception 'a swap has to be the same position';
  end if;
  if p_in = any (v_e.picks) then
    raise exception 'he is already in your lineup';
  end if;
  if exists (select 1 from public.fantasy_out f
              where f.season = p_season and f.week = p_week and f.player_id = p_in) then
    raise exception 'he is ruled out too';
  end if;
  if v_i.kick is null or now() >= v_i.kick then
    raise exception 'his game has already started';
  end if;

  /* THE CAP IS CHECKED ON THE LINEUP AS IT WILL STAND, off the stored spend. The out man's
     price comes back, which is the money a reader has to spend on his replacement. */
  v_spend := v_e.spend - v_o.price_musd + v_i.price_musd;
  if v_spend > v_wk.cap_musd then
    raise exception 'that swap puts your lineup over the cap';
  end if;

  update public.fantasy_entries
     set picks     = array_replace(v_e.picks, p_out, p_in),
         spend     = v_spend,
         projected = v_e.projected - v_o.proj + v_i.proj,
         swaps     = v_e.swaps || jsonb_build_array(jsonb_build_object(
                       'out', p_out, 'in', p_in, 'at', now()))
   where id = v_e.id;
end;
$$;

revoke all on function public.fantasy_swap(int,int,text,text) from public;
grant execute on function public.fantasy_swap(int,int,text,text) to authenticated;

notify pgrst, 'reload schema';
