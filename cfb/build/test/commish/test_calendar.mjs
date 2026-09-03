/* THE DATES ARE A CLAIM ABOUT THE REAL CALENDAR.
 *
 *   node cfb/build/test/commish/test_calendar.mjs
 *
 * The mode now walks a term day by day, which means it is telling the player when things
 * happen, and everybody who plays this knows when these things happen. Week one on the wrong
 * Saturday, a championship weekend in the middle of November, signing day in June: each of
 * those is the same class of error as putting a school in the wrong state, and just as
 * visible to the audience it is for.
 *
 * The other half is arithmetic that has to hold whatever year it is. Windows that overlap
 * deal two beats the same Tuesday. A window that runs backwards produces no days at all and
 * a simulation with nothing to animate. A decision day outside its own window stops the
 * calendar on a square that is not lit.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const ROOT = path.resolve(new URL('../../../..', import.meta.url).pathname);
import { leagueTeams } from './league.mjs';
const C = require(ROOT + '/cfb/commish/calendar.js');
const L = require(ROOT + '/cfb/commish/ledger.js');
const S = require(ROOT + '/cfb/commish/season.js');
const D = require(ROOT + '/cfb/commish/docket.js');

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
/* A decade, because a leap year and a late August both have to work. */
const YEARS = [2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034];

console.log('\n=== week one is where week one is ===');
{
  const wrong = [];
  YEARS.forEach((y) => {
    const w1 = C.weekOne(y);
    if (w1.getDay() !== 6) wrong.push(y + ' opens on a ' + C.DOW[w1.getDay()]);
    /* On or after the 28th of August, which is what it really is: some years the 30th, some
       the 2nd of September. */
    const late = w1.getMonth() === 8 && w1.getDate() > 3;
    const early = w1.getMonth() === 7 && w1.getDate() < 28;
    if (late || early) wrong.push(y + ' opens ' + C.label(w1));
  });
  ok('every season opens on a Saturday in the right window', !wrong.length,
    wrong.join('; ') || YEARS.map((y) => C.label(C.weekOne(y))).join(', '));
  /* 2025 is the season this data actually starts on and the real one opened on 30 August. */
  ok('  and 2025 opens on the Saturday it really did', C.label(C.weekOne(2025)) === 'Aug 30',
    C.label(C.weekOne(2025)));

  const gaps = [];
  YEARS.forEach((y) => {
    for (let w = 2; w <= 15; w++) {
      if (C.between(C.saturday(y, w - 1), C.saturday(y, w)) !== 7) gaps.push(y + ' week ' + w);
    }
  });
  ok('  and every week is seven days after the last', !gaps.length, gaps.join(', ') || '15 weeks, 10 years');
  /* Championship weekend is week fifteen and lands in December every year. */
  const dec = YEARS.filter((y) => C.saturday(y, 15).getMonth() !== 11);
  ok('  championship weekend is always in December', !dec.length,
    dec.join(', ') || YEARS.map((y) => C.label(C.saturday(y, 15))).join(', '));
}

console.log('\n=== the nine windows tile the year ===');
{
  const overlaps = [], backwards = [], empty = [];
  YEARS.forEach((y) => {
    const ws = C.windows(y);
    ws.forEach((w, i) => {
      if (C.between(w.from, w.to) < 0) backwards.push(y + ' ' + w.name);
      const days = C.daysOf(y, i);
      if (!days.length) empty.push(y + ' ' + w.name);
      /* THE DAYS ARE THE WINDOW. A simulation animates this array, so a day in it that is not
         inside the window is a square the grid will not light. */
      days.forEach((d) => {
        if (C.between(w.from, d) < 0 || C.between(d, w.to) < 0) {
          overlaps.push(y + ' ' + w.name + ' produced ' + C.label(d));
        }
      });
      if (i > 0 && C.between(ws[i - 1].to, w.from) < 1) {
        overlaps.push(y + ': ' + ws[i - 1].name + ' runs into ' + w.name);
      }
    });
  });
  ok('no window runs backwards', !backwards.length, backwards.join(', ') || '90 windows');
  ok('  none of them is empty', !empty.length, empty.join(', ') || 'every beat has days in it');
  /* TWO BEATS SHARING A TUESDAY would deal two items on one day. */
  ok('  and no two of them overlap', !overlaps.length, overlaps.slice(0, 3).join('; ') || 'nine windows, in order');

  /* The four offseason beats are where anybody would look for them. */
  const w = C.windows(2026);
  ok('the winter meetings are in January', w[0].from.getMonth() === 0, C.label(w[0].from));
  ok('  signing day is in February', w[1].to.getMonth() === 1, C.label(w[1].to));
  ok('  spring is in the spring', w[2].from.getMonth() === 2 && w[2].to.getMonth() === 3,
    C.label(w[2].from) + ' to ' + C.label(w[2].to));
  ok('  media days are in July', w[3].from.getMonth() === 6, C.label(w[3].from));
  /* And the playoff is the one window that crosses a new year. */
  ok('  and the playoff runs into January', w[8].to.getFullYear() === 2027,
    C.label(w[8].from) + ' to ' + C.label(w[8].to) + ' ' + w[8].to.getFullYear());
}

console.log('\n=== a decision lands on a day the calendar is showing ===');
{
  const outside = [], first = [];
  YEARS.forEach((y) => {
    for (let beat = 0; beat < 9; beat++) {
      const days = C.daysOf(y, beat);
      D.ITEMS.forEach((it) => {
        const d = C.decisionDay(y, beat, it.id);
        if (!d) { outside.push(y + ' beat ' + beat + ' ' + it.id + ': nothing'); return; }
        if (!days.some((x) => C.sameDay(x, d))) {
          outside.push(y + ' beat ' + beat + ' ' + it.id + ' landed ' + C.label(d) + ', outside its window');
        }
        /* NEVER THE FIRST DAY. Something arriving the morning the window opens reads as
           scripted rather than as a thing that happened while you were working. */
        if (days.length > 1 && C.sameDay(d, days[0])) first.push(y + ' ' + it.id);
      });
    }
  });
  ok('every decision day is inside its own window', !outside.length,
    outside.slice(0, 3).join('; ') || (YEARS.length * 9 * D.ITEMS.length) + ' checked');
  ok('  and never on the first morning of it', !first.length, first.slice(0, 3).join('; ') || 'none');

  /* DETERMINISTIC, because the same beat replayed has to stop on the same date. */
  const a = C.decisionDay(2027, 5, 'flex-window');
  const b = C.decisionDay(2027, 5, 'flex-window');
  ok('  and the same beat replays to the same date', C.sameDay(a, b), C.label(a));
  ok('  while a different item lands somewhere else',
    !C.sameDay(a, C.decisionDay(2027, 5, 'officiating')),
    C.label(a) + ' vs ' + C.label(C.decisionDay(2027, 5, 'officiating')));
}

console.log('\n=== the football is on the Saturday it was played ===');
{
  const fs = require('fs');
  const teams = leagueTeams(ROOT);
  const E = require(ROOT + '/cfb/engine.js');
  const w = L.createWorld({ year: 2025, membership: L.membershipFrom(teams, 2025) });
  const sim = S.play(w, teams, E.createSeededRNG(11), S.segmentFor(6));
  const ev = C.eventsFor(2025, 6, sim);
  /* November owns weeks ten to fourteen, so those Saturdays and no others carry a game. */
  const onSat = [];
  for (let week = 10; week <= 14; week++) {
    const k = C.key(C.saturday(2025, week));
    if (ev[k] && ev[k].kind === 'game') onSat.push(week);
  }
  ok('November reads out a game on each of its Saturdays', onSat.length === 5, 'weeks ' + onSat.join(', '));
  const notSat = Object.keys(ev).filter((k) => ev[k].kind === 'game')
    .filter((k) => {
      const p = k.split('-').map(Number);
      return new Date(p[0], p[1] - 1, p[2]).getDay() !== 6;
    });
  ok('  and never on a day that is not a Saturday', !notSat.length, notSat.join(', ') || 'all six');
  /* The offseason beats have their own notes and no football at all. */
  const winter = C.eventsFor(2025, 0, null);
  ok('  the winter meetings have notes and no games',
    Object.keys(winter).length >= 2
    && Object.keys(winter).every((k) => winter[k].kind === 'note'),
    Object.keys(winter).length + ' notes');
}

console.log('\n=== every event has an icon the page can actually draw ===');
{
  const fs = require('fs');
  /* THE ICON SET LIVES IN THE PAGE and the names live here, which is exactly the join that
     fails without a word: an event asking for an icon nobody drew renders an empty square,
     and an empty square is what an ordinary day looks like. */
  const page = fs.readFileSync(ROOT + '/cfb/commish/index.html', 'utf8');
  const block = page.slice(page.indexOf('const CDI={'), page.indexOf('const cdIcon='));
  const drawn = new Set([...block.matchAll(/^\s{2}([a-z]+):/gm)].map((m) => m[1]));
  ok('the page draws a set of icons', drawn.size >= 8, [...drawn].join(', '));

  const teams = leagueTeams(ROOT);
  const E = require(ROOT + '/cfb/engine.js');
  const w = L.createWorld({ year: 2025, membership: L.membershipFrom(teams, 2025) });
  const sim = S.play(w, teams, E.createSeededRNG(4), null);
  const missing = [], unknown = [];
  const used = new Set();
  for (let beat = 0; beat < 9; beat++) {
    const ev = C.eventsFor(2025, beat, sim);
    Object.keys(ev).forEach((k) => {
      if (!ev[k].icon) { missing.push('beat ' + beat + ' ' + k); return; }
      used.add(ev[k].icon);
      if (!drawn.has(ev[k].icon)) unknown.push(ev[k].icon + ' on beat ' + beat);
    });
  }
  ok('  no event goes out without one', !missing.length, missing.slice(0, 3).join('; ') || 'every day the ticker reads out is marked');
  ok('  and none of them names an icon nobody drew', !unknown.length,
    unknown.slice(0, 3).join('; ') || [...used].sort().join(', '));
  /* THE OTHER DIRECTION IS DEAD WEIGHT rather than a bug, but a set that has drifted out of
     use is how the first one stops being trustworthy. `desk` is the decision day, which is
     not an event and so never appears above. */
  const idle = [...drawn].filter((n) => n !== 'desk' && !used.has(n));
  ok('  and nothing in the set is unused', !idle.length, idle.join(', ') || drawn.size + ' drawn, all reachable');
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
