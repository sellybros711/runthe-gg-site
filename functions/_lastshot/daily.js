/* THE DAILY LAST SHOT (the owner, 2026-11-13). One situation a day for
 * everybody, one scored run, on the Arcade Lab's daily service
 * (functions/_arcadelab/api.js): its seed, its one-run rule, its restart
 * guard, its board and its gems. This file is the game's half of that
 * contract, the same shape as an Arcade Lab sim:
 *
 *   dailyConfig(seed)            the day's situation: clock, down, set
 *   replay(seed, inputs, cfg)    inputs is [play]; the server runs the sim
 *   gems(score), scoreText(score), squares(detail)
 *
 * The sim is a pure function of the scenario, the play and the seed, so the
 * server does not replay an input log: it runs the posted play itself and
 * the score it gets is the score. The defense is the seed's first draw, so
 * everybody faces the same one today and nobody knows it until the run.
 *
 * Score: a win is 1000, plus 100 a star, plus the shot's make chance in
 * percent (the look, which also breaks ties). A loss is the look alone. */
import { SCENARIO } from './scenario.js';
import { simulate } from './sim.js';
import { problems, scenarioFor, IDS } from './playbook.js';
import { SETS, starsOf } from './levels.js';
import { SCHEME_NAMES } from './scenario.js';

export const DAILY_VERSION = 1;
/* A run cannot be filed faster than this, in sim frames at 60 Hz (the Lab's
   duration check). Drawing and watching takes longer; this only stops a bot. */
export const MIN_FRAMES = 180;

const CLOCKS = [22, 18, 14, 10, 8, 6];
const DOWNS = [1, 1, 1, 2, 2, 3];
const SET_KEYS = ['box', 'horns', 'high14', 'out41'];
const SET_NAMES = { box: 'Box', horns: 'Horns', high14: '1-4 high', out41: 'Spread' };

/* A stream of its own, so the day's situation does not share draws with
   the defense roll inside the sim. */
function pick(seed) {
  let a = (seed ^ 0x5bd1e995) >>> 0;
  return n => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

export function dailyConfig(seed) {
  const r = pick(seed >>> 0);
  const clock = CLOCKS[r(CLOCKS.length)], down = DOWNS[r(DOWNS.length)], set = SET_KEYS[r(SET_KEYS.length)];
  return { v: DAILY_VERSION, clock, down, set, title: 'Down ' + down + '. ' + clock + ' seconds. ' + SET_NAMES[set] + '.' };
}

/* The scenario the day plays. The page and the server both call this. */
export function dailyScenario(cfg, sc = SCENARIO) {
  const s = scenarioFor(sc, { clock: cfg.clock, down: cfg.down });
  return { ...s, spots: JSON.parse(JSON.stringify(SETS[cfg.set] || sc.spots)) };
}

const num = v => typeof v === 'number' && Number.isFinite(v);
const inCourt = p => p && num(p.x) && num(p.y) && p.x >= -2 && p.x <= 52 && p.y >= -2 && p.y <= 48;

/* Only the fields the sim reads, checked, so nothing else rides into the run. */
export function cleanPlay(play) {
  if (!play || typeof play !== 'object' || !play.spots || !Array.isArray(play.steps)) return null;
  if (play.steps.length > 40) return null;
  const spots = {};
  for (const id of IDS) { const p = play.spots[id]; if (!inCourt(p)) return null; spots[id] = { x: p.x, y: p.y }; }
  const steps = [];
  for (const s of play.steps) {
    if (!s || typeof s !== 'object') return null;
    if (s.kind === 'move' || s.kind === 'screen') {
      if (!IDS.includes(s.who) || !Array.isArray(s.pts) || !s.pts.length || s.pts.length > 40 || !s.pts.every(inCourt)) return null;
      steps.push({ kind: s.kind, who: s.who, pts: s.pts.map(p => ({ x: p.x, y: p.y })) });
    } else if (s.kind === 'pass') {
      if (!IDS.includes(s.from) || !IDS.includes(s.to)) return null;
      steps.push({ kind: 'pass', from: s.from, to: s.to });
    } else if (s.kind === 'shoot') {
      if (!IDS.includes(s.who)) return null;
      steps.push({ kind: 'shoot', who: s.who });
    } else return null;
  }
  const out = { spots, steps };
  if (play.goAt != null) { if (!num(play.goAt)) return null; out.goAt = play.goAt; }
  return out;
}

export function scoreOf(res) {
  const pct = res.shot ? Math.round(res.shot.p * 100) : 0;
  return res.outcome === 'win' ? 1000 + 100 * starsOf(res) + pct : pct;
}

export function replay(seed, inputs, cfg) {
  if (!Array.isArray(inputs) || inputs.length !== 1) return { error: 'bad_inputs' };
  if (!cfg || cfg.v !== DAILY_VERSION) return { error: 'bad_config' };
  const play = cleanPlay(inputs[0]);
  if (!play) return { error: 'bad_play' };
  const sc = dailyScenario(cfg);
  if (problems(sc, play).length) return { error: 'illegal_play' };
  const res = simulate(sc, play, seed >>> 0);
  const detail = {
    outcome: res.outcome, how: res.how, stars: starsOf(res), us: res.us, them: res.them, down: cfg.down,
    shotAt: res.shotAt, p: res.shot ? res.shot.p : null, open: res.shot ? res.shot.open : null,
    zone: res.shot ? res.shot.zone : null, shooter: res.shooter, scheme: res.scheme, schemeName: res.schemeName,
    ot: res.ot, reason: res.reason
  };
  return { score: scoreOf(res), frames: MIN_FRAMES, detail };
}

export const GEM_BANDS = Object.freeze([{ min: 40, bonus: 2 }, { min: 1000, bonus: 5 }, { min: 1200, bonus: 8 }, { min: 1300, bonus: 10 }]);
export function gems(score) {
  let bonus = 0;
  for (const b of GEM_BANDS) if (score >= b.min) bonus = b.bonus;
  return 5 + bonus;
}

export function scoreText(score) {
  const pct = score % 100;
  if (score < 1000) return 'Lost · ' + pct + '% look';
  const stars = Math.floor((score - 1000) / 100);
  return 'Won · ' + stars + (stars === 1 ? ' star' : ' stars') + ' · ' + pct + '% look';
}

/* The no spoiler share line: stars, never the defense or the play. */
export function squares(d) {
  if (!d || d.outcome !== 'win') return ['⬛', '⬛', '⬛'];
  return [0, 1, 2].map(i => (i < d.stars ? '⭐' : '⬛'));
}

export const schemeNameOf = id => SCHEME_NAMES[id] || id;
