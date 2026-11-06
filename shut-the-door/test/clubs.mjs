// Every scheduled scenario names both real clubs: the closer's and the hitters'. The scorebug, the matchup bar, the 3D kits
// and the crowd all read clubs.js battingClub; a null there showed the word "them" to players.
import { readFileSync } from 'node:fs';
import { battingClub, clubNamed } from '../3d/clubs.js';

const sched = JSON.parse(readFileSync(new URL('../data/schedule.json', import.meta.url)));
const bad = [];
for (const [id, p] of Object.entries(sched.packs)) {
  const c = p.card;
  if (!clubNamed(c.team)) bad.push(id + ' (the closer\'s club)');
  if (!battingClub({ title: c.title, scenarioId: id, pitcher: { team: c.team } })) bad.push(id + ' (the hitters\' club)');
}
if (bad.length) { console.error('no club for: ' + bad.join(', ')); process.exit(1); }
console.log('clubs ok: every one of ' + Object.keys(sched.packs).length + ' scenarios names both clubs');
