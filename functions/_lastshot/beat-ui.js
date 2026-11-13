/* BEAT MY PLAY, the page side (Phase 2, 2026-11-13). The link format and the
 * rule for who won are challenge.js; this reads the link from the address,
 * draws the Challenge screen and makes a link from a run.
 *
 *   /last-shot#beat=<code>   a challenge: their situation, seed and play
 *   /last-shot#daily         straight to the Daily (the Arcade Lab links here)
 *
 * What their play did is worked out here from the play (resultOf), never
 * read from the link. A link that does not decode is "That link didn't
 * work." and a way home, never a crash. The page clears the hash when the
 * player leaves, so a reload does not trap them in it. */
import { encode, decode, resultOf, challengeScenario, MAX_LINK } from './challenge.js';
import { SCHEME_NAMES, isZone } from './scenario.js';
import { adder, summaryOf } from './cards.js';

const SET_NAMES = { box: 'Box', horns: 'Horns', high14: '1-4 high', out41: 'Spread' };
export const BEAT_TEXT = 'I drew this one. Beat it.';

/* null, { kind: 'daily' } or { kind: 'beat', code } */
export function readHash(hash) {
  const h = String(hash || '');
  if (h === '#daily') return { kind: 'daily' };
  if (h.startsWith('#beat=')) return { kind: 'beat', code: h.slice(6) };
  return null;
}
export function clearHash() {
  if (!location.hash) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
}

/* The challenge and what their play did, or null for a bad link. */
export function openChallenge(code) {
  try {
    const ch = decode(code);
    if (!ch) return null;
    const theirs = resultOf(ch);
    if (!theirs || !theirs.res || !Array.isArray(theirs.res.frames)) return null;
    return { ch, sc: challengeScenario(ch), theirs };
  } catch (e) { return null; }
}

/* A link for a run, or null when the play will not survive the trip. */
export function beatLink(ch) {
  try {
    const code = encode(ch);
    if (code.length > MAX_LINK || !decode(code)) return null;
    return location.origin + '/last-shot#beat=' + code;
  } catch (e) { return null; }
}

export const theirLine = res => 'Their play: ' + summaryOf(res);
export const sitLine = ch => ch.clock.toFixed(1) + ' · Down ' + ch.down + ' · ' + (SET_NAMES[ch.set] || ch.set);
export const scoutOf = ch => (ch.scheme ? 'Scout: ' + SCHEME_NAMES[ch.scheme] + (isZone(ch.scheme) ? '' : ' on screens') : '');

/* Share it, or copy it. The button says what happened. */
export async function shareBeat(url, btn) {
  const label = btn.textContent;
  const back = () => setTimeout(() => { btn.textContent = label; }, 1600);
  try { if (navigator.share) { await navigator.share({ text: BEAT_TEXT, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(BEAT_TEXT + '\n' + url); btn.textContent = 'Link copied'; } catch (e) { btn.textContent = 'Copy failed'; }
  back();
}

/* The Challenge screen: their result, the spot, Watch and Draw yours. */
export function renderChallenge(root, chal, h) {
  root.innerHTML = '';
  const add = adder(root);
  const card = add('div', 'beatcard');
  add('p', 'beatkick', 'Beat my play', card);
  add('h2', 'beathead', theirLine(chal.theirs.res), card).id = 'beatHead';
  add('p', 'beatsit', sitLine(chal.ch), card).id = 'beatSpot';
  if (chal.ch.scheme) add('span', 'lscout', scoutOf(chal.ch), card).id = 'beatScoutIntro';
  add('p', 'muted', 'Same spot. Same roll. Same defense. Draw yours.', card);
  const row = add('div', 'row', null, card);
  const btn = (label, cls, fn, id) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.id = id; b.addEventListener('click', fn); row.appendChild(b); return b; };
  btn('Watch their play', 'dark', h.watch, 'bWatch');
  btn('Draw yours', 'go', h.draw, 'bDraw');
  const row2 = add('div', 'row', null, card);
  const home = document.createElement('button'); home.className = 'btn alt'; home.textContent = 'Home'; home.id = 'bBeatHome';
  home.addEventListener('click', h.home); row2.appendChild(home);
}

export function renderBadLink(root, home) {
  root.innerHTML = '';
  const add = adder(root);
  const card = add('div', 'beatcard');
  add('h2', 'beathead', 'That link didn\'t work.', card).id = 'beatBad';
  const row = add('div', 'row', null, card);
  const b = document.createElement('button'); b.className = 'btn go'; b.textContent = 'Home'; b.id = 'bBeatHome';
  b.addEventListener('click', home); row.appendChild(b);
}
