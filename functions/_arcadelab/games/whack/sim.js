/* Whack the Right Player: the rules as a pure, fixed-step simulation.
 *
 * The day's config is the published slate: three rounds, each a prompt and
 * its cards ({ id, n, pos, ok, plausible }). The spawn schedule is built from
 * the seed and the slate, so everybody meets the same cards in the same holes
 * at the same moments. An input is { f, h }: a tap on hole h at frame f. A tap
 * on an empty hole is not an input at all (applyInput refuses it), so the log
 * holds only real hits. */
import { CONFIG as C } from './config.js';
import { streamFor } from '../../shared/seed.js';
import { gemsFor } from '../../shared/gems.js';
import { replay as replayAny } from '../../shared/replay.js';

export const MAX_INPUTS = C.MAX_INPUTS;
export const ROUND_LEN = C.INTRO_FRAMES + C.ROUND_FRAMES;
export const MAX_FRAMES = C.ROUNDS * ROUND_LEN + 120;

/* Without a slate (tests, the dev server) the sim still runs on numbered cards. */
function placeholder() {
  const rounds = [];
  for (let r = 0; r < C.ROUNDS; r++) {
    const cards = [];
    for (let i = 0; i < 24; i++) cards.push({ id: 'r' + r + 'c' + i, n: 'Player ' + (i + 1), pos: '', ok: i < 12, plausible: i >= 12 && i < 20 });
    rounds.push({ promptId: 'none', title: 'Hit every odd card (practice board)', cards });
  }
  return { rounds };
}
export function dailyConfig() { return null; }

const ease = (a, b, t) => a + (b - a) * t;

/* The schedule: for each round, the list of (frame, hole, card, up). Built
   once from (seed, slate) and the same for everybody. */
export function schedule(seed, cfg) {
  const slate = cfg && cfg.rounds ? cfg : placeholder();
  const out = [];
  slate.rounds.forEach((round, ri) => {
    const r = streamFor(seed, 'round' + ri);
    const ok = round.cards.filter(c => c.ok), no = round.cards.filter(c => !c.ok);
    const plaus = no.filter(c => c.plausible), plain = no.filter(c => !c.plausible);
    const bag = (list, k) => { let pool = []; return () => { if (!pool.length) pool = list.map((c, i) => ({ c, k: r() + i * 1e-9 })).sort((a, b) => a.k - b.k).map(x => x.c); return pool.shift(); }; };
    const nextOk = bag(ok), nextPlaus = bag(plaus.length ? plaus : no), nextPlain = bag(plain.length ? plain : no);
    const holeFree = new Array(C.HOLES).fill(0);
    const start = ri * ROUND_LEN + C.INTRO_FRAMES, end = start + C.ROUND_FRAMES;
    let t = start + 20, last = -1;
    while (t < end - 30) {
      const prog = (ri * C.ROUND_FRAMES + (t - start)) / (C.ROUNDS * C.ROUND_FRAMES);
      const up = Math.round(ease(C.UP_START, C.UP_END, prog));
      const isOk = r() < C.CORRECT_SHARE[ri];
      const card = isOk ? nextOk() : (r() < C.PLAUSIBLE_SHARE[ri] ? nextPlaus() : nextPlain());
      // a free hole, never the one just used
      const free = [];
      for (let h = 0; h < C.HOLES; h++) if (holeFree[h] <= t && h !== last) free.push(h);
      if (free.length) {
        const hole = free[Math.floor(r() * free.length)];
        const downAt = Math.min(t + up, end);
        out.push({ round: ri, at: t, hole, downAt, card: { id: card.id, n: card.n, pos: card.pos }, ok: !!card.ok });
        holeFree[hole] = downAt + 14; last = hole;
      }
      const gap = ease(C.GAP_START, C.GAP_END, prog);
      t += Math.max(10, Math.round(gap * (1 - C.GAP_JITTER / 2 + r() * C.GAP_JITTER)));
    }
  });
  return { slate, spawns: out };
}

export function create(seed, cfg) {
  const { slate, spawns } = schedule(seed, cfg);
  return { seed, slate, spawns, next: 0, live: [], frame: 0, round: 0, score: 0, combo: 0, best: 0, strikes: 0,
    over: false, events: [], rounds: slate.rounds.map(() => ({ score: 0, hits: 0, misses: 0, wrong: 0 })), struck: [], missed: [] };
}

export const mult = combo => Math.min(C.MULT_MAX, 1 + Math.floor(combo / C.COMBO_STEP));

export function applyInput(s, inp) {
  if (s.over || !Number.isInteger(inp.h) || inp.h < 0 || inp.h >= C.HOLES) return false;
  const c = s.live.find(x => x.hole === inp.h && !x.hit && s.frame >= x.at && s.frame <= x.downAt + C.GRACE);
  if (!c) return false;
  c.hit = true;
  const R = s.rounds[c.round];
  if (c.ok) {
    s.combo++; s.best = Math.max(s.best, s.combo);
    const pts = C.BASE * mult(s.combo);
    s.score += pts; R.score += pts; R.hits++;
    s.events.push({ type: 'hit', hole: c.hole, pts, combo: s.combo, mult: mult(s.combo) });
  } else {
    s.combo = 0; s.strikes++; R.wrong++;
    s.struck.push({ round: c.round, id: c.card.id, n: c.card.n });
    s.events.push({ type: 'strike', hole: c.hole, strikes: s.strikes, name: c.card.n });
    if (s.strikes >= C.STRIKES) { s.over = true; s.endRound = c.round; s.events.push({ type: 'over', out: true }); }
  }
  return true;
}
export function waiting() { return false; }

export function step(s) {
  s.events = [];
  s.frame++;
  const f = s.frame;
  const r = Math.min(C.ROUNDS - 1, Math.floor((f - 1) / ROUND_LEN));
  if (r !== s.round || f === 1) { if (r !== s.round) s.events.push({ type: 'roundEnd', round: s.round }); s.round = r; s.events.push({ type: 'roundStart', round: r, title: s.slate.rounds[r].title }); }
  while (s.next < s.spawns.length && s.spawns[s.next].at <= f) {
    const sp = s.spawns[s.next++];
    s.live.push({ ...sp, hit: false });
    s.events.push({ type: 'up', hole: sp.hole });
  }
  s.live = s.live.filter(c => {
    if (f <= c.downAt + C.GRACE) return true;
    if (c.ok && !c.hit) {
      s.combo = 0; s.rounds[c.round].misses++; s.missed.push({ round: c.round, id: c.card.id, n: c.card.n });
      s.events.push({ type: 'miss', hole: c.hole });
    }
    return false;
  });
  if (f >= C.ROUNDS * ROUND_LEN + 10) { s.over = true; s.endRound = C.ROUNDS - 1; s.events.push({ type: 'roundEnd', round: C.ROUNDS - 1 }, { type: 'over', out: false }); }
}

export function detail(s) {
  return { rounds: s.rounds.map((R, i) => ({ ...R, title: s.slate.rounds[i].title, promptId: s.slate.rounds[i].promptId,
    perfect: R.wrong === 0 && R.misses === 0 && (s.strikes < C.STRIKES || i < s.endRound) })),
  strikes: s.strikes, bestCombo: s.best, struck: s.struck, missed: s.missed, out: s.strikes >= C.STRIKES, endRound: s.endRound };
}
export function replay(seed, inputs, cfg) { return replayAny({ create, applyInput, step, detail, waiting, MAX_FRAMES, MAX_INPUTS }, seed, inputs, cfg); }
export function gems(score) { return gemsFor(score, C.GEM_BANDS); }
/* One square a round: green clean, yellow got through, red struck out. */
export function squares(d) {
  return (d.rounds || []).map((R, i) => d.out && i === d.endRound ? '🟥' : d.out && i > d.endRound ? '⬛' : R.perfect ? '🟩' : '🟨');
}
export function scoreText(score) { return String(score); }
