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

const page = eval(`(function(){const esc=s=>String(s);${namesBlock}${lift('clubTag')}${lift('halfTag')}${lift('seasonLine')}${lift('seasonText')}${lift('offerMeta')}return{clubTag,halfTag,seasonLine,seasonText,offerMeta};})()`);

claim(page.clubTag('TOT') !== 'TOT' && page.clubTag('TOT').length > 3,
  'TOT is rendered as words, not as the code',
  `got ${JSON.stringify(page.clubTag('TOT'))}`);
claim(page.clubTag('NYY') === 'NYY',
  'a real club code is left exactly as it is');

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
const helperSrc = lift('clubTag') + lift('halfTag') + lift('seasonLine') + lift('seasonText') + lift('tcPlate') + lift('offerMeta');
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

/* The two renderers the page actually calls both have to read it. */
for (const fn of ['seasonLine', 'seasonText', 'tcPlate']) {
  claim(/clubTag\(/.test(lift(fn)), `${fn}() goes through clubTag`);
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

console.log(failures ? `\n${failures} failed.\n` : '\nAll checks passed.\n');
process.exit(failures ? 1 : 0);
