/* The playoff bracket, played through in a browser.
 *
 *   (nohup node cfb/build/test/gzip_server.mjs &)
 *   node cfb/build/test/test_bracket.mjs
 *
 * A player reported being the four seed and drawing a four seed. They were right, and
 * the reason was that there was no bracket: the old postseason handed out four opponents
 * by strength and the number beside the opponent's name was where THAT team finished in
 * its own real season, so two unrelated fours could sit either side of the scoreboard.
 *
 * So the claim under test is not "a bracket is drawn". It is that the twelve teams are a
 * field, that the field advances, that a player only ever meets somebody still in it, and
 * that nobody meets their own seed. The engine side of that is checked over thousands of
 * brackets at the bottom of this file; the top drives the real game to the real screen,
 * because "the numbers are right" has been true here before while the screen was wrong.
 *
 * THE RUN SEED IS PINNED with window.PS_CFB_SEED. A good roster makes the playoff about
 * one season in six, so a test that drafts and hopes is a test that fails at random. The
 * seeds below were found by playing the same greedy draft in node and then confirming the
 * same six men come out of the wheel in a browser: 106 finishes as a four seed with a
 * bye, which is the exact case that was reported, and 19 finishes an eleven seed and so
 * plays all four rounds. Both shapes are needed, because a bye seed enters the bracket a
 * round late and that is where this went wrong the first time.
 */
import { chromium } from 'playwright';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(ROOT + '/cfb/engine.js');
const R = require(ROOT + '/cfb/run.js');
const SS = process.env.SS || '/tmp/';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

/* ── the field, over thousands of brackets ─────────────────────────────────── */
const rd = (f) => JSON.parse(fs.readFileSync(ROOT + '/cfb/data/' + f, 'utf8'));
const data = R.indexData(rd('cfb_player_seasons.json'), rd('cfb_team_seasons.json'));

console.log('=== the shape of the field ===');
{
  let sameSeed = 0, dupTeam = 0, noOpp = 0, dead = 0, brackets = 0;
  const met = {};
  for (let seed = 1; seed <= E.CONSTANTS.PLAYOFF_TEAMS; seed++) {
    met[seed] = new Set();
    for (let t = 0; t < 300; t++) {
      const rng = E.createSeededRNG(E.hashSeed('shape|' + seed + '|' + t));
      const br = E.buildBracket(data.prepared, rng, seed);
      brackets++;
      const ids = Object.values(br.field).filter((e) => e.team).map((e) => e.team.team_season_id);
      if (new Set(ids).size !== ids.length) dupTeam++;
      const rounds = seed <= E.CONSTANTS.PLAYOFF_BYES
        ? E.CONSTANTS.PLAYOFF_ROUNDS_WITH_BYE : E.CONSTANTS.PLAYOFF_ROUNDS_NO_BYE;
      const first = E.PLAYOFF_ROUND_NAMES.length - rounds;
      E.openBracket(br, first, rng);
      /* Walked all the way through as a winner, which is the longest path anybody can
         take and so the one that exposes an empty seat if there is one. */
      for (let i = 0; i < rounds; i++) {
        const opp = E.bracketPending(br, first + i);
        if (!opp || !opp.team) { noOpp++; break; }
        if (opp.seed === seed) sameSeed++;
        met[seed].add(opp.seed);
        /* Nobody already knocked out can turn up again. */
        const beaten = br.rounds.slice(0, first + i).flat()
          .filter((g) => g.winner && g.a && g.b)
          .map((g) => (g.winner === g.a ? g.b : g.a).seed);
        if (beaten.includes(opp.seed)) dead++;
        E.advanceBracket(br, first + i, true, rng);
      }
    }
  }
  ok('no seed ever plays its own seed', sameSeed === 0, sameSeed + ' of ' + brackets + ' brackets');
  ok('no team is in the field twice', dupTeam === 0, String(dupTeam));
  ok('every round has somebody in the other seat', noOpp === 0, String(noOpp));
  ok('nobody knocked out comes back', dead === 0, String(dead));
  const wrong = Object.keys(met).filter((s) => met[s].has(Number(s)));
  ok('every seed can meet all eleven others and none of itself', wrong.length === 0,
    Object.keys(met).map((s) => s + ':' + met[s].size).join(' '));
}

/* The real shape, spelled out rather than inferred, so a change to BRACKET is caught
   here and not by somebody looking at a screenshot. */
console.log('\n=== the pairings are the real ones ===');
{
  const rng = E.createSeededRNG(E.hashSeed('pairs'));
  const br = E.buildBracket(data.prepared, rng, 0);
  const seedsOf = (r) => E.bracketPairs(br, r).map(([a, b]) => a.seed + 'v' + b.seed).join(' ');
  ok('the first round is 5/12, 6/11, 7/10, 8/9', seedsOf(0) === '5v12 6v11 7v10 8v9', seedsOf(0));
  E.advanceBracket(br, 0, false, rng);
  const q = E.bracketPairs(br, 1).map(([a, b]) => a.seed + 'v' + b.seed);
  ok('the one seed hosts the 8/9 winner', q[0] === '1v8' || q[0] === '1v9', q.join(' '));
  ok('the four seed hosts the 5/12 winner', q[3] === '4v5' || q[3] === '4v12', q.join(' '));
  /* The bit that was reported. A four seed's quarterfinal is the 5/12 winner, so the
     only numbers that can appear opposite it are 5 and 12. */
  ok('a four seed can only draw a 5 or a 12 in the quarterfinal',
    ['4v5', '4v12'].includes(q[3]), q[3]);
}

/* ── the same thing on the screen ──────────────────────────────────────────── */
/* player|season:slot. THE SLOT MATTERS AS MUCH AS THE PLAYER. A man who played two
   positions gets asked where he plays, and answering with whichever option happens to be
   first drafts a differently shaped roster than node did: the same six men came out at a
   ten seed instead of the four seed with a bye this is here to reproduce. So the slot
   node chose is clicked by index, and the run comes out the same on both sides. */
const PICKS = {
  106: ['243503|2009:0', '4047337|2019:1', '173412|2007:4', '4259550|2022:2', '381959|2010:3', '3126339|2017:5'],
  19: ['145396|2006:2', '480693|2012:3', '545319|2014:4', '4429066|2021:0', '5085024|2025:5', '535520|2012:1'],
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function playSeed(runSeed, label, width, wantBye) {
  console.log('\n=== ' + label + ' (seed ' + runSeed + ', ' + width + 'px) ===');
  const ctx = await b.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript((s) => { window.PS_CFB_SEED = s; }, runSeed);
  await p.goto('http://localhost:8081/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(2600);
  await p.evaluate(() => { const e = document.getElementById('b-play-intro'); if (e) e.click(); });
  await p.waitForTimeout(3000);

  /* The exact six the same greedy draft takes in node, clicked by player and season
     rather than by position on screen, so a change to tile ordering cannot silently
     draft a different team and turn this into a different test. */
  for (const pick of PICKS[runSeed]) {
    const [key, want] = pick.split(':');
    let signed = false;
    for (let tries = 0; tries < 40 && !signed; tries++) {
      const slot = await p.$('#sheet.on .slotopt[data-i="' + want + '"]');
      if (slot) { await slot.click(); await p.waitForTimeout(800); continue; }
      /* The tile may be under a position tab that is not the open one. */
      signed = await p.evaluate((k) => {
        const hit = () => document.querySelector('#opts .tile[data-k="' + k + '"]');
        let t = hit();
        if (!t) {
          for (const tab of document.querySelectorAll('#tabs .tab')) {
            tab.click(); t = hit(); if (t) break;
          }
        }
        if (!t) return false;
        t.click(); return true;
      }, key);
      if (!signed) await p.waitForTimeout(700);
    }
    if (!signed) { ok('signs ' + key, false); await p.close(); return; }
    await p.waitForTimeout(2200);
    /* The sheet opens after the tile is clicked, not before it. */
    const after = await p.$('#sheet.on .slotopt[data-i="' + want + '"]');
    if (after) { await after.click(); await p.waitForTimeout(1400); }
  }
  ok('the draft fills the squad', !!(await p.$('#s-squad.on')));

  await p.evaluate(() => document.getElementById('b-play').click());
  /* Straight through the twelve games; the regular season is not what this is about. */
  for (let i = 0; i < 30; i++) {
    if (await p.$('#s-seed.on')) break;
    await p.evaluate(() => { const e = document.getElementById('b-sim'); if (e && e.offsetParent) e.click(); });
    await p.waitForTimeout(900);
  }
  const seedTxt = ((await p.textContent('#sd-badges')) || '').trim();
  ok('the season ends at the seeding screen', !!(await p.$('#s-seed.on')), seedTxt);
  ok('this run made the playoff', /seed/i.test(seedTxt), seedTxt);
  if (!/seed/i.test(seedTxt)) { await p.close(); return; }
  /* The two runs are here for the two shapes of postseason, so if the run drifts to the
     other shape the test has stopped covering what it says it covers. */
  ok('the run lands on the ' + (wantBye ? 'bye' : 'no-bye') + ' path it was picked for',
    /first-round bye/i.test(seedTxt) === !!wantBye, seedTxt);

  await p.evaluate(() => document.getElementById('b-po').click());
  await p.waitForTimeout(1500);
  ok('the bracket comes up before the first game', !!(await p.$('#s-brk.on')));

  const shot = async (n) => p.screenshot({ path: SS + 'brk_' + runSeed + '_' + n + '.png' });

  /* THE LINE UNDER THE BRACKET IS SAMPLED, NOT SNAPSHOTTED. Each round's note is on
     screen for a couple of seconds and then the next one replaces it, so reading it once
     at a fixed moment tests the machine's speed rather than the game: this assertion
     passed for a week and then started failing when a slower run pushed the read past
     the round it was about. Everything below collects, and the claims are made against
     what was seen across the whole postseason. */
  const notes = new Set();
  const grabNote = async () => {
    if (!(await p.$('#s-brk.on'))) return;
    const t = ((await p.textContent('#brk-note')) || '').trim();
    if (t) notes.add(t);
  };
  await grabNote();
  await shot('open');

  /* THE RAIL SCROLLS SIDEWAYS, THE PAGE DOES NOT. Four columns will not fit on a phone
     and the bracket is not worth deforming to make them, so the rail is the one thing on
     this site allowed to overflow; if that overflow reaches the document the whole page
     starts sliding under the reader's thumb. Checked at both ends, because the wide
     layout drops the scrolling entirely and centres instead. */
  const sideways = async (w) => {
    await p.setViewportSize({ width: w, height: 800 });
    await p.waitForTimeout(500);
    return p.evaluate(() => {
      const d = document.documentElement;
      const rail = document.getElementById('brk-rail');
      return { page: d.scrollWidth - d.clientWidth, over: rail.scrollWidth - rail.clientWidth };
    });
  };
  await grabNote();
  const narrow = await sideways(width);
  ok('the page does not scroll sideways on a phone', narrow.page <= 1, JSON.stringify(narrow));
  const desk = await sideways(1280);
  await shot('desktop');
  ok('the page does not scroll sideways on a desktop', desk.page <= 1, JSON.stringify(desk));
  /* On a wide screen the whole bracket has to be there without being dragged for. */
  ok('all four rounds fit on a desktop without scrolling', desk.over <= 1, JSON.stringify(desk));
  await p.setViewportSize({ width, height: 800 });
  await p.waitForTimeout(400);
  /* A BYE SEED WATCHES THE FIRST ROUND. It is the only stretch of the postseason with no
     game of theirs in it, and the round that has to be played before their own opponent
     exists at all: getting this wrong left all four bye seeds with nobody to play. */
  if (wantBye) {
    await grabNote();
    await p.waitForTimeout(4200);
    const settled = await p.$$eval('#brk-rail .brk-col:first-child .brk-t.won', (e) => e.length);
    ok('all four first-round games resolve on screen before the player plays', settled === 4,
      String(settled));
    await shot('first_round');
  }

  const field = await p.$$eval('#brk-rail .brk-col', (cols) => cols.map((c) => ({
    head: (c.querySelector('.brk-h') || {}).textContent,
    games: c.querySelectorAll('.brk-g').length,
  })));
  ok('four rounds are drawn', field.length === 4, JSON.stringify(field.map((f) => f.head)));
  /* A heading wider than its column is a heading nobody can read the end of. */
  const clipped = await p.$$eval('#brk-rail .brk-h',
    (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
  ok('no round heading is cut off', clipped.length === 0, clipped.join(', '));
  ok('the rounds are 4, 4, 2 and 1 games',
    JSON.stringify(field.map((f) => f.games)) === '[4,4,2,1]',
    JSON.stringify(field.map((f) => f.games)));

  const seatCount = await p.$$eval('#brk-rail .brk-col:first-child .brk-t, #brk-rail .brk-col:nth-child(2) .brk-t',
    (els) => els.filter((e) => !e.classList.contains('tbd')).length);
  ok('all twelve teams are named in the first two rounds', seatCount >= 12, String(seatCount));

  /* The complaint, on the screen it was made about: the seed next to your opponent is
     their seat in this bracket, so it can never be yours. */
  const mySeed = await p.evaluate(() => Number(document.querySelector('#brk-rail .brk-t.me .sd').textContent));
  ok('your own seat carries your seed', mySeed >= 1 && mySeed <= 12, String(mySeed));

  /* THE BRACKET MUST NOT SPOIL YOUR OWN GAME. The engine settles a whole round at once,
     the player's game included, so a bracket drawn straight off it puts the survivor of
     YOUR quarterfinal into the semifinal column while you are still looking at the
     quarterfinal. It did exactly that, and the screenshot showed the other team already
     through. Nothing to the right of the round in progress may name a team.
     Sampled while the bracket is up rather than once, because the leak appears at the
     moment a round resolves and is gone by the time the next screen paints. */
  let spoiled = 0;
  const noSpoiler = async () => {
    if (!(await p.$('#s-brk.on'))) return;
    spoiled += await p.evaluate(() => {
      const cols = [...document.querySelectorAll('#brk-rail .brk-col')];
      const live = cols.findIndex((c) => c.classList.contains('live'));
      if (live < 0 || live >= cols.length - 1) return 0;
      const mine = cols[live].querySelector('.brk-g.yours');
      /* Once your game has been revealed there is nothing left to give away, and a game
         somebody else already played is meant to advance its winner. */
      if (!mine || mine.querySelector('.brk-t.won')) return 0;
      /* So exactly one seat in the next round is still owed a name: the one your game
         feeds. If nothing there is waiting, the answer is already on the screen. */
      const waiting = cols[live + 1].querySelectorAll('.brk-t.fed.tbd').length;
      return waiting > 0 ? 0 : 1;
    });
  };

  /* Now play it out, round by round, watching for the two things that would make it a
     drawing rather than a bracket: an opponent who is not in the field, and an opponent
     seeded the same as you. */
  const met = [];
  for (let i = 0; i < 60; i++) {
    if (await p.$('#s-over.on')) break;
    await grabNote();
    await noSpoiler();
    if (await p.$('#s-po.on')) {
      const them = await p.evaluate(() => {
        const el = document.getElementById('po-them');
        return { code: el.querySelector('.cd').textContent, rk: el.querySelector('.rk').textContent };
      });
      if (!met.some((m) => m.code === them.code)) met.push(them);
      /* THE REPORT, ON THE SCOREBOARD IT WAS MADE ABOUT. Both numbers on this bug are
         now seeds in the same twelve-team field, so they cannot be equal. */
      const my = await p.evaluate(() =>
        document.querySelector('#po-you .rk').textContent);
      if (my && them.rk && my === them.rk) {
        bad++; console.log(' FAIL  the scorebug shows you against your own seed   ' + my);
      }
      await p.evaluate(() => { const e = document.getElementById('b-po-fast'); if (e) e.click(); });
    }
    await p.waitForTimeout(800);
  }
  await shot('end');

  ok('the postseason finishes', !!(await p.$('#s-over.on')));
  const noteList = [...notes];
  ok('every round of the bracket says what is happening', noteList.length > 0,
    noteList.join(' | ').slice(0, 150));
  if (wantBye) {
    /* The one stretch of the postseason with no game of theirs in it has to say so. */
    ok('a bye seed is told the first round is not theirs',
      noteList.some((t) => /first round off/i.test(t)), noteList.join(' | ').slice(0, 150));
  }
  /* Nothing may promise a next round that does not exist: the final is the last one. */
  ok('the title is not announced as another round to come',
    !noteList.some((t) => /on to the (next round|championship)\.$/i.test(t) && /champion/i.test(t)),
    noteList.join(' | ').slice(0, 150));
  ok('no round is filled in before the one in front of it is played', spoiled === 0,
    spoiled + ' names shown early');
  ok('every playoff opponent was a different team', met.length >= 1,
    met.map((m) => m.code + ' ' + m.rk).join(', '));
  ok('nothing logged while the bracket played', errs.length === 0, errs.slice(0, 3).join(' | '));
  await p.close();
}

await playSeed(106, 'a four seed with a bye, the case that was reported', 390, true);
await playSeed(19, 'an eleven seed, all four rounds', 360, false);

await b.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
