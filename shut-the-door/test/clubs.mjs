// Every scheduled scenario names both real clubs: the closer's and the hitters'. The scorebug, the matchup bar, the 3D kits
// and the crowd all read clubs.js battingClub; a null there showed the word "them" to players.
import { readFileSync } from 'node:fs';
import { battingClub, clubNamed } from '../3d/clubs.js';
import { HOME_SIDE, CAPS, FRONT } from '../3d/uniforms.js';

const sched = JSON.parse(readFileSync(new URL('../data/schedule.json', import.meta.url)));
const bad = [];
for (const [id, p] of Object.entries(sched.packs)) {
  const c = p.card;
  if (!clubNamed(c.team)) bad.push(id + ' (the closer\'s club)');
  if (!battingClub({ title: c.title, scenarioId: id, pitcher: { team: c.team } })) bad.push(id + ' (the hitters\' club)');
}
if (bad.length) { console.error('no club for: ' + bad.join(', ')); process.exit(1); }
console.log('clubs ok: every one of ' + Object.keys(sched.packs).length + ' scenarios names both clubs');

/* A custom challenge (CONTRACT.md 18): the hitters wear the lineup pack's club exactly as that pack's
   own daily names it (the nickname and the name on the chest), whoever pitches to them, the same
   club as the pitcher's included. */
const mx = JSON.parse(readFileSync(new URL('../data/matchups.json', import.meta.url)));
const pack = (id) => JSON.parse(readFileSync(new URL('../data/packs/' + id + '.json', import.meta.url))).scenario;
const name = (c) => (c ? c.nick + '/' + (c.as || c.nick) : null);
const wrong = [];
let n = 0;
for (const l of mx.lineups) {
  if (!l.team) continue;
  const q = pack(l.id), own = battingClub({ title: q.title, scenarioId: q.id, pitcher: { team: q.pitcher.team } });
  for (const p of mx.pitchers) {
    const got = battingClub({ title: p.name + ' vs the ' + l.year + ' ' + l.team, scenarioId: p.id + '__' + l.id, pitcher: { team: p.team },
      matchup: { pitcher: p.id, lineup: l.id, lineupTeam: l.team } });
    n++;
    if (!got || name(got) !== name(own)) wrong.push(p.id + '__' + l.id + ': ' + name(got) + ', its daily ' + name(own));
  }
}
if (wrong.length) { console.error('a challenge\'s hitters are not the lineup pack\'s club: ' + wrong.slice(0, 8).join('; ')); process.exit(1); }
console.log('clubs ok: every challenge pairing (' + n + ') dresses the hitters as the lineup pack\'s own daily');
/* uniforms.js HOME_SIDE: every scenario with a sourced cap or number, and its home side the pack's */
const keys = [...new Set([...Object.keys(CAPS), ...Object.keys(FRONT)])];
const off = keys.filter((id) => HOME_SIDE[id] !== (pack(id).situation.usHome ? 'us' : 'them'));
if (off.length || Object.keys(HOME_SIDE).length !== keys.length) { console.error('uniforms.js HOME_SIDE does not match the packs: ' + off.join(', ')); process.exit(1); }
console.log('clubs ok: the ' + keys.length + ' sourced caps and numbers each name the jersey their game was played in');
