/* Every badge in the trophy case has to be reachable by a real player.
 *
 *   node cfb/build/test/test_achievements.mjs
 *
 * WHY THIS EXISTS. Four badges in this catalog could not be earned, and none of
 * them threw or looked wrong in the code. Three Heisman badges tested awards that
 * no player carried, because the awards join had never been run against the
 * shipped player file, so the test passed on a data set where the answer was
 * always false. A fourth asked for +10% chemistry against an engine that clamps
 * chemistry at +8% and only approaches it. A dead badge is worse than no badge:
 * it is a promise on a shelf that nobody can take down.
 *
 * So this does not read the catalog and nod at it. It BUILDS A CAREER out of the
 * real player file, one designed to earn everything, and then asserts that the
 * evaluator hands back all of it. Anything left locked is either impossible or
 * needs a row shape this test does not know how to make, and either way somebody
 * has to look at it.
 *
 * The rosters are legal, not merely arithmetic. Six slots, exactly one
 * quarterback, at least one running back and never three, at least two receivers,
 * at most two players from any one team-season, and every one of them inside the
 * $11M cap. A badge that only lights on a roster the draft cannot produce is
 * exactly the failure this file is here to catch.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(ROOT + '/cfb/engine.js');
const ACH = require(ROOT + '/cfb/achievements.js');
const P = JSON.parse(fs.readFileSync(ROOT + '/cfb/data/cfb_player_seasons.json', 'utf8'));

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

/* ---------------- what a legal roster is ---------------- */

const CAP = E.CONSTANTS.CAP_MUSD;
const RB_MAX = (E.CONSTANTS.POSITION_MAX || {}).RB ?? 6;
/* Derived from SLOTS rather than typed out, so a change to the slot line breaks this
   test rather than quietly letting it bless rosters the game will not allow. */
const SHAPES = (() => {
  const out = [];
  const flex = E.SLOTS.filter((s) => s === 'FLEX').length;
  const base = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const s of E.SLOTS) if (s !== 'FLEX') base[s]++;
  const fill = (i, acc) => {
    if (i === flex) { out.push({ ...acc }); return; }
    for (const pos of E.SLOT_ELIGIBILITY.FLEX) {
      if (acc[pos] + 1 > (pos === 'RB' ? RB_MAX : 6)) continue;
      acc[pos]++; fill(i + 1, acc); acc[pos]--;
    }
  };
  fill(0, { ...base });
  const seen = new Set(), uniq = [];
  for (const s of out) {
    const k = s.QB + '|' + s.RB + '|' + s.WR + '|' + s.TE;
    if (!seen.has(k)) { seen.add(k); uniq.push(s); }
  }
  return uniq;
})();

const byPos = { QB: [], RB: [], WR: [], TE: [] };
for (const p of P) byPos[p.position].push(p);
for (const k of Object.keys(byPos)) byPos[k].sort((a, b) => a.price_musd - b.price_musd);

function isLegal(roster) {
  if (roster.length !== E.SLOTS.length) return false;
  const n = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const p of roster) n[p.position]++;
  if (!SHAPES.some((s) => s.QB === n.QB && s.RB === n.RB && s.WR === n.WR && s.TE === n.TE)) return false;
  const ts = Object.create(null);
  for (const p of roster) if ((ts[p.team_season_id] = (ts[p.team_season_id] || 0) + 1) > 2) return false;
  if (new Set(roster.map((p) => p.player_id)).size !== roster.length) return false;
  return roster.reduce((s, p) => s + p.price_musd, 0) <= CAP + 1e-9;
}

/* Cheapest legal roster holding one distinct player per requirement, or null if the
   six slots and the cap cannot hold them all. */
function build(reqs, take) {
  take = take || (reqs.length >= 5 ? 3 : reqs.length >= 3 ? 6 : 20);
  /* Cheapest few PER POSITION and not cheapest overall: a flat cheapest-ten can be
     ten receivers, and then nothing fills the quarterback slot and an easy badge
     reports as impossible when it was only badly sampled. */
  const cands = reqs.map((f) => {
    const hit = P.filter(f), out = [];
    for (const k of ['QB', 'RB', 'WR', 'TE']) {
      out.push(...hit.filter((p) => p.position === k)
        .sort((a, b) => a.price_musd - b.price_musd).slice(0, take));
    }
    return out.sort((a, b) => a.price_musd - b.price_musd);
  });
  if (cands.some((c) => !c.length)) return null;
  let best = null;
  const chosen = [];
  const walk = (i, cost) => {
    if (cost > CAP || (best && cost >= best.cost)) return;
    if (i === reqs.length) { const r = fill(chosen, cost); if (r && (!best || r.cost < best.cost)) best = r; return; }
    const start = (i > 0 && reqs[i] === reqs[i - 1]) ? cands[i].indexOf(chosen[i - 1]) + 1 : 0;
    for (let j = start; j < cands[i].length; j++) {
      const p = cands[i][j];
      if (chosen.indexOf(p) >= 0) continue;
      if (chosen.filter((q) => q.team_season_id === p.team_season_id).length >= 2) continue;
      chosen.push(p); walk(i + 1, cost + p.price_musd); chosen.pop();
    }
  };
  walk(0, 0);
  return best ? best.roster : null;
}

function fill(core, coreCost) {
  let best = null;
  for (const shape of SHAPES) {
    const got = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const p of core) got[p.position]++;
    if (['QB', 'RB', 'WR', 'TE'].some((k) => got[k] > shape[k])) continue;
    const used = core.slice();
    let cost = coreCost, okShape = true;
    for (const k of ['QB', 'RB', 'WR', 'TE']) {
      let want = shape[k] - got[k];
      for (const p of byPos[k]) {
        if (!want) break;
        if (used.indexOf(p) >= 0) continue;
        if (used.filter((q) => q.team_season_id === p.team_season_id).length >= 2) continue;
        used.push(p); cost += p.price_musd; want--;
      }
      if (want) { okShape = false; break; }
    }
    if (okShape && (!best || cost < best.cost)) best = { cost, roster: used };
  }
  return best;
}

const heis = (p) => (p.awards || []).some((a) => /heisman/i.test(a));
const withBadge = (re) => (p) => (p.badges || []).some((b) => re.test(b));

/* ---------------- the career ---------------- */

const rosters = [];
const solved = [];
const add = (label, reqs) => {
  const r = build(reqs);
  if (!r) { ok('a legal roster exists for ' + label, false, 'six slots and $' + CAP + 'M cannot hold it'); return null; }
  if (!isLegal(r)) { ok('the roster built for ' + label + ' is legal', false); return null; }
  rosters.push(r);
  solved.push({ label, cost: r.reduce((s, p) => s + p.price_musd, 0) });
  return r;
};

console.log('=== every simultaneous-roster badge has a legal roster ===');
/* One entry per badge that asks for more than one thing on the field at once. These
   are the ones the cap can kill, so each is solved rather than assumed. */
add('heisman_qb', [(p) => p.position === 'QB' && heis(p)]);
add('heisman_rb', [(p) => p.position === 'RB' && heis(p)]);
add('heisman_wr', [(p) => p.position === 'WR' && heis(p)]);
add('heisman_2', [heis, heis]);
add('heisman_led', [heis, withBadge(/^Led FBS in/)]);
add('triple_crown', [withBadge(/^Led FBS in passing yards$/), withBadge(/^Led FBS in rushing yards$/),
  withBadge(/^Led FBS in receiving yards$/)]);
add('led_three', Array(3).fill(withBadge(/^Led FBS in/)));
add('podium_three', Array(3).fill(withBadge(/FBS/)));
add('milestone_six', Array(6).fill((p) => (p.badges || []).length > 0));
add('realignment', [(p) => p.conference === 'Pac-10', (p) => p.conference === 'Pac-12']);
add('span_20', [(p) => p.season === 2005, (p) => p.season === 2025]);
add('state_three', Array(3).fill((p) => p.home_state === 'TX'));
add('state_six', Array(6).fill((p) => p.home_state === 'TX'));
add('bargain_ultra', Array(6).fill((p) => p.price_musd <= 1));
add('two_splash', Array(2).fill((p) => p.price_musd >= 4));
add('two_te', Array(2).fill((p) => p.position === 'TE'));
add('two_backs', Array(2).fill((p) => p.position === 'RB'));
add('four_wr', Array(4).fill((p) => p.position === 'WR'));
add('all_four_positions', ['QB', 'RB', 'WR', 'TE'].map((pos) => (p) => p.position === pos));
add('one_school', Array(6).fill((p) => p.school === 'Alabama'));
add('one_season', Array(6).fill((p) => p.season === 2015));
add('one_conference', Array(6).fill((p) => p.conference === 'SEC'));
add('same_team_season', Array(2).fill((p) => p.team_season_id === 'LSU-2019'));
add('six_schools', ['Alabama', 'Ohio State', 'Michigan', 'Texas', 'Oregon', 'Miami']
  .map((s) => (p) => p.school === s));
add('six_states', ['TX', 'CA', 'FL', 'GA', 'OH', 'LA'].map((s) => (p) => p.home_state === s));
add('five_conferences', ['SEC', 'Big Ten', 'ACC', 'Big 12', 'Pac-12'].map((cf) => (p) => p.conference === cf));
add('three_decades', [(p) => p.season < 2010, (p) => p.season >= 2010 && p.season < 2020,
  (p) => p.season >= 2020]);
for (const d of [2000, 2010, 2020]) {
  add('decade_' + d, Array(6).fill((p) => Math.floor(p.season / 10) * 10 === d));
}
add('qb_and_target', [(p) => p.position === 'QB' && p.team_season_id === 'LSU-2019',
  (p) => p.position === 'WR' && p.team_season_id === 'LSU-2019']);
add('splash', [(p) => p.price_musd >= 4]);
add('bargain_six', Array(6).fill((p) => p.price_musd <= 1.5));

solved.sort((a, b) => b.cost - a.cost);
ok(solved.length + ' simultaneous-roster badges each fit inside the cap',
  solved.every((s) => s.cost <= CAP + 1e-9),
  'tightest: ' + solved.slice(0, 3).map((s) => s.label + ' $' + s.cost.toFixed(2) + 'M').join(', '));
/* Three Heisman winners on one roster, which is the idea this check killed. It stays
   in the test as the negative case: if the pool or the cap ever moves far enough for
   this to fit, the badge is worth writing and this line will say so. */
ok('three Heisman winners at once still do not fit, so no badge promises them',
  build([heis, heis, heis]) === null);

/* The other end of the budget. "Every last dollar" asks for $10.9M spent out of $11M,
   which is only earnable if six real prices add up into that last tenth: prices come in
   tenths of a million, so a roster that lands on 10.85 and cannot be improved would make
   the badge a rounding accident rather than a goal. */
{
  const grid = {};
  for (const k of Object.keys(byPos)) {
    grid[k] = [...new Set(byPos[k].map((p) => Math.round(p.price_musd * 10)))].sort((a, b) => a - b);
  }
  const target = Math.round(CAP * 10);
  let hit = null;
  for (const shape of SHAPES) {
    const slots = [];
    for (const k of ['QB', 'RB', 'WR', 'TE']) for (let i = 0; i < shape[k]; i++) slots.push(k);
    const walk = (i, sum, acc) => {
      if (hit || sum > target) return;
      if (i === slots.length) { if (sum >= target - 1) hit = { sum, acc: acc.slice() }; return; }
      for (const v of grid[slots[i]]) { acc.push(slots[i] + ' $' + (v / 10)); walk(i + 1, sum + v, acc); acc.pop(); if (hit) return; }
    };
    walk(0, 0, []);
    if (hit) break;
  }
  ok('a legal roster can spend the last tenth of the cap', !!hit,
    hit ? '$' + (hit.sum / 10).toFixed(1) + 'M  ' + hit.acc.join(', ') : 'nothing lands above $' + (CAP - 0.1) + 'M');
}

console.log('\n=== the collection badges can be walked to, one roster at a time ===');
/* Everything the career-wide sets count. Each entry gets a legal roster of its own,
   which is what "sign a player from all 83 schools" actually asks of a player. */
const schools = [...new Set(P.map((p) => p.school))];
const seasons = [...new Set(P.map((p) => p.season))];
const confs = [...new Set(P.map((p) => p.conference))];
const states = [...new Set(P.map((p) => p.home_state).filter(Boolean))];
const heismans = [...new Set(P.filter(heis).map((p) => p.name))];
const badgeKinds = [...new Set(P.flatMap((p) => p.badges || []))];
const landmarks = ['USC-2005', 'Texas-2005', 'Boise State-2006', 'Auburn-2010',
  'Florida State-2013', 'Louisville-2016', 'Oklahoma-2018', 'LSU-2019',
  'Georgia-2022', 'Michigan-2023'];
const overseas = ['ON', 'AB', 'BC', 'PQ', 'BS', 'NSW', 'GB'];

let missed = [];
const cover = (label, list, pred) => {
  let got = 0;
  for (const v of list) {
    const r = build([pred(v)]);
    if (r && isLegal(r)) { rosters.push(r); got++; } else missed.push(label + ':' + v);
  }
  ok('every ' + label + ' can be signed on a legal roster', got === list.length, got + '/' + list.length);
};
cover('school', schools, (s) => (p) => p.school === s);
cover('season', seasons, (s) => (p) => p.season === s);
cover('conference', confs, (cf) => (p) => p.conference === cf);
cover('home state', states, (s) => (p) => p.home_state === s);
cover('Heisman winner', heismans, (n) => (p) => p.name === n && heis(p));
cover('statistical feat', badgeKinds, (b) => (p) => (p.badges || []).indexOf(b) >= 0);
cover('landmark team', landmarks, (id) => (p) => p.team_season_id === id);
cover('overseas home', overseas, (s) => (p) => p.home_state === s);
if (missed.length) console.log('       unreachable: ' + missed.slice(0, 10).join(', '));

/* players_500 wants five hundred DIFFERENT men. The rosters above reach for the same
   bottom-of-the-market fillers every time, which is a habit of the solver rather than
   a limit of the game, so this signs fresh ones: legal rosters cut from slices of the
   pool nobody has touched yet. */
{
  const used = new Set(rosters.flat().map((p) => p.player_id));
  const next = (pos, roster) => byPos[pos].find((p) => !used.has(p.player_id)
    && roster.filter((q) => q.team_season_id === p.team_season_id).length < 2);
  for (let guard = 0; used.size < 600 && guard < 400; guard++) {
    const roster = [];
    for (const pos of ['QB', 'RB', 'WR', 'WR', 'WR', 'WR']) {
      const p = next(pos, roster);
      if (!p) break;
      roster.push(p); used.add(p.player_id);
    }
    if (roster.length === 6 && isLegal(roster)) rosters.push(roster);
  }
}
const signed = new Set(rosters.flat().map((p) => p.player_id));
ok('the career signs 500 different players', signed.size >= 500, String(signed.size));

/* ---------------- the rows ---------------- */

/* Enough seasons, on enough different days, in enough different shapes. Rows are
   cheap and the tests are mostly any() and count(), so the career is built by
   stamping out one row per thing a badge can ask for and then padding to the
   milestone counts. */
const rows = [];
const DAY0 = Date.UTC(2024, 0, 1);
let seq = 0;
const stamp = (dayOffset) => {
  /* Local noon, because the streak badges count local days and a UTC midnight would
     land on the day before for anybody west of Greenwich. */
  const d = new Date(DAY0 + dayOffset * 86400000);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, (seq++) % 60).toISOString();
};
const row = (dayOffset, extra) => {
  const r = {
    created_at: stamp(dayOffset), wins: 8, losses: 4, reg_wins: 8, reg_losses: 4,
    title_won: false, perfect: false, made_playoffs: false, seed: null,
    national_rank: null, eliminated_in: null, bowl: false, bowl_won: false,
    bowl_tier: null, bowl_key: null, run_mode: 'free', chemistry_pct: 0,
    spend_musd: 8, overall: 80, perfect_pct: 50, respins: 1, sig_wins: 0,
    best_win_rank: null, picks: [],
  };
  Object.assign(r, extra || {});
  return r;
};

/* Sixty consecutive days, ten seasons on the first of them. */
for (let d = 0; d < 60; d++) rows.push(row(d));
for (let i = 0; i < 9; i++) rows.push(row(0));

/* Titles, perfect seasons, number ones, playoffs: the counted ones, at their highest
   threshold, so every rung below lights with them. */
for (let i = 0; i < 50; i++) {
  rows.push(row(100 + i, { title_won: true, wins: 16, losses: 1, reg_wins: 11, reg_losses: 1,
    made_playoffs: true, seed: 1, national_rank: 1, bowl: false, sig_wins: 6, best_win_rank: 1,
    overall: 95, perfect_pct: 100, spend_musd: 8.4, chemistry_pct: 7.9, respins: 0 }));
}
for (let i = 0; i < 10; i++) {
  rows.push(row(200 + i, { title_won: true, perfect: true, wins: 16, losses: 0,
    reg_wins: 12, reg_losses: 0, made_playoffs: true, seed: 1, national_rank: 1,
    respins: 0, overall: 100, spend_musd: 4.5 }));
}
for (let i = 0; i < 50; i++) {
  rows.push(row(300 + i, { made_playoffs: true, wins: 12, losses: 2, reg_wins: 11, reg_losses: 1,
    seed: 6, national_rank: 6 }));
}
/* Ten seasons running, in the field, ranked, and in a bowl, for the streak badges. */
for (let i = 0; i < 12; i++) {
  rows.push(row(400 + i, { made_playoffs: true, bowl: true, bowl_won: true, bowl_tier: 'minor',
    bowl_key: 'spud_bowl', national_rank: 8, wins: 12, losses: 2, reg_wins: 11, reg_losses: 1 }));
}
/* Every way a season can end. */
for (const round of ['CFP First Round', 'CFP Quarterfinal', 'CFP Semifinal', 'CFP Championship']) {
  for (let i = 0; i < 3; i++) {
    rows.push(row(500, { made_playoffs: true, eliminated_in: round, seed: 5, national_rank: 5 }));
  }
}
/* The odd shapes: unbeaten and uncrowned, snubbed, the twelve seed and the nine seed
   with a ring, a title with negative chemistry, a title on every re-spin. */
rows.push(row(510, { reg_losses: 0, reg_wins: 12, wins: 14, losses: 1, made_playoffs: true, national_rank: 3 }));
rows.push(row(511, { national_rank: 13, made_playoffs: false, wins: 11, losses: 1, reg_losses: 1, reg_wins: 11 }));
rows.push(row(512, { title_won: true, seed: 12, made_playoffs: true, wins: 15, losses: 1, reg_losses: 1, reg_wins: 11, national_rank: 1 }));
rows.push(row(513, { title_won: true, seed: 9, made_playoffs: true, wins: 15, losses: 1, reg_losses: 1, reg_wins: 11, national_rank: 1 }));
rows.push(row(514, { title_won: true, chemistry_pct: -3, national_rank: 1 }));
rows.push(row(515, { title_won: true, respins: 3, national_rank: 1 }));
rows.push(row(516, { made_playoffs: true, chemistry_pct: 0 }));
rows.push(row(517, { national_rank: 2 }));
rows.push(row(518, { national_rank: 25 }));
rows.push(row(519, { best_win_rank: 3, sig_wins: 4 }));
rows.push(row(520, { wins: 4, losses: 8, reg_wins: 4, reg_losses: 8 }));
rows.push(row(521, { spend_musd: 10.95 }));
rows.push(row(522, { spend_musd: 4.2 }));
rows.push(row(523, { overall: 100, perfect_pct: 100 }));
rows.push(row(524, { chemistry_pct: 4 }));
rows.push(row(525, { chemistry_pct: 6 }));
rows.push(row(526, { chemistry_pct: 7.9 }));
rows.push(row(527, { bowl: true, bowl_won: false, bowl_tier: 'minor', bowl_key: 'coral_bowl' }));

/* Every bowl in the game, won, plus the house bowl. */
const bowlKeys = ['runthegg'];
for (const tier of Object.keys(E.BOWLS)) {
  for (const b of E.BOWLS[tier]) bowlKeys.push(E.bowlKey(b.name));
}
let bd = 600;
for (const tier of Object.keys(E.BOWLS)) {
  for (const b of E.BOWLS[tier]) {
    rows.push(row(bd++, { bowl: true, bowl_won: true, bowl_tier: tier, bowl_key: E.bowlKey(b.name),
      wins: 11, losses: 2 }));
  }
}
rows.push(row(bd++, { bowl: true, bowl_won: true, bowl_tier: 'ny6', bowl_key: 'runthegg' }));

/* Conference drafts: all five, each with a title, a bowl, the playoff and a perfect
   season, plus ten titles for the dynasty rung. */
let cd = 700;
for (const { key } of E.POWER_CONFERENCES) {
  for (let i = 0; i < 3; i++) {
    rows.push(row(cd++, { run_mode: 'conf:' + key, title_won: true, perfect: true, wins: 16, losses: 0,
      reg_wins: 12, reg_losses: 0, made_playoffs: true, seed: 1, national_rank: 1,
      bowl: true, bowl_won: true, bowl_tier: 'ny6', bowl_key: 'garland_bowl' }));
  }
}

/* Pad to a thousand finished seasons for the last milestone rung. */
let pad = 800;
while (rows.length < 1000) rows.push(row(pad + Math.floor((rows.length - 800) / 4)));

/* Hand the rosters out over the rows. There are fewer rows than rosters at no point,
   and a roster on a title row is what the ring-shaped roster badges need. */
const pkey = (p) => p.player_id + '|' + p.season;
const BY = new Map();
for (const p of P) BY.set(pkey(p), p);
for (let i = 0; i < rosters.length; i++) rows[i % rows.length].picks = rosters[i].map(pkey);
/* Two rows that need a specific pairing of roster and result: unbeaten with a Heisman,
   and a ring with a Heisman. Both use the first Heisman roster built above. */
const heisRoster = rosters[0].map(pkey);
rows.push(row(900, { perfect: true, title_won: true, wins: 16, losses: 0, reg_wins: 12, reg_losses: 0,
  made_playoffs: true, seed: 1, national_rank: 1, picks: heisRoster }));

const resolve = (k) => BY.get(k) || null;
const res = ACH.evaluate(rows, resolve, new Date(DAY0 + 60 * 86400000).toISOString());

console.log('\n=== the whole catalog lights ===');
ok('the career finished a thousand seasons', res.stats.runs >= 1000, String(res.stats.runs));
ok('every roster handed out resolved',
  rows.every((r) => !r.picks.length || r.picks.every((k) => BY.has(k))));
const locked = res.locked.map((a) => a.id);
ok('no badge is left unearnable', locked.length === 0,
  locked.length ? locked.join(', ') : String(res.earned.length) + ' of ' + res.total);

console.log('\n=== the catalog itself is well formed ===');
const ids = new Set(), names = new Set();
let dupes = 0;
for (const a of ACH.CATALOG) {
  if (ids.has(a.id) || names.has(a.name)) dupes++;
  ids.add(a.id); names.add(a.name);
}
ok('no two badges share an id or a name', dupes === 0, String(dupes));
ok('every badge sits on a real shelf', ACH.CATALOG.every((a) => ACH.GROUPS.indexOf(a.group) >= 0));
ok('every badge has a real tier',
  ACH.CATALOG.every((a) => Object.prototype.hasOwnProperty.call(ACH.TIER_ORDER, a.tier)));
ok('no badge description is empty', ACH.CATALOG.every((a) => a.desc && a.desc.length > 8));
/* House style, and it is checked rather than trusted because a stray one reads as a
   different voice on a screen full of short lines. */
ok('no em dashes anywhere in the catalog',
  !ACH.CATALOG.some((a) => /\u2014/.test(a.name + a.desc)));

/* A CAPPED FETCH STILL KNOWS HOW BIG THE CAREER IS. The board hands back the most recent
   five hundred seasons and the count of all of them, so the milestone badges have to read
   the count rather than the rows or "finish 1,000 seasons" is unreachable by construction
   and "finish 500" lights at exactly the fetch size and never above it. */
{
  const capped = rows.slice(-500);
  const short = ACH.evaluate(capped, resolve, new Date(DAY0 + 60 * 86400000).toISOString());
  const told = ACH.evaluate(capped, resolve, new Date(DAY0 + 60 * 86400000).toISOString(), { total: 1200 });
  ok('five hundred rows on their own do not claim a thousand seasons',
    short.stats.runs === 500 && !short.earned.some((a) => a.id === 'runs_1000'), String(short.stats.runs));
  ok('the same rows with the true count do', told.stats.runs === 1200
    && told.earned.some((a) => a.id === 'runs_1000'), String(told.stats.runs));
  ok('and the rows walked are still reported as the rows walked', told.stats.shown === 500,
    String(told.stats.shown));
  /* A count smaller than the rows in hand is ignored rather than believed, because a
     career must never read as fewer seasons than are already on the table. */
  const lying = ACH.evaluate(capped, resolve, new Date().toISOString(), { total: 3 });
  ok('a count below the rows in hand does not shrink the career', lying.stats.runs === 500,
    String(lying.stats.runs));
}

/* An empty career must earn nothing and must not throw, because that is what the
   trophy case looks like the first time anybody opens it. */
const empty = ACH.evaluate([], resolve, new Date().toISOString());
ok('an empty career earns nothing', empty.earned.length === 0, String(empty.earned.length));
ok('an empty career still reports the whole catalog', empty.total === ACH.CATALOG.length);
/* And a career of rows with no picks at all, which is every season played before the
   roster was recorded, must answer false rather than throw. */
const noPicks = ACH.evaluate([row(0)], null, new Date().toISOString());
ok('rows with no roster resolve to no roster badges',
  noPicks.earned.every((a) => a.group !== 'The roster'));

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
