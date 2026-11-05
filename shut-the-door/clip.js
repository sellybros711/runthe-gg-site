/* Shut The Door: a clip of one pitch, as a link (the owner, 2026-11-05: "You should be able to share
 * clips of any of your pitches retroactively after the game").
 *
 * The engine is deterministic: an outing replays exactly from its seed and its calls (api.js resume,
 * check-replays.mjs). So a clip is the calls up to and including the pitch, and the seed: a daily or
 * an archive day's seed is the day's (engine.js seedFor), so only the day is written; practice and
 * Survivor write their own seed. Nothing else is stored or sent: the link is the clip.
 *
 *   STD_CLIP.encode(spec)        the link's value (the ?clip= param)
 *   STD_CLIP.decode(text)        the spec, or null for anything malformed
 *   STD_CLIP.replay(E, pack, model, spec)
 *                                the pitch played again on its own outing: { before, pr, final, after }
 *
 * spec: { mode: 'd' | 'a' | 'p' | 's' (daily, archive, practice, Survivor), day: 'YYYY-MM-DD',
 *         pack: scenario id, seed (p and s only), rules, calls: [kept calls, engine.js keptCall] }
 *
 * THE FORMAT (version 1), dots between the fields:
 *   1.<mode>.<day YYYYMMDD>.<rules>.<pack>[.<seed base 36>].<call>.<call>...
 * and each call is its type and cell, then its tags:
 *   q<n> release (n = q x 100), e<n> effort, a<u>_<v> the free aim point (x 100, signed),
 *   c a challenge made on it (ch 1), s a quick delivery (ss 1), p<n> pickoff throws after it (pa)
 *   e.g. 1.d.20261105.10.std-2025-ws7-yamamoto.FF12q62a3_-4.SL7q85e40c
 * The rules ride once in the header: every call of a rules 2 and later outing carries the same r, a
 * rules 1 call carries none (engine.js keptCall). The replay takes the rules from the calls, as a
 * resume does, so a clip of an old outing plays under the rules it was played under, and a link from
 * a newer build than this one fails on createOuting rather than playing something else.
 *
 * The replay is its own outing in memory: it is never stored, never resumed, never submitted. */
(function () {
'use strict';
const NODE = typeof module !== 'undefined' && module.exports;
const K = NODE ? require('./contract.js') : window.STD_CONTRACT;

const V = 1;
const MODES = ['d', 'a', 'p', 's'];
const MODE_OF = { daily: 'd', archive: 'a', practice: 'p', survivor: 's' };
const MAX_CALLS = 160;
const CALL_RE = /^([A-Z]{2})(\d{1,2})((?:q\d{1,3}|e\d{1,3}|a-?\d{1,2}_-?\d{1,2}|c|s|p\d)*)$/;
const TAG_RE = /q(\d{1,3})|e(\d{1,3})|a(-?\d{1,2})_(-?\d{1,2})|(c)|(s)|p(\d)/g;
const STEPS = () => ({ q: K.RELEASE.STEPS, e: K.EFFORT.STEPS, a: K.AIM.STEPS });

function int(x) { return Math.round(x); }

function encodeCall(c) {
  const st = STEPS();
  let s = c.type + c.cell;
  if (c.q != null) s += 'q' + int(c.q * st.q);
  if (c.e != null) s += 'e' + int(c.e * st.e);
  if (c.at != null) s += 'a' + int(c.at[0] * st.a) + '_' + int(c.at[1] * st.a);
  if (c.ch === 1) s += 'c';
  if (c.ss === 1) s += 's';
  if (c.pa) s += 'p' + c.pa;
  return s;
}

function encode(spec) {
  const day = String(spec.day || '').replace(/-/g, '');
  const head = [V, spec.mode, day, spec.rules, spec.pack];
  if (spec.mode === 'p' || spec.mode === 's') head.push((spec.seed >>> 0).toString(36));
  return head.concat(spec.calls.map(encodeCall)).join('.');
}

function decodeCall(text, rules) {
  const m = CALL_RE.exec(text);
  if (!m) return null;
  const st = STEPS();
  const c = { type: m[1], cell: +m[2] };
  if (c.cell > 24) return null;
  const tags = m[3];
  let t, seen = '';
  TAG_RE.lastIndex = 0;
  while ((t = TAG_RE.exec(tags))) {
    const k = t[0][0];
    if (seen.includes(k)) return null;   // each tag once
    seen += k;
    if (k === 'q') c.q = +t[1] / st.q;
    else if (k === 'e') c.e = +t[2] / st.e;
    else if (k === 'a') c.at = [+t[3] / st.a + 0, +t[4] / st.a + 0];
    else if (k === 'p') c.pa = +t[7];
  }
  if ((c.q != null && c.q > 1) || (c.e != null && c.e > 1)) return null;
  if (c.at && c.at.some((x) => Math.abs(x) > K.AIM.MAX)) return null;
  if (c.pa === 0) return null;
  // the engine's own order (keptCall): type, cell, q, e, at, r, ch, ss, pa
  const out = { type: c.type, cell: c.cell };
  if (c.q != null) out.q = c.q;
  if (c.e != null) out.e = c.e;
  if (c.at) out.at = c.at;
  if (rules >= 2) out.r = rules;
  if (seen.includes('c')) out.ch = 1;
  if (seen.includes('s')) out.ss = 1;
  if (c.pa) out.pa = c.pa;
  return out;
}

function decode(text) {
  if (typeof text !== 'string' || text.length > 4000) return null;
  const f = text.trim().split('.');
  if (f.length < 6 || f[0] !== String(V) || !MODES.includes(f[1])) return null;
  const mode = f[1];
  if (!/^\d{8}$/.test(f[2])) return null;
  const day = f[2].slice(0, 4) + '-' + f[2].slice(4, 6) + '-' + f[2].slice(6, 8);
  if (isNaN(Date.parse(day + 'T12:00:00Z'))) return null;
  if (!/^\d{1,2}$/.test(f[3])) return null;
  const rules = +f[3];
  if (rules < 1) return null;
  if (!/^[a-z0-9-]{1,80}$/.test(f[4])) return null;
  const spec = { mode, day, rules, pack: f[4] };
  let at = 5;
  if (mode === 'p' || mode === 's') {
    if (!/^[0-9a-z]{1,7}$/.test(f[5])) return null;
    const seed = parseInt(f[5], 36);
    if (!(seed >= 0 && seed <= 0xffffffff)) return null;
    spec.seed = seed;
    at = 6;
  }
  const raw = f.slice(at);
  if (!raw.length || raw.length > MAX_CALLS) return null;
  const calls = [];
  for (const r of raw) { const c = decodeCall(r, rules); if (!c) return null; calls.push(c); }
  spec.calls = calls;
  return spec;
}

/* The spec of pitch n (1 based) of an outing: its mode, day, seed and rules, and its first n calls. */
function specOf(o, day, n) {
  return { mode: MODE_OF[o.mode] || 'p', day, rules: o.rules, pack: o.pack.scenario.id, seed: o.seed, calls: o.calls.slice(0, n).map((c) => Object.assign({}, c)) };
}

/* The seed a spec plays on: the day's for a daily or an archive day, else its own. */
function seedOf(E, spec) { return spec.mode === 'd' || spec.mode === 'a' ? E.seedFor('daily', spec.day) : (spec.seed >>> 0); }

/* The pitch again, on an outing of its own: every call before it as it was (challenges and pickoffs
   too), then the pitch itself as it was thrown, the way the field saw it (before any challenge the
   pitcher's side made after it, and without the pickoff throws after it). before is the state the
   pitch was thrown in, pr the pitch as the scene plays it, final the pitch as it stands (a won
   challenge makes a called ball a strike), after the state after it. Throws on a call the engine
   refuses: a clip of a forged or foreign outing does not play. */
function replay(E, pack, model, spec) {
  const calls = spec.calls;
  if (E.rulesOf(calls) !== (spec.rules >= 2 ? spec.rules : 1)) throw new Error('the clip\'s rules do not match its calls');
  const o = E.createOuting(pack, { seed: seedOf(E, spec), mode: 'practice', model, rules: E.rulesOf(calls), outingId: 'clip' });
  for (let i = 0; i < calls.length - 1; i++) {
    if (o.status !== 'live') throw new Error('the outing ended before pitch ' + calls.length);
    E.throwPitch(o, calls[i]);
  }
  if (o.status !== 'live') throw new Error('the outing ended before pitch ' + calls.length);
  const before = E.publicState(o);
  const last = Object.assign({}, calls[calls.length - 1]);
  const ch = last.ch === 1;
  delete last.ch; delete last.pa;
  const res = E.throwPitch(o, last);
  const pr = JSON.parse(JSON.stringify(res.pitchResult));
  let final = pr;
  if (ch) {
    if (!E.challengeLive(o)) throw new Error('a challenge on a pitch with none to make');
    final = JSON.parse(JSON.stringify(E.challengePitch(o).pitchResult));
  }
  return { before: JSON.parse(JSON.stringify(before)), pr, final, after: JSON.parse(JSON.stringify(E.publicState(o))) };
}

const api = Object.freeze({ V, MODE_OF, encode, decode, specOf, seedOf, replay });
if (NODE) module.exports = api;
if (typeof window !== 'undefined') window.STD_CLIP = api;
})();
