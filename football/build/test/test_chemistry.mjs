// The college link reads every school a man went to. No network, no browser.
//
//   node football/build/test/test_chemistry.mjs
//
// The data joins a transfer's or a junior college man's schools into one string ("Oklahoma;
// Blinn College"). The link used to compare the whole string, so Mark Andrews and Dede
// Westbrook, both Oklahoma men, had no chemistry. Real rows from player_seasons.json.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const E = require(path.join(root, 'football/engine.js'));
const players = JSON.parse(fs.readFileSync(path.join(root, 'football/data/player_seasons.json'), 'utf8'));
const coachColleges = JSON.parse(fs.readFileSync(path.join(root, 'football/data/coach_colleges.json'), 'utf8'));
const ctx = { battery: {}, coaches: {}, curated: {}, coachColleges };

let fails = 0;
const ok = (c, m, d = '') => {
  if (c) console.log('  ok   ' + m);
  else { fails++; console.log('  FAIL ' + m + (d ? '   ' + d : '')); }
};
const row = (name, season) => players.find((p) => p.name === name && p.season === season);
const college = (a, b) => E.pairLinks(a, b, ctx).find((l) => l.type === 'college');

console.log('\n1. Andrews and Westbrook, both Oklahoma');
const andrews = row('Mark Andrews', 2021);
const westbrook = row('Dede Westbrook', 2018);
ok(andrews && andrews.college === 'Oklahoma', 'Andrews is "Oklahoma"', andrews && andrews.college);
ok(westbrook && /;/.test(westbrook.college), 'Westbrook carries more than one school', westbrook && westbrook.college);
for (const [a, b, tag] of [[andrews, westbrook, 'Andrews, Westbrook'], [westbrook, andrews, 'Westbrook, Andrews']]) {
  const l = college(a, b);
  ok(!!l, `${tag}: a college link`);
  ok(l && l.label === 'Both went to Oklahoma', `${tag}: labelled Oklahoma`, l && l.label);
  ok(l && l.short === 'Oklahoma', `${tag}: short is the school, not the joined string`, l && l.short);
}

console.log('\n2. a four-year school is named before a junior college');
/* Two men who share both schools, if the data has a pair: the label names the four-year one. */
const multi = players.filter((p) => E.collegesOf(p).length > 1);
let pair = null;
for (let i = 0; i < multi.length && !pair; i++) {
  for (let j = i + 1; j < multi.length; j++) {
    const a = multi[i], b = multi[j];
    if (a.player_id === b.player_id) continue;
    const sh = E.collegesOf(a).filter((s) => E.collegesOf(b).includes(s));
    if (sh.some(E.isJuniorCollege) && sh.some((s) => !E.isJuniorCollege(s))) { pair = [a, b]; break; }
  }
}
ok(!!pair, 'the data has a pair sharing a four-year school and a junior college');
if (pair) {
  const l = college(pair[0], pair[1]);
  ok(l && !E.isJuniorCollege(l.short), `${pair[0].name} and ${pair[1].name}: named ${l && l.short}`);
}
/* A junior college alone still links (the owner's call, 2026-11-19). */
const fake = (college) => ({ player_id: 'x' + college, name: 'X', college });
const j = college(fake('Auburn; Blinn College'), fake('Oklahoma; Blinn College'));
ok(j && j.label === 'Both went to Blinn College', 'a shared junior college alone links', j && j.label);
ok(!college(fake('Auburn'), fake('Oklahoma')), 'no shared school, no link');
ok(!college(fake(''), fake('')), 'no school on either, no link');

console.log('\n3. the coach link reads every school too');
/* Any hireable coach with a college post, and a man whose SECOND school is that post. */
let hit = null;
for (const [coach, schools] of Object.entries(coachColleges)) {
  const p = players.find((x) => E.collegesOf(x).slice(1).some((s) => schools.includes(s)));
  if (p) { hit = { coach, p, school: E.collegesOf(p).find((s) => schools.includes(s)) }; break; }
}
if (hit) {
  const l = E.coachLinks([hit.p], ctx, { name: hit.coach }).find((x) => x.type === 'coach_college');
  ok(!!l, `${hit.coach} links to ${hit.p.name} (${hit.p.college})`);
  ok(l && l.label.includes(' at ' + hit.school + ',') && !l.label.includes(';'), 'labelled with the matching school', l && l.label);
  ok(l && l.short === 'Both at ' + hit.school, 'short names the matching school', l && l.short);
} else {
  const l = E.coachLinks([westbrook], { ...ctx, coachColleges: { 'Test Coach': ['Blinn College'] } },
    { name: 'Test Coach' }).find((x) => x.type === 'coach_college');
  ok(l && l.short === 'Both at Blinn College', 'a coach at the second school links', l && l.label);
}

console.log('\n4. the screen shows the schools, not the stored separator');
ok(E.collegeDisplay(westbrook) === 'Oklahoma · Blinn College', 'collegeDisplay', E.collegeDisplay(westbrook));

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
