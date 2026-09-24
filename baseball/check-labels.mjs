#!/usr/bin/env node
/*
 * What a player-season row SAYS it is.
 * =====================================
 * Three things in the pool are true about the data and false about what a
 * reader assumes, and all three render perfectly:
 *
 *   TOT        Baseball-Reference's combined row for a man who played for more
 *              than one club that year. The WAR on it is his whole season and
 *              agrees with bbref's own total line, so the NUMBER is right and
 *              the three-letter code means nothing to anybody.
 *   two-way    A season split into a batting row and a pitching row, because a
 *              draft has to put a man in one slot. Each row's WAR is therefore
 *              half of what a lookup returns for that season.
 *   the source bWAR, not fWAR. The two disagree by 0.5 to 2.0 routinely.
 *
 * None of that throws, fails a test or looks wrong on screen. The only symptom
 * is a reader checking one of our numbers against a lookup, finding a different
 * one, and having nothing on the page to tell them why. That is what this file
 * guards, and it guards the COVERAGE as much as the labels: a new surface that
 * prints a raw club code is the way this comes back.
 *
 *   node baseball/check-labels.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const players = JSON.parse(fs.readFileSync(path.join(DIR, 'data/players.json'), 'utf8'));

let failures = 0;
function claim(ok, what, detail) {
  if (ok) { console.log(`  ok    ${what}`); return; }
  failures++;
  console.log(`  FAIL  ${what}${detail ? `\n        ${detail}` : ''}`);
}

/* ── 1. the engine marks exactly the two-way seasons ───────────────────────── */
console.log('\n1. Two-way seasons are marked, and only those');

globalThis.window = globalThis;
await import(path.join(DIR, 'engine.js'));
await import(path.join(DIR, 'run.js'));
const R = window.RTD_RUN;
const E = window.RTD_ENGINE;
R.indexData(players);

/* Derived independently of the engine, or the check is the engine agreeing
   with itself. */
const roles = new Map();
for (const p of players) {
  const k = `${p.i}|${p.s}`;
  if (!roles.has(k)) roles.set(k, new Set());
  roles.get(k).add(p.r);
}
const expect = new Set([...roles].filter(([, v]) => v.size > 1).map(([k]) => k));
const marked = players.filter(p => p.half);
const markedSeasons = new Set(marked.map(p => `${p.i}|${p.s}`));

claim(expect.size > 0, 'the pool contains two-way seasons at all',
  'a check with nothing to find passes without asserting anything');
claim(markedSeasons.size === expect.size &&
      [...expect].every(k => markedSeasons.has(k)),
  `every two-way season is marked and nothing else is (${expect.size} seasons)`,
  `marked ${markedSeasons.size}, expected ${expect.size}`);
claim(marked.every(p => p.half === (p.r === 'b' ? 'batting' : 'pitching')),
  'each row is marked with its own side of the ball');
claim(marked.length === expect.size * 2,
  'both halves of every two-way season carry a mark',
  `${marked.length} rows for ${expect.size} seasons`);

const ohtani = players.find(p => p.n === 'Shohei Ohtani' && p.s === 2023 && p.r === 'p');
claim(ohtani && ohtani.half === 'pitching',
  "Ohtani's 2023 pitching row knows it is the pitching half");

/* ── 2. the page's own renderers, lifted rather than copied ────────────────── */
console.log('\n2. What the page prints for a club');

/* Brace-matched out of index.html. Never a second implementation: a copy of the
   arithmetic agrees with itself forever. */
function lift(name) {
  const at = html.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`check-labels: no function ${name} in index.html`);
  let depth = 0;
  for (let k = html.indexOf('{', at); k < html.length; k++) {
    if (html[k] === '{') depth++;
    else if (html[k] === '}' && --depth === 0) return html.slice(at, k + 1);
  }
  throw new Error(`check-labels: unbalanced braces in ${name}`);
}
const namesBlock = html.slice(html.indexOf('const TEAM_NAMES={'), html.indexOf('function teamFullName'));
claim(/TOT:/.test(namesBlock), 'TEAM_NAMES carries a TOT entry to read the words from');

/* EVERY FUNCTION seasonLine LEANS ON, not just seasonLine. It was three names and
   is five, and this lift is what caught the change TWICE: splitting the row's
   facts into rowFacts and heavyIP left the old list resolving a ReferenceError at
   the first call, and so did offerMeta growing an offerWar under it. `E` is passed
   in because heavyIP reads ANCHOR_IP off the engine and offerWar reads
   workloadWar. */
const page = eval(`(function(E){const esc=s=>String(s);${namesBlock}${lift('clubTag')}${lift('halfTag')}${lift('heavyIP')}${lift('rowFacts')}${lift('seasonLine')}${lift('seasonText')}${lift('offerWar')}${lift('offerMeta')}return{clubTag,halfTag,heavyIP,rowFacts,seasonLine,seasonText,offerWar,offerMeta};})`)(E);

claim(page.clubTag('TOT') !== 'TOT' && page.clubTag('TOT').length > 3,
  'TOT is rendered as words, not as the code',
  `got ${JSON.stringify(page.clubTag('TOT'))}`);
claim(page.clubTag('NYY') === 'NYY',
  'a real club code is left exactly as it is');

/* ── A CLUB CODE IS NOT A CLUB WITHOUT A SEASON ────────────────────────────
   `BAL` in 1914 is the Federal League Baltimore Terrapins, and `BAL` from 1954
   is the Orioles, who are the St. Louis Browns moved and did not exist in 1914.
   teamFullName was keyed on the code alone, so the hero reel and the draw banner
   called that Terrapin side the Baltimore Orioles: a false statement about a
   real club, on a game whose whole pitch is that the history is real.
   DRIVEN THROUGH THE PAGE'S OWN FUNCTION, and both directions are asserted,
   because a fix that named every Baltimore team the Terrapins would satisfy a
   one-sided check perfectly. The third claim is the one that would have caught
   the bug this fix nearly introduced: `.map(teamFullName)` hands the callback an
   INDEX, which the new signature reads as a season, so the first decoy on every
   reel would have been named as of season 0. */
const nameFns = eval(`(function(E){${namesBlock}${lift('teamFullName')}return teamFullName;})`)(E);
claim(nameFns('BAL', 1914) === 'Baltimore Terrapins',
  'a 1914 Baltimore side is the Terrapins', `got ${JSON.stringify(nameFns('BAL', 1914))}`);
claim(nameFns('BAL', 1971) === 'Baltimore Orioles',
  'and a 1971 Baltimore side is still the Orioles', `got ${JSON.stringify(nameFns('BAL', 1971))}`);
claim(nameFns('BAL') === 'Baltimore Orioles',
  'a caller with no season gets the modern club, as every franchise surface does');
/* The pool's own rows, so this cannot pass on a code the game never draws. */
const balSeasons = [...new Set(players.filter(p => p.t === 'BAL').map(p => p.s))];
const misnamed = balSeasons.filter(s => (s < 1954) !== (nameFns('BAL', s) === 'Baltimore Terrapins'));
claim(misnamed.length === 0,
  `every Baltimore season in the pool is named for the club that played it (${balSeasons.length} seasons)`,
  `wrong on ${misnamed.join(', ')}`);
/* COVERAGE: the bug was one code today and the mechanism is general, so what is
   asserted is that no OTHER code silently needs this. A second collision arriving
   in the data should fail here rather than ship as a wrong club name. */
const codes = [...new Set(players.map(p => p.t))];
const ambiguous = codes.filter((c) => {
  const seasons = [...new Set(players.filter(p => p.t === c).map(p => p.s))];
  return new Set(seasons.map((s) => E.franchiseOf(c, s))).size > 1;
});
claim(ambiguous.length === 1 && ambiguous[0] === 'BAL',
  'and BAL is still the only code that means two different clubs',
  `ambiguous: ${ambiguous.join(', ') || 'none'}`);

const totRow = players.find(p => p.t === 'TOT');
claim(totRow && !/\bTOT\b/.test(page.seasonLine(totRow)),
  'a multi-club row never prints TOT on screen',
  totRow && page.seasonLine(totRow));
claim(ohtani && /pitching only/.test(page.seasonLine(ohtani)),
  'a two-way row says which half it is');
claim(!/only/.test(page.seasonLine(players.find(p => p.n === 'Babe Ruth' && p.s === 1923))),
  'an ordinary row says nothing extra');

/* The tightest surface is .of-side .mt: 10px nowrap with an ellipsis, about 28
   characters, and the WAR figure sits AFTER the club on that row. So a long
   label does not wrap, it eats the number the trade offer is about. This is a
   ceiling on the words, not on the data. */
const longest = players.reduce((a, p) => Math.max(a, page.seasonText(p).length), 0);
claim(longest <= 30, `the longest club line fits the narrowest field (${longest} chars)`,
  'shorten TEAM_NAMES.TOT rather than widening the field');

/* The offer row is the narrowest of the four and carries a WAR figure too, so
   all four facts do not fit on one line: measured in a real browser at 390px,
   `2023 LAA · pitching only · 3.8 WAR` truncates and eats the number. The note
   drops to a second line there. Asserted as a PROPERTY (the first line never
   carries the half, the second one does) rather than as a width, because a
   width measured in node is a width measured in the wrong font. */
const first = s => s.slice(0, s.indexOf('</span>'));
const twoWay = { ...ohtani };
claim(!/only/.test(first(page.offerMeta(twoWay))),
  "an offer's first line is the season, the club and the WAR, nothing else");
claim(/pitching only/.test(page.offerMeta(twoWay)),
  'and the two-way note is still on the row, on its own line');
claim(page.offerMeta({ n: 'x', s: 1923, t: 'NYY', w: 12.5 }).split('</span>').length === 2,
  'an ordinary offer grows no second line');
claim(page.halfTag(twoWay) && page.seasonLine(twoWay).includes(page.halfTag(twoWay)),
  'both layouts spell the two-way note the same way',
  'halfTag is the one source and seasonLine has to read it');

/* ── 3. coverage: nothing prints a club code the long way round ─────────────── */
console.log('\n3. Every surface goes through the renderer');

/* A label is only as good as the number of screens that use it, and the way
   this comes back is somebody adding a screen. A club code reaching the page
   has to be escaped on the way, so `esc(<something>.t)` is the shape to look
   for. The helpers are the one legitimate reader and are cut out first.
   `esc(t.t)` in the coaching takes is excluded BY THE RECEIVER: `t` there is a
   take, and its `.t` is the sentence rather than a club. Excluding it by name
   is the weak part of this scan, so the take list is asserted to still be
   what that name means. */
const helperSrc = lift('clubTag') + lift('halfTag') + lift('heavyIP') + lift('rowFacts')
  + lift('seasonLine') + lift('seasonText') + lift('tcPlate') + lift('offerMeta');
const scanned = html.split(helperSrc).join('');
const ESCAPED_CODE = /esc\(\s*([A-Za-z_$][\w.$]*)\.t\s*\)/g;
const strays = [...scanned.matchAll(ESCAPED_CODE)]
  .map(m => m[0])
  .filter(s => !/esc\(\s*t\.t\s*\)/.test(s));

claim(/ro-take[\s\S]{0,160}esc\(\s*t\.t\s*\)/.test(html),
  "the one excluded receiver is still the coach's takes, not a club",
  'if `t` stops meaning a take, this scan goes quiet on the real thing');
claim(new RegExp(ESCAPED_CODE.source).test(`'x'+esc(p.t)+'y'`),
  'the scanner recognises a raw club code at all',
  'a regex that matches nothing passes every assertion under it');
claim(strays.length === 0,
  'no surface prints a club code without going through clubTag',
  strays.length ? `found: ${[...new Set(strays)].join(' | ')}` : '');

/* THE CHAIN, not the call site. The renderers used to name clubTag themselves and
   now share a rowFacts that does, and reading each body for the word reported two
   correct functions as broken. Following the indirection is the fix rather than
   dropping the claim: what matters is that a club code cannot reach a screen
   without passing through clubTag, and the route is now one hop long. */
claim(/clubTag\(/.test(lift('rowFacts')), 'rowFacts() is where the club code goes through clubTag');
for (const fn of ['seasonLine', 'seasonText']) {
  claim(/rowFacts\(/.test(lift(fn)), `${fn}() builds its row from rowFacts`);
}
claim(/clubTag\(/.test(lift('tcPlate')), 'tcPlate() goes through clubTag');
/* And rowFacts is the ONLY thing they read it from, or a second list of facts is a
   second spelling of a row, which is the reason rowFacts exists. */
for (const fn of ['seasonLine', 'seasonText']) {
  claim(!/clubTag\(/.test(lift(fn)), `${fn}() does not keep a second copy of the club rule`);
}

/* Today this is belt and braces, and saying so is the point: a guard whose
   subject is unreachable rots quietly. Three filters keep TOT off every board,
   and if that ever stops being true the labels above are what stands between a
   reader and a three letter code that means nothing. */
const DATA = R.indexData(players);
const reachable = DATA.teamSeasons
  .filter(t => (DATA.byTeamSeason[t.team_season_id] || []).some(p => p.t === 'TOT'));
claim(reachable.length === 0,
  'no multi-club row is reachable from any spinnable roster today',
  'if this ever fails the labels start earning their keep, it is not a regression');

/* ── 4. the source is named where the number is read ───────────────────────── */
console.log('\n4. The draft screen says where the WAR comes from');

const draft = html.slice(html.indexOf('<div class="screen" id="s-draft">'),
                         html.indexOf('<div class="screen" id="s-squad">'));
claim(/Baseball-Reference/.test(draft),
  'the draft screen names Baseball-Reference');
claim(/FanGraphs/.test(draft),
  'and names the other real answer, which is the half that does the work');
claim(/Baseball-Reference/.test(fs.readFileSync(path.join(DIR, 'how-to-play.html'), 'utf8')),
  'how-to-play still names it too');

/* The runbook described a 50/50 FanGraphs blend that never ran. A document
   claiming a number the data does not have is worse than silence: the next
   person explains a mismatch with it. */
const runbook = fs.readFileSync(path.join(DIR, 'pipeline/DATA_RUNBOOK.md'), 'utf8');
claim(/never ran|bWAR and nothing else/i.test(runbook),
  'the runbook says the shipped pool is bWAR-only');

/* ── 5. the fourth reason, which was the one left unlabelled ───────────────── */
console.log('\n5. A starter priced on 210 innings says so');

/* build_positions.py scales a STARTER's WAR by min(1, ANCHOR_IP/ip) before pricing
   him and leaves relievers and batters alone, so a heavy workload makes the price
   on a tile disagree with the WAR beside it. The pipeline cannot be run from here
   (both WAR sources are refused by the sandbox's proxy), so the rule is verified
   against every shipped row instead, which is stronger: it is the data the game
   actually serves rather than the script that was supposed to have made it. */
const ANCHOR = E.CONSTANTS.ANCHOR_IP;
const price = (w) => Math.round(Math.max(1, 1.5 * Math.pow(Math.max(w, 0), 1.6)) * 10) / 10;
{
  let bad = null, discounted = 0, starters = 0;
  for (const r of players) {
    const isSP = r.r === 'p' && r.pp === 'SP' && r.ip > 0;
    if (isSP) starters++;
    const f = isSP ? Math.min(1, ANCHOR / r.ip) : 1;
    if (f < 0.999) discounted++;
    const want = price(r.w * f);
    if (Math.abs(want - r.p) > 0.1001 && !bad) bad = `${r.n} ${r.s}: w=${r.w} ip=${r.ip} pp=${r.pp} price=${r.p}, rule says ${want}`;
  }
  claim(!bad, `every one of the ${players.length} shipped rows reproduces from w, ip and pp`, bad);
  /* And the discount really bites, or the label below is dressing nothing. */
  claim(discounted > 500,
    `${discounted} starters of ${starters} are priced below their own WAR (${(100 * discounted / starters).toFixed(1)}%)`);
}

/* The label is on exactly those rows. Driven through the page's own heavyIP rather
   than a copy of the predicate, for the reason the rest of this file is written:
   a second implementation agrees with itself. */
{
  const src = html.slice(html.indexOf('function heavyIP('));
  const body = src.slice(0, src.indexOf('\n}') + 2);
  claim(/function heavyIP/.test(body), 'heavyIP is still in the page');
  const heavyIP = new Function('E', body + '\nreturn heavyIP;')(E);
  let wrong = null, tagged = 0;
  for (const r of players) {
    const want = r.r === 'p' && r.pp === 'SP' && r.ip > ANCHOR;
    const got = !!heavyIP(r);
    if (got) tagged++;
    if (got !== want && !wrong) wrong = `${r.n} ${r.s} (${r.pp}, ${r.ip} IP): tagged ${got}, should be ${want}`;
  }
  claim(!wrong, `the innings tag is on exactly the ${tagged} rows whose price it explains`, wrong);
  /* A batter and a reliever are never tagged, which is the half a loose predicate
     would get wrong and which no sample of one draft board would notice. */
  const bats = players.filter((r) => r.r === 'b' && heavyIP(r)).length;
  const pen = players.filter((r) => r.r === 'p' && r.pp !== 'SP' && heavyIP(r)).length;
  claim(bats === 0 && pen === 0, 'and never on a batter or a reliever, who are priced raw',
    `batters ${bats}, relievers ${pen}`);
}

/* The two surfaces that explain it, because a tag with nothing to explain it is a
   three letter code again. */
claim(new RegExp(String(ANCHOR) + ' innings').test(draft),
  'the draft screen says what the innings do to a price');
claim(new RegExp(String(ANCHOR) + ' innings').test(fs.readFileSync(path.join(DIR, 'how-to-play.html'), 'utf8')),
  'and how-to-play says it too');

/* ── 6. AND THE PRICE AND THE VALUE READ ONE WAR ───────────────────────────── */
console.log('\n6. At one price, a heavy arm is worth no more than a light one');

/* The label above is the half a reader sees. This is the half that decides the
   game, and it was wrong for as long as the label existed: the price was built
   on 210 innings and the ENGINE read the season line, so at equal price a heavy
   innings starter bought a better rotation ERA than a light one. Measured over
   the shipped pool it ran 0.04 to 0.07 of ERA in every band, which is a bargain
   nothing on any screen could report, because every figure involved was a true
   statement about a season.

   PER PRICE BAND, and it has to be: comparing heavy arms with light ones outright
   compares dear men with cheap ones and says nothing at all. */
{
  const era = (p) => {
    /* Driven through the engine's own staffEra rather than rebuilt here. The
       rest of the staff is identical in both arms, so the only thing that
       differs between two readings is the man in SP1. */
    const rest = [];
    for (const s of ['SP2', 'SP3', 'SP4', 'SP5']) rest.push({ _slot: s, w: 2, ip: 200, r: 'p', pp: 'SP' });
    for (const s of ['RP1', 'RP2', 'RP3', 'RP4', 'RP5', 'SU', 'CL']) rest.push({ _slot: s, w: 1, ip: 60, r: 'p', pp: 'RP' });
    return E.staffEra([{ ...p, _slot: 'SP1' }].concat(rest));
  };
  const sp = players.filter((p) => p.r === 'p' && p.pp === 'SP' && p.ip > 0);
  const mean = (a) => a.reduce((s, p) => s + era(p), 0) / a.length;
  let worst = -99, worstBand = null, bands = 0;
  for (const [lo, hi] of [[10, 20], [20, 30], [30, 999]]) {
    const inBand = sp.filter((p) => p.p >= lo && p.p < hi);
    const light = inBand.filter((p) => p.ip <= ANCHOR), heavy = inBand.filter((p) => p.ip > ANCHOR);
    if (light.length < 20 || heavy.length < 20) continue;
    bands++;
    const gap = mean(light) - mean(heavy);
    if (gap > worst) { worst = gap; worstBand = `$${lo}-${hi}M: ${gap.toFixed(3)} ERA`; }
  }
  /* The bottom band is deliberately out: under $10M the price floor packs
     thousands of men onto one figure, so "equal price" stops meaning equal. */
  claim(bands >= 3, `three price bands are deep enough to compare (${bands})`);
  claim(worst < 0.02, `a heavy arm's advantage at equal price is gone (worst ${worstBand})`,
    `was 0.044, 0.066 and 0.069 across these three bands before the engine read the same WAR the price did`);

  /* Coverage: the claim above passes trivially if this pool has no workhorses in
     the dear bands, which is exactly what it looked like from the trade sheet for
     as long as the offer projection dropped `ip`. */
  const dearHeavy = sp.filter((p) => p.p >= 20 && p.ip > ANCHOR).length;
  claim(dearHeavy > 100, `and there are ${dearHeavy} heavy arms priced over $20M to be wrong about`);
}

/* WHICH READING GOES WHERE, because the two are one edit from being swapped and
   nothing downstream would throw. teamStrength rates REAL clubs, who really did
   throw those innings, so it keeps the season line and the coefficient fitted to
   it; everything that rates a DRAFTED roster reads workloadWar and the
   coefficient fitted to that. Asked of the source, since both answers are valid
   numbers and no measurement of an output can tell which fit produced it. */
{
  const eng = fs.readFileSync(path.join(DIR, 'engine.js'), 'utf8');
  const body = (name) => {
    const i = eng.indexOf('function ' + name + '(');
    return i < 0 ? '' : eng.slice(i, eng.indexOf('\nfunction ', i + 1));
  };
  claim(/sp\.w \* 0\.32/.test(body('teamStrength')),
    'teamStrength still rates a real club on its own season line');
  for (const fn of ['rosterRunPrevention', 'staffEra', 'staffRunPrevention']) {
    claim(/workloadWar\(/.test(body(fn)), `${fn} reads workloadWar`);
    claim(!/\* 0\.32\b/.test(body(fn)), `and ${fn} does not carry the coefficient fitted to the season line`);
  }
}

/* ── 7. AN OFFER PROMISES WHAT IT DELIVERS ─────────────────────────────────── */
console.log('\n7. A trade offer is a subtraction the reader can do on screen');

/* The Trade Machine's whole offer is a better player for one of yours, and it
   was filtered and headlined on the season line while the season is played on
   workloadWar. Measured over 1,578 real offers, ONE IN FIVE advertised a gain
   that was really a loss or nothing, worst case "+5.2 WAR" for a swap worth
   -0.5. Nothing threw: every figure on the sheet was a true statement about a
   season, and the only symptom was a mode that made your team worse.

   Driven through the page's OWN offerWar rather than a copy of it, because a
   second implementation of a rounding rule agrees with itself. */
{
  const offerWar = page.offerWar;
  claim(typeof offerWar === 'function', 'offerWar is still in the page');
  const data = R.indexData(players);

  let offers = 0, notAGain = 0, seam = 0, heavySides = 0, sides = 0, fieldsOk = 0, worst = null;
  for (let i = 0; i < 40; i++) {
    const run = R.createRun({ seed: E.hashSeed('offer-check-' + i), tradeMachine: true });
    let ok = true;
    while (R.slotsLeft(run) > 0) {
      try { R.spin(run, data); } catch (_) { ok = false; break; }
      const opts = (run.currentDraw.options || []).map((k) => data.allPlayers[k]).filter(Boolean);
      const can = opts.filter((p) => R.canFinishAfter(run, p));
      if (!can.length) { ok = false; break; }
      const rem = R.remaining(run), left = R.slotsLeft(run);
      const lim = Math.max((rem / Math.max(1, left)) * 2.1, 6);
      const fit = can.filter((p) => p.p <= lim);
      try { R.sign(run, (fit.length ? fit : can).sort((a, b) => b.w - a.w)[0]); } catch (_) { ok = false; break; }
    }
    if (!ok) continue;
    for (const g of R.TRADE.WINDOWS) {
      let os = null;
      try { os = R.tradeOffers(run, data, g); } catch (_) {}
      for (const off of (os || [])) {
        offers++;
        const gain = offerWar(off.in) - offerWar(off.out);
        if (gain <= 0) {
          notAGain++;
          if (!worst || gain < worst.g) worst = { g: gain, t: `${off.out.n} ${off.out.s} to ${off.in.n} ${off.in.s}` };
        }
        /* The headline is this subtraction, so it can only be honest if the two
           rows it is drawn from are what was subtracted. */
        const printed = Number((offerWar(off.in) - offerWar(off.out)).toFixed(1));
        if (Math.abs(printed - Number(gain.toFixed(1))) > 1e-9) seam++;
        /* Against the ROW the side was projected from, because the pool itself
           holds 940 pitchers with no innings at all and a claim that every side
           carries one would be failing on the data rather than on the
           projection. `out` is a roster index, `in` is the offer's own key. */
        for (const [s, real] of [[off.out, run.roster[off.rosterIdx]], [off.in, data.allPlayers[off.key]]]) {
          sides++;
          if (real && s.r === real.r && s.pp === real.pp && s.ip === real.ip) fieldsOk++;
          if (s.r === 'p' && s.pp === 'SP' && s.ip > ANCHOR) heavySides++;
        }
      }
    }
  }
  claim(offers > 120, `the walk met ${offers} real offers`);
  claim(!notAGain, 'no offer advertises a gain that is not one',
    worst && `worst ${worst.g.toFixed(1)}: ${worst.t}; was 20.0% of offers before the filter read workloadWar`);
  claim(!seam, 'and the headline is the difference of the two figures printed beside it',
    `${seam} of ${offers} disagreed; 64 of 207 did before offerWar rounded first`);

  /* COVERAGE, ASKED OF THE PROJECTION AND NOT OF THE MIX. The real defect was
     that the offer sides are a flat projection which dropped `r`, `pp` and `ip`,
     so the page's own heavyIP answered no for every man alive and none of 2,274
     sides was ever tagged. Asked as a SHARE of offers that are heavy arms it
     would be measuring the mode's economics instead: a rotation upgrade at equal
     money cannot exist now that a starter's price is monotone in the figure he
     is valued on, so heavy sides are about 1% and a share threshold would either
     pass on nothing or fail on a correct page. What must be true is that the
     fields are THERE. */
  claim(fieldsOk === sides && sides > 0,
    `every one of the ${sides} offer sides carries the row's own role, position and innings`,
    `${sides - fieldsOk} disagreed with the row they were projected from, which is how the tag went quiet on all of them`);
  claim(heavySides > 0,
    `and ${heavySides} of them are heavy arms, so the tag has something to say`);
}

console.log(failures ? `\n${failures} failed.\n` : '\nAll checks passed.\n');
process.exit(failures ? 1 : 0);
