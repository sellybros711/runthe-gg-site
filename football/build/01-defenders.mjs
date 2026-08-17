/* Stage 1D, defender_seasons. The defense draft's player pool.
 *
 *   node football/build/01-defenders.mjs
 *
 * Produces data/defender_seasons.{json,csv}: one row per eligible defensive
 * player-season, 1999-2025, with weekly IDP mean/SD and a price.
 *
 * THIS IS 01-players.mjs FOR THE OTHER SIDE OF THE BALL, and it is deliberately
 * the same shape rather than a fresh idea. The cap puzzle is the game, and the
 * cap puzzle is a function of the pricing curve: pooled baseline, value over
 * replacement, the same anchors and the same exponent. A defender priced $30M
 * has to buy what a receiver priced $30M buys, or the two modes are two
 * different games wearing one interface, and a player moving between them has
 * to relearn what money means. Everything that differs below differs because
 * the sport does, and says so where it happens.
 *
 * WHY IDP POINTS AT ALL, when the mode is about points allowed rather than
 * points scored. The rating has to rank defenders against each other, and it
 * has to do it from the box score, because that is what nflverse ships for
 * 1999. Snap-weighted grades do not exist this far back and never will. IDP
 * scoring is the one convention that is widely understood, checkable against
 * the stat line printed on the tile, and available for every season the game
 * covers. What the rating is USED for is the engine's business, not this file's:
 * here it is only a ranking and a price.
 *
 * ITS KNOWN BIAS IS LINEBACKERS, and it is left in on purpose. Tackles are the
 * bulk of IDP scoring and linebackers make the most of them, so LB is the
 * expensive slot the way QB is on offense. That is the same trade the offense
 * build reasons about at BASELINE_RANK: with position-locked slots, a position
 * that scores more SHOULD cost more, because you have to field one either way.
 * The alternative, pricing within position, is what the offense build rejected
 * for decoupling price from payoff, and it would be no better here.
 */
import {
  SEASONS, MIN_GAMES, nflverseCSV, parseCSVObjects,
  mean, stdev, quantileSorted, round, writePair,
  franchiseId, franchiseName,
} from './lib.mjs';

/* The same curve as the offense pool, deliberately. See the header. */
export const BASE_PRICE = 3.0;
export const MAX_PRICE = 48.0;
export const PRICE_K = 1.8;
export const BASELINE_RANK = 150;

/*
 * IDP SCORING. A middle-of-the-road set: no league's exact rules, and close
 * enough to all of them that a fan reading the stat line can see where the
 * number came from.
 *
 * Two choices worth naming, because they change who is expensive:
 *
 *   PASSES DEFENDED ARE WORTH REAL POINTS (1.5). Leave them out and cornerbacks
 *   price like backups: a shutdown corner's whole case is the throws that did
 *   not happen, and the box score's only trace of it is the pass defended and
 *   the absence of targets. Without this the CB slot is a coin toss between
 *   cheap men, which is not a decision.
 *
 *   ASSISTS ARE WORTH HALF A SOLO, not the same. Assist scoring varies wildly
 *   by scorer and by stadium, far more than solos do, so paying them equally
 *   imports somebody's home-town charity into the price.
 */
const IDP = {
  def_tackles_solo: 1.5,
  def_tackle_assists: 0.75,
  def_tackles_for_loss: 1.0,
  def_sacks: 4.0,
  def_qb_hits: 0.75,
  def_interceptions: 6.0,
  def_pass_defended: 1.5,
  def_fumbles_forced: 4.0,
  def_fumbles: 3.0,
  def_tds: 6.0,
  def_safeties: 4.0,
};

/* Every defensive column that goes into the season card, scored or not. */
const STAT_KEYS = Object.keys(IDP).concat(['def_sack_yards', 'def_interception_yards',
  'def_tackles_for_loss_yards', 'def_tackles_with_assist']);

/*
 * THREE SLOTS, off nflverse's own position_group: DL, LB, DB. That field is the
 * one nflverse maintains consistently across twenty-seven seasons, and every
 * defender lands in exactly one of the three, which a board needs: a wheel that
 * stops on a team-season unable to fill a slot is a broken game, not history.
 *
 * THE SECONDARY IS NOT SPLIT INTO CORNERS AND SAFETIES, and it was meant to be.
 * The reason is a measurement, not a preference. Half the secondary in the early
 * era carries no specific label at all: bare `DB` is 50% of defensive-back
 * player-weeks in 1999, 47% in 2004, 34% in 2010, still 13% in 2023. Resolving a
 * player from his OTHER seasons recovers a good chunk, and players.csv adds one
 * more, and after both passes 985 defensive backs (43%) have never been called a
 * corner or a safety anywhere in the feed.
 *
 * A CB/S split would therefore be invented for nearly half the pool, and the
 * invention would be printed on the player's tile as though it were a fact. This
 * repo already refuses that trade in 01-players.mjs, where awards are derived
 * from the box score because "a wrong award on a shipped player card is worse
 * than no award". The same standard rules this out.
 *
 * What is kept instead: `real_position` ships the label the feed actually gave
 * him, so a card can say CB or FS when that is known and say nothing when it is
 * not. The slot is honest at three buckets; the card is honest at whatever
 * detail exists.
 */
function slotOf(r) {
  const g = r.position_group;
  if (g === 'DL') return 'DL';
  if (g === 'LB') return 'LB';
  if (g === 'DB') return 'DB';
  return null;
}
export const SLOTS = ['DL', 'LB', 'DB'];
export const SLOT_ELIGIBILITY = {
  DL: ['DL'], LB: ['LB'], DB: ['DB'], FLEX: ['DL', 'LB', 'DB'],
};
/* The drafted roster: two up front, one at linebacker, two in the secondary, one
   free. Closest to a real front seven and secondary out of three buckets, and it
   keeps the flex decision the offense draft turns on. */
export const ROSTER_SLOTS = ['DL', 'DL', 'LB', 'DB', 'DB', 'FLEX'];

const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

/* Where a season finished in the league, in the things a fan keeps track of.
   Tackles are counted as solos plus assists, which is how they are quoted. */
const HEADLINE = [
  { key: 'def_sacks', label: 'sacks' },
  { key: 'tackles', label: 'tackles' },
  { key: 'def_interceptions', label: 'interceptions' },
  { key: 'def_pass_defended', label: 'passes defended' },
  { key: 'def_fumbles_forced', label: 'forced fumbles' },
];

/* Round numbers a fan would recognise, and nothing borderline. */
const MILESTONES = [
  { test: (t) => t.def_sacks >= 20, label: '20 sack season' },
  { test: (t) => t.def_sacks >= 15, label: '15 sacks' },
  { test: (t) => t.tackles >= 150, label: '150 tackles' },
  { test: (t) => t.def_interceptions >= 8, label: '8 interceptions' },
  { test: (t) => t.def_tds >= 2, label: 'two defensive touchdowns' },
  { test: (t) => t.def_fumbles_forced >= 6, label: '6 forced fumbles' },
];

function buildBadges(rows) {
  const bySeason = {};
  for (const r of rows) (bySeason[r.season] ??= []).push(r);
  for (const season of Object.keys(bySeason)) {
    for (const h of HEADLINE) {
      const ranked = bySeason[season]
        .filter((r) => r.tot[h.key] > 0)
        .sort((a, b) => b.tot[h.key] - a.tot[h.key]);
      ranked.forEach((r, i) => {
        if (i === 0) r._badges.push({ kind: 'led', text: `Led the NFL in ${h.label}` });
        else if (i < 3) r._badges.push({ kind: 'top', text: `${ordinal(i + 1)} in ${h.label}` });
      });
    }
  }
  for (const r of rows) {
    for (const m of MILESTONES) if (m.test(r.tot)) r._badges.push({ kind: 'mile', text: m.label });
    const led = r._badges.filter((x) => x.kind === 'led');
    const top = r._badges.filter((x) => x.kind === 'top');
    const mile = r._badges.filter((x) => x.kind === 'mile');
    r._badges = led.concat(top).slice(0, 2).concat(mile.slice(0, 1)).slice(0, 3);
  }
}

/*
 * HOW THE POINTS WERE EARNED, in three parts, the way the offense build splits
 * passing from rushing from receiving. The engine reads these to tell a pass
 * rush from a coverage unit, which is a real difference between two defenses
 * that allow the same points on paper.
 *
 * Scaled to reconcile with the player's actual per-game figure, so the parts
 * always add up to the number printed on his tile.
 */
function modeSplit(t, games, actualPpg) {
  const rush = IDP.def_sacks * t.def_sacks + IDP.def_qb_hits * t.def_qb_hits
    + IDP.def_tackles_for_loss * t.def_tackles_for_loss;
  const cover = IDP.def_interceptions * t.def_interceptions
    + IDP.def_pass_defended * t.def_pass_defended;
  const tackle = IDP.def_tackles_solo * t.def_tackles_solo
    + IDP.def_tackle_assists * t.def_tackle_assists;
  const raw = rush + cover + tackle;
  const per = (v) => (games > 0 ? v / games : 0);
  if (raw <= 0) return { rush_ppg: 0, cover_ppg: 0, tackle_ppg: 0 };
  const k = actualPpg / per(raw);
  return {
    rush_ppg: round(per(rush) * k, 2),
    cover_ppg: round(per(cover) * k, 2),
    tackle_ppg: round(per(tackle) * k, 2),
  };
}

/* The line printed under the name. Led by whatever the man actually did, so a
   corner does not get a sack line reading 0.0 and a tackle does not get a
   coverage line reading 0. */
function statLine(slot, t) {
  const n = (v) => Math.round(v).toLocaleString('en-US');
  const parts = [`${n(t.tackles)} tkl`];
  if (t.def_sacks >= 1) parts.push(`${round(t.def_sacks, 1)} sk`);
  if (t.def_tackles_for_loss >= 5) parts.push(`${n(t.def_tackles_for_loss)} TFL`);
  if (t.def_interceptions >= 1) parts.push(`${n(t.def_interceptions)} INT`);
  if (t.def_pass_defended >= 5 || (slot === 'DB' && t.def_pass_defended >= 1)) {
    parts.push(`${n(t.def_pass_defended)} PD`);
  }
  if (t.def_fumbles_forced >= 2) parts.push(`${n(t.def_fumbles_forced)} FF`);
  if (t.def_tds >= 1) parts.push(`${n(t.def_tds)} TD`);
  return parts.join(', ');
}

const idpPoints = (r) => {
  let v = 0;
  for (const [k, w] of Object.entries(IDP)) v += w * (Number(r[k]) || 0);
  return v;
};

async function loadWeekly() {
  const byPlayerSeason = new Map();
  for (const season of SEASONS) {
    const text = await nflverseCSV('stats_player', `stats_player_week_${season}.csv`);
    for (const r of parseCSVObjects(text)) {
      /* Regular season only, for the same reason the offense build gives: playoff
         weeks inflate good players' game counts and mix in a different opponent
         distribution. */
      if (r.season_type !== 'REG') continue;
      const slot = slotOf(r);
      if (!slot) continue;
      const key = `${r.player_id}|${season}`;
      let e = byPlayerSeason.get(key);
      if (!e) {
        e = {
          player_id: r.player_id,
          name: r.player_display_name,
          position: r.position || slot,
          slot,
          season,
          weeks: [],
          teams: {},
          tot: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
        };
        byPlayerSeason.set(key, e);
      }
      e.weeks.push(idpPoints(r));
      for (const k of STAT_KEYS) e.tot[k] += Number(r[k]) || 0;
      if (r.team) e.teams[r.team] = (e.teams[r.team] || 0) + 1;
    }
    process.stderr.write(`  weekly ${season} \r`);
  }
  return [...byPlayerSeason.values()];
}

async function loadBio() {
  const text = await nflverseCSV('players', 'players.csv');
  const bio = new Map();
  for (const r of parseCSVObjects(text)) {
    if (!r.gsis_id) continue;
    bio.set(r.gsis_id, {
      college: r.college_name || null,
      draft_year: r.draft_year ? Number(r.draft_year) : null,
      draft_round: r.draft_round ? Number(r.draft_round) : null,
    });
  }
  return bio;
}

async function main() {
  const raw = await loadWeekly();
  process.stderr.write('\n');
  const bio = await loadBio();

  const shape = (p) => {
    const code = Object.entries(p.teams).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const franchise = code ? franchiseId(code) : null;
    /* Tackles are quoted as solos plus assists, so the card and the badges use
       that rather than either column on its own. */
    p.tot.tackles = p.tot.def_tackles_solo + p.tot.def_tackle_assists;
    return {
      player_id: p.player_id,
      name: p.name,
      season: p.season,
      franchise,
      team_season_id: franchise ? `${franchise}-${p.season}` : null,
      position: p.position,
      slot: p.slot,
      games_played: p.weeks.length,
      idp_ppg_mean: mean(p.weeks),
      idp_ppg_sd: stdev(p.weeks),
      tot: p.tot,
      multi_team: Object.keys(p.teams).length > 1,
    };
  };
  const eligible = raw.filter((p) => p.weeks.length >= MIN_GAMES).map(shape);

  /* EVERY TEAM-SEASON HAS TO BE ABLE TO FIELD ALL FOUR SLOTS, the same guard the
     offense build applies to QB and TE, and for the same reason: the wheel can
     land on any team-season, five of the six slots are position-locked, and a
     board that cannot fill one reads as a broken game rather than as history.
     Here it applies to all four, because none of them is a spare part.
     The club's primary man at a missing slot, most games then most production,
     is admitted below the games threshold. His weekly spread is a noisier
     estimate, games_played ships unchanged, and the player sheet prints it. */
  const covered = new Set(eligible.map((p) => `${p.team_season_id}|${p.slot}`));
  const spares = raw.filter((p) => p.weeks.length < MIN_GAMES).map(shape)
    .filter((p) => p.team_season_id);
  const rescued = new Map();
  for (const p of spares) {
    const key = `${p.team_season_id}|${p.slot}`;
    if (covered.has(key)) continue;
    const cur = rescued.get(key);
    const better = !cur || p.games_played > cur.games_played
      || (p.games_played === cur.games_played && p.idp_ppg_mean > cur.idp_ppg_mean);
    if (better) rescued.set(key, p);
  }
  for (const p of rescued.values()) eligible.push(p);
  if (rescued.size) {
    process.stderr.write(`admitted ${rescued.size} primary starters below ${MIN_GAMES} games so no `
      + `team-season lacks a slot\n`);
  }

  const baseline = new Map();
  for (const season of SEASONS) {
    const desc = eligible.filter((p) => p.season === season)
      .map((p) => p.idp_ppg_mean).sort((a, b) => b - a);
    if (!desc.length) continue;
    baseline.set(season, desc[Math.min(desc.length - 1, BASELINE_RANK - 1)]);
  }
  for (const p of eligible) {
    p.baseline_ppg = baseline.get(p.season) ?? 0;
    p.vor = p.idp_ppg_mean - p.baseline_ppg;
  }

  const vorAsc = eligible.map((p) => p.vor).sort((a, b) => a - b);
  const VOR_LO = quantileSorted(vorAsc, 0.01);
  const VOR_REF = quantileSorted(vorAsc, 0.99);
  const priceOf = (vor) => {
    const t = (vor - VOR_LO) / (VOR_REF - VOR_LO);
    return BASE_PRICE + (MAX_PRICE - BASE_PRICE) * Math.pow(Math.min(1, Math.max(0, t)), PRICE_K);
  };
  for (const p of eligible) {
    p.price_musd = priceOf(p.vor);
    const peers = eligible.filter((q) => q.season === p.season && q.slot === p.slot)
      .map((q) => q.idp_ppg_mean).sort((a, b) => a - b);
    p.position_percentile = peers.filter((v) => v < p.idp_ppg_mean).length
      / Math.max(1, peers.length - 1);
  }

  for (const p of eligible) p._badges = [];
  buildBadges(eligible);

  const rows = eligible
    .sort((a, b) => b.vor - a.vor)
    .map((p) => ({
      player_id: p.player_id,
      name: p.name,
      season: p.season,
      franchise: p.franchise,
      team_season_id: p.team_season_id,
      position: p.slot,          // the drafted slot, which is what the board groups by
      real_position: p.position,  // the label he actually wore, for the card
      games_played: p.games_played,
      idp_ppg_mean: round(p.idp_ppg_mean, 2),
      idp_ppg_sd: round(p.idp_ppg_sd, 2),
      position_percentile: round(p.position_percentile, 4),
      price_musd: round(p.price_musd, 1),
      fppg: round(p.idp_ppg_mean, 1),
      ...modeSplit(p.tot, p.games_played, p.idp_ppg_mean),
      stat_line: statLine(p.slot, p.tot),
      badges: p._badges.map((x) => x.text),
      college: bio.get(p.player_id)?.college ?? null,
      draft_year: bio.get(p.player_id)?.draft_year ?? null,
    }));

  const csvRows = rows.map((r, i) => ({
    ...r,
    team_display: eligible[i].franchise
      ? franchiseName(eligible[i].franchise, eligible[i].season) : null,
    vor: round(eligible[i].vor, 2),
    tackles: round(eligible[i].tot.tackles, 0),
    sacks: round(eligible[i].tot.def_sacks, 1),
    ints: eligible[i].tot.def_interceptions,
    draft_round: bio.get(r.player_id)?.draft_round ?? null,
    multi_team: eligible[i].multi_team,
  }));

  const out = writePair('defender_seasons', rows, Object.keys(rows[0]), csvRows,
    Object.keys(csvRows[0]));

  console.log(`defender_seasons: ${rows.length} eligible player-seasons `
    + `(${SEASONS[0]}-${SEASONS.at(-1)}, >=${MIN_GAMES} REG games)`);
  console.log(`baseline = rank ${BASELINE_RANK} defender each season `
    + `(${baseline.get(1999).toFixed(1)} ppg in 1999 -> ${baseline.get(2025).toFixed(1)} ppg in 2025)`);
  console.log(`VOR anchors: p01 ${VOR_LO.toFixed(2)}  p99 ${VOR_REF.toFixed(2)}   K=${PRICE_K}`);
  console.log(`wrote ${out.json} (${(out.bytes / 1024).toFixed(0)} KB) + .csv\n`);

  const byPos = {};
  for (const p of rows) (byPos[p.position] ??= []).push(p);
  console.log('per slot:');
  for (const slot of SLOTS) {
    const g = byPos[slot] || [];
    const ppg = g.map((p) => p.idp_ppg_mean).sort((a, b) => a - b);
    const price = g.map((p) => p.price_musd).sort((a, b) => a - b);
    console.log(`  ${slot.padEnd(3)} ${String(g.length).padStart(5)} seasons   `
      + `ppg med ${quantileSorted(ppg, 0.5).toFixed(1)} p99 ${quantileSorted(ppg, 0.99).toFixed(1)}   `
      + `price med $${quantileSorted(price, 0.5).toFixed(1)}M max $${price.at(-1).toFixed(1)}M`);
  }
  /* The seats have to exist before the board can offer them. */
  const teamSeasons = new Set(rows.map((r) => r.team_season_id).filter(Boolean));
  let holes = 0;
  for (const ts of teamSeasons) {
    for (const slot of SLOTS) {
      if (!rows.some((r) => r.team_season_id === ts && r.position === slot)) holes++;
    }
  }
  console.log(`\n${teamSeasons.size} team-seasons, ${holes} unfillable slots`);
}

main().catch((e) => { console.error(e); process.exit(1); });
