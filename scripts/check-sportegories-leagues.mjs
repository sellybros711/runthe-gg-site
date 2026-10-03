/* Sportegories: does every kind of category accept the right answers from
 * every league it names, and refuse the wrong ones?
 *
 * WHY
 * The categories are data, built by scripts/build-sportegories.mjs, and three
 * of them claimed more leagues than the data could check. "Hall of Famer"
 * refused Larry Bird's teammate Ben Wallace, Wayne Gretzky and Sue Bird (the
 * curated hof flag never reached the award list the category reads). "MVP
 * winner (any sport)" had no NHL or WNBA MVP on file. "Defensive Player of the
 * Year winner" was NFL-only and refused every NBA winner. None of that throws:
 * a refused right answer is a red row, and the player decides the game is
 * wrong. This walks a known answer through every category type, per league,
 * with the real check (arcade/sportegories.js) and the real data.
 *
 * Every accepted answer has to be settled by OUR file (not punted to the live
 * lookup), because the live lookup is a network call that can fail.
 *
 *   node scripts/check-sportegories-leagues.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = {}; G.window = G; G.self = G;
for (const f of ['arcade/franchise.js', 'arcade/sportegories-data.js', 'arcade/sportegories.js', 'arcade/livecheck.js'])
  new Function('window', 'self', 'module', readFileSync(path.join(ROOT, f), 'utf8'))(G, G, undefined);
const SP = G.RTG_SPORTEGORIES, D = G.RTG_SPORTEGORIES_DATA, LC = G.RTG_LIVECHECK;
SP.setData(D);

let fails = 0, n = 0;
const ok = (c, what, d) => { n++; if (c) console.log('  ok   ' + what); else { fails++; console.log('  FAIL ' + what + (d ? '\n       ' + d : '')); } };

function cat(label) {
  const c = D.cats.find((x) => typeof label === 'string' ? x.l === label : label.test(x.l));
  if (!c) throw new Error('no category ' + label);
  return c;
}
function verdict(label, name) {
  const c = cat(label), letter = name.trim().split(/\s+/).pop()[0].toUpperCase();
  return SP.check({ letter, cats: [{ i: c.i }] }, 0, name, {});
}
// [category, answer that must pass, answer that must fail]
const CASES = {
  'award, every league': [
    ['Hall of Famer', 'Ben Wallace', 'LeBron James'],
    ['Hall of Famer', 'Walter Payton', 'Patrick Mahomes'],
    ['Hall of Famer', 'Willie Mays', 'Mike Trout'],
    ['Hall of Famer', 'Wayne Gretzky', null],
    ['Hall of Famer', 'Sue Bird', null],
    ['Hall of Famer', null, 'Albert Pujols'],
    ['MVP winner (NBA, NFL or MLB)', 'Larry Bird', 'Kevin Love'],
    ['MVP winner (NBA, NFL or MLB)', 'Peyton Manning', 'Philip Rivers'],
    ['MVP winner (NBA, NFL or MLB)', 'Mike Trout', null],
    [/^Rookie of the Year \(NBA, NFL or MLB\)$/, 'Victor Wembanyama', null],
    [/^Rookie of the Year \(NBA, NFL or MLB\)$/, 'Justin Herbert', null],
    [/^Rookie of the Year \(NBA, NFL or MLB\)$/, 'Aaron Judge', 'Kevin Love'],
    ['Defensive Player of the Year (NBA or NFL)', 'Ben Wallace', 'Kevin Love'],
    ['Defensive Player of the Year (NBA or NFL)', 'Reggie White', null],
    ['NBA Sixth Man of the Year', 'Manu Ginobili', 'Tim Duncan']
  ],
  'award, one league': [
    ['NFL MVP winner', 'Peyton Manning', 'Eli Manning'],
    ['NBA MVP winner', 'Tim Duncan', 'Tony Parker'],
    ['MLB MVP winner', 'Mike Trout', null],
    ['Cy Young winner', 'Randy Johnson', null],
    ['Super Bowl MVP winner', 'Tom Brady', null]
  ],
  'combo (award and team)': [
    [/^Hall of Famer who played for the Boston Celtics$/, 'Larry Bird', 'Rajon Rondo'],
    [/^Hall of Famer who played for the New York Yankees$/, 'Babe Ruth', null]
  ],
  'position': [
    ['NBA Center', "Shaquille O'Neal", 'Stephen Curry'],
    [/^NFL Quarterback$/, 'Tom Brady', 'Jerry Rice']
  ],
  'team, across a move or a rename': [
    // stored under the club's current name; the card shows every era (see below)
    [/^Played for the Tennessee Titans$/, 'Warren Moon', 'Tom Brady'],
    [/^Played for the Oklahoma City Thunder$/, 'Gary Payton', null],
    [/^Played for the Raiders$/, 'Marcus Allen', null]
  ],
  'college': [
    [/^Played college at Duke$/, 'Grant Hill', 'Tim Duncan']
  ]
};

for (const [kind, rows] of Object.entries(CASES)) {
  console.log('\n' + kind);
  for (const [label, yes, no] of rows) {
    let c; try { c = cat(label); } catch (e) { ok(false, 'category exists: ' + label); continue; }
    if (yes) { const r = verdict(label, yes); ok(r.ok && !r.live, `"${c.l}" accepts ${yes} from our own file`, JSON.stringify(r)); }
    // A miss is never final in our file (deep cuts are the game, so an answer
    // our data cannot place goes to the live lookup); it must just not pass.
    if (no) { const r = verdict(label, no); ok(!r.ok, `"${c.l}" does not accept ${no}`, JSON.stringify(r)); }
  }
}

console.log('\nlabels');
const generic = D.cats.filter((c) => /any sport/i.test(c.l));
ok(generic.length === 0, 'no category promises "any sport"', generic.map((c) => c.l).join(', '));
const shared = D.cats.filter((c) => /^(Defensive|Offensive) (Player|Rookie) of the Year winner$|^Rookie of the Year winner$/.test(c.l));
ok(shared.length === 0, 'an award two leagues share says which league it means', shared.map((c) => c.l).join(', '));

const shown = [];
for (let i = 0; i < 365; i++) { const d = new Date(2026, 0, 1 + i); SP.daily(d.toISOString().slice(0, 10)).cats.forEach((c) => shown.push(c.label)); }
ok(!shown.some((l) => /the Tennessee Titans\b/.test(l) && !/Houston Oilers/.test(l)), 'a card shows the Titans as "Houston Oilers / Tennessee Titans", the eras it accepts');

console.log('\nthe live lookup');
const aw = (labels) => LC.awardsFor(labels);
ok(aw(['Pro Football Hall of Fame']).includes('Hall of Fame'), 'the Pro Football Hall of Fame counts');
ok(aw(['Naismith Memorial Basketball Hall of Fame']).includes('Hall of Fame'), 'the Naismith Hall of Fame counts');
ok(aw(['Hockey Hall of Fame']).includes('Hall of Fame'), 'the Hockey Hall of Fame counts');
ok(!aw(['College Football Hall of Fame']).includes('Hall of Fame'), 'the College Football Hall of Fame does not');
ok(!aw(['Green Bay Packers Hall of Fame']).includes('Hall of Fame'), 'a team hall does not');
ok(!aw(['Texas Sports Hall of Fame']).includes('Hall of Fame'), 'a state hall does not');

console.log(fails ? `\n${fails} of ${n} failed` : `\nsportegories leagues ok (${n} checks)`);
process.exit(fails ? 1 : 0);
