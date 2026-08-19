/* Who scored it, and who took it away.
 *
 *   node football/build/test/test_credits.mjs
 *
 * A drafted roster used to play twenty-one weeks without one of its six names being said.
 * The score went up, the drive chart drew a line into the end zone, and which of your
 * players did it was not on the screen anywhere. E.touchdownCredits puts a man on every
 * touchdown and E.takeawayScript does the same for the defense draft, where your offense is the
 * league's and the six you actually chose only show up going the other way.
 *
 * FOUR THINGS ARE WORTH TESTING HERE AND ONLY ONE OF THEM IS "IT RETURNS SOMETHING".
 *
 *   THE STREAM. This is the one that would cost real runs. Every game in a season comes out
 *   of one sequential rng, so a draw taken from it to pick a scorer consumes a value the
 *   next week depends on and silently rewrites the rest of the year. Nothing throws; the
 *   leaderboard just quietly stops agreeing with itself, and every run recorded before the
 *   change becomes unreproducible. It is the same failure toFootballScore shipped once and
 *   the reason that one draws exactly one value from each of its two paths. The assertion
 *   below plays seasons with credits computed between the weeks and demands the results come
 *   out identical to the same seasons played without them.
 *
 *   THE ATTRIBUTION. Credit has to track what a man actually is, or it is a random name
 *   attached to a real event, which is worse than no name: it would tell a player their
 *   tight end is a touchdown machine while the box score beside it says he caught for six
 *   points. So the rusher outscores the tight end, and the quarterback throws them rather
 *   than scoring them.
 *
 *   WHICH PLAY, WHICH MAN, on the defensive side. This is where the first cut of the code
 *   was actually wrong rather than theoretically wrong: reading a defender's coverage and
 *   pass rush columns alone looked principled, but the cheap end of the pool is tackle-led
 *   and carries roughly zero in both, so every drafted defender fell through to one shared
 *   fraction and defensive ends led the team in interceptions at the same 58% as the
 *   safeties. The position is the prior now and the columns adjust it, and the two
 *   assertions below are what say so.
 *
 *   THE WORDS. A blurb is copy that ships, so it is held to the copy rules: no dashes, and
 *   no goal-line verb on a fifty yard run.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = '/home/user/runthe-gg-site';
const E = require(`${ROOT}/football/engine.js`);
const R = require(`${ROOT}/football/run.js`);
const D = `${ROOT}/football/data`;
const load = (f) => JSON.parse(fs.readFileSync(`${D}/${f}`, 'utf8'));
const players = load('player_seasons.json'), teamSeasons = load('team_seasons.json');
const defenders = load('defender_seasons.json');
const leagueContext = load('league_context.json').league_avg_pts_allowed_by_season;
const CAL = load('display_calibration.json');
const ctx = { battery: load('battery.json'), coaches: load('coaches.json'), curated: load('curated.json') };

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 160) : '')); };

/* A competent draft, the same policy the bracket harness uses: the best man on the board
   that still leaves a floor for the spots after him. */
function playSeason(defense, seed, onWeek) {
  const src = defense ? defenders : players;
  const byKey = new Map(src.map((p) => [p.player_id + '|' + p.season, p]));
  const data = R.indexData(src, teamSeasons);
  const run = R.createRun({ seed, defense: defense || undefined });
  let guard = 0;
  while (run.phase === R.PHASES.DRAFT && guard++ < 40) {
    const draw = R.spin(run, data);
    const opts = (draw.options || []).map((k) => byKey.get(k)).filter(Boolean);
    if (!opts.length) break;
    const budget = R.remaining(run) - R.reserveFloor(run);
    const can = opts.filter((p) => p.price_musd <= budget);
    const from = can.length ? can : opts.slice().sort((a, b) => a.price_musd - b.price_musd).slice(0, 1);
    from.sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean || a.price_musd - b.price_musd);
    R.sign(run, from[0]);
  }
  R.startSeason(run, data, ctx);
  const rows = [];
  while (run.phase === R.PHASES.SEASON || run.phase === R.PHASES.PLAYOFFS) {
    const r = R.advanceWeek(run, data, leagueContext, CAL);
    rows.push([r.week, r.round, r.won, r.yourScore, r.oppScore, r.shownYou, r.shownThem,
      (r.lines || []).map((l) => l.name + ':' + l.pts).join('|')].join(','));
    if (onWeek) onWeek(r, run);
    if (run.phase === R.PHASES.SEEDING) {
      if (run.playoffSeed && run.playoffSeed.made) R.startPlayoffs(run); else break;
    }
  }
  return { rows, run };
}

/* The page's own seeding, copied here on purpose rather than imported: if index.html ever
   starts seeding these off something that moves, this test still asks the question the
   comment above it asks. Rounds only, because the page only credits playoff games: the
   regular season is a score that flashes past and is deliberately left alone. */
const seedStrFor = (seed, r) => seed + '|' + r.round + '|' + r.shownYou + '-' + r.shownThem;
const creditsFor = (seed, r, defense) => {
  const s = seedStrFor(seed, r);
  const rng = E.createSeededRNG(E.hashSeed(s + '|credits'));
  return defense
    ? E.takeawayScript(r.lines, rng)
    : E.touchdownCredits(E.scoringScript(r.shownYou, r.shownThem,
      E.createSeededRNG(E.hashSeed(s))), r.lines, rng);
};

/* ── the stream ──────────────────────────────────────────────────────────── */
console.log('=== the season stream is not touched ===');
{
  let mismatch = 0, checked = 0, credited = 0;
  for (const defense of [false, true]) {
    for (let seed = 1; seed <= 25; seed++) {
      const clean = playSeason(defense, seed);
      /* The same season again, with the blurbs actually being built after every week, which
         is what the page does. If any of that reaches the season's rng the rows diverge. */
      const withCredits = playSeason(defense, seed, (r) => {
        if (!r.lines) return;
        credited += creditsFor(seed, r, defense).length;
      });
      checked++;
      if (clean.rows.join('\n') !== withCredits.rows.join('\n')) mismatch++;
    }
  }
  ok('a season plays identically whether or not the blurbs are built', mismatch === 0,
    { seasons: checked, differed: mismatch });
  ok('and the blurbs were genuinely being built while it ran', credited > 200, { credited });
}

/* ── who gets the credit ─────────────────────────────────────────────────── */
console.log('\n=== the credit follows the player ===');
{
  /* One roster, many games, so the only thing separating the six is who they are. */
  const { run } = playSeason(false, 99);
  const lines = run.season.results.find((r) => r.lines).lines;
  const tally = new Map(); let n = 0, passerNamed = 0, catches = 0;
  for (let g = 0; g < 3000; g++) {
    const script = E.scoringScript(24, 17, E.createSeededRNG(E.hashSeed('s' + g)));
    for (const c of E.touchdownCredits(script, lines, E.createSeededRNG(E.hashSeed('c' + g)))) {
      tally.set(c.scorer, (tally.get(c.scorer) || 0) + 1); n++;
      if (c.play === 'catch') { catches++; if (c.passer) passerNamed++; }
    }
  }
  const by = (name) => tally.get(name) || 0;
  const qb = lines.find((l) => l.pos === 'QB');

  ok('every touchdown is credited to somebody on the roster',
    n > 0 && [...tally.keys()].every((k) => lines.some((l) => l.name === k)),
    { credited: n, names: [...tally.keys()].length });
  /* A quarterback throws them. He can run one in, and the data says that is rare: the
     ceiling here is deliberately loose because a running quarterback is a real thing, but
     "the QB scored a third of our touchdowns" never is. */
  ok('the quarterback throws them rather than scoring them',
    !qb || by(qb.name) / n < 0.08, { qb: qb && qb.name, share: qb ? (by(qb.name) / n).toFixed(3) : 'none' });
  ok('and he is named as the passer on the catches',
    catches === 0 || passerNamed / catches > 0.9, { catches, passerNamed });
  /* Nobody is frozen out. A weight of zero for a man who played is a bug that reads as a
     preference, and it took a real roster to notice. */
  ok('nobody on the roster is unable to score',
    lines.filter((l) => l.pos !== 'QB').every((l) => by(l.name) > 0),
    lines.map((l) => [l.name, l.pos, by(l.name)]));

  /* WHAT HE IS, HELD APART FROM HOW HE PLAYED, which needs a roster rather than a week.
     The weight is the end-zone half of a man's season times his form in THIS game, and on a
     real week those two pull against each other: the first draft of this assertion compared
     a back's season rushing against a tight end's and failed honestly, because in the week
     it happened to read the tight end had gone off and the back had not. That is the
     feature. So form is pinned flat here (pts equal to avg for all six) and only the kind of
     player is left varying, which is the thing this line actually claims. */
  const flat = [
    { name: 'Bell Cow', pos: 'RB', slot: 'RB', pts: 15, avg: 15, pass: 0, rush: 14.0, rec: 2.0 },
    { name: 'Split End', pos: 'WR', slot: 'WR', pts: 15, avg: 15, pass: 0, rush: 0.2, rec: 13.0 },
    { name: 'Slot Man', pos: 'WR', slot: 'WR2', pts: 9, avg: 9, pass: 0, rush: 0.0, rec: 8.5 },
    { name: 'Blocking End', pos: 'TE', slot: 'TE', pts: 4, avg: 4, pass: 0, rush: 0.0, rec: 3.2 },
    { name: 'Change Back', pos: 'RB', slot: 'FLEX', pts: 6, avg: 6, pass: 0, rush: 4.0, rec: 2.5 },
    { name: 'The Arm', pos: 'QB', slot: 'QB', pts: 22, avg: 22, pass: 21.0, rush: 0.6, rec: 0 },
  ];
  const ft = new Map(); let fn = 0, runs = 0, plays = 0;
  for (let g = 0; g < 3000; g++) {
    const script = E.scoringScript(28, 21, E.createSeededRNG(E.hashSeed('f' + g)));
    for (const c of E.touchdownCredits(script, flat, E.createSeededRNG(E.hashSeed('h' + g)))) {
      ft.set(c.scorer, (ft.get(c.scorer) || 0) + 1); fn++;
      plays++; if (c.play === 'run') runs++;
    }
  }
  const f = (name) => (ft.get(name) || 0);
  ok('with form held flat, the bigger end-zone threat scores more',
    f('Bell Cow') > f('Change Back') && f('Split End') > f('Blocking End'),
    { bellCow: f('Bell Cow'), changeBack: f('Change Back'), splitEnd: f('Split End'), blockingEnd: f('Blocking End') });
  ok('and the passer, who produces most of all, scores least',
    f('The Arm') < f('Blocking End'), { arm: f('The Arm'), blockingEnd: f('Blocking End') });
  /* A back's touchdowns are mostly runs and a receiver's are all catches, which is the
     second half of "the credit follows the player": naming the right man on the wrong kind
     of play is still wrong. */
  const runShare = (name) => { let r2 = 0, t2 = 0;
    for (let g = 0; g < 1500; g++) {
      const script = E.scoringScript(28, 21, E.createSeededRNG(E.hashSeed('p' + g)));
      for (const c of E.touchdownCredits(script, flat, E.createSeededRNG(E.hashSeed('q' + g)))) {
        if (c.scorer !== name) continue; t2++; if (c.play === 'run') r2++;
      }
    }
    return t2 ? r2 / t2 : null; };
  ok('a back mostly runs them in', runShare('Bell Cow') > 0.75, { runShare: runShare('Bell Cow') });
  ok('a receiver always catches them', runShare('Split End') < 0.06, { runShare: runShare('Split End') });
  ok('and the league still scores both ways', runs / plays > 0.1 && runs / plays < 0.7,
    { runShare: (runs / plays).toFixed(2) });
}

/* ── the defensive half ──────────────────────────────────────────────────── */
console.log('\n=== takeaways fit the man who made them ===');
{
  /* Built rather than drafted, so both extremes are actually in the sample: the drafted
     pool at these prices is tackle-led and a season of it may contain no true cover man at
     all, which is exactly the roster that hid the bug this is about. */
  const men = [
    { name: 'Rush End', pos: 'DL', slot: 'DL', pts: 18, avg: 18, rush: 10.1, cover: 1.6, tackle: 7.3 },
    { name: 'Nose Man', pos: 'DL', slot: 'DL', pts: 8, avg: 8, rush: 0.1, cover: 0.0, tackle: 1.2 },
    { name: 'Mike Backer', pos: 'LB', slot: 'LB', pts: 14, avg: 14, rush: 1.2, cover: 2.0, tackle: 9.0 },
    { name: 'Cover Safety', pos: 'DB', slot: 'DB', pts: 13, avg: 13, rush: 0.2, cover: 7.4, tackle: 5.1 },
    { name: 'Corner', pos: 'DB', slot: 'DB', pts: 11, avg: 11, rush: 0.0, cover: 0.1, tackle: 2.8 },
    { name: 'Flex Backer', pos: 'LB', slot: 'FLEX', pts: 10, avg: 10, rush: 0.3, cover: 0.0, tackle: 4.4 },
  ];
  const kind = new Map(), byMan = new Map();
  let total = 0, games = 6000;
  for (let g = 0; g < games; g++) {
    for (const t of E.takeawayScript(men, E.createSeededRNG(E.hashSeed('t' + g)))) {
      total++;
      kind.set(t.kind, (kind.get(t.kind) || 0) + 1);
      const m = byMan.get(t.by) || { INTERCEPTION: 0, FUMBLE: 0 };
      m[t.kind]++; byMan.set(t.by, m);
    }
  }
  const share = (name) => { const m = byMan.get(name) || { INTERCEPTION: 0, FUMBLE: 0 };
    const s = m.INTERCEPTION + m.FUMBLE; return s ? m.INTERCEPTION / s : null; };

  /* A real defense takes the ball away about 1.3 times a game. */
  ok('the rate is a real defense\'s rate', total / games > 0.9 && total / games < 1.9,
    { perGame: (total / games).toFixed(2) });
  ok('every defender can make one', byMan.size === men.length,
    { made: [...byMan.keys()] });
  /* THE BUG THIS FILE EXISTS FOR. A pass rusher knocks it loose and a cover man picks it
     off, and the thin end of the roster follows its position rather than a shared fallback:
     the nose tackle and the tackling corner have nothing in either column and must still
     part company, or the columns were never driving this at all. */
  ok('a pass rusher mostly knocks it loose', share('Rush End') < 0.35,
    { intShare: share('Rush End') });
  ok('a cover man mostly picks it off', share('Cover Safety') > 0.7,
    { intShare: share('Cover Safety') });
  ok('and a thin line still splits on position, not on one shared fraction',
    share('Nose Man') < 0.35 && share('Corner') > 0.6,
    { nose: share('Nose Man'), corner: share('Corner') });
  ok('a linebacker does both', share('Mike Backer') > 0.3 && share('Mike Backer') < 0.8,
    { intShare: share('Mike Backer') });
  /* Production still decides how often, not just how. */
  const count = (n2) => { const m = byMan.get(n2); return m ? m.INTERCEPTION + m.FUMBLE : 0; };
  ok('the man having the bigger game makes more of them',
    count('Rush End') > count('Nose Man'),
    { rushEnd: count('Rush End'), noseMan: count('Nose Man') });
}

/* ── the return ──────────────────────────────────────────────────────────── */
console.log('\n=== and what happens after the ball changes hands ===');
{
  const men = [
    { name: 'Rush End', pos: 'DL', slot: 'DL', pts: 18, avg: 18, rush: 10.1, cover: 1.6, tackle: 7.3 },
    { name: 'Mike Backer', pos: 'LB', slot: 'LB', pts: 14, avg: 14, rush: 1.2, cover: 2.0, tackle: 9.0 },
    { name: 'Cover Safety', pos: 'DB', slot: 'DB', pts: 13, avg: 13, rush: 0.2, cover: 7.4, tackle: 5.1 },
  ];
  /* Real scripts, because a return touchdown is not invented: it is one of the touchdowns
     the game already scored, handed to the man who produced it. A script with none of yours
     in it must produce no return touchdowns at all, which is the second half of this. */
  let takeaways = 0, tds = 0, games = 6000, longRet = 0, retSum = 0, bad = 0;
  let sameClock = 0, doubleClaimed = 0, offScript = 0, noRet = 0;
  const kinds = new Map(), tdKinds = new Map();
  for (let g = 0; g < games; g++) {
    const seed = 'ret' + g;
    const script = E.scoringScript(24, 20, E.createSeededRNG(E.hashSeed(seed)));
    const evs = E.takeawayScript(men, E.createSeededRNG(E.hashSeed(seed + '|c')), { script });
    const claimed = new Set();
    for (const t of evs) {
      takeaways++;
      kinds.set(t.kind, (kinds.get(t.kind) || 0) + 1);
      if (!(t.ret >= 0 && t.ret <= 80)) bad++;
      if (t.ret == null) noRet++;
      retSum += t.ret;
      if (t.ret >= 10) longRet++;
      if (!t.td) continue;
      tds++;
      tdKinds.set(t.kind, (tdKinds.get(t.kind) || 0) + 1);
      const e = script[t.at];
      /* THE TOUCHDOWN IT CLAIMS HAS TO BE ONE OF YOURS, and the takeaway has to have moved
         onto its clock, or the screen shows a pick six at 9:40 and the seven points at
         7:12. */
      if (!e || e.team !== 'you' || e.kind !== 'TOUCHDOWN') offScript++;
      else if (e.q !== t.q || e.sec !== t.sec || e.clock !== t.clock) sameClock++;
      if (claimed.has(t.at)) doubleClaimed++;
      claimed.add(t.at);
    }
  }
  ok('every takeaway is returned some distance, none of them absurd', bad === 0 && noRet === 0,
    { outOfRange: bad, missing: noRet });
  ok('most die where they were made, and some do not',
    longRet / takeaways > 0.25 && longRet / takeaways < 0.65,
    { overTenYards: (longRet / takeaways * 100).toFixed(1) + '%',
      average: (retSum / takeaways).toFixed(1) });
  ok('a return touchdown always lands on one of YOUR touchdowns', offScript === 0, { offScript });
  ok('and the takeaway moves onto its clock, because it is one play', sameClock === 0, { sameClock });
  ok('and no two of them claim the same score', doubleClaimed === 0, { doubleClaimed });
  /* Often enough to be an event, rare enough to stay one. A real defense scores about once
     every eight or nine games. */
  const perGame = tds / games;
  ok('they happen about as often as a real defense scores',
    perGame > 0.06 && perGame < 0.2,
    { oneEvery: (1 / perGame).toFixed(1) + ' games', share: (tds / takeaways * 100).toFixed(1) + '%' });
  /* A pick six is the commoner of the two, as it is in the real game. */
  const pick = tdKinds.get('INTERCEPTION') || 0, scoop = tdKinds.get('FUMBLE') || 0;
  ok('a pick six outnumbers a scoop and score', pick > scoop && scoop > 0, { pick, scoop });

  /* AND WITHOUT A SCRIPT, NOTHING IS A TOUCHDOWN. The box score builds credits with nothing
     to pin them to, and a takeaway that called itself a touchdown there would be seven
     points that appear on no scoreboard. */
  let loose = 0, looseN = 0;
  for (let g = 0; g < 2000; g++) {
    for (const t of E.takeawayScript(men, E.createSeededRNG(E.hashSeed('bare' + g)))) {
      looseN++; if (t.td) loose++;
    }
  }
  ok('with no game to pin it on, no takeaway claims a touchdown',
    loose === 0 && looseN > 0, { claimed: loose, of: looseN });
  /* A game your side never scored in cannot produce one either. */
  const shutout = E.scoringScript(0, 21, E.createSeededRNG(E.hashSeed('shutout')));
  let inShutout = 0;
  for (let g = 0; g < 2000; g++) {
    for (const t of E.takeawayScript(men, E.createSeededRNG(E.hashSeed('sh' + g)), { script: shutout })) {
      if (t.td) inShutout++;
    }
  }
  ok('and neither can a game you were shut out of', inShutout === 0, { inShutout });
}

/* ── both sides of a Challenge Bowl ──────────────────────────────────────── */
console.log('\n=== the Bowl names both teams ===');
{
  /* A season's opponent is a historic team modelled as a team rather than as players, so
     only your six can ever be named. In the Bowl a person drafted each side, and the other
     team's touchdowns deserve a name every bit as much as yours. */
  const mine = [
    { name: 'My Back', pos: 'RB', slot: 'RB', pts: 15, avg: 15, pass: 0, rush: 13, rec: 2 },
    { name: 'My Wideout', pos: 'WR', slot: 'WR', pts: 14, avg: 14, pass: 0, rush: 0, rec: 13 },
    { name: 'My Arm', pos: 'QB', slot: 'QB', pts: 22, avg: 22, pass: 21, rush: 0.5, rec: 0 },
  ];
  const theirs = [
    { name: 'Their Back', pos: 'RB', slot: 'RB', pts: 15, avg: 15, pass: 0, rush: 13, rec: 2 },
    { name: 'Their Wideout', pos: 'WR', slot: 'WR', pts: 14, avg: 14, pass: 0, rush: 0, rec: 13 },
    { name: 'Their Arm', pos: 'QB', slot: 'QB', pts: 22, avg: 22, pass: 21, rush: 0.5, rec: 0 },
  ];
  let mineOnYou = 0, mineOnThem = 0, theirsOnThem = 0, theirsOnYou = 0, youTD = 0, themTD = 0;
  for (let g = 0; g < 1200; g++) {
    const script = E.scoringScript(28, 24, E.createSeededRNG(E.hashSeed('b' + g)));
    script.forEach((e) => { if (e.kind === 'TOUCHDOWN') { if (e.team === 'you') youTD++; else themTD++; } });
    const rng = E.createSeededRNG(E.hashSeed('c' + g));
    for (const c of E.touchdownCredits(script, mine, rng)) {
      if (script[c.at].team === 'you') mineOnYou++; else mineOnThem++;
    }
    for (const c of E.touchdownCredits(script, theirs, rng, { team: 'them' })) {
      if (script[c.at].team === 'them') theirsOnThem++; else theirsOnYou++;
    }
  }
  ok('your men are credited with your touchdowns and only yours',
    mineOnYou === youTD && mineOnThem === 0, { onYours: mineOnYou, yourTDs: youTD, strayed: mineOnThem });
  ok('and the opponent\'s men with theirs',
    theirsOnThem === themTD && theirsOnYou === 0, { onTheirs: theirsOnThem, theirTDs: themTD, strayed: theirsOnYou });
  ok('so every touchdown in the game has a name on it', youTD > 0 && themTD > 0,
    { you: youTD, them: themTD });
}

/* ── the Bowl's roster filter ────────────────────────────────────────────── */
console.log('\n=== a defence cannot score in the Bowl ===');
{
  /* bowlMen lives in index.html, so it comes out of the page rather than being retyped, the
     same way test_drives.mjs takes generateDrives. */
  const html = fs.readFileSync(`${ROOT}/football/index.html`, 'utf8');
  const i = html.indexOf('function bowlMen(roster){');
  const j = html.indexOf('\n}\n', i) + 3;
  const BOWL_SCORERS = new Set(['QB', 'RB', 'WR', 'TE']);
  const bowlMen = eval('(' + html.slice(i, j).replace('function bowlMen', 'function') + ')');

  const defence = [
    { name: 'Rush End', position: 'DL', ppr_ppg_mean: 19, rush_ppg: 10.1, cover_ppg: 1.6, tackle_ppg: 7.3 },
    { name: 'Corner', position: 'DB', ppr_ppg_mean: 12, rush_ppg: 0, cover_ppg: 6, tackle_ppg: 4 },
  ];
  const offence = [
    { name: 'A Back', position: 'RB', ppr_ppg_mean: 15, pass_ppg: 0, rush_ppg: 13, rec_ppg: 2 },
    { name: 'A Passer', position: 'QB', ppr_ppg_mean: 22, pass_ppg: 21, rush_ppg: 0.5, rec_ppg: 0 },
  ];
  /* THE GUARD, AND WHY IT IS ONE. A defender carries rush_ppg too and it means his PASS
     RUSH, while the credit weight adds rushing to receiving. Without the filter a defensive
     roster reaching this screen would hand touchdowns to defensive ends on the strength of
     their sack numbers, which is a sentence the game would say with a straight face. */
  ok('a defensive roster produces no scorers at all', bowlMen(defence).length === 0,
    bowlMen(defence).map((m) => m.name));
  ok('and an offensive one produces all of them', bowlMen(offence).length === 2,
    bowlMen(offence).map((m) => m.name + ' ' + m.pos));
  const men = bowlMen(offence);
  ok('with the production mix carried across',
    men.every((m) => m.pts === m.avg) && men[1].pass === 21 && men[0].rush === 13,
    men.map((m) => [m.name, m.pts, m.avg, m.pass, m.rush, m.rec]));
  /* A defence handed straight to the credits, with no filter in front, is exactly the thing
     the filter prevents; this says the danger is real rather than theoretical. */
  const unfiltered = E.touchdownCredits(
    E.scoringScript(28, 21, E.createSeededRNG(E.hashSeed('g'))),
    defence.map((p) => ({ name: p.name, pos: p.position, slot: p.position,
      pts: p.ppr_ppg_mean, avg: p.ppr_ppg_mean, pass: 0, rush: p.rush_ppg, rec: 0 })),
    E.createSeededRNG(E.hashSeed('h')));
  ok('(and unfiltered, a defensive end really would score)', unfiltered.length > 0,
    unfiltered.slice(0, 1).map((c) => c.blurb));
}

/* ── the kicks ───────────────────────────────────────────────────────────── */
console.log('\n=== field goals carry a distance ===');
{
  let kicks = 0, fgs = 0, missing = 0;
  const all = [];
  for (let g = 0; g < 4000; g++) {
    const script = E.scoringScript(23, 20, E.createSeededRNG(E.hashSeed('k' + g)));
    const d = E.fieldGoalDistances(script, E.createSeededRNG(E.hashSeed('m' + g)));
    script.forEach((e, i) => {
      if (e.kind === 'FIELD GOAL') { fgs++; if (d.has(i)) { kicks++; all.push(d.get(i)); } else missing++; }
      else if (d.has(i)) missing++;   // a distance on something that is not a kick
    });
  }
  all.sort((a, b) => a - b);
  const med = all[Math.floor(all.length / 2)];
  const pct = (lo, hi) => all.filter((y) => y >= lo && y <= hi).length / all.length;
  ok('every field goal in a script gets one, and nothing else does',
    missing === 0 && kicks === fgs && fgs > 1000, { fieldGoals: fgs, withDistance: kicks, wrong: missing });
  /* The legal range. A kick is snapped seven yards back and the posts are ten deep, so an
     18 yarder is a ball on the one: anything shorter is not a field goal, it is a mistake. */
  ok('no kick is shorter than a ball on the one or longer than the record',
    all[0] >= 18 && all[all.length - 1] <= 63, { shortest: all[0], longest: all[all.length - 1] });
  /* Real NFL kicks cluster in the forties. A median in the twenties would mean the game
     thinks every drive stalls at the edge of the red zone. */
  ok('the median kick is a real one', med >= 36 && med <= 44, { median: med });
  ok('the long kick is ordinary but not routine', pct(50, 63) > 0.12 && pct(50, 63) < 0.32,
    { fiftyPlus: pct(50, 63).toFixed(3) });
  ok('and the chip shot is uncommon', pct(18, 24) < 0.16, { under25: pct(18, 24).toFixed(3) });
  /* The banner reads it live and the log reads it again on the replay, both by index, so a
     game that showed 48 yards must not say 31 afterwards. */
  const s1 = E.scoringScript(23, 20, E.createSeededRNG(E.hashSeed('same')));
  const a = [...E.fieldGoalDistances(s1, E.createSeededRNG(E.hashSeed('d'))).entries()].join('|');
  const b2 = [...E.fieldGoalDistances(s1, E.createSeededRNG(E.hashSeed('d'))).entries()].join('|');
  ok('the call and the replay agree on the same kick', a === b2 && a.length > 0, { map: a });
}

/* ── the kick against the picture of it ──────────────────────────────────── */
console.log('\n=== the distance matches the drive chart above it ===');
{
  /* generateDrives lives in index.html, so it comes out of the page rather than being
     retyped, the same way test_drives.mjs takes it. The page derives the distance from the
     drive; this checks the two cannot disagree, because they are on screen together and the
     chart is what the player is watching while the call is up. */
  const html = fs.readFileSync(`${ROOT}/football/index.html`, 'utf8');
  const i = html.indexOf('function generateDrives(script,rng){');
  const j = html.indexOf('\n}\n', html.indexOf('return drives;', i)) + 3;
  const generateDrives = eval('(' + html.slice(i, j).replace('function generateDrives', 'function') + ')');
  const cal = JSON.parse(fs.readFileSync(`${ROOT}/football/data/display_calibration.json`, 'utf8'));

  const rng = E.createSeededRNG(4242);
  const all = [];
  let disagree = 0, kicks = 0, noDrive = 0, tagged = 0;
  for (let g = 0; g < 4000; g++) {
    const [hi, lo] = cal.real_pairs[Math.floor(rng() * cal.real_pairs.length)];
    const you = rng() < 0.5 ? hi : lo, them = you === hi ? lo : hi;
    const script = E.scoringScript(you, them, rng);
    const drives = generateDrives(script, E.createSeededRNG(Math.floor(rng() * 1e9)));
    const fg = E.fieldGoalDistances(script, E.createSeededRNG(Math.floor(rng() * 1e9)));
    /* Exactly what playPlayoffGame does. */
    for (const d of drives) {
      if (d.result !== 'field goal' || d.at == null) continue;
      tagged++;
      const out = d.team === 'you' ? 100 - d.endYard : d.endYard;
      fg.set(d.at, Math.max(18, Math.min(63, Math.round(out) + 17)));
    }
    const byIndex = new Map();
    for (const d of drives) if (d.result === 'field goal' && d.at != null) byIndex.set(d.at, d);
    script.forEach((e, k) => {
      if (e.kind !== 'FIELD GOAL') return;
      kicks++;
      const y = fg.get(k);
      all.push(y);
      const d = byIndex.get(k);
      if (!d) { noDrive++; return; }
      const out = d.team === 'you' ? 100 - d.endYard : d.endYard;
      if (y !== Math.max(18, Math.min(63, Math.round(out) + 17))) disagree++;
    });
  }
  all.sort((a2, b2) => a2 - b2);
  const med = all[Math.floor(all.length / 2)];
  const pct = (lo2, hi2) => all.filter((y) => y >= lo2 && y <= hi2).length / all.length;
  ok('every kick the chart drew is called at the distance the chart drew it',
    disagree === 0 && tagged > 5000, { kicks, drawn: tagged, disagreed: disagree });
  /* A kick whose drive was never drawn still has to say something. That is the fallback and
     it is a real path: a score inside five seconds of the next one is resolved without a
     drive at all. If this ever hits zero the fallback has become dead code and should go. */
  ok('and a kick with no drive behind it still gets a distance',
    noDrive > 0 && noDrive < kicks * 0.2, { withoutDrive: noDrive, of: kicks });
  /* The whole point of drawing the distance first and the yard line from it. Reading the old
     chart back gave a median of 48 and 41% from fifty plus, which is not a league. */
  ok('the kicks a real game produces, once the chart is the source',
    med >= 36 && med <= 44 && pct(50, 63) > 0.12 && pct(50, 63) < 0.30 && pct(18, 24) > 0.05,
    { median: med, fiftyPlus: pct(50, 63).toFixed(3), short: pct(18, 24).toFixed(3) });
}

/* ── determinism ─────────────────────────────────────────────────────────── */
console.log('\n=== the same game always reads the same way ===');
{
  const { run } = playSeason(false, 7);
  const r = run.season.results.find((x) => x.lines);
  const a = creditsFor(7, r, false).map((c) => c.blurb).join('|');
  const b = creditsFor(7, r, false).map((c) => c.blurb).join('|');
  ok('a re-render of the same game gives the same names and words', a === b && a.length > 0,
    { blurbs: a.slice(0, 90) });
  const { run: dRun } = playSeason(true, 7);
  const dr = dRun.season.results.find((x) => x.lines);
  ok('and the same on a defense',
    JSON.stringify(creditsFor(7, dr, true)) === JSON.stringify(creditsFor(7, dr, true)));
}

/* ── the copy ────────────────────────────────────────────────────────────── */
console.log('\n=== the words themselves ===');
{
  const lines = playSeason(false, 42).run.season.results.find((r) => r.lines).lines;
  const men = playSeason(true, 42).run.season.results.find((r) => r.lines).lines;
  const blurbs = [], shorts = [];
  const tds = [];
  for (let g = 0; g < 2500; g++) {
    const script = E.scoringScript(31, 24, E.createSeededRNG(E.hashSeed('w' + g)));
    for (const c of E.touchdownCredits(script, lines, E.createSeededRNG(E.hashSeed('v' + g)))) {
      blurbs.push(c.blurb); shorts.push(c.short); tds.push(c);
    }
    /* WITH the script, so the return and return-touchdown forms are in this sample too.
       Without it they never appear, and copy that never reaches a checker is copy that
       breaks the rule the first time somebody reads it out loud. */
    for (const t of E.takeawayScript(men, E.createSeededRNG(E.hashSeed('u' + g)), { script })) {
      blurbs.push(t.blurb); shorts.push(t.short);
    }
  }
  /* The repo's hard rule, applied to text that is generated rather than typed: a checker
     that reads source files can never see a string built at runtime out of templates.
     ASSEMBLED FROM ESCAPES, because scripts/check-dashes.mjs reads this file too and a
     literal en dash here would fail the very rule it is here to enforce. */
  const EN = String.fromCharCode(0x2013), EM = String.fromCharCode(0x2014), AMP = '&';
  const DASH = new RegExp('[' + EN + EM + ']|' + AMP + 'mdash;|' + AMP + 'ndash;|' + AMP + '#821[12];');
  ok('no blurb contains a dash', !blurbs.some((b) => DASH.test(b)),
    blurbs.filter((b) => DASH.test(b)).slice(0, 3));
  ok('and neither does a log line', !shorts.some((s) => DASH.test(s)),
    shorts.filter((s) => DASH.test(s)).slice(0, 3));
  /* A goal-line verb on a long run is the kind of wrong that reads as broken rather than
     as random, so the phrasing bands are asserted rather than eyeballed. */
  const shortVerb = /punches it in|powers in|behind his line|in the corner/;
  const longVerb = /breaks away|to the house|untouched|behind the secondary|takes the top off/;
  const badShort = tds.filter((c) => c.yards > 20 && shortVerb.test(c.blurb));
  const badLong = tds.filter((c) => c.yards <= 5 && longVerb.test(c.blurb));
  ok('no goal-line verb on a long score', badShort.length === 0,
    badShort.slice(0, 3).map((c) => c.yards + ': ' + c.blurb));
  ok('and nothing breaks away from the one yard line', badLong.length === 0,
    badLong.slice(0, 3).map((c) => c.yards + ': ' + c.blurb));
  ok('every blurb names its man', tds.every((c) => c.blurb.includes(c.scorer)),
    tds.filter((c) => !c.blurb.includes(c.scorer)).slice(0, 3));
  /* Variety, because four touchdowns in a game reading the same sentence four times is the
     failure mode a template set exists to avoid. */
  const distinct = new Set(blurbs).size;
  ok('the phrasing varies', distinct > 40, { distinct, of: blurbs.length });
  console.log('  e.g. ' + blurbs.slice(0, 3).join('\n       '));
}

/* ── the kick against the PIXELS of the picture ──────────────────────────────
   Everything above this reasons about d.endYard, which is the number both the call and the
   chart are supposed to come from. That is an argument about the code. This is the
   measurement: draw the chart as it ships, read the bar off the canvas, convert where it
   stops back into a kick, and check the game would have called that number.

   It matters because "the chart draws endYard" is only true for a FINISHED drive. The
   renderer interpolates one that is still running, and the call lands exactly on the
   boundary. If that ever moved by a frame the bar on screen and the number under it would
   part company, and no assertion about the data would notice.

     BROWSER=1 node football/build/test/test_credits.mjs
   with a server on :8081. */
if (process.env.BROWSER) {
  console.log('\n=== the kick, measured off the drawn chart ===');
  const { chromium } = await import('playwright');
  const HOST = process.env.HOST || 'http://localhost:8081';
  const PROBE = `${ROOT}/football/__test_credits.html`;
  /* drawDriveChart is nested in the page's one script, so it is reached the same way every
     harness for this page reaches anything: one hook at the boot() anchor. */
  const HOOK = `
window.__CR={
  /* Draw a chart of exactly these drives and measure where the last bar stops, in yards.
     The geometry is recomputed from drawDriveChart's own constants rather than guessed. */
  measure(drives,upTo){
    const W=680,H=210,dpr=window.devicePixelRatio||1;
    const c=document.createElement('canvas'); c.width=W; c.height=H;
    const ctx=c.getContext('2d',{willReadFrequently:true});
    const YOU='#00aaff', THEM='#ff5522';
    drawDriveChart(ctx,W,H,drives,upTo,YOU,THEM,'YOU','OPP');
    const padL=4*dpr,padT=10*dpr,padB=14*dpr;
    const fw=W-padL-4*dpr, fh=H-padT-padB;
    const ezW=Math.round(fw*0.06), pfL=padL+ezW, pfW=fw-ezW*2;
    const visible=drives.filter(d=>d.tStart<=upTo);
    const shown=visible.slice(Math.max(0,visible.length-7));
    const rowH=fh/7, i=shown.length-1;
    const y=Math.round(padT+i*rowH+rowH/2);
    const px=ctx.getImageData(0,y,W,1).data;
    const want=(hex)=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
    const team=shown[i].team==='you'?want(YOU):want(THEM);
    /* The bar carries a light-to-dark sheen and sits at 0.92 alpha over dark green, so a
       pixel is "the bar" by being nearer the team colour than the field is, not by equalling
       it. The arrow tip at the leading edge is the same colour and is deliberately included:
       it is part of what a player sees as the end of the drive. */
    const near=(o)=>{const dr=px[o]-team[0],dg=px[o+1]-team[1],db=px[o+2]-team[2];
      return Math.sqrt(dr*dr+dg*dg+db*db)<110;};
    let lo=-1,hi=-1;
    for(let x=0;x<W;x++){ if(near(x*4)){ if(lo<0)lo=x; hi=x; } }
    if(lo<0) return {found:false,row:y};
    const edge=shown[i].team==='you'?hi:lo;
    return {found:true,yards:(edge-pfL)/pfW*100,row:y,lo,hi,
      endYard:shown[i].endYard,team:shown[i].team};
  },
};
boot();`;
  const src = fs.readFileSync(`${ROOT}/football/index.html`, 'utf8');
  if (src.split('\nboot();').length !== 2) throw new Error('the boot() anchor moved; update this file');
  fs.writeFileSync(PROBE, src.replace('\nboot();', HOOK));
  const br = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  try {
    const p = await br.newPage();
    p.on('pageerror', (e) => { bad++; console.log(' FAIL  page error   ' + String(e.message).split('\n')[0]); });
    await p.goto(`${HOST}/football/__test_credits.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.__CR, null, { timeout: 60000 });

    /* One kick per case, at both ends of the range and on both sides of the ball, plus a
       drive in front of it so the bar being measured is not also the first row. */
    const cases = [
      { tag: 'a 20 yard chip shot', team: 'you', startYard: 62, endYard: 97 },
      { tag: 'a 31 yarder', team: 'you', startYard: 40, endYard: 86 },
      { tag: 'a 52 yarder', team: 'you', startYard: 28, endYard: 65 },
      { tag: 'a 60 yarder from distance', team: 'you', startYard: 20, endYard: 57 },
      { tag: 'the opponent from 24', team: 'them', startYard: 70, endYard: 7 },
      { tag: 'the opponent from 49', team: 'them', startYard: 80, endYard: 32 },
    ];
    for (const c of cases) {
      const drives = [
        { team: c.team === 'you' ? 'them' : 'you', startYard: 50, endYard: 50, result: 'punt', tStart: 0, tEnd: 100 },
        { team: c.team, startYard: c.startYard, endYard: c.endYard, result: 'field goal', tStart: 100, tEnd: 400, at: 0 },
      ];
      const m = await p.evaluate(([d, u]) => window.__CR.measure(d, u), [drives, 400]);
      /* What the page would say, from the same drive. */
      const out = c.team === 'you' ? 100 - c.endYard : c.endYard;
      const called = Math.max(18, Math.min(63, Math.round(out) + 17));
      const drawnOut = m.found ? (c.team === 'you' ? 100 - m.yards : m.yards) : null;
      const drawnKick = m.found ? drawnOut + 17 : null;
      ok(c.tag + ': the bar stops where the call says it did',
        m.found && Math.abs(drawnKick - called) <= 2.2,
        { called, measuredOffCanvas: m.found ? +drawnKick.toFixed(1) : 'no bar found', endYard: c.endYard });
    }
    /* And the boundary the whole thing turns on: at the instant the call is made, the drive
       is finished rather than part drawn. A frame early and the bar is short of where the
       number says the kick was taken from. */
    const drives = [
      { team: 'them', startYard: 50, endYard: 50, result: 'punt', tStart: 0, tEnd: 100 },
      { team: 'you', startYard: 40, endYard: 86, result: 'field goal', tStart: 100, tEnd: 400, at: 0 },
    ];
    const atCall = await p.evaluate((d) => window.__CR.measure(d, 400), drives);
    const midDrive = await p.evaluate((d) => window.__CR.measure(d, 250), drives);
    ok('the drive is complete at the moment the call is made, not still running',
      Math.abs((100 - atCall.yards) + 17 - 31) <= 2.2
      && (100 - midDrive.yards) + 17 > 31 + 4,
      { atTheCall: +((100 - atCall.yards) + 17).toFixed(1),
        halfway: +((100 - midDrive.yards) + 17).toFixed(1) });
    await p.close();
  } finally {
    await br.close();
    if (fs.existsSync(PROBE)) fs.unlinkSync(PROBE);
  }
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
