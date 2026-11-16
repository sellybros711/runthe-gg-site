/* THE PLAYOFF FANTASY: one lineup, ridden through the bracket (the owner's call, 2026-11-16).
 *
 *   node cfb/build/fantasy/playoff.mjs [--season 2026]            dry: print the board
 *   node cfb/build/fantasy/playoff.mjs --write                      build and write it
 *   node cfb/build/fantasy/playoff.mjs --refresh                    add rounds as they are set
 *
 * Six men from the twelve Playoff teams. A man scores in every game his team plays, so the
 * draft is a bet on who goes deep. It is ONE MORE WEEK ROW to the server, `PLAYOFF_WEEK`,
 * with its own board, cap and prize, so submit, the board, the standings and the prize need
 * no new SQL. Three things are different, and each is said where it lives:
 *
 *   THE PRICE IS PER GAME TIMES EXPECTED GAMES. A man's weekly projection, from the same
 *   season store, prior and roles as every week, multiplied by how many games his team should
 *   play: its first game from that game's line, every later round an even chance.
 *
 *   A SWAP CLOSES AT A MAN'S FIRST PLAYOFF GAME (the owner's call, 2026-11-16). His `kick` is
 *   his team's first Playoff kickoff, which is what cfb_fantasy_swap already reads. A top four
 *   seed has a bye, so its men stay swappable until the quarterfinals. A man who has played is
 *   never swapped, so a total is always one lineup's points and nothing has to be banked.
 *
 *   THE SLATE GROWS. The later rounds' matchups are not known at the lock. `--refresh` adds
 *   each Playoff game to the board file as ESPN lists it, never touching a price, and the week
 *   is final only once the title game is (EXPECTED_GAMES).
 */
import fs from 'node:fs';
import path from 'node:path';
import { scoreboardPost, scoreboardWeek, roster, rosterOf, calendarOf, gamesOf, STAT_KEYS } from './espn.mjs';
import { DATA, loadStore, saveStore, fillBefore, seasonToDate } from './season.mjs';
import { sweepCap } from './cap.mjs';
import { quarterbacks } from './roles.mjs';
import {
  buildMen, applyRoles, asPriced, asShown, positionLevels, projectMan, pricePool, priorsFrom,
  POSITIONS, SWAP_PCT, SWAP_FLOOR_MUSD, writePool,
} from './pool.mjs';

const say = (...a) => process.stderr.write(a.join(' ') + '\n');
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/* The Playoff's week number. No regular week comes near it, so it can never collide with one,
   and the page reads anything from here up as the Playoff. */
export const PLAYOFF_WEEK = 100;
/* Twelve teams: four first round games, four quarterfinals, two semifinals, the title game. */
export const PLAYOFF_TEAMS = 12;
export const EXPECTED_GAMES = 11;
/* A ROUND WITH NO LINE YET IS AN EVEN CHANCE. Every later round, and said so: the opponent
   is not known when the board is priced. */
export const LATER_P = 0.5;
/* A top four seed's quarterfinal has no line until the first round is played. The seed is
   favoured over whoever comes through, so it is priced a little better than even. */
export const BYE_P = 0.6;
/* A college point spread's spread, for turning a line into a chance: about two touchdowns. */
export const SPREAD_SD = 14;

/* ─── the bracket ─────────────────────────────────────────────────────────────────── */

/** A Playoff game, by ESPN's headline, as opposed to any other bowl. */
export function isPlayoffGame(g) {
  return !!g && /college football playoff|\bcfp\b/i.test(g.note || '');
}

/** 1 first round, 2 quarterfinal, 3 semifinal, 4 the title game. null if it cannot tell. */
export function roundOf(g) {
  const n = (g && g.note) || '';
  if (/first round/i.test(n)) return 1;
  if (/quarter/i.test(n)) return 2;
  if (/semi/i.test(n)) return 3;
  if (/national championship|championship game|title game/i.test(n)) return 4;
  return null;
}

/** A real team, not a slot ESPN holds for a winner still to come. */
export function isRealTeam(t) {
  return !!t && !!t.id && Number(t.id) > 0 && !!t.abbr && !/^tbd$/i.test(t.abbr);
}

/* The normal curve, for a line. Abramowitz and Stegun 7.1.26, good to about 1e-7. */
function phi(x) {
  const s = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t
    + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + s * y);
}

/** A side's chance in a game with a line. The spread is the home side's (espn.mjs). */
export function winProb(g, home) {
  if (!g || g.spread == null) return null;
  const pHome = phi(-g.spread / SPREAD_SD);
  return home ? pHome : 1 - pHome;
}

/** Games a team should play, from the round it starts in and its chance in that first game. */
export function expectedGames(firstRound, p0) {
  let e = 1, alive = p0;
  for (let r = firstRound + 1; r <= 4; r++) {
    e += alive;
    alive *= LATER_P;
  }
  return round(e, 3);
}

/**
 * The twelve teams and each one's first game. A first round team starts in round 1; a bye
 * team's first game is its quarterfinal, listed with a slot for the opponent still to come.
 * Answers { teams: Map(id -> { side, game, round, p, expected }), games }, or throws when
 * the bracket is not set (fewer than twelve real teams).
 */
export function bracketOf(postGames) {
  const games = postGames.filter(isPlayoffGame);
  const teams = new Map();
  const order = [...games].sort((a, b) => (roundOf(a) || 9) - (roundOf(b) || 9)
    || Date.parse(a.kick) - Date.parse(b.kick));
  for (const g of order) {
    const r = roundOf(g);
    if (r == null || r > 2) continue;
    for (const [side, home] of [[g.home, true], [g.away, false]]) {
      if (!isRealTeam(side) || teams.has(side.id)) continue;
      const line = winProb(g, home);
      const p = line != null ? line : (r === 2 ? BYE_P : LATER_P);
      teams.set(side.id, { side, game: g, round: r, p: round(p, 3), lined: line != null,
        expected: expectedGames(r, p) });
    }
  }
  if (teams.size !== PLAYOFF_TEAMS) {
    throw new Error(`the bracket is not set: ${teams.size} of ${PLAYOFF_TEAMS} Playoff teams listed`);
  }
  return { teams, games };
}

/* ─── the board ───────────────────────────────────────────────────────────────────── */

export async function buildPlayoff({ season, now = Date.now(), fetchPost = scoreboardPost } = {}) {
  const post = await fetchPost(season);
  if (!post) throw new Error('the postseason scoreboard could not be read');
  const { teams, games } = bracketOf(gamesOf(post));
  for (const t of teams.values()) {
    say(`  ${t.side.abbr.padEnd(5)} round ${t.round} ${t.game.kick}  first game ${Math.round(t.p * 100)}%`
      + `${t.lined ? '' : ' (no line)'}  expected games ${t.expected}`);
  }

  /* The season to date is every regular week, so the store is filled to the last one. */
  const sb1 = await scoreboardWeek(season, 1);
  const last = Math.max(0, ...calendarOf(sb1).map((c) => c.week));
  if (!last) throw new Error('the regular season calendar could not be read');
  const store = loadStore(season);
  const have = await fillBefore(store, last + 1);
  saveStore(store);
  say(`${season} Playoff: the season store holds weeks ${have.join(', ') || 'none'}`);

  const rosters = new Map();
  for (const t of teams.values()) {
    const j = await roster(t.side.id);
    if (!j) throw new Error(`the ${t.side.school} roster could not be read`);
    rosters.set(t.side.id, rosterOf(j));
  }

  /* EACH TEAM ON ITS FIRST GAME, so a man's kick is his first Playoff kickoff (the swap
     cutoff) and his matchup is that game's line. A bye team's quarterfinal names a slot for
     its opponent, which buildMen passes by: there is no roster behind it. */
  const firsts = [...new Map([...teams.values()].map((t) => [t.game.id, t.game])).values()];
  const todate = seasonToDate(store, last + 1, STAT_KEYS);
  const rows = JSON.parse(fs.readFileSync(path.join(DATA, '..', 'cfb_player_seasons.json'), 'utf8'));
  const priors = priorsFrom(rows, season);
  const roles = quarterbacks(store, last + 1);
  const built = buildMen(firsts, rosters, todate, priors, roles);
  /* ONE ROW A MAN, OFF HIS TEAM'S FIRST GAME. A quarterfinal can already name the first round
     winner it waits for (a rebuilt or late board does: the 2025 dry build listed Ole Miss off
     its first round game and again off its Sugar Bowl quarterfinal), and buildMen reads both
     sides of every game it is given. */
  const seen = new Set();
  const men = applyRoles(built.men, roles).filter((m) => {
    const t = teams.get(m.team_id);
    if (!t || m.game_id !== t.game.id || seen.has(m.player_id)) return false;
    seen.add(m.player_id);
    return true;
  });
  for (const pos of POSITIONS) {
    if (!men.some((m) => m.position === pos)) throw new Error(`the board has no ${pos}`);
  }

  for (const m of men) asPriced(m);
  const levels = positionLevels(men);
  for (const m of men) {
    Object.assign(m, projectMan(m, levels));
    /* PER GAME TIMES EXPECTED GAMES. The page shows both, so the price can be read. */
    const t = teams.get(m.team_id);
    m.per_game = m.proj;
    m.exp_games = t.expected;
    m.proj = round(m.proj * t.expected, 2);
  }
  const priced = pricePool(men);
  for (const m of men) { asShown(m); delete m.start_ppg; }
  men.sort((a, b) => b.price_musd - a.price_musd || b.proj - a.proj);
  const { cap } = sweepCap(men);

  const first = Math.min(...games.filter((g) => roundOf(g) === 1).map((g) => Date.parse(g.kick)));
  const title = games.find((g) => roundOf(g) === 4);
  say(`\n${men.length} men from ${teams.size} teams, cap $${cap}M, locks ${new Date(first).toISOString()}`);
  return {
    season, week: PLAYOFF_WEEK, kind: 'playoff',
    built: new Date(now).toISOString(),
    locks_at: new Date(first).toISOString(),
    ends_at: title && title.kick ? title.kick : null,
    expect_games: EXPECTED_GAMES,
    cap_musd: cap,
    swap: { pct: SWAP_PCT, floor_musd: SWAP_FLOOR_MUSD },
    baseline: priced.baseline,
    teams: [...teams.values()].map((t) => ({ id: t.side.id, abbr: t.side.abbr, school: t.side.school,
      round: t.round, p: t.p, expected: t.expected })),
    games: games.map(slim),
    pool: men,
  };
}

function slim(g) {
  return { id: g.id, kick: g.kick, neutral: g.neutral, spread: g.spread, total: g.total, tv: g.tv,
    note: g.note, round: roundOf(g), home: g.home, away: g.away };
}

/**
 * ADD EACH PLAYOFF GAME AS ESPN LISTS IT, never touching a price or a man. A game already on
 * the board has its kick and teams brought up to date (a slot filled by the winner). Answers
 * the number of games added or changed.
 */
export function refreshGames(pool, postGames) {
  const byId = new Map(pool.games.map((g) => [g.id, g]));
  let moved = 0;
  for (const g of postGames.filter(isPlayoffGame)) {
    const s = slim(g);
    const had = byId.get(s.id);
    if (!had) { byId.set(s.id, s); moved++; continue; }
    if (JSON.stringify(had) !== JSON.stringify(s)) { byId.set(s.id, s); moved++; }
  }
  pool.games = [...byId.values()].sort((a, b) => Date.parse(a.kick) - Date.parse(b.kick));
  const title = pool.games.find((g) => g.round === 4);
  if (title && title.kick) pool.ends_at = title.kick;
  return moved;
}

/* ─── the pointer between the seasons ─────────────────────────────────────────────── */

/**
 * The regular season is over and the bracket is not set: the pointer keeps the last week (the
 * live job still finishes it) and says the Playoff is next, so the door can say so too.
 */
export function markWaiting() {
  const f = path.join(DATA, 'now.json');
  const cur = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (cur.next === 'playoff' || cur.kind === 'playoff') return false;
  fs.writeFileSync(f, JSON.stringify({ ...cur, next: 'playoff' }) + '\n');
  return true;
}

/* ─── cli ─────────────────────────────────────────────────────────────────────────── */

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

/* The exact name, not endsWith: test_playoff.mjs ends in playoff.mjs too, and importing this
   from it must not run a build. */
if (process.argv[1] && path.basename(process.argv[1]) === 'playoff.mjs') {
  /* THE SEASON IS THE POINTER'S ONCE THE PLAYOFF IS ON IT. The title game is in January, when
     the calendar year has moved on, and a refresh then must still find this season's board. */
  let ptr = null;
  try { ptr = JSON.parse(fs.readFileSync(path.join(DATA, 'now.json'), 'utf8')); } catch { /* none */ }
  const fallback = ptr && ptr.kind === 'playoff' ? ptr.season : new Date().getUTCFullYear();
  const season = Number(arg('--season', String(fallback)));
  const write = process.argv.includes('--write');
  /* `--check`: is the bracket set? 0 yes, 3 not yet, 1 could not tell. For the watchdog. */
  if (process.argv.includes('--check')) {
    const post = await scoreboardPost(season);
    if (!post) { say('the postseason scoreboard could not be read'); process.exit(1); }
    try { bracketOf(gamesOf(post)); console.log('set'); process.exit(0); } catch (e) {
      say(String(e.message)); console.log('not set'); process.exit(3);
    }
  }
  if (process.argv.includes('--refresh')) {
    const file = path.join(DATA, `pool_${season}_w${PLAYOFF_WEEK}.json`);
    if (!fs.existsSync(file)) { say('no Playoff board yet. Nothing to refresh.'); process.exit(0); }
    const post = await scoreboardPost(season);
    if (!post) { say('the postseason scoreboard could not be read'); process.exit(1); }
    const pool = JSON.parse(fs.readFileSync(file, 'utf8'));
    const moved = refreshGames(pool, gamesOf(post));
    say(`${moved} Playoff games added or changed; ${pool.games.length} on the board`);
    if (moved && write) writePool(pool);
    process.exit(0);
  }
  try {
    const pool = await buildPlayoff({ season });
    say('  price    proj = per game x games   man');
    for (const m of pool.pool.slice(0, 15)) {
      say(`  $${String(m.price_musd).padStart(4)}M  ${String(m.proj).padStart(6)} = `
        + `${String(m.per_game).padStart(5)} x ${m.exp_games}   ${m.name} ${m.position} ${m.team}`);
    }
    const ids = pool.pool.map((m) => m.player_id);
    say(`  ${ids.length - new Set(ids).size} men listed twice`);
    for (const pos of POSITIONS) {
      const ps = pool.pool.filter((m) => m.position === pos);
      say(`  ${pos}: ${ps.length} men, $${ps[ps.length - 1].price_musd}M to $${ps[0].price_musd}M`);
    }
    if (write) {
      const w = writePool(pool);
      say(`wrote ${w.name}${w.pointer ? ' and moved now.json to it' : ''}`);
    }
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/bracket is not set/.test(msg)) {
      say(msg);
      if (write) say(markWaiting() ? 'now.json says the Playoff is next' : 'now.json already says so');
      process.exit(0);
    }
    say(msg);
    process.exit(1);
  }
}
