/* A crude player for every game, so the tests can make real input logs.
 * Each bot offers an input now and then; only the ones the sim takes are
 * logged, exactly as the browser shell does. */
import { mulberry32 } from '../shared/seed.js';
import { GAMES } from '../registry.js';

const R3 = x => Math.round(x * 1000) / 1000;
const OFFER = {
  'roll-ball': r => ({ a: R3(r() * 0.5 - 0.25), p: R3(0.35 + r() * 0.6) }),
  'field-goal-flick': r => ({ a: R3((r() * 2 - 1) * 0.1), p: R3(0.4 + r() * 0.55) }),
  'hoop-shoot': r => ({ a: R3((r() * 2 - 1) * 0.08), p: R3(0.3 + r() * 0.5) }),
  'drop-board': r => ({ x: R3(5 + r() * 90) }),
  'whack': (r, s) => { const c = s.live.find(x => !x.hit && s.frame >= x.at + 6); return c && r() < 0.5 ? { h: c.hole } : null; },
  'pinball': (r, s) => {
    if (s.b.rest) return { k: 'P', p: R3(r()) };
    const b = s.b, near = b.y > 140 && b.y < 166 && b.vy > -20;
    if (near) { const side = b.x < 48 ? 'L' : 'R', f = s.flippers[side === 'L' ? 0 : 1]; return { k: side + (f.held ? '0' : '1') }; }
    const up = s.flippers.find(f => f.held); return up ? { k: up.side + '0' } : null;
  }
};

export function play(gameId, seed, cfg, botSeed = 1) {
  const sim = GAMES[gameId].sim, r = mulberry32(botSeed), s = sim.create(seed, cfg), log = [];
  let n = 0;
  while (!s.over && s.frame < sim.MAX_FRAMES) {
    if (r() < 0.25 && log.length < sim.MAX_INPUTS) {
      const inp = OFFER[gameId](r, s);
      if (inp) { const full = { f: s.frame, ...inp }; if (sim.applyInput(s, full)) log.push(full); }
    }
    sim.step(s);
    if (++n > sim.MAX_FRAMES + 10) break;
  }
  return { log, score: s.score, frames: s.frame, detail: sim.detail(s), over: s.over };
}
