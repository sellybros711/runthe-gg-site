/* Play a Roll-Ball run the way the browser does and return its input log. */
import * as S from '../games/rollball/sim.js';
import { mulberry32 } from '../shared/seed.js';
export function playLog(seed, botSeed = 1, idle = 20) {
  const r = mulberry32(botSeed), s = S.create(seed), log = [];
  let wait = idle;
  while (!s.over) {
    if (s.phase === 'ready' && --wait <= 0) {
      const a = Math.round((r() * 0.5 - 0.25) * 10000) / 10000, p = Math.round((0.35 + r() * 0.6) * 10000) / 10000;
      const f = s.frame;
      if (S.throwBall(s, a, p)) log.push({ f, a, p });
      wait = idle;
    }
    S.step(s);
  }
  return { log, score: s.score, frames: s.frame, detail: S.detail(s) };
}
