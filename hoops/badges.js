/*
 * badges.js - the cabinet for Run The Floor.
 *
 * DERIVED, NEVER STORED. Every badge here is computed from the career the game
 * already keeps: the cumulative sets it has always counted, a compact row per
 * finished run, and a map of FEATS. Nothing is written when a badge is earned,
 * which buys two things worth having:
 *
 *   - a badge cannot drift out of step with the career, because it IS the
 *     career, read a different way.
 *   - adding a badge on a field that already exists needs no migration. Write
 *     the test, and every run already on the device answers it.
 *
 * THE FEATS MAP IS THE ONE PLACE A MODE WRITES, and it is still not "earned".
 * It is a count per thing that happened (a Game 7 won, Stockton and Malone on
 * one roster, a Six Passes chain at par) and the badge reads the count. It
 * exists for two reasons the rows could not answer:
 *
 *   - CONQUEST, FIX HISTORY AND SIX PASSES FILE NO ROW. They are not seasons,
 *     and a row is a finished season. Their badges needed somewhere to live.
 *   - THE ROWS ARE CAPPED AT 250. A badge about a specific roster read off the
 *     rows could be lit on run 12 and gone again by run 263. A count never
 *     shrinks, so a feat stays won.
 *
 * Every feat merges by MAXIMUM in cloud.js (it is on CAREER_COUNTS there), so
 * two devices never take a badge away from each other. A count that merges by
 * maximum can under-count across devices, which only ever delays a badge.
 *
 * WHAT WRITES A FEAT LIVES HERE TOO: draftFeats, conquestFeats, fixFeats and
 * passesFeats are pure functions of what the mode already holds, and the page,
 * modes-ui.js and check-badges.mjs all call the same ones. A rule restated in
 * the checker is a rule that agrees with itself.
 *
 * OLD CAREERS HAVE HOLES. Fields were added over time, so every test has to
 * treat a missing key as "not known" rather than as zero. That is what `num`,
 * `set` and `rows` below are for.
 *
 * Headless and dependency-free, so the catalog can be tested in node against
 * real careers. Browser: window.RTF_BADGES. Node: require('./badges.js').
 */
'use strict';
(function() {

const BADGES_API_VERSION = 2;

/* ---------------- small helpers ---------------- */

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const set = (c, key) => (c && c[key] && typeof c[key] === 'object') ? c[key] : {};
const rows = (c) => (c && Array.isArray(c.rows)) ? c.rows : [];
const count = (c, key) => Object.keys(set(c, key)).length;
const any = (c, test) => rows(c).some(test);
const feat = (c, k) => num(set(c, 'feats')[k]);
const has = (k, n) => (c) => feat(c, k) >= (n || 1);
/* How many of a named list this career has a feat for, e.g. which of the
   twelve Dream Teamers have been signed. */
const hits = (c, pre, keys) => keys.filter((k) => feat(c, pre + k) > 0).length;
/* How many feats start with a prefix, for a collection whose members come from
   the data (every MVP season) rather than from a list written here. */
const prefixed = (c, pre) => Object.keys(set(c, 'feats'))
  .filter((k) => k.indexOf(pre) === 0 && num(set(c, 'feats')[k]) > 0).length;

/* How many of a thing there are to collect. Read from the data at boot where
   the page can, so a season landing in the data next July moves the target
   rather than leaving a collection permanently one short. */
let TOTALS = { seasons: 53, clubs: 45, shapes: 14, mvps: 53, franchises: 30 };
function setTotals(t) {
  if (!t) return;
  for (const k of Object.keys(TOTALS)) if (num(t[k]) > 0) TOTALS[k] = num(t[k]);
}

/* ---------------- the lists a fan knows ----------------
 *
 * Every id below is a Basketball-Reference id that is in data/players.json,
 * and check-badges.mjs asserts that, because a typo here is a badge nobody can
 * ever earn and it throws nothing.
 *
 * THE REUNIONS ARE ALL ONE CLUB, AND THAT IS THE POINT OF THEM. Off the whole
 * league the wheel lands on a given team-season about once in fourteen hundred
 * spins, so three named men on one roster is a lottery ticket. Locked to their
 * club in One Franchise it is a hunt: which seasons overlap, which of them fit
 * under the cap together, and when to spend a re-spin. Measured with a bot that
 * signs a target whenever one is on the board and re-spins when none is, over
 * 100 franchise drafts each, the rate runs from 2 in 100 (Webber, Bibby and
 * Divac; LeBron, Wade and Bosh) to 57 (Stockton and Malone). The tier follows
 * that measurement: 30 or more is silver, 7 to 29 gold, under 7 a ring.
 */
const REUNIONS = [
  ['celtics', 'BOS', ['birdla01', 'mchalke01', 'parisro01'], 'The Big Three',
    'Bird, McHale and Parish on one roster.', 'ring'],
  ['showtime', 'LAL', ['johnsma02', 'abdulka01', 'worthja01'], 'Showtime',
    'Magic, Kareem and Worthy on one roster.', 'gold'],
  ['bulls', 'CHI', ['jordami01', 'pippesc01', 'rodmade01'], 'The second three-peat',
    'Jordan, Pippen and Rodman on one roster.', 'ring'],
  ['badboys', 'DET', ['thomais01', 'dumarjo01', 'laimbbi01'], 'Bad Boys',
    'Isiah, Dumars and Laimbeer on one roster.', 'gold'],
  ['jazz', 'UTA', ['stockjo01', 'malonka01'], 'Stockton to Malone',
    'Stockton and Malone on one roster.', 'silver'],
  ['rockets', 'HOU', ['olajuha01', 'sampsra01'], 'Towers in Houston',
    'Olajuwon and Sampson on one roster.', 'gold'],
  ['shaqkobe', 'LAL', ['onealsh01', 'bryanko01'], 'Shaq and Kobe',
    'Shaq and Kobe on one roster.', 'silver'],
  ['spurs', 'SAS', ['duncati01', 'parketo01', 'ginobma01'], 'The Spurs way',
    'Duncan, Parker and Ginóbili on one roster.', 'silver'],
  ['celts08', 'BOS', ['garneke01', 'piercpa01', 'allenra02'], 'Ubuntu',
    'Garnett, Pierce and Ray Allen on one roster.', 'ring'],
  ['heat', 'MIA', ['jamesle01', 'wadedw01', 'boshch01'], 'Not one, not two',
    'LeBron, Wade and Bosh on one roster.', 'ring'],
  ['dubs', 'GSW', ['curryst01', 'thompkl01', 'greendr01'], 'Splash and Dray',
    'Curry, Klay and Draymond on one roster.', 'gold'],
  ['okc', 'OKC', ['duranke01', 'westbru01', 'hardeja01'], 'What could have been',
    'Durant, Westbrook and Harden on one roster.', 'ring'],
  ['suns', 'PHO', ['nashst01', 'stoudam01', 'mariosh01'], 'Seven seconds or less',
    'Nash, Amar\'e and Marion on one roster.', 'gold'],
  ['lob', 'LAC', ['paulch01', 'griffbl01', 'jordade01'], 'Lob City',
    'Chris Paul, Blake Griffin and DeAndre Jordan on one roster.', 'gold'],
  ['sonics', 'OKC', ['paytoga01', 'kempsh01'], 'The Glove and the Reign Man',
    'Payton and Kemp on one roster.', 'silver'],
  ['grit', 'MEM', ['gasolma01', 'randoza01', 'conlemi01'], 'Grindhouse',
    'Marc Gasol, Z-Bo and Conley on one roster.', 'silver'],
  ['knicks', 'NYK', ['ewingpa01', 'starkjo01', 'oaklech01'], 'Garden brawlers',
    'Ewing, Starks and Oakley on one roster.', 'gold'],
  ['goin', 'DET', ['billuch01', 'wallabe01', 'wallara01'], 'Goin\' to work',
    'Billups, Ben Wallace and Rasheed Wallace on one roster.', 'ring'],
  ['kings', 'SAC', ['webbech01', 'bibbymi01', 'divacvl01'], 'The greatest show on court',
    'Webber, Bibby and Divac on one roster.', 'ring'],
  ['sixers', 'PHI', ['ervinju01', 'malonmo01', 'cheekma01'], 'The Doctor and the Chairman',
    'Dr. J, Moses Malone and Mo Cheeks on one roster.', 'gold'],
  ['blazers', 'POR', ['drexlcl01', 'portete01', 'kerseje01'], 'Rip City',
    'Drexler, Terry Porter and Kersey on one roster.', 'gold'],
];

/* CAREER COLLECTIONS: men signed across any number of runs, in any mode. */
const DREAM_TEAM = ['jordami01', 'johnsma02', 'birdla01', 'pippesc01', 'barklch01',
  'malonka01', 'stockjo01', 'ewingpa01', 'robinda01', 'mullich01', 'drexlcl01', 'laettch01'];
const CLASSES = [
  ['84', ['jordami01', 'olajuha01', 'barklch01', 'stockjo01'], 'Class of \'84',
    'Sign Jordan, Olajuwon, Barkley and Stockton. One draft.'],
  ['96', ['bryanko01', 'iversal01', 'nashst01', 'allenra02'], 'Class of \'96',
    'Sign Kobe, Iverson, Nash and Ray Allen. One draft.'],
  ['03', ['jamesle01', 'wadedw01', 'boshch01', 'anthoca01'], 'Class of \'03',
    'Sign LeBron, Wade, Bosh and Carmelo. One draft.'],
];
/* Every id a feat is written for, so the page stores the famous few rather
   than every man anybody ever signed. */
const TRACKED = (() => {
  const s = new Set(DREAM_TEAM);
  for (const c of CLASSES) for (const i of c[1]) s.add(i);
  return s;
})();

const AWARDS = [
  ['roy', 'Rookie of the Year', 'Sign a Rookie of the Year in his rookie season.', 'bronze'],
  ['smoy', 'Starting the sixth man', 'Put a Sixth Man of the Year in your starting five.', 'bronze'],
  ['mip', 'Most Improved', 'Sign a Most Improved Player in the year he won it.', 'bronze'],
  ['dpoy', 'Stopper', 'Sign a Defensive Player of the Year in the year he won it.', 'silver'],
  ['an1', 'First team', 'Sign an All-NBA First Team season.', 'silver'],
  ['fmvp', 'Finals MVP', 'Sign a Finals MVP from his title season.', 'silver'],
];
const TROPHIES = ['mvp', 'fmvp', 'roy', 'dpoy', 'smoy', 'mip', 'an1'];
const BLUE_BLOODS = ['UNC', 'Duke', 'Kentucky', 'Kansas', 'UCLA'];

/* ---------------- what a finished Quick Draft run proves ----------------
 *
 * Returns { add: {key: 1}, max: {} }. Every key here is a count of runs that
 * did the thing. Pure: it reads the run the page already has and returns keys,
 * so the page, the checker and a unit test all get the same answer.
 *
 * THRESHOLDS ARE MEASURED against data/players.json, and the rarest are rare
 * on purpose: four player-seasons in the data average 35 (Jordan's 1987 and
 * 1988, Kobe's 2006, Harden's 2019), and every one is reachable in One
 * Franchise with a club locked to the right era.
 */
function draftFeats(run) {
  const add = {}, max = {};
  const one = (k) => { add[k] = 1; };
  if (!run || !Array.isArray(run.roster)) return { add, max };
  const roster = run.roster, out = run.outcome || null;

  const ids = new Set(roster.map((p) => p.i));
  const cols = {}, classes = {};
  let rookies = 0, vets = 0, no3 = 0, twenty = 0, threes = 0;
  const decades = new Set();
  for (const p of roster) {
    const pts = num(p.pts), reb = num(p.reb), ast = num(p.ast);
    if (pts >= 30) one('st.pts30');
    if (pts >= 35) one('st.pts35');
    if (ast >= 12) one('st.ast12');
    if (reb >= 15) one('st.reb15');
    if (num(p.blk) >= 3.5) one('st.blk35');
    if (num(p.stl) >= 3) one('st.stl3');
    if (pts >= 10 && reb >= 10 && ast >= 10) one('st.trip');
    if (pts >= 20) twenty++;
    if (num(p.tpa) < 0.5) no3++;
    threes += num(p.tpa);
    if (num(p.p) >= 55) one('st.max');
    if (p.dr) {
      if (p.s === p.dr + 1) rookies++;
      if (p.s - p.dr >= 12) vets++;
      if (p.s - p.dr >= 19) one('st.ageless');
      classes[p.dr] = (classes[p.dr] || 0) + 1;
    }
    if (p.col) cols[p.col] = (cols[p.col] || 0) + 1;
    decades.add(Math.floor(p.s / 10));
    for (const a of (p.aw || [])) {
      one('aw:' + a);
      if (a === 'mvp') one('mvp:' + p.s);
      if (a === 'fmvp') one('fmvp:' + p.s);
    }
    if (TRACKED.has(p.i)) one('id:' + p.i);
  }
  if (roster.length >= 5) {
    if (twenty >= 3) one('st.three20');
    if (no3 >= 5) one('st.no3');
    if (threes >= 30) one('st.bombs');
    if (rookies >= 2) one('st.rook2');
    if (vets >= 3) one('st.vet3');
    if (decades.size >= 5) one('st.decades5');
    if (Object.keys(cols).some((k) => cols[k] >= 3)) one('st.col3');
    if (Object.keys(classes).some((k) => classes[k] >= 3)) one('st.class3');
  }
  for (const r of REUNIONS) if (r[2].every((i) => ids.has(i))) one('re:' + r[0]);

  if (!out) return { add, max };

  /* ---- the regular season ---- */
  const season = Array.isArray(run.season) ? run.season : [];
  const sched = Array.isArray(run.schedule) ? run.schedule : [];
  let streak = 0, best = 0, lose = 0, worstSlide = 0, homeW = 0, homeL = 0, roadW = 0;
  for (let i = 0; i < season.length; i++) {
    const g = season[i];
    if (g.won) { streak++; lose = 0; } else { lose++; streak = 0; }
    if (streak > best) best = streak;
    if (lose > worstSlide) worstSlide = lose;
    const home = sched[i] ? !!sched[i].home : null;
    if (home === true) { if (g.won) homeW++; else homeL++; }
    if (home === false && g.won) roadW++;
    if (g.won && num(g.yourPoints) >= 150) one('rs.150');
    if (g.won && num(g.oppPoints) > 0 && num(g.oppPoints) < 80) one('rs.lock');
  }
  if (best >= 15) one('rs.streak15');
  if (best >= 20) one('rs.streak20');
  if (season.length && homeW >= 36) one('rs.home');
  if (roadW >= 32) one('rs.road');
  if (num(out.wins) >= 65) one('rs.w65');
  if (num(out.wins) >= 70) one('rs.w70');
  if (season.length && (num(out.totalPF) - num(out.totalPA)) / season.length >= 10) one('rs.pd10');

  /* ---- the playoffs ---- */
  const po = run.playoffs, rounds = (po && Array.isArray(po.rounds)) ? po.rounds : [];
  const playin = rounds.length && rounds[0].round === 'Play-In';
  const inField = rounds.length && (!playin || rounds[0].won);
  if (inField && worstSlide >= 8) one('rs.slump');
  let lost = 0;
  for (const rd of rounds) {
    const gs = Array.isArray(rd.games) ? rd.games : [];
    if (rd.round !== 'Play-In') lost += num(rd.oppWins);
    let y = 0, o = 0, down = false, up = false;
    for (const g of gs) {
      if (g.won) y++; else o++;
      if (o === 3 && y <= 1) down = true;
      if (y === 3 && o <= 1) up = true;
      if (g.won && num(g.ot) > 0) one('po.ot');
    }
    if (gs.length === 7) {
      const last = gs[6];
      if (last.won) { one('po.g7'); if (last.live) one('po.g7live'); }
      else one('po.g7loss');
    }
    if (rd.won && down) one('po.comeback');
    if (!rd.won && up) one('po.blown');
    if (rd.round === 'NBA Finals' && rd.won && num(rd.oppWins) === 0) one('po.brooms');
    if (rd.round === 'First Round' && !rd.won && num(out.wins) >= 60) one('po.upset');
  }
  if (out.titleWon) {
    if (lost <= 1) one('po.fofofo');
    if (playin) one('po.playin');
    const finals = rounds[rounds.length - 1];
    if (finals && Array.isArray(finals.games) && finals.games.some((g) => g.live)) one('po.livering');
    if (run.club) one('fring:' + run.club);
    if (run.era) one('ering:' + run.era);
    if (run.daily) one('daily.ring');
  }
  if (run.daily) one('daily.runs');
  return { add, max };
}

/* ---------------- Conquest ----------------
 *
 * EVERYTHING HERE IS A MAXIMUM OF THE RUN AS IT STANDS, so the page can call it
 * after every game and again at the end without anything counting twice. The
 * one exception is `cq.runs`, the number of runs finished, which is added when
 * `final` is true: modes-ui passes it once, when the last life goes, and marks
 * the run so a reload cannot pass it again. `rungs` is modes.js' CQ.RUNGS, passed in so
 * this file needs nothing else. `row(key)` looks a pkey up in the pool.
 */
function conquestFeats(cq, rungs, row, final) {
  const add = final ? { 'cq.runs': 1 } : {}, max = {};
  if (!cq || !Array.isArray(cq.wins)) return { add, max };
  const look = typeof row === 'function' ? row : () => null;
  const wins = cq.wins.slice();
  if (cq.pending) wins.push(cq.pending);
  const streak = wins.length;
  const bosses = wins.filter((w) => w.boss).length;
  const took = cq.wins.filter((w) => w.took).length;
  const cleared = streak >= (rungs || 25);
  const m = (k, v) => { if (v > 0) max[k] = Math.max(max[k] || 0, v); };
  m('cq.best', streak);
  m('cq.bosses', bosses);
  m('cq.took', took);
  /* A game won on the matchup's best plan. The read is the skill in this mode,
     so it is the one thing counted per game rather than per run. */
  m('cq.film', wins.filter((w) => w.right).length);
  if (cleared && (cq.losses || []).length === 0) m('cq.flawless', 1);
  if (cleared && num(cq.lives) === 1) m('cq.lastlife', 1);
  if (streak >= 10 && took === 0) m('cq.loyal', 1);
  for (const w of wins) {
    if (num(w.oppRating) - num(w.rating) >= 20) m('cq.giant', 1);
    if (num(w.ot) > 0) m('cq.ot', 1);
    if (num(w.you) - num(w.opp) >= 30) m('cq.blowout', 1);
    const p = w.took ? look(w.took) : null;
    if (p && (p.aw || []).indexOf('mvp') >= 0) m('cq.mvp', 1);
  }
  if (cq.lost && streak === (rungs || 25) - 1) m('cq.oneaway', 1);
  return { add, max };
}

/* ---------------- Fix History ----------------
 *
 * Called once, when a day's season is finished. `r` is the result modes-ui
 * files: odds and base as shares, trades as { w, outs, picks, ins }. `streak`
 * is how many days in a row have been finished, counted by the caller off its
 * own store because only it knows which days those are. */
function fixFeats(r, streak) {
  const add = { 'fx.days': 1 }, max = {};
  if (!r) return { add: {}, max };
  const odds = Math.round(num(r.odds) * 100), base = Math.round(num(r.base) * 100);
  max['fx.odds'] = odds;
  if (odds - base > 0) max['fx.gain'] = odds - base;
  const trades = Array.isArray(r.trades) ? r.trades : [];
  const windows = new Set(trades.map((t) => t.w));
  if (windows.size >= 4) add['fx.four'] = 1;
  const picks = trades.reduce((s, t) => s + (t.picks || []).length, 0);
  if (picks >= 1) add['fx.pick'] = 1;
  if (picks >= 3) add['fx.picks3'] = 1;
  if (trades.some((t) => (t.outs || []).length >= 3 && (t.ins || []).length === 1)) add['fx.three'] = 1;
  if (num(r.base) < 0.10 && num(r.odds) >= 0.5) add['fx.miracle'] = 1;
  if (r.replay && r.replay.title) {
    add['fx.title'] = 1;
    if (!trades.length) add['fx.pat'] = 1;
  }
  if (num(streak) > 0) max['fx.streak'] = num(streak);
  return { add, max };
}

/* ---------------- Six Passes ----------------
 * Called once, when a day's chain is finished. `passes` is the chain's length
 * in passes and `streak` the days in a row solved, counted by the caller. */
function passesFeats(solved, passes, par, clock, streak) {
  const add = { 'ps.played': 1 }, max = {};
  if (solved) {
    add['ps.solved'] = 1;
    if (passes <= par) add['ps.par'] = 1;
    if (passes <= par && par >= 5) add['ps.par5'] = 1;
    if (passes === clock) add['ps.buzzer'] = 1;
  }
  if (num(streak) > 0) max['ps.streak'] = num(streak);
  return { add, max };
}

/* Fold feats into a career. The ONE writer, used by the page for every mode,
   so an add and a max mean the same thing wherever they came from. */
function applyFeats(career, f) {
  if (!career || !f) return career;
  const fe = career.feats = (career.feats && typeof career.feats === 'object') ? career.feats : {};
  for (const k of Object.keys(f.add || {})) fe[k] = num(fe[k]) + num(f.add[k]);
  for (const k of Object.keys(f.max || {})) fe[k] = Math.max(num(fe[k]), num(f.max[k]));
  return career;
}

/* ---------------- the catalog ----------------
 *
 * Each badge is { id, g, name, why, tier, got(career) -> bool } and, for a
 * collection, a `progress(career) -> [have, need]` so the cabinet can show how
 * far along something is rather than a locked square with no information in it.
 * `g` is the shelf it sits on, in GROUPS order.
 *
 * TIERS: 'bronze' is a first step, 'silver' is a habit, 'gold' is a feat and
 * 'ring' is the handful somebody will actually brag about.
 *
 * EVERY ONE-RUN THRESHOLD IS ASSERTED REACHABLE by check-badges.mjs, which
 * plays the game every way a person would and names any badge nothing lit. The
 * first catalog asked for three things this game cannot produce and nothing
 * failed: a badge nobody can earn is not a hard badge, it is a bug that looks
 * like content.
 */
const GROUPS = [
  ['start', 'Tip-off'],
  ['win', 'Winning'],
  ['playoffs', 'Playoff lore'],
  ['build', 'Roster building'],
  ['lines', 'Stat lines'],
  ['legends', 'Reunions'],
  ['history', 'Hall of fame'],
  ['collect', 'Collections'],
  ['modes', 'Franchises and eras'],
  ['conquest', 'Conquest'],
  ['fix', 'Fix History'],
  ['passes', 'Six Passes'],
  ['hurt', 'Heartbreak'],
];

function tiered(g, idBase, name, why, key, totalKey, marks) {
  return marks.map((need, i) => ({
    id: idBase + '-' + need, g,
    name: typeof name === 'function' ? name(need) : name,
    why: typeof why === 'function' ? why(need) : why,
    tier: ['bronze', 'silver', 'gold', 'ring'][Math.min(i, 3)],
    collection: true,
    progress: (c) => [Math.min(count(c, key), need), need],
    got: (c) => count(c, key) >= need,
    _totalKey: totalKey,
  }));
}

/* A ladder on one feat count, e.g. Conquest's best streak at 5, 10, 15. */
function ladder(g, key, steps) {
  return steps.map(([need, id, name, why, tier]) => ({
    id, g, name, why, tier, got: has(key, need),
  }));
}

/* A named group of men collected across a career. */
function roll(g, id, name, why, tier, list, need) {
  const n = need || list.length;
  return { id, g, name, why, tier, collection: true,
    progress: (c) => [Math.min(hits(c, 'id:', list), n), n],
    got: (c) => hits(c, 'id:', list) >= n };
}

const awardHit = (c, code) => feat(c, 'aw:' + code) > 0 || any(c, (r) => (r.aw || []).indexOf(code) >= 0);

const CATALOG = [
  /* ---- tip-off ---- */
  { id: 'first-run', g: 'start', name: 'Tip-off', why: 'Finish your first run.', tier: 'bronze',
    got: (c) => num(c.runs) >= 1 },
  { id: 'ten-runs', g: 'start', name: 'Regular', why: 'Finish ten runs.', tier: 'silver',
    got: (c) => num(c.runs) >= 10 },
  { id: 'fifty-runs', g: 'start', name: 'Season ticket', why: 'Finish fifty runs.', tier: 'gold',
    got: (c) => num(c.runs) >= 50 },
  { id: 'hundred-wins', g: 'start', name: 'A thousand games', why: 'Play a thousand regular season games.',
    tier: 'gold', got: (c) => num(c.totalWins) + num(c.totalLosses) >= 1000 },
  { id: 'all-four', g: 'start', name: 'Four ways to play',
    why: 'Finish a Quick Draft, a Conquest run, a Fix History day and a Six Passes chain.', tier: 'silver',
    got: (c) => num(c.runs) >= 1 && feat(c, 'cq.runs') >= 1 && feat(c, 'fx.days') >= 1 && feat(c, 'ps.played') >= 1 },

  /* ---- winning ---- */
  { id: 'playoffs', g: 'win', name: 'In the field', why: 'Reach the playoffs.', tier: 'bronze',
    got: (c) => num(c.playoffs) >= 1 },
  { id: 'sixty', g: 'win', name: 'Sixty win team', why: 'Win 60 games in a season.', tier: 'silver',
    got: (c) => num(c.bestWins) >= 60 },
  { id: 'w65', g: 'win', name: 'Sixty-five', why: 'Win 65 games in a season.', tier: 'gold',
    got: (c) => num(c.bestWins) >= 65 },
  { id: 'w70', g: 'win', name: 'The seventy club', why: 'Win 70 games in a season.', tier: 'ring',
    got: (c) => num(c.bestWins) >= 70 },
  { id: 'record', g: 'win', name: 'Better than 72', why: 'Beat the 1996 Bulls.', tier: 'ring',
    got: (c) => num(c.beat72) >= 1 },
  { id: 'streak15', g: 'win', name: 'Heater', why: 'Win 15 straight in the regular season.', tier: 'silver',
    got: has('rs.streak15') },
  { id: 'streak20', g: 'win', name: 'Twenty straight', why: 'Win 20 straight in the regular season.', tier: 'gold',
    got: has('rs.streak20') },
  { id: 'fortress', g: 'win', name: 'Fortress', why: 'Win 36 home games in a season.', tier: 'gold',
    got: has('rs.home') },
  { id: 'road', g: 'win', name: 'Road warriors', why: 'Win 32 road games in a season.', tier: 'gold',
    got: has('rs.road') },
  { id: 'pd10', g: 'win', name: 'Plus ten', why: 'Outscore teams by 10 a night over a season.', tier: 'gold',
    got: has('rs.pd10') },
  { id: 'score150', g: 'win', name: 'Run and gun', why: 'Score 150 in a win.', tier: 'silver',
    got: has('rs.150') },
  { id: 'lockdown', g: 'win', name: 'Lockdown', why: 'Hold a team under 80 in a win.', tier: 'silver',
    got: has('rs.lock') },
  { id: 'slump', g: 'win', name: 'Survived the slump', why: 'Lose eight straight and still make the playoffs.', tier: 'silver',
    got: has('rs.slump') },

  /* ---- playoff lore ---- */
  { id: 'ring', g: 'playoffs', name: 'Champions', why: 'Win the title.', tier: 'ring',
    got: (c) => num(c.rings) >= 1 },
  { id: 'threepeat', g: 'playoffs', name: 'Dynasty', why: 'Win three titles.', tier: 'ring',
    got: (c) => num(c.rings) >= 3 },
  { id: 'five-rings', g: 'playoffs', name: 'The cabinet', why: 'Win five titles.', tier: 'ring',
    got: (c) => num(c.rings) >= 5 },
  { id: 'fofofo', g: 'playoffs', name: 'Fo\', fo\', fo\'',
    why: 'Win the title losing one playoff game or none. Moses said it in 1983.', tier: 'ring',
    got: has('po.fofofo') },
  { id: 'brooms', g: 'playoffs', name: 'Brooms', why: 'Sweep the Finals.', tier: 'gold',
    got: has('po.brooms') },
  { id: 'comeback', g: 'playoffs', name: 'Down 3-1', why: 'Win a series after trailing it 3-1.', tier: 'gold',
    got: has('po.comeback') },
  { id: 'g7', g: 'playoffs', name: 'Game 7', why: 'Win a Game 7.', tier: 'silver',
    got: has('po.g7') },
  { id: 'g7live', g: 'playoffs', name: 'Clutch', why: 'Win a Game 7 you played yourself.', tier: 'gold',
    got: has('po.g7live') },
  { id: 'livering', g: 'playoffs', name: 'You called it', why: 'Win a title in a Finals you played yourself.', tier: 'ring',
    got: has('po.livering') },
  { id: 'playin-ring', g: 'playoffs', name: 'From the play-in', why: 'Win the title after starting in the play-in.', tier: 'ring',
    got: has('po.playin') },
  { id: 'po-ot', g: 'playoffs', name: 'Playoff overtime', why: 'Win a playoff game in overtime.', tier: 'silver',
    got: has('po.ot') },

  /* ---- roster building ---- */
  { id: 'spend-it', g: 'build', name: 'Spent to the dollar', why: 'Finish a draft with under $500k left.',
    tier: 'bronze', got: (c) => any(c, (r) => num(r.left) >= 0 && num(r.left) < 0.5) },
  /* MEASURED, and the first number was fantasy. "Win 50 games under $80M" came
     back at 2 runs in 1,111 deliberate cheap builds, which is rarer than most
     of the ring badges and was never meant to be. Reaching the playoffs on that
     budget is the same idea, is worth saying, and happens often enough that
     somebody chasing it will get there. */
  { id: 'thrift', g: 'build', name: 'Moneyball', why: 'Reach the playoffs with a roster under $80M.',
    tier: 'gold', got: (c) => any(c, (r) => r.po && num(r.spend) > 0 && num(r.spend) < 80) },
  { id: 'cheap-ring', g: 'build', name: 'No superstars', why: 'Win the title with nobody over $45M.',
    tier: 'ring', got: (c) => any(c, (r) => r.ring && num(r.top) > 0 && num(r.top) <= 45) },
  { id: 'max', g: 'build', name: 'Max contract', why: 'Sign a man priced at $55M or more.', tier: 'bronze',
    got: has('st.max') },
  { id: 'chemistry', g: 'build', name: 'They knew each other', why: 'Field a roster worth +1.5 chemistry.',
    tier: 'gold', got: (c) => any(c, (r) => num(r.chem) >= 1.5) },
  { id: 'reunion', g: 'build', name: 'Reunion', why: 'Sign two men from the same club and season.',
    tier: 'silver', got: (c) => any(c, (r) => num(r.pairs) >= 1) },
  { id: 'col3', g: 'build', name: 'Alumni weekend', why: 'Start three men from one college.', tier: 'silver',
    got: has('st.col3') },
  { id: 'class3', g: 'build', name: 'Draft night', why: 'Start three men from one draft class.', tier: 'silver',
    got: has('st.class3') },
  { id: 'rook2', g: 'build', name: 'Rookie wall', why: 'Start two rookies.', tier: 'silver',
    got: has('st.rook2') },
  { id: 'vet3', g: 'build', name: 'Grey beards', why: 'Start three men twelve years past their draft.', tier: 'silver',
    got: has('st.vet3') },
  { id: 'decades5', g: 'build', name: 'Time machine', why: 'Start men from five different decades.', tier: 'gold',
    got: has('st.decades5') },
  { id: 'all-decorated', g: 'build', name: 'Four of the best',
    why: 'Field four players who each won something that season.', tier: 'gold',
    got: (c) => any(c, (r) => num(r.decorated) >= 4) },
  { id: 'no-hardware', g: 'build', name: 'Nobody you have heard of',
    why: 'Reach the playoffs with a roster carrying no hardware at all.', tier: 'gold',
    got: (c) => any(c, (r) => r.po && num(r.decorated) === 0) },

  /* ---- stat lines ---- */
  { id: 'pts30', g: 'lines', name: 'Scoring title', why: 'Sign a man who averaged 30.', tier: 'silver',
    got: has('st.pts30') },
  { id: 'pts35', g: 'lines', name: 'Thirty-five a night',
    why: 'Sign a man who averaged 35. Four seasons since 1974 qualify.', tier: 'ring',
    got: has('st.pts35') },
  { id: 'ast12', g: 'lines', name: 'Dime a dozen', why: 'Sign a man who averaged 12 assists.', tier: 'silver',
    got: has('st.ast12') },
  { id: 'reb15', g: 'lines', name: 'Glass eater', why: 'Sign a man who averaged 15 rebounds.', tier: 'silver',
    got: has('st.reb15') },
  { id: 'blk35', g: 'lines', name: 'Not in my house', why: 'Sign a man who averaged 3.5 blocks.', tier: 'silver',
    got: has('st.blk35') },
  { id: 'stl3', g: 'lines', name: 'Pickpocket', why: 'Sign a man who averaged 3 steals.', tier: 'gold',
    got: has('st.stl3') },
  { id: 'trip', g: 'lines', name: 'Triple-double season',
    why: 'Sign a man who averaged a triple-double. Westbrook did it four times.', tier: 'gold',
    got: has('st.trip') },
  { id: 'three20', g: 'lines', name: 'Three scorers', why: 'Start three men who each averaged 20.', tier: 'silver',
    got: has('st.three20') },
  { id: 'no3', g: 'lines', name: 'Before the line', why: 'Start five men who never shot threes.', tier: 'bronze',
    got: has('st.no3') },
  { id: 'bombs', g: 'lines', name: 'Bombs away', why: 'Start five men who shot 30 threes a night between them.', tier: 'gold',
    got: has('st.bombs') },
  { id: 'ageless', g: 'lines', name: 'Ageless', why: 'Sign a man nineteen years past his draft.', tier: 'gold',
    got: has('st.ageless') },

  /* ---- reunions ---- */
  ...REUNIONS.map(([key, , , name, why, tier]) => ({
    id: 're-' + key, g: 'legends', name, why, tier, got: has('re:' + key) })),
  { id: 're-tour', g: 'legends', name: 'Reunion tour', why: 'Complete five reunions.', tier: 'gold',
    collection: true,
    progress: (c) => [Math.min(hits(c, 're:', REUNIONS.map((r) => r[0])), 5), 5],
    got: (c) => hits(c, 're:', REUNIONS.map((r) => r[0])) >= 5 },
  { id: 're-all', g: 'legends', name: 'Every band back together', why: 'Complete every reunion.', tier: 'ring',
    collection: true,
    progress: (c) => [hits(c, 're:', REUNIONS.map((r) => r[0])), REUNIONS.length],
    got: (c) => hits(c, 're:', REUNIONS.map((r) => r[0])) >= REUNIONS.length },

  /* ---- hall of fame ---- */
  { id: 'mvp', g: 'history', name: 'Signed an MVP', why: 'Sign a player from his MVP season.',
    tier: 'silver', got: (c) => awardHit(c, 'mvp') },
  ...AWARDS.map(([code, name, why, tier]) => ({
    id: 'aw-' + code, g: 'history', name, why, tier, got: (c) => awardHit(c, code) })),
  { id: 'trophies', g: 'history', name: 'Trophy case',
    why: 'Sign every kind of winner: MVP, Finals MVP, Rookie, Defense, Sixth Man, Most Improved, First Team.',
    tier: 'gold', collection: true,
    progress: (c) => [TROPHIES.filter((t) => awardHit(c, t)).length, TROPHIES.length],
    got: (c) => TROPHIES.every((t) => awardHit(c, t)) },
  roll('history', 'dream-6', 'Half the Dream Team', 'Sign six of the twelve 1992 Olympians.', 'silver', DREAM_TEAM, 6),
  roll('history', 'dream', 'The Dream Team', 'Sign all twelve 1992 Olympians.', 'ring', DREAM_TEAM),
  ...CLASSES.map(([key, list, name, why]) => roll('history', 'class-' + key, name, why, 'gold', list)),
  { id: 'mvps-3', g: 'history', name: 'MVP collector', why: 'Sign three different MVP seasons.', tier: 'silver',
    collection: true, progress: (c) => [Math.min(prefixed(c, 'mvp:'), 3), 3], got: (c) => prefixed(c, 'mvp:') >= 3 },
  { id: 'mvps-10', g: 'history', name: 'MVP ladder', why: 'Sign ten different MVP seasons.', tier: 'gold',
    collection: true, progress: (c) => [Math.min(prefixed(c, 'mvp:'), 10), 10], got: (c) => prefixed(c, 'mvp:') >= 10 },
  { id: 'mvps-all', g: 'history', name: 'Every MVP since 1974', why: 'Sign every MVP season in the game.', tier: 'ring',
    collection: true, progress: (c) => [Math.min(prefixed(c, 'mvp:'), TOTALS.mvps), TOTALS.mvps],
    got: (c) => prefixed(c, 'mvp:') >= TOTALS.mvps },
  { id: 'fmvps-5', g: 'history', name: 'Finals MVP collector', why: 'Sign five different Finals MVP seasons.', tier: 'gold',
    collection: true, progress: (c) => [Math.min(prefixed(c, 'fmvp:'), 5), 5], got: (c) => prefixed(c, 'fmvp:') >= 5 },

  /* ---- collections ---- */
  ...tiered('collect', 'clubs', (n) => n >= 45 ? 'The whole league' : 'Scout ' + n + ' clubs',
    (n) => 'Sign a player from ' + n + ' different franchises.', 'clubs', 'clubs',
    [5, 15, 30, 45]),
  ...tiered('collect', 'seasons', (n) => n >= 52 ? 'Every season since 1974' : 'Draft from ' + n + ' seasons',
    (n) => 'Sign a player from ' + n + ' different seasons.', 'seasons', 'seasons',
    [5, 15, 30, 52]),
  ...tiered('collect', 'shapes', (n) => n >= 14 ? 'Every system' : 'Run ' + n + ' systems',
    (n) => 'Field ' + n + ' different roster identities.', 'shapes', 'shapes',
    [3, 6, 10, 14]),
  ...tiered('collect', 'colleges', 'Recruiter',
    (n) => 'Sign players out of ' + n + ' different colleges.', 'colleges', null,
    [10, 40, 100]),
  /* A decade and a blue blood are both read off sets the career has always
     kept, so both fill in for somebody who has been playing for weeks. */
  { id: 'decades', g: 'collect', name: 'Across the eras', why: 'Sign a player from all six decades.',
    tier: 'silver', collection: true,
    progress: (c) => [DECADES.filter((d) => decadeHit(c, d)).length, DECADES.length],
    got: (c) => DECADES.every((d) => decadeHit(c, d)) },
  { id: 'blue-bloods', g: 'collect', name: 'Blue bloods',
    why: 'Sign players out of UNC, Duke, Kentucky, Kansas and UCLA.', tier: 'silver', collection: true,
    progress: (c) => [BLUE_BLOODS.filter((k) => set(c, 'colleges')[k]).length, BLUE_BLOODS.length],
    got: (c) => BLUE_BLOODS.every((k) => set(c, 'colleges')[k]) },

  /* ---- franchises and eras ---- */
  { id: 'fring-1', g: 'modes', name: 'Hometown hero', why: 'Win a title in One Franchise.', tier: 'silver',
    got: (c) => prefixed(c, 'fring:') >= 1 },
  { id: 'fring-5', g: 'modes', name: 'Five banners', why: 'Win One Franchise titles with five different clubs.',
    tier: 'gold', collection: true,
    progress: (c) => [Math.min(prefixed(c, 'fring:'), 5), 5], got: (c) => prefixed(c, 'fring:') >= 5 },
  { id: 'fring-15', g: 'modes', name: 'Half the league', why: 'Win One Franchise titles with fifteen different clubs.',
    tier: 'ring', collection: true,
    progress: (c) => [Math.min(prefixed(c, 'fring:'), 15), 15], got: (c) => prefixed(c, 'fring:') >= 15 },
  { id: 'fring-all', g: 'modes', name: 'Every banner', why: 'Win a One Franchise title with every club.',
    tier: 'ring', collection: true,
    progress: (c) => [Math.min(prefixed(c, 'fring:'), TOTALS.franchises), TOTALS.franchises],
    got: (c) => prefixed(c, 'fring:') >= TOTALS.franchises },
  { id: 'ering-1', g: 'modes', name: 'Period piece', why: 'Win a title in Decades.', tier: 'silver',
    got: (c) => prefixed(c, 'ering:') >= 1 },
  { id: 'ering-all', g: 'modes', name: 'A ring in every decade', why: 'Win a Decades title in all six decades.',
    tier: 'ring', collection: true,
    progress: (c) => [Math.min(prefixed(c, 'ering:'), DECADES.length), DECADES.length],
    got: (c) => prefixed(c, 'ering:') >= DECADES.length },
  { id: 'daily-10', g: 'modes', name: 'Daily habit', why: 'Play ten daily drafts.', tier: 'silver',
    got: has('daily.runs', 10) },
  { id: 'daily-ring', g: 'modes', name: 'Ring of the day', why: 'Win the title on a daily draft.', tier: 'gold',
    got: has('daily.ring') },
  ...ladder('modes', 'daily.streak', [
    [3, 'daily-3', 'Three in a row', 'Play the daily draft three days running.', 'bronze'],
    [7, 'daily-7', 'A week of drafts', 'Play the daily draft seven days running.', 'silver'],
    [30, 'daily-30', 'Every single day', 'Play the daily draft thirty days running.', 'gold'],
  ]),

  /* ---- conquest ---- */
  { id: 'cq-first', g: 'conquest', name: 'Winners stay on', why: 'Finish a Conquest run.', tier: 'bronze',
    got: has('cq.runs') },
  { id: 'cq-10runs', g: 'conquest', name: 'Court regular', why: 'Finish ten Conquest runs.', tier: 'silver',
    got: has('cq.runs', 10) },
  ...ladder('conquest', 'cq.best', [
    [5, 'cq-5', 'Holding court', 'Win five straight in Conquest.', 'bronze'],
    [10, 'cq-10', 'Ten deep', 'Win ten straight in Conquest.', 'silver'],
    [15, 'cq-15', 'Fifteen deep', 'Win fifteen straight in Conquest.', 'gold'],
    [25, 'cq-clear', 'Cleared the ladder', 'Beat all 25 teams in Conquest.', 'ring'],
    [30, 'cq-30', 'Nobody left', 'Win thirty in one Conquest run.', 'ring'],
  ]),
  ...ladder('conquest', 'cq.bosses', [
    [1, 'cq-boss', 'Boss down', 'Beat a Conquest boss.', 'bronze'],
    [3, 'cq-boss3', 'Boss rush', 'Beat three bosses in one Conquest run.', 'gold'],
  ]),
  ...ladder('conquest', 'cq.film', [
    [3, 'cq-plan3', 'Game planner', 'Win three Conquest games in one run on the right game plan.', 'bronze'],
    [10, 'cq-film', 'Film room', 'Win ten Conquest games in one run on the right game plan.', 'gold'],
  ]),
  { id: 'cq-flawless', g: 'conquest', name: 'Untouchable', why: 'Clear the Conquest ladder without losing a game.',
    tier: 'ring', got: has('cq.flawless') },
  { id: 'cq-lastlife', g: 'conquest', name: 'Last ball', why: 'Clear the Conquest ladder on your last life.',
    tier: 'gold', got: has('cq.lastlife') },
  { id: 'cq-giant', g: 'conquest', name: 'Giant killer', why: 'Beat a Conquest team rated 20 above yours.',
    tier: 'gold', got: has('cq.giant') },
  { id: 'cq-ot', g: 'conquest', name: 'Extra time', why: 'Win a Conquest game in overtime.', tier: 'bronze',
    got: has('cq.ot') },
  { id: 'cq-blowout', g: 'conquest', name: 'Run them off', why: 'Win a Conquest game by 30.', tier: 'silver',
    got: has('cq.blowout') },
  { id: 'cq-mvp', g: 'conquest', name: 'Grand theft', why: 'Take a man off a team in his MVP season.', tier: 'silver',
    got: has('cq.mvp') },
  { id: 'cq-took10', g: 'conquest', name: 'Five-finger discount', why: 'Take ten men in one Conquest run.',
    tier: 'silver', got: has('cq.took', 10) },
  { id: 'cq-loyal', g: 'conquest', name: 'Loyal to the crew', why: 'Win ten straight in Conquest without taking anybody.',
    tier: 'gold', got: has('cq.loyal') },

  /* ---- fix history ---- */
  ...ladder('fix', 'fx.days', [
    [1, 'fx-1', 'General manager', 'Finish a day of Fix History.', 'bronze'],
    [7, 'fx-7', 'Front office', 'Finish seven days of Fix History.', 'silver'],
    [30, 'fx-30', 'Lifer', 'Finish thirty days of Fix History.', 'gold'],
  ]),
  { id: 'fx-streak7', g: 'fix', name: 'Every morning', why: 'Finish Fix History seven days running.', tier: 'gold',
    got: has('fx.streak', 7) },
  ...ladder('fix', 'fx.gain', [
    [15, 'fx-gain15', 'Fixed it', 'Raise a team\'s title odds by 15 points.', 'silver'],
    [30, 'fx-gain30', 'Rewrote history', 'Raise a team\'s title odds by 30 points.', 'gold'],
  ]),
  { id: 'fx-odds50', g: 'fix', name: 'Favorite', why: 'Finish a Fix History day at 50% title odds.', tier: 'gold',
    got: has('fx.odds', 50) },
  { id: 'fx-title', g: 'fix', name: 'History rewritten', why: 'Win the title in the Fix History replay.', tier: 'silver',
    got: has('fx.title') },
  { id: 'fx-title10', g: 'fix', name: 'Revisionist', why: 'Win ten Fix History replays.', tier: 'gold',
    got: has('fx.title', 10) },
  { id: 'fx-pat', g: 'fix', name: 'Run it back', why: 'Stand pat all season and win the replay.', tier: 'silver',
    got: has('fx.pat') },
  { id: 'fx-four', g: 'fix', name: 'Deadline junkie', why: 'Make a deal in all four Fix History windows.', tier: 'silver',
    got: has('fx.four') },
  { id: 'fx-pick', g: 'fix', name: 'Future considerations', why: 'Trade a draft pick.', tier: 'bronze',
    got: has('fx.pick') },
  { id: 'fx-picks3', g: 'fix', name: 'Mortgage the future', why: 'Trade three draft picks in one season.', tier: 'silver',
    got: has('fx.picks3') },
  { id: 'fx-three', g: 'fix', name: 'Three for one', why: 'Send three men for one.', tier: 'silver',
    got: has('fx.three') },
  { id: 'fx-talk', g: 'fix', name: 'Worked the phones', why: 'Land a deal you negotiated.', tier: 'bronze',
    got: has('fx.talk') },
  { id: 'fx-miracle', g: 'fix', name: 'Miracle worker', why: 'Take a team from under 10% to 50% title odds.', tier: 'ring',
    got: has('fx.miracle') },

  /* ---- six passes ---- */
  { id: 'ps-first', g: 'passes', name: 'First touch', why: 'Finish a Six Passes chain.', tier: 'bronze',
    got: has('ps.played') },
  ...ladder('passes', 'ps.solved', [
    [1, 'ps-1', 'Assist', 'Get the ball there.', 'bronze'],
    [25, 'ps-25', 'Point guard', 'Solve 25 Six Passes chains.', 'silver'],
    [100, 'ps-100', 'Floor general', 'Solve 100 Six Passes chains.', 'gold'],
  ]),
  ...ladder('passes', 'ps.par', [
    [1, 'ps-par', 'Perfect pass', 'Solve a chain at par.', 'silver'],
    [10, 'ps-par10', 'Tic-tac-toe', 'Solve ten chains at par.', 'gold'],
  ]),
  { id: 'ps-par5', g: 'passes', name: 'Full court', why: 'Solve a par 5 at par.', tier: 'gold',
    got: has('ps.par5') },
  { id: 'ps-buzzer', g: 'passes', name: 'At the buzzer', why: 'Score on the tenth and last pass.', tier: 'silver',
    got: has('ps.buzzer') },
  ...ladder('passes', 'ps.streak', [
    [3, 'ps-streak3', 'In rhythm', 'Solve Six Passes three days running.', 'silver'],
    [7, 'ps-streak7', 'Automatic', 'Solve Six Passes seven days running.', 'gold'],
  ]),

  /* ---- heartbreak ---- */
  { id: 'swept', g: 'hurt', name: 'Swept', why: 'Lose a playoff series 0-4.', tier: 'bronze',
    got: (c) => any(c, (r) => r.swept) },
  { id: 'flop', g: 'hurt', name: 'On paper', why: 'Miss the playoffs with a rating of 60 or better.',
    tier: 'silver', got: (c) => any(c, (r) => !r.po && num(r.rating) >= 60) },
  { id: 'lost-finals', g: 'hurt', name: 'So close', why: 'Lose in the Finals.', tier: 'silver',
    got: (c) => any(c, (r) => r.lostFinals) },
  { id: 'g7loss', g: 'hurt', name: 'Game 7 heartbreak', why: 'Lose a Game 7.', tier: 'bronze',
    got: has('po.g7loss') },
  { id: 'blown', g: 'hurt', name: 'Blew a 3-1 lead', why: 'Lose a series you led 3-1.', tier: 'silver',
    got: has('po.blown') },
  { id: 'upset', g: 'hurt', name: 'We believe', why: 'Win 60 and lose in the first round. Ask the 2007 Mavericks.',
    tier: 'gold', got: has('po.upset') },
  { id: 'cq-oneaway', g: 'hurt', name: 'One away', why: 'Lose your last life on the final Conquest rung.', tier: 'gold',
    got: has('cq.oneaway') },
];

const DECADES = [1970, 1980, 1990, 2000, 2010, 2020];
function decadeHit(c, d) {
  const seasons = Object.keys(set(c, 'seasons')).map(Number);
  return seasons.some((s) => s >= d && s < d + 10);
}

/* A collection's target moves with the data. tiered() marks are fixed numbers
   so the badge names read as promises ("Draft from 30 seasons"), but the top
   tier of each is meant to BE the whole set, so it is corrected here rather
   than hardcoded twice. */
function catalog() {
  return CATALOG.map((b) => {
    if (!b._totalKey || !TOTALS[b._totalKey]) return b;
    const total = TOTALS[b._totalKey];
    const marks = { clubs: 45, seasons: 52, shapes: 14 };
    if (!b.id.endsWith('-' + marks[b._totalKey])) return b;
    if (total === marks[b._totalKey]) return b;
    return { ...b, progress: (c) => [Math.min(count(c, b._totalKey), total), total],
      got: (c) => count(c, b._totalKey) >= total };
  });
}

/** Every badge, with whether this career has it and how far along it is. */
function evaluate(career) {
  const c = career || {};
  return catalog().map((b) => {
    const got = !!b.got(c);
    const p = b.progress ? b.progress(c) : null;
    return { id: b.id, g: b.g, name: b.name, why: b.why, tier: b.tier,
      collection: !!b.collection, got, have: p ? p[0] : (got ? 1 : 0),
      need: p ? p[1] : 1 };
  });
}

function earned(career) { return evaluate(career).filter((b) => b.got); }

const publicAPI = {
  API_VERSION: BADGES_API_VERSION,
  catalog, evaluate, earned, setTotals, applyFeats,
  draftFeats, conquestFeats, fixFeats, passesFeats,
  GROUPS, REUNIONS, DREAM_TEAM, CLASSES, BLUE_BLOODS,
  get TOTAL() { return CATALOG.length; },
};

if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;
if (typeof window !== 'undefined') window.RTF_BADGES = publicAPI;
})();
