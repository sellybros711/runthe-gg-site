/* Stumpire: the rules, as a pure state machine. No I/O, no clock of its own:
 * every call is handed `now`, and every fact about a prompt (whether an id is
 * valid, its frozen tier, the called list) comes in through `slate`. The API
 * persists what this returns; the client only ever sees what the API sends.
 *
 * State (JSON, stored on the play row):
 *   { v, slate, no, i, outs, over, won, ab: [ AtBat x5 ] }
 *   AtBat: { s: 'pending'|'live'|'done', t0, paused, pausedAt, strikes,
 *            tried: [ids], r: { ruling, tier, id, name, arguable } }
 *
 * `slate` handed to answer():
 *   { prompts: [ { id, league, type, called: [ids], rows: Map(id -> { tier, called, arguable, name }) } ] }
 */
import { CONFIG } from './config.js';

export function newPlay(slateDate, slateNo) {
  return {
    v: 1, slate: slateDate, no: slateNo, i: 0, outs: 0, over: false, won: false,
    ab: Array.from({ length: CONFIG.AT_BATS }, () => ({ s: 'pending', strikes: 0, tried: [], paused: 0 }))
  };
}

export function current(st) { return st.over ? null : st.ab[st.i]; }

export function elapsed(ab, now) {
  if (!ab || ab.s !== 'live') return 0;
  const pausedNow = ab.pausedAt ? now - ab.pausedAt : 0;
  return Math.max(0, now - ab.t0 - (ab.paused || 0) - pausedNow);
}
export function remaining(ab, now) { return Math.max(0, CONFIG.CLOCK_MS - elapsed(ab, now)); }

/* An at-bat's clock starts when the prompt is first shown, and only then. */
export function start(st, now) {
  const ab = current(st);
  if (!ab) return { error: 'game_over' };
  if (ab.s === 'pending') { ab.s = 'live'; ab.t0 = now; ab.paused = 0; ab.pausedAt = null; }
  return { ok: true };
}

function resume(ab, now) {
  if (ab.pausedAt) { ab.paused += now - ab.pausedAt; ab.pausedAt = null; }
}

export function maxTier(strikes) { return Math.max(1, CONFIG.MAX_BASES - strikes); }

function finishAtBat(st, ab, r) {
  ab.s = 'done'; ab.r = r; ab.pausedAt = null;
  if (r.ruling === 'OUT') st.outs++;
  st.i++;
  if (st.outs >= CONFIG.OUTS_TO_END || st.i >= CONFIG.AT_BATS) {
    st.over = true;
    st.won = st.i >= CONFIG.AT_BATS && st.outs < CONFIG.OUTS_TO_END;
  }
}

/* One submission. input: { entityId } | { text } | { timeout: true }.
   resolve(input, ctx) is the matcher. Returns what happened; `st` is mutated.
     { ruling: 'SAFE'|'OUT'|'STRIKE'|'NO_PITCH'|'PICKER', tier, strikes, picker,
       strikeout, expired, reason, match, review, atBatOver, log } */
export function answer(st, input, slate, resolve, now) {
  const ab = current(st);
  if (!ab) return { error: 'game_over' };
  if (ab.s !== 'live') return { error: 'not_started' };
  const p = slate.prompts[st.i];
  const out = { strikes: ab.strikes };

  const late = elapsed(ab, now) > CONFIG.CLOCK_MS + CONFIG.CLOCK_TOLERANCE_MS;
  if (input && input.timeout && !late && elapsed(ab, now) < CONFIG.CLOCK_MS - CONFIG.CLOCK_TOLERANCE_MS) {
    return { ruling: 'NO_PITCH', reason: 'clock_running', strikes: ab.strikes };
  }
  if (late || (input && input.timeout)) {
    out.expired = true;
    out.log = { raw: input && input.text ? String(input.text) : '', matched: null, status: 'expired' };
    return strike(st, ab, out, now);
  }

  resume(ab, now);
  const m = resolve(input || {}, { league: p.league, type: p.type });
  out.log = { raw: input && input.text != null ? String(input.text) : (input && input.entityId) || '',
    matched: m.status === 'match' ? m.id : null, status: m.status, via: m.via || null };
  if (m.status === 'picker') {
    ab.pausedAt = now;            // the clock stops while they choose
    return { ...out, ruling: 'PICKER', picker: m.options };
  }
  if (m.status !== 'match') return { ...out, ruling: 'NO_PITCH', reason: m.reason };
  if (ab.tried.includes(m.id)) return { ...out, ruling: 'NO_PITCH', reason: 'already_tried', match: m.id };

  out.match = m.id;
  const row = p.rows.get(m.id);
  if (!row) { ab.tried.push(m.id); out.reason = 'invalid'; return strike(st, ab, out, now); }
  if (row.called) {
    finishAtBat(st, ab, { ruling: 'OUT', tier: 0, id: m.id, name: row.name, called: true });
    return { ...out, ruling: 'OUT', tier: 0, atBatOver: true };
  }
  let tier = Math.min(row.tier, maxTier(ab.strikes));
  if (row.arguable) { tier = Math.min(tier, CONFIG.ARGUABLE_CAP); out.review = { id: m.id, reason: 'arguable' }; }
  finishAtBat(st, ab, { ruling: 'SAFE', tier, id: m.id, name: row.name, arguable: !!row.arguable });
  return { ...out, ruling: 'SAFE', tier, atBatOver: true };
}

function strike(st, ab, out, now) {
  ab.strikes++;
  out.strikes = ab.strikes;
  if (ab.strikes >= CONFIG.STRIKES_TO_OUT) {
    finishAtBat(st, ab, { ruling: 'OUT', tier: 0, id: out.match || null, strikeout: true });
    return { ...out, ruling: 'STRIKE', strikeout: true, tier: 0, atBatOver: true };
  }
  if (out.expired) { ab.t0 = now; ab.paused = 0; ab.pausedAt = null; }   // a fresh clock for the retry
  return { ...out, ruling: 'STRIKE' };
}

/* ---------- results ---------- */
export function summary(st) {
  const tiers = st.ab.map(a => (a.s === 'done' ? (a.r.ruling === 'SAFE' ? a.r.tier : 0) : null));
  const bases = tiers.reduce((s, t) => s + (t || 0), 0);
  const strikes = st.ab.reduce((s, a) => s + (a.strikes || 0), 0);
  const hit = new Set(tiers.filter(t => t > 0));
  return {
    over: st.over, won: st.won, bases, max: CONFIG.AT_BATS * CONFIG.MAX_BASES,
    outs: st.outs, strikes, tiers,
    cycle: [1, 2, 3, 4].every(t => hit.has(t))
  };
}

/* Higher is better: total bases, then fewer outs, then fewer strikes. */
export function compareResults(a, b) {
  return (b.bases - a.bases) || (a.outs - b.outs) || (a.strikes - b.strikes);
}

const KEYCAP = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣'];
export function shareLine(st) {
  const s = summary(st);
  const marks = st.ab.map(a => a.s !== 'done' ? '⬜' : a.r.ruling === 'SAFE' ? KEYCAP[a.r.tier] : '❌');
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  return 'Stumpire #' + st.no + '\n' + marks.join(' ') + '\n'
    + s.bases + '/' + s.max + ' · ' + plural(s.outs, 'out') + ' · ' + plural(s.strikes, 'strike');
}
