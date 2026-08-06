-- ============================================================================
-- 64_cfb_bowl_key.sql : record WHICH bowl, not just which tier
-- ============================================================================
-- Run AFTER 63_cfb_run_mode.sql. Safe to re-run.
--
-- 62 stores the bowl as a TIER: 'ny6', 'bowl' or 'minor'. That is a thing the
-- server can derive from the loss count and therefore a thing it can refuse to
-- be lied about, which is why it was the only bowl fact stored. But which bowl
-- inside the tier is a seeded draw made in the browser, so nothing in the row
-- said whether a team won the Garland Bowl or the Ballpark Bowl, and two things
-- were wrong because of it:
--
--   * the leaderboard could only say "Bowl champions", when the interesting half
--     of that sentence is which trophy
--   * NINE badges key off the specific bowl (the six New Year's Six, the sweep of
--     all six, and both RunThe.GG Bowl badges). A signed-in player's trophy case
--     is rebuilt from these rows, so for anybody with an account those nine were
--     not hard, they were impossible. A guest playing the same seasons earned
--     them from local history. That is the worse of the two bugs and it is the
--     reason this is a migration rather than a nicety.
--
-- AN ID, NOT A NAME, AND THAT IS THE WHOLE SECURITY ARGUMENT. 62's header says
-- there is no free-text column here that a player can write into, and that stays
-- true. What is stored is a short slug matching ^[a-z0-9_]{1,40}$, and the client
-- renders a name by looking the slug up in ITS OWN copy of the bowl table. A
-- slug nobody's table knows renders as nothing and falls back to the tier
-- wording, so the worst a crafted client achieves is a row that says less than
-- it could have. No string that arrives here is ever displayed.
--
-- THE SET IS NOT ENUMERATED HERE, DELIBERATELY. The obvious alternative is a
-- check constraint listing all thirty-odd slugs. That buys nothing the lookup
-- does not already give (an unknown slug is inert either way) and costs a
-- migration every time a bowl is added or renamed, with the failure mode being
-- that real seasons start getting REFUSED in production. Shape is checked;
-- membership is a rendering question and is answered where the names live.
--
-- The column is nullable and stays null for a season that reached no bowl. The
-- function forces that rather than trusting it, so a playoff team cannot carry a
-- bowl slug.
-- ----------------------------------------------------------------------------

alter table cfb_runs add column if not exists bowl_key text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cfb_runs_bowl_key_ck') then
    alter table cfb_runs add constraint cfb_runs_bowl_key_ck check (
      bowl_key is null or bowl_key ~ '^[a-z0-9_]{1,40}$'
    );
  end if;
end $$;

comment on column cfb_runs.bowl_key is
  'Which bowl, as a slug the client resolves to a name against its own table. Null when no bowl was played. Never rendered as stored text.';

-- Rows written before this migration have no bowl recorded and cannot get one:
-- the draw that made it was never sent. They keep the tier they already have and
-- read as "Bowl champions", which is what they said yesterday.

-- ---------------------------------------------------------------------------
-- cfb_submit_run(), now carrying the bowl
-- ---------------------------------------------------------------------------
-- One new trailing argument with a default, so a client that has not been
-- updated keeps working and records a bowl it does not name.
--
-- The 20-argument signature from 63 is dropped by its exact argument list first:
-- create or replace would leave it in place as an overload and PostgREST would
-- then have two candidates to choose between.
drop function if exists cfb_submit_run(int,int,int,boolean,numeric,numeric,numeric,int,int,int,text[],text[],text,int,numeric,numeric,numeric,numeric,int,text);

create or replace function cfb_submit_run(
  p_regular_wins   int,
  p_national_rank  int,
  p_playoff_wins   int      default 0,
  p_bowl_won       boolean  default false,
  p_point_diff     numeric  default null,
  p_chemistry_pct  numeric  default null,
  p_spend_musd     numeric  default null,
  p_respins        int      default 0,
  p_sig_wins       int      default 0,
  p_best_win_rank  int      default null,
  p_picks          text[]   default null,
  p_slots          text[]   default null,
  p_rng_seed       text     default null,
  p_rng_calls      int      default null,
  p_squad_fppg     numeric  default null,
  p_structure_mult numeric  default null,
  p_team_rating    numeric  default null,
  p_overall        numeric  default null,
  p_perfect_pct    int      default null,
  p_run_mode       text     default 'free',
  p_bowl_key       text     default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  CFB_REG_GAMES     constant int := 12;
  CFB_FIELD_SIZE    constant int := 134;
  CFB_PLAYOFF_TEAMS constant int := 12;
  CFB_PLAYOFF_BYES  constant int := 4;
  CFB_ROUNDS_BYE    constant int := 3;
  CFB_ROUNDS_NO_BYE constant int := 4;
  CFB_ROSTER_SIZE   constant int := 6;
  CFB_CAP_MUSD      constant numeric := 14;
  CFB_FIELD_MAX_LOSSES constant int := 4;
  -- WHICH BOWL TIER, BY RANK, WHICH IS WHAT THE ENGINE ACTUALLY DOES.
  -- 62 and 63 derived the tier from the LOSS COUNT: three or fewer was a New
  -- Year's Six, five or fewer a major, six a minor. engine.js has never worked
  -- that way. seedFromRanking(rank, wins) needs six wins to go bowling at all and
  -- then reads the RANKING: top 18 is a New Year's Six, top 40 a major, the rest
  -- a minor. Two different rules on two different variables, and they disagree
  -- constantly. A 9-3 team ranked 44th played a small bowl on screen and recorded
  -- as a New Year's Six; a 6-6 team ranked 15th played a New Year's Six and
  -- recorded as a minor.
  --
  -- That was survivable while the tier only chose a word on a results screen. It
  -- stops being survivable now the row also carries WHICH bowl, because the tier
  -- and the slug come from different rules and would contradict each other on the
  -- same row: "win all six New Year's Six bowls" could be completed with six
  -- small-bowl trophies sitting on rows the server had labelled ny6.
  --
  -- The ranking is already validated and is already the number the seed identity
  -- is checked against, so deriving from it is no more trusting than before. It is
  -- simply the same rule the player was shown.
  CFB_BOWL_MIN_WINS   constant int := 6;
  CFB_BOWL_NY6_RANK   constant int := 18;
  CFB_BOWL_MAJOR_RANK constant int := 40;

  ROUND_NAMES constant text[] :=
    array['CFP First Round','CFP Quarterfinal','CFP Semifinal','CFP Championship'];
  MODES constant text[] :=
    array['free','conf:SEC','conf:Big Ten','conf:Big 12','conf:ACC','conf:Pac-12'];

  v_reg     int := p_regular_wins;
  v_po      int := coalesce(p_playoff_wins, 0);
  v_rank    int := p_national_rank;
  v_reg_l   int;
  v_seed    int;
  v_bye     boolean;
  v_rounds  int;
  v_made    boolean;
  v_title   boolean;
  v_po_games int;
  v_bowl    text := null;
  v_bowl_won boolean := false;
  v_bowl_games int := 0;
  v_bowl_key text := null;
  v_elim    text := null;
  v_names   text[];
  v_wins    int;
  v_losses  int;
  v_games   int;
  v_label   text;
  v_mode    text := coalesce(p_run_mode, 'free');
  v_dupe    bigint;
  v_id      bigint;
  v_user    uuid := auth.uid();
  v_name    text;
begin
  -- ---- which competition ----
  if not (v_mode = any(MODES)) then
    raise exception 'unknown run mode: %', v_mode;
  end if;

  -- ---- the record has to be a record this game can produce ----
  if v_reg is null or v_reg < 0 or v_reg > CFB_REG_GAMES then
    raise exception 'regular wins must be 0..%, got %', CFB_REG_GAMES, v_reg;
  end if;
  v_reg_l := CFB_REG_GAMES - v_reg;

  if v_rank is null or v_rank < 1 or v_rank > CFB_FIELD_SIZE then
    raise exception 'national ranking must be 1..%, got %', CFB_FIELD_SIZE, v_rank;
  end if;

  -- ---- the field, derived from the ranking exactly as seedFromRanking() does ----
  if v_rank <= CFB_PLAYOFF_TEAMS then
    if v_reg_l > CFB_FIELD_MAX_LOSSES then
      raise exception 'a %-% team cannot be ranked % and in the playoff', v_reg, v_reg_l, v_rank;
    end if;
    v_seed   := v_rank;
    v_bye    := v_rank <= CFB_PLAYOFF_BYES;
    v_rounds := case when v_bye then CFB_ROUNDS_BYE else CFB_ROUNDS_NO_BYE end;
    v_made   := true;
    v_label  := case when v_bye then 'No. ' || v_rank || ' seed, first-round bye'
                     else 'No. ' || v_rank || ' seed' end;
  else
    v_seed   := null;
    v_bye    := false;
    v_rounds := 0;
    v_made   := false;
    -- Six wins to go bowling, then the tier by ranking: exactly seedFromRanking().
    -- 'bowl' is the stored name for the tier the game calls 'major'; the client
    -- maps it back. Renaming it would orphan every row already written.
    if v_reg < CFB_BOWL_MIN_WINS then
      v_bowl := null;    v_label := 'Season over';
    elsif v_rank <= CFB_BOWL_NY6_RANK then
      v_bowl := 'ny6';   v_label := 'New Year''s Six Bowl';
    elsif v_rank <= CFB_BOWL_MAJOR_RANK then
      v_bowl := 'bowl';  v_label := 'Bowl Game';
    else
      v_bowl := 'minor'; v_label := 'Bowl Game';
    end if;
  end if;

  -- ---- the postseason has to fit the bracket it was seeded into ----
  if v_made then
    if v_po < 0 or v_po > v_rounds then
      raise exception 'playoff wins must be 0..% for the No. % seed, got %', v_rounds, v_seed, v_po;
    end if;
    if p_bowl_won then
      raise exception 'a playoff team does not play a bowl game';
    end if;
    v_title := v_po = v_rounds;
    v_po_games := case when v_title then v_rounds else v_po + 1 end;
    if not v_title then
      v_names := ROUND_NAMES[(array_length(ROUND_NAMES,1) - v_rounds + 1):array_length(ROUND_NAMES,1)];
      v_elim  := v_names[v_po + 1];
    end if;
  else
    if v_po <> 0 then
      raise exception 'playoff wins on a season ranked %, which misses the field', v_rank;
    end if;
    v_title := false;
    v_po_games := 0;
    if v_bowl is null and p_bowl_won then
      raise exception 'a bowl win on a season with % losses, which reaches no bowl', v_reg_l;
    end if;
    v_bowl_won   := v_bowl is not null and coalesce(p_bowl_won, false);
    v_bowl_games := case when v_bowl is null then 0 else 1 end;
  end if;

  -- ---- which bowl ----
  -- Kept only when a bowl was actually played, so a playoff team or a team that
  -- stayed home cannot carry one. Shape is checked here as well as by the
  -- constraint, to fail with a sentence rather than a constraint name.
  if v_bowl is not null and p_bowl_key is not null then
    if p_bowl_key !~ '^[a-z0-9_]{1,40}$' then
      raise exception 'bowl key is not a slug: %', p_bowl_key;
    end if;
    v_bowl_key := p_bowl_key;
  end if;

  v_wins   := v_reg + v_po + (case when v_bowl_won then 1 else 0 end);
  v_losses := v_reg_l + (v_po_games - v_po)
              + (case when v_bowl_games = 1 and not v_bowl_won then 1 else 0 end);
  v_games  := CFB_REG_GAMES + v_po_games + v_bowl_games;

  -- ---- the descriptive numbers have to be in range ----
  if p_point_diff is null or p_point_diff < -60 or p_point_diff > 60 then
    raise exception 'point differential out of range: %', p_point_diff;
  end if;
  if p_chemistry_pct is null or p_chemistry_pct < -50 or p_chemistry_pct > 100 then
    raise exception 'chemistry out of range: %', p_chemistry_pct;
  end if;
  if p_spend_musd is null or p_spend_musd < 0 or p_spend_musd > CFB_CAP_MUSD then
    raise exception 'spend of $%M is outside the $%M budget', p_spend_musd, CFB_CAP_MUSD;
  end if;
  if coalesce(p_respins, 0) < 0 or coalesce(p_respins, 0) > 3 then
    raise exception 'respins must be 0..3, got %', p_respins;
  end if;
  if coalesce(p_sig_wins, 0) < 0 or coalesce(p_sig_wins, 0) > v_wins then
    raise exception 'more ranked wins (%) than wins (%)', p_sig_wins, v_wins;
  end if;
  if p_best_win_rank is not null then
    if p_best_win_rank < 1 or p_best_win_rank > 25 then
      raise exception 'a signature win is against a top 25 team, got rank %', p_best_win_rank;
    end if;
    if coalesce(p_sig_wins, 0) = 0 then
      raise exception 'a best ranked win with no ranked wins';
    end if;
  end if;

  if p_squad_fppg is not null and (p_squad_fppg < 0 or p_squad_fppg > 400) then
    raise exception 'squad FPPG out of range: %', p_squad_fppg;
  end if;
  if p_structure_mult is not null and (p_structure_mult < 0.2 or p_structure_mult > 2) then
    raise exception 'structure multiplier out of range: %', p_structure_mult;
  end if;
  if p_team_rating is not null and (p_team_rating < 0 or p_team_rating > 400) then
    raise exception 'team rating out of range: %', p_team_rating;
  end if;
  if p_overall is not null and (p_overall < 0 or p_overall > 300) then
    raise exception 'overall out of range: %', p_overall;
  end if;
  if p_perfect_pct is not null and (p_perfect_pct < 0 or p_perfect_pct > 100) then
    raise exception 'perfect percentage out of range: %', p_perfect_pct;
  end if;

  -- ---- the roster has to be six distinct, well-formed player-seasons ----
  if p_picks is null or cardinality(p_picks) <> CFB_ROSTER_SIZE then
    raise exception 'a run has % picks, got %', CFB_ROSTER_SIZE,
      coalesce(cardinality(p_picks), 0);
  end if;
  if cardinality(array(select distinct unnest(p_picks))) <> CFB_ROSTER_SIZE then
    raise exception 'the same player cannot be signed twice';
  end if;
  if exists (select 1 from unnest(p_picks) k where k !~ '^[0-9A-Za-z-]{1,32}:[12][0-9]{3}$') then
    raise exception 'a pick is not of the form <player_id>:<season>';
  end if;
  if p_slots is not null then
    if cardinality(p_slots) <> CFB_ROSTER_SIZE then
      raise exception 'slots must line up with picks';
    end if;
    if exists (select 1 from unnest(p_slots) s where s not in ('QB','RB','WR','TE','FLEX')) then
      raise exception 'unknown slot name';
    end if;
  end if;

  -- ---- swallow an accidental double submit ----
  select id into v_dupe from cfb_runs
   where picks = p_picks and regular_wins = v_reg and playoff_wins = v_po
     and national_rank = v_rank and run_mode = v_mode
     and created_at > now() - interval '1 minute'
   limit 1;
  if v_dupe is not null then return v_dupe; end if;

  if v_user is not null then
    select username::text into v_name from profiles where id = v_user;
  end if;

  insert into cfb_runs (
    user_id, display_name, run_mode,
    regular_wins, playoff_wins, wins, losses, games,
    national_rank, playoff_seed, made_playoffs, title_won, perfect,
    eliminated_in, bowl, bowl_won, bowl_key, seed_label,
    point_diff, chemistry_pct, spend_musd, respins, sig_wins, best_win_rank,
    squad_fppg, structure_mult, team_rating, overall, perfect_pct,
    picks, slots, rng_seed, rng_calls
  ) values (
    v_user, v_name, v_mode,
    v_reg, v_po, v_wins, v_losses, v_games,
    v_rank, v_seed, v_made, v_title, (v_title and v_losses = 0),
    v_elim, v_bowl, v_bowl_won, v_bowl_key, v_label,
    round(p_point_diff, 1), round(p_chemistry_pct, 2), round(p_spend_musd, 2),
    coalesce(p_respins, 0), coalesce(p_sig_wins, 0), p_best_win_rank,
    round(p_squad_fppg, 1), round(p_structure_mult, 3), round(p_team_rating, 2),
    round(p_overall, 2), p_perfect_pct,
    p_picks, p_slots, p_rng_seed, p_rng_calls
  ) returning id into v_id;

  return v_id;
end $$;

revoke all on function cfb_submit_run(int,int,int,boolean,numeric,numeric,numeric,int,int,int,text[],text[],text,int,numeric,numeric,numeric,numeric,int,text,text) from public;
grant execute on function cfb_submit_run(int,int,int,boolean,numeric,numeric,numeric,int,int,int,text[],text[],text,int,numeric,numeric,numeric,numeric,int,text,text)
  to anon, authenticated;

analyze cfb_runs;
