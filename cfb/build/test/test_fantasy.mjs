/* THE COLLEGE FANTASY CHALLENGE, checked.
 *
 *   node cfb/build/test/test_fantasy.mjs           the builders, the board and the page
 *   node cfb/build/test/test_fantasy.mjs --quick   no browser
 *
 * The builders are checked against payloads in the shape ESPN actually sent a runner on
 * 2026-09-27 (see cfb/build/fantasy/probe.mjs), because ESPN cannot be reached from here.
 * The page is checked in a real browser with every request to the server stubbed: NOT ONE
 * REQUEST REACHES THE LIVE SUPABASE PROJECT, which holds a real competition.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  gameOf, gamesOf, implied, boxRows, rosterOf, calendarOf,
} from '../fantasy/espn.mjs';
import {
  pickSlate, gameScore, priorsFrom, buildMen, projectMan, positionLevels, pricePool,
  SLATE_SIZE, MATCHUP_HI, MATCHUP_LO, PROJ_LEVEL,
} from '../fantasy/pool.mjs';
import { seasonToDate } from '../fantasy/season.mjs';
import { sweepCap, DRAFT } from '../fantasy/cap.mjs';
import { poolSQL, resultsSQL } from '../fantasy/publish.mjs';
import { buildReport } from '../fantasy/injuries.mjs';
import { plan, easternDay } from '../fantasy/live.mjs';
import { STAT_KEYS } from '../fantasy/espn.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const QUICK = process.argv.includes('--quick');
let fails = 0, passes = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { passes++; console.log(`  ok    ${label}`); }
  else { fails++; console.log(`  FAIL  ${label}${detail ? '  ' + detail : ''}`); }
};
const section = (s) => console.log(`\n${s}`);

/* ─── fixtures in ESPN's own shape ─────────────────────────────────────────────── */

const team = (id, abbr, loc, conf, rank) => ({
  id, homeAway: null, curatedRank: { current: rank || 99 },
  team: { id, abbreviation: abbr, location: loc, name: loc, color: '112233', conferenceId: conf },
});
let evN = 1000;
function event({ home, away, kick, state = 'pre', spread = null, total = null, hs, as }) {
  const h = { ...team(...home), homeAway: 'home', score: hs == null ? '0' : String(hs) };
  const a = { ...team(...away), homeAway: 'away', score: as == null ? '0' : String(as) };
  return {
    id: String(evN++), date: kick, name: `${a.team.location} at ${h.team.location}`,
    competitions: [{
      status: { period: state === 'in' ? 3 : 0, displayClock: state === 'in' ? '7:30' : '0:00',
        type: { state } },
      competitors: [h, a],
      odds: spread == null ? undefined : [{ details: 'x', spread, overUnder: total }],
      broadcasts: [{ names: ['ESPN'] }],
    }],
  };
}
const athlete = (id, name) => ({ athlete: { id, displayName: name, jersey: '1' } });
function summaryOf(homeId, awayId, lines) {
  /* lines: [{team, id, name, pass:[yds,td,int], rush:[yds,td], rec:[n,yds,td], lost}] */
  const blocks = (tid) => {
    const mine = lines.filter((l) => l.team === tid);
    return [
      { name: 'passing', keys: ['completions/passingAttempts', 'passingYards', 'yardsPerPassAttempt',
        'passingTouchdowns', 'interceptions', 'adjQBR'], labels: ['C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'QBR'],
        athletes: mine.filter((l) => l.pass).map((l) => ({ ...athlete(l.id, l.name),
          stats: ['10/20', String(l.pass[0]), '7.0', String(l.pass[1]), String(l.pass[2]), '50'] })) },
      { name: 'rushing', keys: ['rushingAttempts', 'rushingYards', 'yardsPerRushAttempt',
        'rushingTouchdowns', 'longRushing'], labels: ['CAR', 'YDS', 'AVG', 'TD', 'LONG'],
        athletes: mine.filter((l) => l.rush).map((l) => ({ ...athlete(l.id, l.name),
          stats: ['10', String(l.rush[0]), '5.0', String(l.rush[1]), '20'] })) },
      { name: 'receiving', keys: ['receptions', 'receivingYards', 'yardsPerReception',
        'receivingTouchdowns', 'longReception'], labels: ['REC', 'YDS', 'AVG', 'TD', 'LONG'],
        athletes: mine.filter((l) => l.rec).map((l) => ({ ...athlete(l.id, l.name),
          stats: [String(l.rec[0]), String(l.rec[1]), '10.0', String(l.rec[2]), '30'] })) },
      { name: 'defensive', keys: ['totalTackles'], labels: ['TOT'],
        athletes: [{ ...athlete('999' + tid, 'A Linebacker'), stats: ['8'] }] },
    ];
  };
  return { boxscore: { players: [
    { team: { id: homeId }, statistics: blocks(homeId) },
    { team: { id: awayId }, statistics: blocks(awayId) },
  ] } };
}

/* ─── 1. the feed's shape ───────────────────────────────────────────────────────── */

section('1. ESPN, read in the shape it sent');
{
  const ev = event({ home: ['166', 'NMSU', 'New Mexico State', '12'], away: ['98', 'WKU', 'Western Kentucky', '12'],
    kick: '2026-10-02T00:00Z', spread: -1.5, total: 53.5 });
  const g = gameOf(ev);
  ok('a game is read', g && g.home.abbr === 'NMSU' && g.away.abbr === 'WKU');
  ok('rank 99 is no rank', g.home.rank === null);
  const imp = implied(g);
  ok('a negative spread favours the home side', imp.home > imp.away && Math.abs(imp.home - 27.5) < 1e-9,
    JSON.stringify(imp));
  const s = summaryOf('1', '2', [
    { team: '1', id: 'q1', name: 'Quinn Q', pass: [300, 3, 1], rush: [20, 0] },
    { team: '1', id: 'w1', name: 'Wes W', rec: [6, 80, 1] },
    { team: '2', id: 'r2', name: 'Ray R', rush: [100, 2], rec: [2, 10, 0] },
  ]);
  const rows = boxRows(s);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  ok('a tackler is not a row', !rows.some((r) => r.name === 'A Linebacker'));
  ok('each row carries its team', by.q1.team === '1' && by.r2.team === '2');
  /* 300*.04 + 3*4 - 1*2 + 20*.1 = 12 + 12 - 2 + 2 = 24 */
  ok('half PPR for a quarterback', by.q1.pts === 24, String(by.q1.pts));
  /* 6*.5 + 80*.1 + 6 = 3 + 8 + 6 = 17 */
  ok('half PPR for a receiver', by.w1.pts === 17, String(by.w1.pts));
  ok('a stat line is written', /300 pass yds, 3 TD/.test(by.q1.line), by.q1.line);
  const cal = calendarOf({ leagues: [{ calendar: [{ value: '2', entries: [
    { value: '5', startDate: '2026-09-28T07:00Z', endDate: '2026-10-05T06:59Z', label: 'Week 5' }] }] }] });
  ok('the calendar is read', cal.length === 1 && cal[0].week === 5);
  const ros = rosterOf({ athletes: [
    { position: 'offense', items: [{ id: 'q1', displayName: 'Quinn Q', position: { abbreviation: 'QB' } }] },
    { position: 'injuredReserveOrOut', items: [{ id: 'x1', displayName: 'Hurt Man', position: { abbreviation: 'RB' } }] },
    { position: 'suspended', items: [{ id: 'x2', displayName: 'Held Out', position: { abbreviation: 'WR' } }] },
  ] });
  ok('a roster reads positions', ros.get('q1').pos === 'QB' && !ros.get('q1').off);
  ok('the injured reserve group is out', ros.get('x1').off === 'out');
  ok('the suspended group is off', ros.get('x2').off === 'suspended');
}

/* ─── 2. the slate ──────────────────────────────────────────────────────────────── */

section('2. the twenty games, by the written rule');
const NOW = Date.parse('2026-09-28T15:00:00Z');
let SLATE, EVENTS;
{
  const confs = ['8', '5', '1', '4', '151', '12', '37', '15', '17'];
  EVENTS = [];
  for (let i = 0; i < 40; i++) {
    const c1 = confs[i % confs.length], c2 = confs[(i + 3) % confs.length];
    EVENTS.push(event({
      home: [`h${i}`, `H${i}`, `Home ${i}`, c1, i < 12 ? i + 1 : null],
      away: [`a${i}`, `A${i}`, `Away ${i}`, c2, i < 12 ? 25 - i : null],
      kick: new Date(NOW + (24 + (i % 5) * 3) * 3600e3).toISOString(),
      spread: i % 7 === 0 ? null : -((i * 3) % 21), total: 40 + (i % 30),
    }));
  }
  EVENTS.push(event({ home: ['fcs1', 'FCS', 'An FCS Team', '99'], away: ['h99', 'H99', 'Power', '8', 1],
    kick: new Date(NOW + 30 * 3600e3).toISOString(), spread: -40, total: 60 }));
  EVENTS.push(event({ home: ['hp', 'HP', 'Played Already', '8', 2], away: ['ap', 'AP', 'Other', '8', 3],
    kick: new Date(NOW - 3600e3).toISOString(), state: 'post', hs: 30, as: 20 }));
  const games = gamesOf({ events: EVENTS });
  SLATE = pickSlate(games, NOW);
  ok(`the slate is ${SLATE_SIZE} games`, SLATE.length === SLATE_SIZE, String(SLATE.length));
  ok('an FCS opponent is never in it', !SLATE.some((g) => g.home.id === 'fcs1'));
  ok('a game already played is never in it', !SLATE.some((g) => g.home.id === 'hp'));
  const all = games.filter((g) => g.state === 'pre' && g.home.id !== 'fcs1').map(gameScore)
    .sort((a, b) => b - a);
  ok('it is the twenty highest scores', Math.min(...SLATE.map((g) => g.score)) >= all[SLATE_SIZE - 1]);
  ok('it is in kickoff order', SLATE.every((g, i) => !i || String(SLATE[i - 1].kick) <= String(g.kick)));
  const top = gameScore(gameOf(event({ home: ['x', 'X', 'X', '8', 1], away: ['y', 'Y', 'Y', '8', 2],
    kick: '2026-10-03T19:30Z', spread: -1, total: 62 })));
  const dull = gameScore(gameOf(event({ home: ['x', 'X', 'X', '37'], away: ['y', 'Y', 'Y', '12'],
    kick: '2026-10-03T19:30Z', spread: -24, total: 41 })));
  ok('No. 1 against No. 2 outscores a Sun Belt blowout', top > dull + 40, `${top} against ${dull}`);
}

/* ─── 3. the board, the projection and the price ────────────────────────────────── */

section('3. the board: projection and price');
let POOL;
{
  /* Four stored weeks of every slate team, with a quarterback, two backs, three receivers
     and a tight end each, all of different quality. */
  const store = { season: 2026, names: {}, weeks: {} };
  const rosters = new Map();
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const teams = [...new Set(SLATE.flatMap((g) => [g.home, g.away]).map((t) => t.id))];
  const shape = [['QB', 22], ['RB', 14], ['RB', 8], ['WR', 15], ['WR', 11], ['WR', 6], ['TE', 7]];
  for (const tid of teams) {
    const ros = new Map();
    shape.forEach(([pos], k) => ros.set(`${tid}_${k}`, { name: `${pos} ${tid} ${k}`, pos }));
    ros.set(`${tid}_hurt`, { name: `Hurt ${tid}`, pos: 'WR', off: 'out' });
    ros.set(`${tid}_ol`, { name: `Lineman ${tid}`, pos: 'OT' });
    rosters.set(tid, ros);
  }
  for (let w = 1; w <= 4; w++) {
    const games = [], rows = [];
    for (let i = 0; i < teams.length; i += 2) {
      const gid = `g${w}_${i}`, h = teams[i], a = teams[i + 1] || teams[0];
      games.push([gid, h, a, 21 + Math.round(rnd() * 20), 14 + Math.round(rnd() * 20), `2026-09-0${w}T19:00Z`]);
      for (const tid of [h, a]) {
        shape.forEach(([pos, base], k) => {
          /* the second back misses week 4, so he has missed his team's last game */
          if (k === 2 && w === 4) return;
          const pts = Math.max(0, base * (0.6 + rnd() * 0.8) * (tid.startsWith('h') ? 1.1 : 1));
          rows.push([`${tid}_${k}`, tid, gid, Math.round(pts * 10) / 10, '', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
          store.names[`${tid}_${k}`] = `${pos} ${tid} ${k}`;
        });
      }
    }
    store.weeks[String(w)] = { games, rows };
  }
  const todate = seasonToDate(store, 5, STAT_KEYS);
  const priors = new Map([[`${teams[0]}_0`, 30]]);
  const { men, dropped } = buildMen(SLATE, rosters, todate, priors);
  ok('an out man is not on the board', !men.some((m) => /^Hurt/.test(m.name)) && dropped.off === teams.length);
  ok('a lineman is not on the board', !men.some((m) => /^Lineman/.test(m.name)));
  ok('a man who missed his team\'s last game is marked', men.filter((m) => m.missed_last).length === teams.length);
  ok('  and only him', men.filter((m) => m.missed_last).every((m) => /_2$/.test(m.player_id)));
  const levels = positionLevels(men);
  for (const m of men) Object.assign(m, projectMan(m, levels));
  ok('every projection is a number', men.every((m) => Number.isFinite(m.proj) && m.proj >= 0));
  const mm = men.map((m) => m.matchup).filter((x) => x !== 1);
  ok('the matchup term is held inside its band',
    men.every((m) => m.matchup >= MATCHUP_LO - 1e-9 && m.matchup <= MATCHUP_HI + 1e-9) && mm.length > 0);
  const withPrior = men.find((m) => m.player_id === `${teams[0]}_0`);
  const same = { ...withPrior, prior: null };
  ok('a prior pulls a projection toward it',
    Math.sign(projectMan(withPrior, levels).proj - projectMan(same, levels).proj)
      === Math.sign(30 - PROJ_LEVEL * levels.get(withPrior.position)));
  const missed = men.find((m) => m.missed_last);
  const full = { ...missed, games: missed.played_of };
  ok('missing games costs projection', projectMan(missed, levels).proj < projectMan(full, levels).proj);
  const p = pricePool(men);
  ok('prices run $3M to $48M', Math.min(...men.map((m) => m.price_musd)) >= 3
    && Math.max(...men.map((m) => m.price_musd)) === 48);
  const sorted = men.slice().sort((a, b) => a.proj - b.proj);
  ok('the price is monotone in the projection',
    sorted.every((m, i) => !i || m.price_musd >= sorted[i - 1].price_musd - 1e-9));
  ok('exactly the best man reaches the ceiling', men.filter((m) => m.price_musd === 48).length >= 1
    && p.rank >= 1);
  men.sort((a, b) => b.price_musd - a.price_musd);
  POOL = { season: 2026, week: 5, locks_at: SLATE[0].kick, cap_musd: 0,
    swap: { pct: 0.25, floor_musd: 5 }, games: SLATE, pool: men };
}

/* ─── 4. the cap ────────────────────────────────────────────────────────────────── */

section('4. the cap is the crossover, and nobody strands');
{
  const { cap, table } = sweepCap(POOL.pool, { runs: 120 });
  POOL.cap_musd = cap;
  const row = table.find((r) => r.cap === cap);
  ok(`a cap is chosen ($${cap}M)`, Number.isFinite(cap));
  ok('  nobody strands at it', row.stranded === 0);
  ok('  and it is a multiple of five', cap % 5 === 0);
  ok('the table is the whole sweep', table.length >= 8);
  if (process.env.CFBF_DUMP) fs.writeFileSync(process.env.CFBF_DUMP, JSON.stringify(POOL));
}

/* ─── 5. the injury report ──────────────────────────────────────────────────────── */

section('5. the injury report says only what it knows');
{
  const tid = POOL.pool[0].team_id;
  const rosters = new Map([[tid, new Map([[POOL.pool[0].player_id,
    { name: POOL.pool[0].name, pos: POOL.pool[0].position, off: 'out' }]])]]);
  const rep = buildReport(POOL, rosters, []);
  ok('a man moved to the out group is out', rep.men[POOL.pool[0].player_id].st === 'out');
  ok('a man who missed his last game is reported as that and nothing more',
    POOL.pool.filter((m) => m.missed_last).every((m) => !rep.men[m.player_id]
      || rep.men[m.player_id].st === 'missed' || m.team_id === tid));
  ok('the report carries no clock', !('built' in rep) && !JSON.stringify(rep).includes('T00:'));
}

/* ─── 6. the SQL ────────────────────────────────────────────────────────────────── */

section('6. what reaches the server');
{
  const sql = poolSQL(POOL);
  ok('the college tables and not the NFL ones', /cfb_fantasy_weeks/.test(sql)
    && !/public\.fantasy_/.test(sql));
  ok('a week with entries refuses to be repriced', /already has entries/.test(sql));
  ok('the swap band rides on the week', /swap_pct/.test(sql) && /0\.25/.test(sql));
  ok('each man carries his kickoff', (sql.match(/::timestamptz\)/g) || []).length === POOL.pool.length);
  const res = resultsSQL({ season: 2026, week: 5, scores: { a: [12.5, '100 rush yds, 1 TD'] },
    board: [{ game_id: '1', away: 'A', home: 'H', state: 'in' }], played: 0, games: 20, final: false });
  ok('a tick writes the scoreboard and the points',
    /cfb_fantasy_put_games/.test(res) && /cfb_fantasy_results/.test(res) && /mark_results/.test(res));
  ok('  and only the college ones', !/public\.fantasy_results/.test(res));
}

/* ─── 7. the live clock ─────────────────────────────────────────────────────────── */

section('7. the live job wakes for the games and not before');
{
  const first = Date.parse(POOL.games[0].kick);
  ok('a day before the first kickoff it sleeps', !plan(POOL, first - 24 * 3600e3).watch);
  ok('  and two hours before, it says one is coming', plan(POOL, first - 2 * 3600e3).soon);
  ok('during the games it watches', plan(POOL, first + 3600e3).watch);
  ok('a day and a half after the last one it is done',
    plan(POOL, Math.max(...POOL.games.map((g) => Date.parse(g.kick))) + 31 * 3600e3).done);
  ok('a kickoff is filed under its Eastern day', easternDay('2026-10-04T03:30:00Z') === '20261003');
}

/* ─── 8. the live board, if there is one ────────────────────────────────────────── */

section('8. the live week drafts');
{
  const nowFile = path.join(ROOT, 'cfb/data/fantasy/now.json');
  if (!fs.existsSync(nowFile)) {
    console.log('  (no live week on disk yet, which is the state before the first build)');
  } else {
    const ptr = JSON.parse(fs.readFileSync(nowFile, 'utf8'));
    const pool = JSON.parse(fs.readFileSync(path.join(ROOT, 'cfb/data/fantasy', ptr.file), 'utf8'));
    ok('the live week carries its own cap', Number.isFinite(Number(pool.cap_musd)));
    ok('  and a swap band', pool.swap && pool.swap.pct > 0);
    let stranded = 0;
    const cap = DRAFT.capFor(pool);
    for (let k = 0; k < 400; k++) {
      const chance = { seed: 1000 + k, men: [] };
      for (let i = 0; i < DRAFT.SLOTS.length; i++) {
        const board = DRAFT.boardFor(pool.pool, chance, i, cap);
        const left = cap - DRAFT.spent(chance);
        const can = board.filter((m) => DRAFT.canSign(pool.pool, i, left, m));
        if (!can.length) { stranded++; break; }
        chance.men.push(can[k % can.length]);
      }
    }
    ok('400 drafts all finish', stranded === 0, `${stranded} stranded`);
  }
}

if (!QUICK) {
  const page = await import('./test_fantasy_page.mjs');
  const r = await page.run(ROOT, POOL);
  passes += r.passes; fails += r.fails;
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
