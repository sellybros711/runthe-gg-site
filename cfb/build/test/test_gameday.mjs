/*
 * test_gameday.mjs - the college Game Day shelf, against the real schedule and real players.
 *
 *   node cfb/build/test/test_gameday.mjs
 *
 * The Saturday twin of football/check-gameday.mjs, and it asks the same thing for the same
 * reason: no bot can play during a real game, so rows are built by hand at real kickoff times
 * out of cfb/data/cfb_schedule.json with real players, and every badge is asked both halves.
 * It lights when it should, and it stays dark one step outside: before kickoff, after the
 * window, the wrong school, two moments, two weeks, the favourite winning.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..', '..');
const require = createRequire(import.meta.url);
const ACH = require(path.join(ROOT, 'cfb', 'achievements.js'));
const load = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'cfb', 'data', f), 'utf8'));
const SCHED = load('cfb_schedule.json');
const players = load('cfb_player_seasons.json');

let bad = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${label}${detail ? '   ' + detail : ''}`);
  if (!pass) bad++;
};

/* The local history's pick shape, "id|season", which is what achResolve reads. */
const byKey = new Map(players.map((p) => [p.player_id + '|' + p.season, p]));
const resolve = (k) => byKey.get(k) || null;
const bySchool = Object.create(null);
for (const p of players) (bySchool[p.school] = bySchool[p.school] || []).push(p);
const SCHOOLS = Object.keys(bySchool);
const man = (school, n) => { const l = bySchool[school]; const p = l[n % l.length]; return p.player_id + '|' + p.season; };
const G = SCHED.games;
const onAt = (iso) => { const t = Date.parse(iso); return G.filter((g) => Date.parse(g.k) <= t && Date.parse(g.k) > t - ACH.GAME_DAY_MS); };
const at = (g, min) => new Date(Date.parse(g.k) + min * 60000).toISOString();
/* Six men: the schools asked for, filled with men from schools not playing at that moment. */
const six = (schools, iso) => {
  const busy = new Set(onAt(iso).flatMap((g) => [g.a, g.h]));
  const free = SCHOOLS.filter((s) => !busy.has(s));
  const out = schools.slice();
  let n = 0;
  while (out.length < 6) out.push(free[n++ % free.length]);
  return out;
};
const row = (g, min, schools) => {
  const iso = at(g, min);
  return { created_at: iso, picks: six(schools, iso).map((s, i) => man(s, i)) };
};
const lit = (rows, sched = SCHED) => new Set(ACH.evaluate(rows, resolve, '2026-09-28T12:00:00Z',
  { schedule: sched }).earned.map((a) => a.id));
const has = (rows, id) => lit(rows).has(id);
const tagged = (t) => G.filter((g) => (g.tags || []).indexOf(t) >= 0);
const inGame = (g) => SCHOOLS.indexOf(g.a) >= 0 && SCHOOLS.indexOf(g.h) >= 0;

console.log('THE SCHEDULE');
const named = new Set(G.flatMap((g) => [g.a, g.h]));
ok('every school in the game has games', SCHOOLS.every((s) => named.has(s)),
  SCHOOLS.filter((s) => !named.has(s)).join(', ') || SCHOOLS.length + ' schools');
for (const t of ['conf', 'neutral', 'noon', 'night', 'weeknight', 'rivalry', 'ccg', 'bowl', 'cfp', 'natty']) {
  ok('carries a game tagged ' + t, tagged(t).length > 0, tagged(t).length + ' games');
}
ok('has finals and favourites', G.some((g) => g.sc) && G.some((g) => g.fav));
ok('carries no build clock', !/"(built|generated|updated)"/.test(fs.readFileSync(path.join(ROOT, 'cfb/data/cfb_schedule.json'), 'utf8')));

console.log('\nHOME CROWD, AND ITS EDGES');
const any = G.find((g) => SCHOOLS.indexOf(g.h) >= 0);
ok('a season an hour in with a man from the school lights it', has([row(any, 60, [any.h])], 'cgd_home'), any.id);
ok('  not a minute before kickoff', !has([row(any, -1, [any.h])], 'cgd_home'));
ok('  not after the window', !has([row(any, ACH.GAME_DAY_MS / 60000 + 1, [any.h])], 'cgd_home'));
ok('  not with nobody from either school', !has([row(any, 60, [])], 'cgd_home'));
ok('  not with no schedule handed in', !lit([row(any, 60, [any.h])], null).has('cgd_home'));

console.log('\nBOTH SIDELINES');
const conf = tagged('conf').find(inGame);
const nonConf = G.find((g) => inGame(g) && (g.tags || []).indexOf('conf') < 0);
ok('both schools of a conference game lights split and conference clash',
  has([row(conf, 90, [conf.a, conf.h])], 'cgd_split') && has([row(conf, 90, [conf.a, conf.h])], 'cgd_conf'));
ok('  outside the conference is split but no clash',
  has([row(nonConf, 90, [nonConf.a, nonConf.h])], 'cgd_split') && !has([row(nonConf, 90, [nonConf.a, nonConf.h])], 'cgd_conf'));
ok('  one side only is neither', !has([row(conf, 90, [conf.a])], 'cgd_split'));

console.log('\nSATURDAY SLATE');
let slate = null, from = null;
for (const g of tagged('noon')) {
  const on = onAt(at(g, 60)).filter((x) => SCHOOLS.indexOf(x.h) >= 0);
  if (on.length >= 4) { slate = on; from = g; break; }
}
ok('a Saturday with four of the game\'s schools on at once', !!slate);
const four = slate.slice(0, 4).map((g) => g.h);
ok('four schools all playing right now lights it', has([row(from, 60, four)], 'cgd_slate'));
ok('  three does not', !has([row(from, 60, four.slice(0, 3))], 'cgd_slate'));

console.log('\nTHE KICKOFF WINDOWS AND BIG DAYS');
const pick = (t) => tagged(t).find((g) => SCHOOLS.indexOf(g.h) >= 0 || SCHOOLS.indexOf(g.a) >= 0);
const side = (g) => (SCHOOLS.indexOf(g.h) >= 0 ? g.h : g.a);
for (const [t, id] of [['noon', 'cgd_noon'], ['night', 'cgd_night'], ['weeknight', 'cgd_weeknight'],
  ['neutral', 'cgd_neutral'], ['rivalry', 'cgd_rivalry'], ['ccg', 'cgd_ccg'], ['bowl', 'cgd_bowl'],
  ['cfp', 'cgd_cfp'], ['natty', 'cgd_natty']]) {
  const g = pick(t);
  ok(id + ' lights during ' + (g && g.id), !!g && has([row(g, 60, [side(g)])], id));
  ok('  and not an hour before', !!g && !has([row(g, -60, [side(g)])], id));
}
const byWk = Object.create(null);
for (const g of G) {
  for (const t of ['noon', 'night']) {
    if ((g.tags || []).indexOf(t) >= 0 && (SCHOOLS.indexOf(g.h) >= 0)) ((byWk[g.s + g.w] = byWk[g.s + g.w] || {})[t] = g);
  }
}
const day = Object.values(byWk).find((v) => v.noon && v.night);
ok('a noon game and a night game the same Saturday lights All-day Saturday',
  has([row(day.noon, 60, [day.noon.h]), row(day.night, 60, [day.night.h])], 'cgd_allday'));
ok('  two noon games does not', !has([row(day.noon, 60, [day.noon.h]), row(day.noon, 90, [day.noon.h])], 'cgd_allday'));

console.log('\nCALLED IT, AND THE UPSET');
const final = G.filter((g) => g.sc && g.sc[0] !== g.sc[1]);
const winner = (g) => (g.sc[0] > g.sc[1] ? g.a : g.h);
const loser = (g) => (g.sc[0] > g.sc[1] ? g.h : g.a);
const w = final.find((g) => SCHOOLS.indexOf(winner(g)) >= 0 && SCHOOLS.indexOf(loser(g)) >= 0);
ok('the side that won lights Called it', has([row(w, 60, [winner(w)])], 'cgd_called'));
ok('  the side that lost does not', !has([row(w, 60, [loser(w)])], 'cgd_called'));
const dog = final.find((g) => g.fav && g.fav !== winner(g) && SCHOOLS.indexOf(winner(g)) >= 0);
const chalk = final.find((g) => g.fav && g.fav === winner(g) && SCHOOLS.indexOf(winner(g)) >= 0);
ok('the underdog winning lights Upset special', !!dog && has([row(dog, 60, [winner(dog)])], 'cgd_upset'));
ok('  the favourite winning does not', !!chalk && !has([row(chalk, 60, [winner(chalk)])], 'cgd_upset'));

console.log('\nTHE COLLECTIONS');
const firstOf = Object.create(null);
for (const g of G) for (const s of [g.a, g.h]) if (SCHOOLS.indexOf(s) >= 0 && !firstOf[s]) firstOf[s] = g;
const per = SCHOOLS.slice(0, 25).map((s) => row(firstOf[s], 60, [s]));
ok('25 schools, each during its own game, lights Coast to coast', has(per, 'cgd_schools_25'));
ok('  24 does not', !has(per.slice(0, 24), 'cgd_schools_25') && has(per.slice(0, 10), 'cgd_schools_10'));
const weeks = [...new Set(G.filter((g) => SCHOOLS.indexOf(g.h) >= 0).map((g) => g.s + '-' + g.w))]
  .map((k) => G.find((g) => g.s + '-' + g.w === k && SCHOOLS.indexOf(g.h) >= 0));
const attend = weeks.slice(0, 14).map((g) => row(g, 60, [g.h]));
ok('14 different weeks lights Perfect attendance', has(attend, 'cgd_weeks_14'), weeks.length + ' weeks available');
ok('  13 does not', !has(attend.slice(0, 13), 'cgd_weeks_14') && has(attend.slice(0, 8), 'cgd_weeks_8'));

console.log('\nEVERY BADGE ON THE SHELF WAS LIT BY SOMETHING ABOVE');
const everything = [row(any, 60, [any.h]), row(conf, 90, [conf.a, conf.h]), row(from, 60, four),
  ...['noon', 'night', 'weeknight', 'neutral', 'rivalry', 'ccg', 'bowl', 'cfp', 'natty'].map((t) => { const g = pick(t); return row(g, 60, [side(g)]); }),
  row(day.noon, 60, [day.noon.h]), row(day.night, 60, [day.night.h]), row(dog, 60, [winner(dog)]),
  ...per, ...attend];
const got = lit(everything);
const shelf = ACH.CATALOG.filter((a) => a.group === 'Game Day');
const dark = shelf.filter((a) => !got.has(a.id)).map((a) => a.id);
ok(shelf.length + ' Game Day badges, all reachable', !dark.length, dark.join(' ') || 'all lit');
ok('the shelf is on the list the trophy case draws', ACH.GROUPS.indexOf('Game Day') >= 0);

console.log('\nTHE PAGE HANDS THE SCHEDULE IN');
const page = fs.readFileSync(path.join(ROOT, 'cfb/index.html'), 'utf8');
/* Each call read with the lines after it, because the cabinet's own call runs onto two. */
const evals = [];
for (let i = page.indexOf('.evaluate('); i >= 0; i = page.indexOf('.evaluate(', i + 1)) evals.push(page.slice(i, i + 170));
ok('every evaluate call on the page passes the schedule', evals.length >= 3 && evals.every((l) => /schedule:CFB_SCHED/.test(l)),
  evals.filter((l) => !/schedule:CFB_SCHED/.test(l)).length + ' of ' + evals.length + ' without it');
ok('the schedule is fetched no-cache at boot', /fetch\('data\/cfb_schedule\.json',\{cache:'no-cache'\}\)/.test(page)
  && /async function boot\(\)\{\s*loadCfbSchedule\(\);/.test(page));

console.log(bad ? `\n${bad} failed` : '\nall good');
process.exit(bad ? 1 : 0);
