/* Field Goal Flick: the rules as a pure, fixed-step simulation.
 * An input is { f, a, p }: kick at aim a (radians) with power p (0..1),
 * legal only while a kick is waiting. The flight is worked out in closed form
 * the moment the ball is struck, then played out on screen. */
import { CONFIG as C } from './config.js';
import { mulberry32, streamFor } from '../../shared/seed.js';
import { GEMS_FOR_DAILY } from '../../shared/gems.js';
import { replay as replayAny } from '../../shared/replay.js';
import { sin, cos } from '../../shared/dmath.js';

export const MAX_FRAMES = C.MAX_FRAMES;
export const MAX_INPUTS = C.KICKS;
const R1 = v => Math.round(v * 10) / 10;

export function dailyConfig(seed) {
  const r = mulberry32(seed);
  const kicks = C.DISTANCES.map((range, i) => {
    const d = range[0] + Math.floor(r() * (range[1] - range[0] + 1));
    const [lo, hi] = C.WIND_MPH[i];
    const mph = R1(lo + r() * (hi - lo));
    const dir = r() < 0.5 ? -1 : 1;                       // blowing left or right
    const along = R1(mph * C.WIND_ALONG * (r() < 0.5 ? -1 : 1));   // + is a tailwind
    return { yards: d, cross: R1(dir * mph), along };
  });
  const max = maxScore(kicks);
  return { kicks, max, rule: 'Five kicks from ' + kicks[0].yards + ' to ' + kicks[4].yards + ' yards. The wind stiffens as you go.' };
}

export function maxScore(kicks) {
  let m = 0;
  kicks.forEach((k, i) => { m += C.GOOD + Math.floor(k.yards / 10) * C.PER_TEN + C.DOINK_BONUS + (i + 1 >= C.STREAK_FROM ? C.STREAK_BONUS : 0); });
  return m;
}

export function create(seed, cfg) {
  const day = cfg && cfg.kicks ? cfg : dailyConfig(seed);
  return { seed, day, frame: 0, kick: 0, phase: 'ready', phaseFrame: 0, flight: null, results: [], streak: 0, score: 0, over: false, events: [] };
}

/* Everything about a kick, decided at the moment of contact. */
export function resolveKick(seed, k, i, a, p) {
  const r = streamFor(seed, 'kick' + i);
  const ja = (r() * 2 - 1) * C.AIM_JITTER, jr = (r() * 2 - 1) * C.RANGE_JITTER;
  const spray = p > C.OVERHIT ? (r() * 2 - 1) * C.OVERHIT_SPRAY * (p - C.OVERHIT) / (1 - C.OVERHIT) : (r(), 0);
  const doinkRoll = r();
  const range = (C.RANGE_MIN + p * (C.RANGE_MAX - C.RANGE_MIN)) * (1 + jr) * (1 + k.along * C.WIND_RANGE);
  const aim = a + ja + spray;
  const D = k.yards;
  const t = D / range;                                      // share of the flight at the goal line
  const drift = k.cross * C.WIND_DRIFT * (D / 40) * (D / 40);
  const x = D * sin(aim) / cos(aim) + drift;                      // yards left (-) or right (+) of the middle
  const h = t >= 1 ? 0 : C.PEAK * 4 * t * (1 - t) * Math.min(1, range / 60);
  let call, doink = null;
  const ax = Math.abs(x);
  if (t >= 1) call = 'SHORT';
  else {
    const nearPost = Math.abs(ax - C.HALF_WIDTH) < C.DOINK;
    const nearBar = Math.abs(h - C.BAR) < C.DOINK && ax < C.HALF_WIDTH + C.BALL_R;
    if (nearPost || nearBar) {
      doink = nearPost ? 'post' : 'bar';
      call = doinkRoll < C.DOINK_IN ? 'DOINK' : (nearBar ? 'SHORT' : x < 0 ? 'WIDE LEFT' : 'WIDE RIGHT');
    } else if (h < C.BAR) call = 'SHORT';
    else if (ax <= C.HALF_WIDTH) call = 'GOOD';
    else call = x < 0 ? 'WIDE LEFT' : 'WIDE RIGHT';
  }
  return { call, doink, x, h, range, t: Math.min(t, 1), aim, drift };
}

export function applyInput(s, inp) {
  if (s.phase !== 'ready' || s.over) return false;
  const { a, p } = inp;
  if (!(typeof a === 'number' && isFinite(a) && Math.abs(a) <= C.MAX_AIM + 1e-9)) return false;
  if (!(typeof p === 'number' && isFinite(p) && p >= 0 && p <= 1)) return false;
  s.flight = resolveKick(s.seed, s.day.kicks[s.kick], s.kick, a, p);
  s.phase = 'flight'; s.phaseFrame = 0;
  s.events.push({ type: 'kick' });
  return true;
}
export function waiting(s) { return s.phase === 'ready'; }

export function step(s) {
  s.events = [];
  s.frame++; s.phaseFrame++;
  if (s.phase === 'flight' && s.phaseFrame >= C.FLIGHT_FRAMES) {
    const f = s.flight, k = s.day.kicks[s.kick];
    const good = f.call === 'GOOD' || f.call === 'DOINK';
    s.streak = good ? s.streak + 1 : 0;
    let pts = 0;
    if (good) pts = C.GOOD + Math.floor(k.yards / 10) * C.PER_TEN + (f.call === 'DOINK' ? C.DOINK_BONUS : 0) + (s.streak >= C.STREAK_FROM ? C.STREAK_BONUS : 0);
    s.score += pts;
    s.results.push({ call: f.call, yards: k.yards, pts, doink: f.doink });
    s.phase = 'settle'; s.phaseFrame = 0;
    s.events.push({ type: 'result', call: f.call, pts, doink: f.doink, kick: s.kick });
  } else if (s.phase === 'settle' && s.phaseFrame >= C.SETTLE_FRAMES) {
    s.kick++; s.flight = null;
    if (s.kick >= C.KICKS) { s.over = true; s.phase = 'over'; s.events.push({ type: 'over' }); }
    else { s.phase = 'ready'; s.phaseFrame = 0; s.events.push({ type: 'next', kick: s.kick }); }
  }
}

export function detail(s) { return { results: s.results, max: s.day.max }; }
export function replay(seed, inputs, cfg) { return replayAny({ create, applyInput, step, detail, waiting, MAX_FRAMES, MAX_INPUTS }, seed, inputs, cfg); }
export function gems(score, cfg) {
  const share = score / ((cfg && cfg.max) || 1);
  let b = 0; for (const x of C.GEM_SHARE_BANDS) if (share >= x.at) b = x.bonus;
  return GEMS_FOR_DAILY + b;
}
export function squares(d) { return (d.results || []).map(r => r.call === 'DOINK' ? '🥴' : r.call === 'GOOD' ? '✅' : '❌'); }
export function scoreText(score) { return String(score); }
