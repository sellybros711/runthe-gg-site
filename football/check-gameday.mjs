/*
 * check-gameday.mjs - the Game Day shelf, against the real schedule and the real players.
 *
 *   node football/check-gameday.mjs
 *
 * check-badges.mjs proves a badge is reachable by PLAYING, and no bot can play on a Sunday:
 * these badges ask about the real league, at the moment the server filed a row. So this file
 * builds rows by hand at real kickoff times out of football/data/nfl_schedule.json, with real
 * players out of player_seasons.json, and asks the catalog both halves of every claim: the
 * badge lights when it should, and stays dark one step outside it (a minute before kickoff,
 * after the window, the wrong club, the wrong week). A badge that only ever lights proves
 * nothing, and a check that only ever asks the lit half would pass on a shelf that lights for
 * everybody.
 *
 * It also holds the schedule to the catalog: every tag a badge reads has to exist in the file,
 * or that badge cannot be earned until it does, which is the unearnable badge this repo keeps
 * a checker for.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ACH = require(path.join(here, 'achievements.js'));
const load = (f) => JSON.parse(fs.readFileSync(path.join(here, 'data', f), 'utf8'));
const SCHED = load('nfl_schedule.json');
const players = load('player_seasons.json');

let bad = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${label}${detail ? '   ' + detail : ''}`);
  if (!pass) bad++;
};

const byKey = new Map(players.map((p) => [p.player_id + '|' + p.season, p]));
const resolve = (k) => {
  const i = String(k).lastIndexOf(':');
  return byKey.get(String(k).slice(0, i) + '|' + String(k).slice(i + 1)) || null;
};
/* One man a club, and a different one for each seat so a roster of six is six people. */
const byClub = Object.create(null);
for (const p of players) (byClub[p.franchise] = byClub[p.franchise] || []).push(p);
const man = (club, n = 0) => {
  const list = byClub[club];
  if (!list || !list.length) throw new Error('no player for ' + club);
  const p = list[n % list.length];
  return p.player_id + ':' + p.season;
};
/* A club no game in `games` involves, for the filler seats. */
const ALL = ACH.CLUBS;
const outsider = (games, n = 0) => {
  const busy = new Set(games.flatMap((g) => [g.a, g.h]));
  const free = ALL.filter((c) => !busy.has(c));
  return free[n % free.length];
};
const at = (g, minutes) => new Date(Date.parse(g.k) + minutes * 60000).toISOString();
const row = (iso, clubs, extra) => Object.assign({ created_at: iso, run_mode: 'free',
  picks: clubs.map((c, i) => man(c, i)) }, extra || {});
/* A roster of six: the clubs asked for, filled out with men from clubs not playing. */
const six = (clubs, games) => {
  const out = clubs.slice();
  let n = 0;
  while (out.length < 6) out.push(outsider(games, n++));
  return out;
};
const lit = (rows, withSched = true) => new Set(ACH.evaluate(rows, resolve,
  { schedule: withSched ? SCHED : null, nowIso: '2026-09-28T12:00:00Z' }).earned.map((a) => a.id));
const has = (rows, id) => lit(rows).has(id);

const G = SCHED.games;
const tagged = (t) => G.filter((g) => (g.tags || []).indexOf(t) >= 0);
const onAt = (iso) => {
  const t = Date.parse(iso);
  return G.filter((g) => Date.parse(g.k) <= t && Date.parse(g.k) > t - ACH.GAME_DAY_MS);
};

console.log('THE SCHEDULE');
const clubs = new Set(G.flatMap((g) => [g.a, g.h]));
ok('names all 32 clubs, in this site\'s codes', clubs.size === 32 && ALL.every((c) => clubs.has(c)),
  [...clubs].filter((c) => ALL.indexOf(c) < 0).join(' ') || '32');
ok('every club has a player to draft', ALL.every((c) => byClub[c] && byClub[c].length));
for (const t of ['div', 'intl', 'tnf', 'snf', 'mnf', 'early', 'late', 'thanks', 'post', 'sb']) {
  ok('carries a game tagged ' + t, tagged(t).length > 0, tagged(t).length + ' games');
}
ok('has final scores and favourites to judge a call by',
  G.some((g) => g.sc) && G.some((g) => g.fav));
ok('carries no build clock, so an unchanged schedule is unchanged bytes',
  !/"(built|generated|updated)"/.test(fs.readFileSync(path.join(here, 'data', 'nfl_schedule.json'), 'utf8')));

console.log('\nHOME CROWD, AND ITS EDGES');
const any = G.find((g) => g.t === 'REG' && onAt(at(g, 60)).length === 1);
ok('a quiet game to test on', !!any, any && any.id);
const mine = six([any.h], [any]);
ok('a season filed an hour in, with a man from the home side, lights it',
  has([row(at(any, 60), mine)], 'gd_home'));
ok('  and from the away side', has([row(at(any, 60), six([any.a], [any]))], 'gd_home'));
ok('  and not a minute before kickoff', !has([row(at(any, -1), mine)], 'gd_home'));
ok('  and not after the window closes',
  !has([row(new Date(Date.parse(any.k) + ACH.GAME_DAY_MS + 60000).toISOString(), mine)], 'gd_home'));
ok('  and not with nobody from either side', !has([row(at(any, 60), six([], [any]))], 'gd_home'));
ok('  and not with no schedule handed in, which is "not known"',
  !lit([row(at(any, 60), mine)], false).has('gd_home'));
ok('  and not for a row with no time on it', !has([row(null, mine)], 'gd_home'));
const rams = G.find((g) => g.a === 'LAR' || g.h === 'LAR');
ok('a Rams game counts a Rams player whatever city he played in',
  !!rams && has([row(at(rams, 60), six(['LAR'], [rams]))], 'gd_home'));

console.log('\nBOTH SIDELINES');
const div = tagged('div').find((g) => g.t === 'REG');
const nondiv = G.find((g) => g.t === 'REG' && (g.tags || []).indexOf('div') < 0);
ok('both teams of a division game while it is on lights split and rivalry',
  has([row(at(div, 90), six([div.a, div.h], [div]))], 'gd_split')
  && has([row(at(div, 90), six([div.a, div.h], [div]))], 'gd_rival'));
ok('  a game outside the division is split but not a rivalry',
  has([row(at(nondiv, 90), six([nondiv.a, nondiv.h], [nondiv]))], 'gd_split')
  && !has([row(at(nondiv, 90), six([nondiv.a, nondiv.h], [nondiv]))], 'gd_rival'));
ok('  one side only is neither', !has([row(at(div, 90), six([div.a], [div]))], 'gd_split'));

console.log('\nRED ZONE');
const early = tagged('early');
let slate = null;
for (const g of early) { const on = onAt(at(g, 60)); if (on.length >= 4) { slate = on; break; } }
ok('a Sunday with four games on at once', !!slate, slate && slate.length + ' games');
const four = slate.slice(0, 4).map((g, i) => (i % 2 ? g.a : g.h));
ok('four teams all playing right now lights it', has([row(at(slate[0], 60), six(four, slate))], 'gd_redzone'));
ok('  three does not', !has([row(at(slate[0], 60), six(four.slice(0, 3), slate))], 'gd_redzone'));
ok('  and four across two different moments does not',
  !has([row(at(slate[0], 60), six(four.slice(0, 2), slate)),
    row(at(slate[0], 61), six(four.slice(2), slate))], 'gd_redzone'));

console.log('\nPRIMETIME');
const nightOf = (t) => tagged(t).find((g) => g.t === 'REG');
for (const [t, id] of [['tnf', 'gd_tnf'], ['snf', 'gd_snf'], ['mnf', 'gd_mnf']]) {
  const g = nightOf(t);
  ok(id + ' lights during that game', has([row(at(g, 60), six([g.h], [g]))], id), g.id);
}
/* All three in one week: find a week with a game of each. */
const weeks = Object.create(null);
for (const g of G) {
  for (const t of ['tnf', 'snf', 'mnf']) {
    if ((g.tags || []).indexOf(t) >= 0) ((weeks[g.s + '-' + g.w] = weeks[g.s + '-' + g.w] || {})[t] = g);
  }
}
const wk = Object.entries(weeks).find(([, v]) => v.tnf && v.snf && v.mnf);
ok('a week with all three primetime games', !!wk, wk && wk[0]);
const three = ['tnf', 'snf', 'mnf'].map((t) => wk[1][t]);
ok('Thursday, Sunday and Monday of one week lights Prime suspect',
  has(three.map((g) => row(at(g, 60), six([g.h], [g]))), 'gd_prime'));
const other = Object.entries(weeks).find(([k, v]) => k !== wk[0] && v.mnf);
ok('  swapping Monday for another week\'s does not',
  !has([three[0], three[1], other[1].mnf].map((g) => row(at(g, 60), six([g.h], [g]))), 'gd_prime'));

console.log('\nDOUBLEHEADER');
const byWk = Object.create(null);
for (const g of G) {
  for (const t of ['early', 'late']) {
    if ((g.tags || []).indexOf(t) >= 0) ((byWk[g.s + '-' + g.w] = byWk[g.s + '-' + g.w] || {})[t] = g);
  }
}
const dh = Object.values(byWk).find((v) => v.early && v.late);
ok('a 1pm game and a 4pm game the same Sunday lights it',
  has([row(at(dh.early, 60), six([dh.early.h], [dh.early])),
    row(at(dh.late, 60), six([dh.late.h], [dh.late]))], 'gd_doubleheader'));
ok('  two seasons in the 1pm window does not',
  !has([row(at(dh.early, 60), six([dh.early.h], [dh.early])),
    row(at(dh.early, 90), six([dh.early.a], [dh.early]))], 'gd_doubleheader'));

console.log('\nTHE BIG DAYS');
for (const [t, id] of [['intl', 'gd_intl'], ['thanks', 'gd_thanks'], ['post', 'gd_post'], ['sb', 'gd_sb']]) {
  const g = tagged(t)[0];
  ok(id + ' lights during ' + g.id, has([row(at(g, 60), six([g.a], [g]))], id));
  ok('  and not an hour before it', !has([row(at(g, -60), six([g.a], [g]))], id));
}
const post = tagged('post').find((g) => (g.tags || []).indexOf('sb') < 0);
ok('a playoff game that is not the Super Bowl is not the Super Bowl',
  !has([row(at(post, 60), six([post.a], [post]))], 'gd_sb'));

console.log('\nCALLED IT, AND THE UPSET');
const final = G.filter((g) => g.sc && g.sc[0] !== g.sc[1]);
const winner = (g) => (g.sc[0] > g.sc[1] ? g.a : g.h);
const loser = (g) => (g.sc[0] > g.sc[1] ? g.h : g.a);
const w1 = final[0];
ok('a man from the side that won lights Called it', has([row(at(w1, 60), six([winner(w1)], [w1]))], 'gd_called'));
ok('  a man from the side that lost does not', !has([row(at(w1, 60), six([loser(w1)], [w1]))], 'gd_called'));
const dog = final.find((g) => g.fav && g.fav !== winner(g));
const chalk = final.find((g) => g.fav && g.fav === winner(g));
ok('the underdog winning lights Upset special', !!dog && has([row(at(dog, 60), six([winner(dog)], [dog]))], 'gd_upset'), dog && dog.id);
ok('  the favourite winning does not', !!chalk && !has([row(at(chalk, 60), six([winner(chalk)], [chalk]))], 'gd_upset'));
const unplayed = G.find((g) => !g.sc);
ok('  a game with no final score yet calls nothing',
  !unplayed || !has([row(at(unplayed, 60), six([unplayed.h], [unplayed]))], 'gd_called'));

console.log('\nTHE COLLECTIONS');
const first = Object.create(null);
for (const g of G.filter((x) => x.t === 'REG')) { for (const c of [g.a, g.h]) if (!first[c]) first[c] = g; }
const per = ALL.map((c) => row(at(first[c], 60), six([c], [first[c]])));
ok('one season for each club during its own game lights Every sideline', has(per, 'gd_teams_32'));
ok('  thirty-one does not', !has(per.slice(0, 31), 'gd_teams_32') && has(per.slice(0, 8), 'gd_teams_8'));
const wkList = [...new Set(G.map((g) => g.s + '-' + g.w))].map((k) => G.find((g) => g.s + '-' + g.w === k));
ok('there are 18 NFL weeks to attend', wkList.length >= 18, wkList.length + ' weeks');
const attend = wkList.slice(0, 18).map((g) => row(at(g, 60), six([g.h], [g])));
ok('a season in each of 18 weeks lights Perfect attendance', has(attend, 'gd_weeks_18'));
ok('  seventeen does not', !has(attend.slice(0, 17), 'gd_weeks_18') && has(attend.slice(0, 8), 'gd_weeks_8'));
ok('  and 18 seasons in one week is one week',
  !has(Array.from({ length: 18 }, (_, i) => row(at(any, 10 + i), mine)), 'gd_weeks_3'));

console.log('\nEVERY BADGE ON THE SHELF WAS LIT BY SOMETHING ABOVE');
const everything = [row(at(any, 60), mine), row(at(div, 90), six([div.a, div.h], [div])),
  row(at(slate[0], 60), six(four, slate)), ...three.map((g) => row(at(g, 60), six([g.h], [g]))),
  row(at(dh.early, 60), six([dh.early.h], [dh.early])), row(at(dh.late, 60), six([dh.late.h], [dh.late])),
  ...['intl', 'thanks', 'post', 'sb'].map((t) => { const g = tagged(t)[0]; return row(at(g, 60), six([g.a], [g])); }),
  row(at(dog, 60), six([winner(dog)], [dog])), ...per, ...attend];
const got = lit(everything);
const shelf = ACH.CATALOG.filter((a) => a.group === 'Game Day');
const dark = shelf.filter((a) => !got.has(a.id)).map((a) => a.id);
ok(shelf.length + ' Game Day badges, all reachable', !dark.length, dark.join(' ') || 'all lit');
ok('the shelf is on the list the profile draws', ACH.GROUPS.indexOf('Game Day') >= 0);

console.log('\nTHE PAGE HANDS THE SCHEDULE IN');
const page = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
ok('achEvaluate passes schedule:NFL_SCHED', /ACH\.evaluate\(rows,achResolve,\{[^}]*schedule:NFL_SCHED/.test(page));
ok('and achReady waits for it', /function achReady\(rows\)\{[\s\S]{0,200}loadSchedule\(\)/.test(page));
ok('fetched no-cache, because a bot rewrites it under one name',
  /fetch\('data\/nfl_schedule\.json',\{cache:'no-cache'\}\)/.test(page));

console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
