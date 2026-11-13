/* BEAT MY PLAY (the owner, 2026-11-13). A link that carries a situation, a
 * seed and the sender's play. The friend's page runs the sender's play on
 * that seed to show what it did, then the friend draws theirs against the
 * same roll: the same defense, the same bounces for the same choices.
 *
 * No score rides in the link. The page works it out from the play, so a
 * link cannot claim a result the play did not earn.
 *
 * Format: '#beat=' + base64url(JSON) of
 *   { v, c: clock, d: down, s: set, x: scheme or null, seed,
 *     o: [10 spot numbers, tenths of a foot], g: goAt or null,
 *     k: steps as ['m'|'s', who, x1, y1, x2, y2, ...] | ['p', from, to] | ['h', who] }
 * A typical play is under a kilobyte. */
import { SCENARIO, DEFENSES } from './scenario.js';
import { IDS, scenarioFor } from './playbook.js';
import { SETS } from './levels.js';
import { cleanPlay, scoreOf } from './daily.js';
import { simulate } from './sim.js';

export const CHALLENGE_VERSION = 1;
export const MAX_LINK = 6000;
const t10 = n => Math.round(n * 10);

export function challengeScenario(ch, sc = SCENARIO) {
  const s = scenarioFor(sc, { clock: ch.clock, down: ch.down });
  return { ...s, spots: JSON.parse(JSON.stringify(SETS[ch.set] || sc.spots)) };
}
export const challengeOpt = ch => (ch.scheme ? { scheme: ch.scheme } : {});

/* ch: { clock, down, set, scheme, seed, play } */
export function encode(ch) {
  const p = ch.play;
  const k = p.steps.map(s => s.kind === 'pass' ? ['p', s.from, s.to] : s.kind === 'shoot' ? ['h', s.who]
    : [s.kind === 'move' ? 'm' : 's', s.who, ...s.pts.flatMap(q => [t10(q.x), t10(q.y)])]);
  const o = IDS.flatMap(id => [t10(p.spots[id].x), t10(p.spots[id].y)]);
  const body = { v: CHALLENGE_VERSION, c: ch.clock, d: ch.down || 1, s: ch.set || 'box', x: ch.scheme || null, seed: ch.seed >>> 0, o, g: p.goAt ?? null, k };
  return b64(JSON.stringify(body));
}

/* The challenge, checked, or null. Anything odd is null, never a throw. */
export function decode(str) {
  try {
    if (typeof str !== 'string' || !str || str.length > MAX_LINK) return null;
    const b = JSON.parse(unb64(str));
    if (!b || b.v !== CHALLENGE_VERSION) return null;
    if (!(b.c >= 4 && b.c <= 24) || ![1, 2, 3].includes(b.d) || !SETS[b.s]) return null;
    if (b.x != null && !DEFENSES.includes(b.x)) return null;
    if (!Number.isInteger(b.seed) || b.seed < 0 || b.seed > 0xffffffff) return null;
    if (!Array.isArray(b.o) || b.o.length !== 10 || !Array.isArray(b.k)) return null;
    const spots = {};
    IDS.forEach((id, i) => { spots[id] = { x: b.o[2 * i] / 10, y: b.o[2 * i + 1] / 10 }; });
    const steps = b.k.map(s => {
      if (!Array.isArray(s)) return null;
      if (s[0] === 'p') return { kind: 'pass', from: s[1], to: s[2] };
      if (s[0] === 'h') return { kind: 'shoot', who: s[1] };
      if (s[0] === 'm' || s[0] === 's') {
        const n = s.slice(2), pts = [];
        for (let i = 0; i + 1 < n.length; i += 2) pts.push({ x: n[i] / 10, y: n[i + 1] / 10 });
        return { kind: s[0] === 'm' ? 'move' : 'screen', who: s[1], pts };
      }
      return null;
    });
    const raw = { spots, steps };
    if (b.g != null) raw.goAt = b.g;
    const play = cleanPlay(raw);
    if (!play) return null;
    return { clock: b.c, down: b.d, set: b.s, scheme: b.x, seed: b.seed, play };
  } catch (e) { return null; }
}

/* What the sender's play did, worked out here, never taken from the link. */
export function resultOf(ch) {
  const res = simulate(challengeScenario(ch), ch.play, ch.seed, challengeOpt(ch));
  return { res, score: scoreOf(res) };
}

/* Did the friend beat it? Same rule as the daily board: a win, then stars, then the look. */
export const beats = (mine, theirs) => mine > theirs;

function b64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const c of bytes) bin += String.fromCharCode(c);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
