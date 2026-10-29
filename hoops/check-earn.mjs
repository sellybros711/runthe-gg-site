/* Where coins are earned, and who earns them.
 *
 *   node hoops/check-earn.mjs
 *
 * economy.js is checked by check-economy.mjs: what each thing pays, the day
 * rule, the merge. This is the policy on top (hoops/earn.js) and the places the
 * game asks it:
 *   1. a guest earns nothing, from anything
 *   2. every award is keyed: asking twice pays once (a run, a day, a win)
 *   3. the welcome is paid once, after the shelf has answered
 *   4. badges held at the first settle are marked at nought, never paid; a
 *      badge lit afterwards pays its tier; no badge pays before a settle
 *   5. a career already being played when the account signs in pays only the
 *      seasons after; Easy pays half; the finish pays off the real Hall tier
 *   6. a mark pays nothing, is no line in the history, is never folded away,
 *      and merged against a payment can only make the wallet pay LESS
 *   7. the game asks it in the right places, and earn.js loads after the wallet
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pageSource } from './build/page-source.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL ' + msg); } };

const store = () => ({ _: {}, getItem(k){ return k in this._ ? this._[k] : null; }, setItem(k, v){ this._[k] = String(v); }, removeItem(k){ delete this._[k]; } });
global.localStorage = store();
const X = require('./economy.js'), W = require('./wardrobe.js'), BD = require('./badges.js'), EN = require('./earn.js');
const C = require('./career.js');

let signed = true;
const said = [];
const device = (who) => {
  global.localStorage = store(); W._reset(); signed = who !== 'guest';
  EN._use({ econ: X, wallet: W.wallet, badges: BD, signedIn: () => signed, notify: (m, n) => said.push(n) });
  return W.wallet;
};
const bal = () => W.wallet.balance();
const out = (p, s, c) => ({ madePlayoffs: p, seriesWon: s, champion: c });

/* 1. a guest */
{
  device('guest');
  EN.run(out(true, 4, true), { seed: 11 });
  EN.run(out(true, 4, true), { seed: 12, daily: 30 });
  EN.fix(30, 0.4, false); EN.passes(30, true, false, false); EN.conquest('s', 5, true);
  EN.settle({ runs: 5, rings: 3 });
  EN.career({ seed: 9, history: [{ y: 2027, po: 'Champion', aw: ['champ'] }] });
  EN.finish({ seed: 9, history: [{ y: 2027 }] }, 'hof_first');
  ok(bal() === 0 && Object.keys(W.wallet.load().e).length === 0, '1 a guest plays everything and the wallet stays empty (' + bal() + ')');
}

/* 2. keyed */
{
  device();
  const a = EN.run(out(true, 2, false), { seed: 21 }).amount;
  ok(a === X.runCoins(out(true, 2, false)), '2 a run pays what economy.js says it pays (' + a + ')');
  ok(!EN.run(out(true, 2, false), { seed: 21 }).paid, '2 the same run asked again pays nothing');
  const d = EN.run(out(false, 0, false), { seed: 22, daily: 40 });
  ok(d.paid && d.amount === X.dailyDraftCoins(out(false, 0, false)), '2 the Daily Draft pays its own rate');
  ok(!EN.run(out(false, 0, false), { seed: 99, daily: 40 }).paid, '2 and the day pays once, whatever run finished it');
  ok(EN.fix(40, 0.5, false).amount === X.fixCoins(0.5) && !EN.fix(40, 0.9, false).paid, '2 Fix History pays its odds once a day');
  ok(EN.fix(-77, 0.9, true).amount === X.RATE.endless, '2 an endless season pays the endless rate');
  ok(EN.passes(40, true, true, false).amount === X.passesCoins(true, true) && !EN.passes(40, true, false, false).paid, '2 Six Passes pays once a day');
  const cq1 = EN.conquest('q1', 3, false), cq2 = EN.conquest('q1', 3, false), cq3 = EN.conquest('q1', 4, true);
  ok(cq1 === 3 * X.RATE.cqWin && cq2 === 0, '2 Conquest pays each win once, however often it is asked (' + cq1 + ', ' + cq2 + ')');
  ok(cq3 === X.RATE.cqWin + X.RATE.cqClear && EN.conquest('q1', 4, true) === 0, '2 the next win and the clear pay once each');
}

/* 3 and 4. the welcome and the badges */
{
  device();
  const held = { runs: 3, rings: 1, playoffs: 2, rows: [] };
  ok(EN.badges(held) === 0, '4 before the first settle no badge pays');
  const heldN = BD.earned(held).length;
  const s = EN.settle(held);
  ok(W.wallet.has('welcome') && bal() === X.WELCOME, '3 the first settle pays the welcome (' + bal() + ')');
  ok(s && s.baseline === heldN && heldN > 0, '4 and marks every badge already held (' + (s && s.baseline) + ' of ' + heldN + ')');
  EN.settle(held);
  ok(bal() === X.WELCOME, '3 a second settle pays nothing more');
  const more = { runs: 60, rings: 12, playoffs: 40, rows: [] };
  const fresh = BD.earned(more).filter((b) => !BD.earned(held).some((h) => h.id === b.id));
  const want = fresh.reduce((n, b) => n + X.badgeCoins(b.tier), 0);
  const got = EN.badges(more);
  ok(fresh.length > 0 && got === want, '4 a badge lit after the settle pays its tier (' + got + ' of ' + want + ', ' + fresh.length + ' badges)');
  ok(EN.badges(more) === 0, '4 and only once');
  ok(BD.earned(held).every((b) => W.wallet.load().e['bg:' + b.id][0] === 0), '4 every held badge is in the wallet at nought');
}

/* 5. Career */
{
  device('guest');
  const L = { seed: 'k5', opt: {}, history: [{ y: 2027, po: 'R2', aw: [] }, { y: 2028, po: 'CF', aw: ['star'] }] };
  EN.career(L);
  signed = true;
  ok(EN.career(L) === 0 && W.wallet.has('cb:k5'), '5 a career played as a guest is baselined at the first signed in save');
  L.history.push({ y: 2029, po: 'Champion', aw: ['champ', 'star'] });
  const s3 = EN.career(L);
  ok(s3 === X.seasonCoins(L.history[2]), '5 and only the seasons after pay (' + s3 + ')');
  ok(EN.career(L) === 0, '5 a season pays once');
  const f = EN.finish(L, 'hof_first');
  ok(f.paid && f.amount === X.finishCoins('hof_first') && X.finishCoins('hof_first') === X.RATE.finish + X.RATE.hallMax, '5 the finish pays the full Hall bonus for a first ballot');
  ok(!EN.finish(L, 'hof_first').paid, '5 and is paid once');
  ok(X.finishCoins('hof_snub') === X.RATE.finish && X.finishCoins('') === X.RATE.finish, '5 a snub or no Hall pays the finish alone');
  const tiers = Object.keys(X.HALL_TIER);
  ok(tiers.every((t) => C.HOF_TIERS ? C.HOF_TIERS[t] : true), '5 every Hall tier economy.js pays is one career.js can give');
  device();
  const E = { seed: 'e5', opt: { diff: 'easy' }, history: [] };
  EN.career(E);
  E.history.push({ y: 2027, po: 'Finals', aw: [] });
  const e = EN.career(E);
  ok(e === Math.round(X.seasonCoins(E.history[0]) * 0.5), '5 an Easy career pays half (' + e + ')');
  ok(EN.finish({ seed: 'n5', history: [] }, 'hof_first') === null, '5 a career that never reached the league pays no finish');
}

/* 6. marks */
{
  device();
  W.wallet.baseline('bg:base', ['bg:a', 'bg:b']);
  ok(bal() === 0, '6 a mark pays nothing');
  ok(W.wallet.history().length === 0, '6 and is no line in the coin history');
  const w = X.fresh();
  X.mark(w, 'bg:old', 1); X.award(w, 'run:old', 300, 'run', { t: 2 });
  for (let i = 0; i < 2100; i++) X.award(w, 'r' + i, 1, 'x', { t: 3 });
  X.compact(w, 'dev', 3 + 61 * 864e5);
  ok(w.e['bg:old'] && !w.e['run:old'], '6 compaction folds an old run and never a mark');
  const a = X.fresh(), b = X.fresh();
  X.mark(a, 'bg:z', 100); X.award(b, 'bg:z', 480, 'badge', { t: 200 });
  const m = X.merge(a, b);
  ok(X.balance(m) === 0 && X.balance(X.merge(b, a)) === 0, '6 a mark merged against a later payment keeps the mark: a device can only pay less');
}

/* 7. the game asks it */
{
  const read = (f) => fs.readFileSync(path.join(HERE, f), 'utf8');
  const page = pageSource(), mu = read('modes-ui.js'), cu = read('career-ui.js');
  const at = (s, a) => s.indexOf(a);
  const rr = page.slice(at(page, 'function recordRun('), at(page, 'function earnRun('));
  ok(/var coins = earnRun\(out, c\)/.test(rr), '7 a finished run asks for its coins');
  const pull = page.slice(at(page, 'function cloudPull('), at(page, 'function cloudSettle('));
  ok(at(pull, 'RTF_EARN.settle') > at(pull, 'RTF_MODES_UI.cloudAdopt'), '7 the wallet settles after every slot is adopted');
  const rf = page.slice(at(page, 'function recordFeats('), at(page, 'function recordFeats(') + 900);
  ok(/RTF_EARN\.badges\(c\)/.test(rf), '7 a mode feat asks for the badges it lit');
  ok(/RTF_EARN\.conquest\(/.test(mu) && /RTF_EARN\.fix\(/.test(mu) && /RTF_EARN\.passes\(/.test(mu), '7 Conquest, Fix History and Six Passes ask for their coins');
  ok(/function save\(\)\{[\s\S]{0,300}RTF_EARN\.career\(S\.cur\)/.test(cu) && /RTF_EARN\.finish\(L, f\.ending && f\.ending\.tier\)/.test(cu), '7 a career asks on every save and at the finish');
  const ew = at(page, 'src="wardrobe.js'), ee = at(page, 'src="earn.js');
  ok(ew > 0 && ee > ew && ee < at(page, 'src="modes-ui.js'), '7 earn.js loads after the wallet and before the screens that ask it');
}

console.log(passes + ' passed' + (fails ? ', ' + fails + ' FAILED' : ''));
process.exit(fails ? 1 : 0);
