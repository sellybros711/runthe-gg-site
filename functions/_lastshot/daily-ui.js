/* THE DAILY LAST SHOT, the page side (Phase 2, 2026-11-13). The day's
 * situation, the score and the one-run rule are daily.js and the Arcade Lab's
 * daily service (functions/_arcadelab/api.js, game 'last-shot'); this is how
 * the page talks to that service and draws what it says.
 *
 *   GET  /api/arcade/last-shot/today         the day: seed, config, played
 *   POST /api/arcade/last-shot/start         the restart guard, once a day
 *   POST /api/arcade/last-shot/run           the scored run: the server runs the play
 *   GET  /api/arcade/last-shot/leaderboard   the day's board and my rank
 *
 * WHO IS ASKING: the Supabase bearer from the arcade's sign in, and the Lab's
 * guest id header (the same localStorage key the Lab's pages use, so a guest
 * is the same guest here). The gate means a signed in tester, so the guest
 * only matters if the session has not come back yet.
 *
 * LOCAL: one key, last_shot_daily, shaped
 *   { dateKey, play, scored, started }
 * the play on the clipboard, the play that was filed (for Beat my play on a
 * second visit) and whether start was posted, so a reload does not count as
 * a restart. A new day drops it. Read through cleanPlay, never trusted. */
import { MIN_FRAMES } from './daily.js';
import { cleanPlay, starText } from './ladder-ui.js';
import { adder, verdictBlock, checklist, factsOfDetail, scoreLineOf } from './cards.js';

export const GAME_ID = 'last-shot';
export const DAY_KEY = 'last_shot_daily';
const GUEST_KEY = 'arcade_lab_guest_v1';
/* The server refuses a run filed faster than its frames at 60 Hz, less 20%
   (MIN_FRAMES 180 is 2400 ms). Timed from opening the daily; a post that
   would beat it waits, with a margin for clocks. */
export const MIN_POST_MS = Math.ceil(MIN_FRAMES * 1000 / 60 * 0.8) + 400;

const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

export function guestId() {
  let g = lsGet(GUEST_KEY);
  if (!g || !/^[A-Za-z0-9-]{8,64}$/.test(g)) {
    const b = new Uint8Array(16); crypto.getRandomValues(b);
    g = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    lsSet(GUEST_KEY, g);
  }
  return g;
}

/* Wait for the arcade's sign in to say who this is, or 4 seconds. */
export function whenSignedIn() {
  const A = window.RTG_AUTH;
  return new Promise(res => {
    try {
      if (!A || !A.boot || !A.boot()) return res(null);
      const s0 = A.state && A.state();
      if (s0 && s0.resolved) return res(s0);
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; res(null); } }, 4000);
      A.onChange(s => { if (done || !s || !s.resolved) return; done = true; clearTimeout(t); res(s); });
    } catch (e) { res(null); }
  });
}

/* { status, data }. A network failure is status 0, never a throw. */
export async function api(method, path, body) {
  const h = { 'Content-Type': 'application/json', 'X-Arcade-Guest': guestId() };
  try { const A = window.RTG_AUTH, t = A && A.token && A.token(); if (t) h.Authorization = 'Bearer ' + t; } catch (e) {}
  try {
    const r = await fetch('/api/arcade/' + GAME_ID + '/' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let data = null; try { data = await r.json(); } catch (e) {}
    return { status: r.status, data };
  } catch (e) { return { status: 0, data: null }; }
}

/* The one line a failed run gets. The play stays on the clipboard. */
const LINES = {
  score_mismatch: 'The server saw a different result. Reload and try again.',
  illegal_play: 'The server can\'t run that play. Fix it and try again.',
  bad_play: 'The server can\'t run that play. Fix it and try again.',
  bad_inputs: 'The server can\'t run that play. Fix it and try again.',
  stale_day: 'A new day started. Reload for today\'s.',
  wrong_seed: 'Today\'s shot changed. Reload.',
  slow_down: 'Too many tries. Wait a few minutes.',
  implausible_duration: 'That was too quick to file. Try again.',
  not_found: 'The Daily is off right now.'
};
export function errorLine(r) {
  if (!r || !r.status) return 'No connection. Your play is kept. Try again.';
  const e = r.data && r.data.error;
  return LINES[e] || 'That didn\'t file. Try again.';
}

/* ---------- the day on this device ---------- */
export function loadDay(dateKey) {
  let raw = null;
  try { raw = JSON.parse(lsGet(DAY_KEY) || 'null'); } catch (e) { raw = null; }
  const out = { dateKey, play: null, scored: null, started: false };
  if (!raw || typeof raw !== 'object' || raw.dateKey !== dateKey) return out;
  out.play = cleanPlay(raw.play);
  out.scored = cleanPlay(raw.scored);
  out.started = raw.started === true;
  return out;
}
export const saveDay = d => lsSet(DAY_KEY, JSON.stringify(d));

/* ---------- the clock to the next one (the Lab's seed.js, copied) ---------- */
const NY = (() => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }); } catch (e) { return null; } })();
export function dateKeyNY(ms) {
  if (!NY) return new Date(ms).toISOString().slice(0, 10);
  const p = NY.formatToParts(new Date(ms)), g = t => p.find(x => x.type === t).value;
  return g('year') + '-' + g('month') + '-' + g('day');
}
export function msToNextDay(ms) {
  const today = dateKeyNY(ms);
  let lo = ms, hi = ms + 26 * 3600000;
  while (hi - lo > 1000) { const mid = Math.floor((lo + hi) / 2); if (dateKeyNY(mid) === today) lo = mid; else hi = mid; }
  return hi - ms;
}
export function hms(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
  return h + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0');
}
export const nextLine = () => 'Next one in ' + hms(msToNextDay(Date.now()));

/* ---------- the board ---------- */
/* A score on the board: the stars and the look, or a loss and the look. */
export function boardScore(score) {
  const look = (score % 100) + '%';
  if (score < 1000) return 'Lost · ' + look;
  return starText(Math.min(3, Math.floor((score - 1000) / 100))) + ' ' + look;
}
export function rankLine(lb) {
  const me = lb && lb.me;
  if (!me) return '';
  if (me.restarted) return 'Started twice today. Off the board.';
  if (me.rank) return '#' + me.rank + ' of ' + lb.total + ' today';
  return 'Sign in to get ranked.';
}
/* The top ten, me highlighted; me under it when I am further down. */
export function renderBoard(box, lb, max = 10) {
  box.innerHTML = '';
  const add = adder(box);
  const top = (lb && Array.isArray(lb.top) ? lb.top : []).slice(0, max);
  if (!top.length) { add('p', 'muted', 'Nobody on the board yet.'); return; }
  const ol = add('ol', 'dboard');
  top.forEach((r, i) => {
    const li = add('li', r.me ? 'me' : null, null, ol);
    add('span', 'drk', String(i + 1), li);
    add('span', 'dnm', r.me ? 'You' : String(r.name || 'Player').slice(0, 24), li);
    add('span', 'dsc', boardScore(r.score), li);
  });
  const me = lb.me;
  if (me && me.rank && me.rank > top.length && !top.some(r => r.me)) {
    const li = add('li', 'me far', null, ol);
    add('span', 'drk', String(me.rank), li);
    add('span', 'dnm', 'You', li);
    add('span', 'dsc', boardScore(me.score), li);
  }
}

/* ---------- the home card ---------- */
const $ = id => document.getElementById(id);
/* st: { today, error, off } */
export function homeCard(st) {
  const card = $('hDaily');
  if (!card) return;
  card.hidden = !!st.off;
  if (st.off) return;
  const t = st.today, played = t && t.played;
  card.classList.toggle('done', !!played);
  $('hDailyName').textContent = t ? 'Daily Last Shot #' + t.dayNumber : 'Daily Last Shot';
  $('hDailyGo').textContent = !t ? (st.error ? 'Retry' : '') : played ? 'Result' : 'Play';
  $('hDailyGo').hidden = !t && !st.error;
  $('hDailySq').hidden = !played;
  if (played) $('hDailySq').textContent = (played.squares || []).join('');
  $('hDailyTitle').textContent = !t ? (st.error ? 'Couldn\'t load today\'s shot. Tap to try again.' : 'Loading today\'s shot.')
    : played ? played.scoreText : t.config.title;
  $('hDailyCount').textContent = t ? nextLine() : '';
}

/* ---------- the daily result card ----------
 * o: { day, result, reduce, fresh, schemeName }
 * h: { share(btn), beat(btn) or null, practice(), home() }
 * Returns the stars it shows and the places the board and rank land. */
export function dailyCard(c, o, h) {
  const { day, result } = o, d = result.detail || {};
  const add = adder(c);
  c.className = 'card lvl daily';
  c.innerHTML = '';
  const n = d.outcome === 'win' ? (d.stars | 0) : 0;
  c.dataset.stars = String(n);
  add('p', 'lvlname', 'Daily Last Shot #' + day.dayNumber + ' · ' + day.config.title);
  verdictBlock(add, d.outcome === 'win', scoreLineOf(d.us, d.them, d.how === 'ot'), n, o.reduce);
  checklist(add, n, factsOfDetail(d));
  add('p', 'dscore', result.scoreText).id = 'dScore';
  if (d.reason) add('p', 'reason', d.reason);
  add('p', 'facts dscheme', 'Today they played: ' + (d.schemeName || d.scheme || '-')).id = 'dScheme';
  const meta = add('div', 'dmeta');
  const rank = add('b', 'drank', '', meta); rank.id = 'dRank';
  if (result.gems > 0) add('span', 'dgems', '+' + result.gems + ' gems', meta).id = 'dGems';
  const box = add('div', 'dboardbox'); box.id = 'dBoard';
  add('p', 'muted', 'Loading the board.', box);
  const count = add('p', 'dcount', nextLine()); count.id = 'dCount';
  const btn = (label, cls, fn, id, to) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.id = id; b.addEventListener('click', () => fn(b)); to.appendChild(b); return b; };
  const row = add('div', 'row');
  btn('Share', 'go', h.share, 'bDayShare', row);
  if (h.beat) btn('Beat my play', 'alt', h.beat, 'bBeat', row);
  const row2 = add('div', 'row');
  btn('Practice', 'alt', h.practice, 'bDayPractice', row2);
  btn('Home', 'alt', h.home, 'bDayHome', row2);
  return { n, rank, box, count };
}
