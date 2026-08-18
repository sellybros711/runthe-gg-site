/* Who scored it, and who took it away.
 *
 *   node football/build/test/test_credits.mjs
 *
 * A drafted roster used to play twenty-one weeks without one of its six names being said.
 * The score went up, the drive chart drew a line into the end zone, and which of your
 * players did it was not on the screen anywhere. E.touchdownCredits puts a man on every
 * touchdown and E.takeawayScript does the same for Lockdown, where your offense is the
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
    for (const t of E.takeawayScript(men, E.createSeededRNG(E.hashSeed('u' + g)))) {
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

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
