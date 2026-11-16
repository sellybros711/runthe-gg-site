/* Shut The Door: the five game events (events.js), against a stubbed gtag.
 * node shut-the-door/test/events.mjs
 *
 *   1. each event goes out once, as gtag('event', name, params), with exactly its fields
 *   2. outing_end and daily_done only for an outing started on this page view, once; daily_done only
 *      for a daily, once a day; a pitch only once per pitch
 *   3. nothing personal: every field is on the list, every value a short word, a number or a boolean
 *   4. never in the way: nothing goes out on the game's own call (it is deferred), a gtag that throws
 *      throws nothing back, and with no gtag on the page nothing happens
 *   5. score_band is the percentile in tens
 *   6. ui.js calls each one where it belongs (the browser check plays them through the page)
 *   7. promo_click (the result's Run The Diamond card): its fields, and it goes at once as a beacon,
 *      since its link leaves the page */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(DIR, 'events.js'), 'utf8');
const UI = fs.readFileSync(path.join(DIR, 'ui.js'), 'utf8');
const HTML = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');

let passes = 0, fails = 0;
function ok(c, what) { if (c) { passes++; console.log('ok    ' + what); } else { fails++; console.log('FAIL  ' + what); } }

/* a page: window.gtag pushes to a list, setTimeout queues until flush() */
function page(gtag) {
  const sent = [], timers = [];
  const window = {};
  if (gtag !== null) window.gtag = gtag || function () { sent.push([...arguments]); };
  const ctx = { window, setTimeout: (f) => { timers.push(f); return timers.length; } };
  vm.runInNewContext(SRC, ctx);
  return { E: window.STD_EVENTS, sent, flush() { while (timers.length) timers.shift()(); return sent; } };
}
const events = (sent, name) => sent.filter((a) => a[0] === 'event' && a[1] === name).map((a) => a[2]);
const keys = (o) => Object.keys(o).sort().join(',');

const FIELDS = {
  outing_start: 'day,game_name,mode,resumed',
  pitch: 'day,game_name,mode,pitch_no,result',
  outing_end: 'day,game_name,mode,pitches,result,score_band',
  daily_done: 'day,game_name,pitches,result,score_band',
  share: 'day,game_name,method,mode',
  promo_click: 'day,game_name,mode,target,transport_type',
};
const R = { outcome: 'door_shut', pitches: 3, percentile: 76.4, score: 912, share: 'Shut The Door #15', pitchedLike: { name: 'Pete Fairbanks' } };

/* 1: a daily of three pitches, then a share */
{
  const p = page();
  p.E.outingStart('o1', 'daily', 15, 0);
  ok(p.sent.length === 0, '4 nothing goes out on the game\'s own call: it is deferred');
  [1, 2, 3].forEach((n) => p.E.pitch('o1', 'daily', 15, { n, result: n === 3 ? 'in_play' : 'called_strike', grade: { band: 'green' } }));
  p.E.outingEnd('o1', 'daily', 15, R);
  p.E.share('daily', 15, 'text');
  const s = p.flush();
  ok(s.every((a) => a.length === 3 && a[0] === 'event' && typeof a[1] === 'string' && a[2] && typeof a[2] === 'object'), '1 every call is gtag(\'event\', name, params)');
  ok(s.map((a) => a[1]).join() === 'outing_start,pitch,pitch,pitch,outing_end,daily_done,share', '1 in order: outing_start, a pitch each, outing_end, daily_done, share (' + s.map((a) => a[1]).join() + ')');
  for (const [name, f] of Object.entries(FIELDS)) {
    if (name === 'promo_click') continue;
    const got = events(s, name);
    ok(got.length >= 1 && got.every((o) => keys(o) === f), '1 ' + name + ' carries exactly ' + f + (got[0] ? ' (' + keys(got[0]) + ')' : ' (none sent)'));
  }
  const st = events(s, 'outing_start')[0];
  ok(st.mode === 'daily' && st.day === 15 && st.resumed === false && st.game_name === 'Shut The Door', '1 outing_start: daily, #15, not resumed');
  ok(events(s, 'pitch').map((o) => o.pitch_no + ':' + o.result).join() === '1:called_strike,2:called_strike,3:in_play', '1 pitch: its number and the engine\'s result, nothing of the grade');
  const end = events(s, 'outing_end')[0], dd = events(s, 'daily_done')[0];
  ok(end.result === 'door_shut' && end.pitches === 3 && end.score_band === 70 && end.mode === 'daily' && end.day === 15, '1 outing_end: the outcome, the pitch count and the band (' + JSON.stringify(end) + ')');
  ok(dd.result === 'door_shut' && dd.pitches === 3 && dd.score_band === 70 && dd.day === 15, '1 daily_done: the day, the outcome, the pitches and the band');
  ok(events(s, 'share')[0].method === 'text', '1 share: its method');
}

/* 2: the once guards */
{
  const p = page();
  p.E.outingEnd('old', 'daily', 15, R);
  p.E.pitch('old', 'daily', 15, { n: 1, result: 'ball' });
  ok(p.flush().length === 0, '2 a finished outing reopened from the home sends no pitch, no outing_end and no daily_done');
  p.E.outingStart('o1', 'daily', 15, 4);
  p.E.outingStart('o1', 'daily', 15, 4);
  p.E.pitch('o1', 'daily', 15, { n: 5, result: 'ball' });
  p.E.pitch('o1', 'daily', 15, { n: 5, result: 'ball' });
  p.E.outingEnd('o1', 'daily', 15, R);
  p.E.outingEnd('o1', 'daily', 15, R);
  const s = p.flush();
  ok(events(s, 'outing_start').length === 1 && events(s, 'outing_start')[0].resumed === true, '2 a resumed daily starts once, and says resumed');
  ok(events(s, 'pitch').length === 1 && events(s, 'outing_end').length === 1 && events(s, 'daily_done').length === 1, '2 each pitch, the end and the day once');
  for (const mode of ['practice', 'survivor', 'archive']) {
    const q = page();
    q.E.outingStart('x', mode, 15, 0); q.E.outingEnd('x', mode, 15, { outcome: 'walk_off', pitches: 7, percentile: 4 });
    const t = q.flush();
    ok(events(t, 'outing_end').length === 1 && events(t, 'outing_end')[0].mode === mode && events(t, 'outing_end')[0].score_band === 0 && events(t, 'daily_done').length === 0,
      '2 ' + mode + ': outing_end with its mode, and no daily_done');
  }
  const d = page();
  d.E.outingStart('a', 'daily', 15, 0); d.E.outingEnd('a', 'daily', 15, R);
  d.E.outingStart('b', 'daily', 15, 0); d.E.outingEnd('b', 'daily', 15, R);
  ok(events(d.flush(), 'daily_done').length === 1, '2 daily_done once a day');
}

/* 3: nothing personal */
{
  const p = page();
  p.E.outingStart('o1', 'survivor', null, 0);
  p.E.pitch('o1', 'survivor', null, { n: 1, result: 'swinging_strike', name: 'Victor Robles', userId: 'u-1', email: 'a@b.c' });
  p.E.outingEnd('o1', 'survivor', null, Object.assign({ account: { streak: 3, rank: 2 }, userId: 'u-1' }, R));
  p.E.share('daily', 15, 'image');
  const s = p.flush();
  const allowed = new Set(['game_name', 'mode', 'day', 'resumed', 'pitch_no', 'result', 'pitches', 'score_band', 'method']);
  ok(s.every((a) => Object.keys(a[2]).every((k) => allowed.has(k))), '3 every field is on the list (no id, no name, no email, no account)');
  ok(s.every((a) => Object.values(a[2]).every((v) => typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 20 && !/@/.test(v)) || v === 'Shut The Door')),
    '3 every value is a number, a boolean or a short word');
  ok(!('day' in events(s, 'outing_start')[0]), '3 a field with no value is left out, never sent as null');
}

/* 4: never in the way */
{
  const p = page(function () { throw new Error('gtag broke'); });
  let threw = false;
  try { p.E.outingStart('o1', 'daily', 15, 0); p.E.pitch('o1', 'daily', 15, { n: 1, result: 'ball' }); p.E.outingEnd('o1', 'daily', 15, R); p.E.share('daily', 15, 'save'); p.flush(); } catch (e) { threw = true; }
  ok(!threw, '4 a gtag that throws throws nothing back to the game');
  const q = page(null);
  let threw2 = false;
  try { q.E.outingStart('o1', 'daily', 15, 0); q.E.outingEnd('o1', 'daily', 15, R); q.flush(); } catch (e) { threw2 = true; }
  ok(!threw2 && q.sent.length === 0, '4 with no gtag on the page nothing is sent and nothing throws');
  ok(!/fetch\(|XMLHttpRequest|sendBeacon|createElement\(['"]script|https?:\/\//.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')), '4 events.js loads nothing and calls no host of its own: only the page\'s gtag');
}

/* 7 */
{
  const p = page();
  p.E.promo('baseball', 'daily', 15);
  const now = p.sent.slice();
  p.flush();
  const got = events(p.sent, 'promo_click');
  ok(now.length === 1 && got.length === 1, '7 promo_click goes at once, once (a deferred send would be lost when the link leaves)');
  ok(got[0] && keys(got[0]) === FIELDS.promo_click && got[0].target === 'baseball' && got[0].mode === 'daily' && got[0].day === 15 && got[0].transport_type === 'beacon',
    '7 promo_click carries ' + FIELDS.promo_click + ', target baseball, as a beacon (' + JSON.stringify(got[0]) + ')');
  const q = page(function () { throw new Error('gtag broke'); });
  let threw = false;
  try { q.E.promo('baseball', 'daily', 15); } catch (e) { threw = true; }
  ok(!threw, '7 a gtag that throws on the tap throws nothing back, so the link still goes');
  ok(/\$\('r-promo'\)\.addEventListener\('click', function \(\) \{ if \(EV\(\)\) EV\(\)\.promo\('baseball'/.test(UI), '7 ui.js sends it from the card\'s tap, and only from it');
  ok(/<a class="r-promo" id="r-promo" href="\/baseball\/" hidden>/.test(HTML) && HTML.indexOf('id="r-promo"') > HTML.indexOf('id="r-home"'), '7 the card is a plain link to /baseball/, under the menu, hidden until the result says');
}

/* 5 */
{
  const { E } = page();
  ok([[0, 0], [9.9, 0], [10, 10], [76.4, 70], [99, 90], [100, 90], [-3, 0]].every(([p, b]) => E.band(p) === b) && E.band(null) === null && E.band(NaN) === null, '5 score_band is the percentile in tens, 0 to 90');
}

/* 6: the page wiring */
{
  const fn = (name) => { const i = UI.indexOf('function ' + name + '('); return i < 0 ? '' : UI.slice(i, UI.indexOf('\nfunction ', i + 10)); };
  ok(/show\('s-mound'\);\s*\n\s*if \(EV\(\)\) EV\(\)\.outingStart\(S\.outing\.outingId/.test(fn('enterMound')), '6 outing_start goes when the mound shows (enterMound)');
  ok(/API\.throwPitch\([^)]*\)\.then\(function \(res\) \{\s*\n[^\n]*\n\s*if \(EV\(\)\) EV\(\)\.pitch\(/.test(fn('fire')), '6 pitch goes as the engine answers, before the play is drawn, and nothing waits on it (fire)');
  ok(/API\.finishOuting\(id\)\.then\(function \(r\) \{\s*\n\s*if \(EV\(\)\) EV\(\)\.outingEnd\(id/.test(fn('finish')), '6 outing_end and daily_done go with the result (finish)');
  ok((UI.match(/shared\('(text|image|save)'\)/g) || []).length >= 5, '6 share goes from the image, the save and the text');
  ok(/<script src="events\.js\?v=\d+"><\/script>\s*\n<script src="ui\.js\?v=\d+"><\/script>/.test(HTML), '6 index.html loads events.js just before ui.js');
}

console.log(`\n${passes} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
