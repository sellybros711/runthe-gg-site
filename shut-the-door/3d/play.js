/* One pitch's story for the scene: what was thrown, where it went, and what everyone does.
 *
 * The scene is driven by a play shaped like the engine's PitchResult (CONTRACT.md section 6):
 *   { call: { type, cell }, actual: { x, z } (feet, catcher's view), velo, batter: 'take'|'swing',
 *     result, inPlay: { bb, ev, la, spray, result, text } }
 * plus what the scene decides from it (motion below): the batter's motion, how the ball leaves the
 * bat, the catcher's catch or block, the umpire's signal. In the game, fromResult() turns the
 * engine's PitchResult into a play. In the lab, labPlay() builds one from the URL and the pack's
 * own real outcomes (assets/packs/<pack>.json, plays): a sample, never an engine draw.
 *
 *   ?play=swinging_strike|foul|foul_back|foul_tip|ground|line|fly|popup|called_strike|ball|check|
 *         hit_by_pitch|hbp_fall|dirt     (default swinging_strike; take=1 is called_strike; hbp_fall is
 *         a pitch on the shoulder, the fall)
 *   &type=FF &cell=12 &mx=0.1 &mz=-0.1   override the pitch, the aimed cell, the miss (feet)
 */
import { cellPoint } from './pitch.js?v=7';

export const KINDS = ['swinging_strike', 'foul', 'foul_back', 'foul_tip', 'ground', 'line', 'fly', 'popup', 'called_strike', 'ball', 'check', 'hit_by_pitch', 'hbp_fall', 'dirt'];

/** The scene's reading of a play: the batter's motion, the ball's path after the plate, the calls. */
export function motion(play, batter) {
  const r = play.result, ip = play.inPlay;
  const lefty = batter.bats === 'L';
  const m = { batter: 'take', ball: 'glove', ump: null, catcher: 'receive', contactShift: 0 };
  if (play.batter === 'swing') {
    m.batter = 'swing';
    if (r === 'swinging_strike') { m.ball = 'glove'; m.miss = true; }
    else if (r === 'foul_tip') { m.ball = 'tip'; }
    else if (r === 'foul') {
      // a foul with a low launch angle is pulled foul down the line, a steep or unmeasured one goes
      // back into the screen
      const back = play.foul === 'back' || ip == null || ip.la == null || ip.la > 40;
      m.ball = back ? 'back' : 'pulled';
      m.contactShift = back ? 0.004 : -0.045;            // a pulled foul is met early
      m.ump = 'foul';
    } else if (r === 'in_play' && ip) {
      m.ball = 'play';
      // met early to pull it, late to go the other way: a few hundredths of a second over the field
      const pull = (lefty ? 1 : -1) * (ip.spray ?? 0) / 45;
      m.contactShift = -0.03 * Math.max(-1, Math.min(1, pull));
      m.catcher = 'rise';
    }
  } else {
    if (play.check) m.batter = 'check';
    if (r === 'hit_by_pitch') {
      // the catcher stays in his crouch: the ball is not caught, and he does not stand up for it
      m.batter = 'hbp'; m.ball = 'hbp'; m.ump = 'hbp';
      // a pitch on the upper body (above his belt) puts him down: Mixamo's shoulder hit and fall,
      // for four of every five such pitches, picked from the drawn pitch's own id (never the
      // engine's random stream), so a replay falls the same way. The rest turn away (the flinch)
      const belt = (batter.szBot + batter.szTop) / 2;
      m.fall = play.actual.z > belt && (play.drawnId == null || hashId(play.drawnId) % 5 !== 0);
    }
    if (r === 'called_strike') m.ump = 'strike';
  }
  if (play.dirt) { m.ball = 'dirt'; m.catcher = 'block'; }
  return m;
}

/** FNV-1a of an id (a drawn pitch's game_pk:at_bat:pitch), for picks that must replay the same. */
function hashId(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/** From the engine's PitchResult (the game, phase C). actual.zn is normalised to this batter. */
export function fromResult(r, batter) {
  const z = batter.szBot + r.actual.zn * (batter.szTop - batter.szBot);
  return { call: r.call, actual: { x: r.actual.x, z }, velo: r.velo, batter: r.batter, result: r.result, inPlay: r.inPlay ?? null, drawnId: r.drawn ? r.drawn.id : null,
    dirt: z < 0.35, check: r.batter === 'take' && r.result === 'ball' && Math.abs(r.actual.x) < 1.2 && r.countBefore && r.countBefore.s === 2 };
}

/** The lab's play: a kind, the pack's arsenal, the pack's real outcome of that kind. */
export function labPlay(facts, batter, q) {
  const kind = q.get('play') || (q.get('take') === '1' ? 'called_strike' : 'swinging_strike');
  const ars = facts.pitcher.arsenal;
  const byShape = (...shapes) => ars.find((a) => shapes.includes(a.shape)) || ars[0];
  const lefty = batter.bats === 'L';
  const away = lefty ? 1 : 3, awayOff = lefty ? 0 : 4, inside = lefty ? 4 : 0;   // columns, catcher's view
  const P = facts.plays || {};
  const S = {
    swinging_strike: [byShape('split', 'drop', 'slide', 'sweep', 'fade'), 22, { x: 0.05, z: 0.1 }, 'swing', 'swinging_strike'],
    foul: [byShape('ride', 'run'), 7 + (lefty ? 2 : 0), { x: 0.05, z: 0.05 }, 'swing', 'foul'],
    foul_back: [byShape('ride', 'run'), 7, { x: 0.02, z: 0.08 }, 'swing', 'foul'],
    foul_tip: [byShape('ride', 'cut'), 12, { x: 0.03, z: 0.12 }, 'swing', 'foul_tip'],
    ground: [byShape('run', 'cut', 'ride'), 17, { x: 0.05, z: -0.05 }, 'swing', 'in_play'],
    line: [byShape('ride', 'cut'), 12, { x: 0.04, z: 0.02 }, 'swing', 'in_play'],
    fly: [byShape('ride'), 7, { x: 0.03, z: 0.06 }, 'swing', 'in_play'],
    popup: [byShape('ride', 'cut'), 7, { x: 0.02, z: 0.15 }, 'swing', 'in_play'],
    called_strike: [byShape('drop', 'ride', 'slide'), 15 + away, { x: 0.1, z: 0.14 }, 'take', 'called_strike'],
    ball: [byShape('ride', 'run'), 5 + awayOff, { x: 0.12, z: 0.05 }, 'take', 'ball'],
    check: [byShape('slide', 'sweep', 'drop', 'split'), 20 + awayOff, { x: 0.05, z: 0.05 }, 'take', 'ball'],
    hit_by_pitch: [byShape('run', 'ride'), 15 + inside, { x: (lefty ? 1 : -1) * 0.75, z: -0.1 }, 'take', 'hit_by_pitch'],
    hbp_fall: [byShape('run', 'ride'), 5 + inside, { x: (lefty ? 1 : -1) * 0.7, z: 0.35 }, 'take', 'hit_by_pitch'],
    dirt: [byShape('split', 'drop', 'slide', 'sweep'), 22, { x: 0.05, z: -1.2 }, 'take', 'ball'],
  }[kind] || null;
  if (!S) throw new Error(`no such play: ${kind}`);
  let [pitch, cell, miss, bat, result] = S;
  if (q.get('type')) pitch = ars.find((a) => a.type === q.get('type')) || pitch;
  if (q.has('cell')) cell = +q.get('cell');
  if (q.has('mx')) miss = { ...miss, x: +q.get('mx') };
  if (q.has('mz')) miss = { ...miss, z: +q.get('mz') };
  const aim = cellPoint(cell, batter.szTop, batter.szBot);
  const real = P[kind === 'foul_back' ? 'foul' : kind === 'check' ? 'ball' : kind === 'dirt' ? 'ball' : kind === 'hbp_fall' ? 'hit_by_pitch' : ['ground', 'line', 'fly', 'popup'].includes(kind) ? kind : kind] || null;
  const inPlay = ['ground', 'line', 'fly', 'popup', 'foul'].includes(kind) && real
    ? { bb: real.bb || kind, ev: real.ev, la: real.la, spray: real.spray, result: null, text: null } : null;
  return {
    kind, sample: 'a lab sample: the aim and the miss are not an engine draw; the outcome is the pack\'s real pitch ' + (real ? real.id : '(none)'),
    call: { type: pitch.type, cell }, actual: { x: aim.x + miss.x, z: aim.z + miss.z }, velo: pitch.velo,
    batter: bat, result, inPlay, foul: kind === 'foul_back' ? 'back' : null, check: kind === 'check', dirt: kind === 'dirt',
  };
}

/** The play by play line under the scoreboard: short sentences, numbers from the play itself. */
export function describe(play) {
  const ip = play.inPlay;
  const mph = (v) => `${Math.round(v)} mph`;
  switch (play.result) {
    case 'ball': return play.dirt ? 'Ball in the dirt. Blocked.' : play.check ? 'Ball. He held up.' : 'Ball.';
    case 'called_strike': return 'Called strike.';
    case 'swinging_strike': return 'Swinging strike.';
    case 'foul_tip': return 'Foul tip. Held on.';
    case 'foul': return play.foul === 'back' || !ip || ip.la == null || ip.la > 40 ? 'Fouled back.' : 'Foul ball, pulled.';
    case 'hit_by_pitch': return 'Hit by pitch.';
    case 'in_play': {
      if (ip && ip.text) return ip.text;
      const kind = { ground: 'Ground ball', line: 'Line drive', fly: 'Fly ball', popup: 'Pop up' }[ip && ip.bb] || 'In play';
      return ip && ip.ev ? `${kind}. ${mph(ip.ev)} off the bat.` : `${kind}.`;
    }
    default: return '';
  }
}
