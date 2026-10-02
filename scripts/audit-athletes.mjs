/* Audit the whole arcade athlete dataset and write a report of suspect rows.
 *
 *   node scripts/audit-athletes.mjs            writes arcade/data/audit-athletes.md
 *   node scripts/audit-athletes.mjs --print    prints it as well
 *
 * It reads the corpus exactly as the games do (entities.js, then every layer
 * data.js folds on), plus the raw source files on their own, and asks four
 * things of every player:
 *
 *   1. TEAM NAMES FOR THE ERA. Every club name a record carries has to have
 *      been that club's name at some point in the player's career. A 2009
 *      lineman listed with "Washington Commanders" is wrong (the name dates
 *      from 2022). A club name no other record in the sport carries is listed
 *      too, because that is how a typo looks.
 *   2. FRANCHISE COUNT. e.tk is one entry per franchise and is what every game
 *      counts. It has to match the franchises e.t resolves to and hold no
 *      club twice.
 *   3. AWARDS BY LEAGUE. An award has to belong to the player's own league
 *      (no Cy Young on an NBA record), and has to have existed during his
 *      career (no Super Bowl MVP for a career that ended in 1955). The Hall of
 *      Fame on an active player is listed as well.
 *   4. COLLEGE. The school has to look like a school, be spelled one way
 *      across the dataset, and agree between the source files. A player who
 *      transferred went to more than one school and ANY of them is right, so
 *      a disagreement that is a known transfer is accepted rather than listed.
 *
 * It changes nothing. The report is for a person to read and decide.
 * Reads only files already in the repo, so it runs offline.
 */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const require = createRequire(new URL('../', import.meta.url));
globalThis.window = globalThis; globalThis.self = globalThis;

const RAW_ENT = JSON.parse(JSON.stringify(require('./arcade/match/entities.js')));
globalThis.GRID_ENTITIES = require('./arcade/match/entities.js');
for (const f of ['former', 'stars', 'awards', 'supplement', 'cluebank', 'primary', 'franchise', 'data', 'type']) {
  require('./arcade/' + f + '.js');
}
const CORPUS = globalThis.GRID_ENTITIES;
const FR = globalThis.RTGFranchise;
const TYPE = globalThis.RTGType;
const FORMER = (globalThis.RTG_FORMER && globalThis.RTG_FORMER.players) || [];
const SUPP = (globalThis.RTG_SUPPLEMENT && globalThis.RTG_SUPPLEMENT.players) || [];
let CJSON = [];
try { CJSON = require('./arcade/data/corpus.json').filter(x => x.entity_type === 'player'); } catch (e) {}

const PRINT = process.argv.includes('--print');
const NOW = new Date().getFullYear();

const nk = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const who = e => `${e.name} (${e.sport}${e.decade && e.decade.length ? ', ' + e.decade[0] + 's' + (e.decade.length > 1 ? ' to ' + e.decade[e.decade.length - 1] + 's' : '') : ''})`;
function span(e) {
  const d = e.decade || [];
  if (!d.length) return null;
  return [d[0], Math.min(d[d.length - 1] + 9, e.act ? NOW : d[d.length - 1] + 9)];
}

const rows = { teams: [], rare: [], franchise: [], awards: [], college: [], spelling: [] };

/* ---- 1. team names for the era ------------------------------------------- */
// every name the franchise table knows, with the years it was used
const ERA = {};
for (const sport of Object.keys(FR._F)) {
  for (const k of Object.keys(FR._F[sport])) {
    for (const [a, b, name] of FR._F[sport][k]) {
      const key = sport + '|' + name;
      (ERA[key] = ERA[key] || []).push([a, b]);
    }
  }
}
const clubCount = {};
for (const e of CORPUS) for (const t of e.t || []) clubCount[e.sport + '|' + t] = (clubCount[e.sport + '|' + t] || 0) + 1;
for (const e of CORPUS) {
  const sp = span(e);
  for (const t of e.t || []) {
    const eras = ERA[e.sport + '|' + t];
    if (eras && sp) {
      const fits = eras.some(([a, b]) => Math.min(b, sp[1]) >= Math.max(a, sp[0]));
      if (!fits) rows.teams.push(`${who(e)}: "${t}" was only the name ${eras.map(([a, b]) => a + (b === 9999 ? ' on' : ' to ' + b)).join(', ')}`);
    }
    if ((clubCount[e.sport + '|' + t] || 0) <= 1 && ['NFL', 'NBA', 'MLB'].includes(e.sport)) {
      rows.rare.push(`${who(e)}: "${t}" is on no other ${e.sport} record`);
    }
  }
}

/* ---- 2. franchise count --------------------------------------------------- */
for (const e of CORPUS) {
  const t = e.t || [], tk = e.tk || [];
  if (!t.length) continue;
  const sp = span(e) || [0, 9999];
  const want = [...new Set(FR.keysOf(e.sport, t, sp[0], sp[1]))];
  if (new Set(tk).size !== tk.length) rows.franchise.push(`${who(e)}: a franchise is listed twice in tk (${tk.join(', ')})`);
  if (want.length !== new Set(tk).size) rows.franchise.push(`${who(e)}: ${new Set(tk).size} franchises in tk, but the club names resolve to ${want.length} (${want.join(', ')})`);
}

/* ---- 3. awards by league and era ------------------------------------------ */
const AW = {
  // award: [leagues it belongs to, first season it was given]
  'Hall of Fame': [['NFL', 'NBA', 'MLB'], 0],
  'Rookie of the Year': [['NBA', 'MLB'], 1947],
  'NBA MVP': [['NBA'], 1956], 'Finals MVP': [['NBA'], 1969], 'NBA All-Star': [['NBA'], 1951],
  'NFL MVP': [['NFL'], 1957], 'Super Bowl MVP': [['NFL'], 1967], 'Pro Bowl': [['NFL'], 1939],
  'Offensive Player of the Year': [['NFL'], 1972], 'Defensive Player of the Year': [['NFL'], 1971],
  'Offensive Rookie of the Year': [['NFL'], 1967], 'Defensive Rookie of the Year': [['NFL'], 1967],
  'MLB MVP': [['MLB'], 1911], 'Cy Young': [['MLB'], 1956], 'MLB All-Star': [['MLB'], 1933],
  'Gold Glove': [['MLB'], 1957], 'Silver Slugger': [['MLB'], 1980], 'World Series MVP': [['MLB'], 1955]
};
for (const e of CORPUS) {
  const sp = span(e);
  for (const a of e.aw || []) {
    const rule = AW[a];
    if (!rule) { rows.awards.push(`${who(e)}: "${a}" is an award this audit does not know`); continue; }
    if (!rule[0].includes(e.sport)) rows.awards.push(`${who(e)}: "${a}" is not a ${e.sport} award`);
    else if (sp && rule[1] && sp[1] < rule[1]) rows.awards.push(`${who(e)}: "${a}" was first given in ${rule[1]}, after this career ended`);
  }
  if ((e.hof || (e.aw || []).includes('Hall of Fame')) && e.act) rows.awards.push(`${who(e)}: in the Hall of Fame and marked active`);
}

/* ---- 4. college ----------------------------------------------------------- */
/* Players known to have played at more than one school. Any of these is a
   right answer, so a source that names one and a source that names another
   are both right. Add to it when the report turns one up. */
const TRANSFERS = {
  'NFL|russell wilson': ['NC State', 'Wisconsin'],
  'NFL|cam newton': ['Florida', 'Blinn', 'Auburn'],
  'NFL|joe burrow': ['Ohio State', 'LSU'],
  'NFL|baker mayfield': ['Texas Tech', 'Oklahoma'],
  'NFL|kyler murray': ['Texas A&M', 'Oklahoma'],
  'NFL|jalen hurts': ['Alabama', 'Oklahoma'],
  'NFL|justin fields': ['Georgia', 'Ohio State'],
  'NFL|jayden daniels': ['Arizona State', 'LSU'],
  'NFL|caleb williams': ['Oklahoma', 'USC'],
  'NFL|bo nix': ['Auburn', 'Oregon'],
  'NFL|michael penix jr': ['Indiana', 'Washington'],
  'NFL|joe flacco': ['Pittsburgh', 'Delaware'],
  'NFL|aaron rodgers': ['Butte', 'California'],
  'NFL|josh allen': ['Reedley', 'Wyoming'],
  'NFL|cam ward': ['Incarnate Word', 'Washington State', 'Miami'],
  'NBA|jimmy butler': ['Tyler', 'Marquette'],
  'NBA|dennis rodman': ['Cooke County', 'Southeastern Oklahoma State'],
  'NBA|larry bird': ['Indiana', 'Indiana State']
};
const schoolKey = s => (TYPE && TYPE.schoolKey) ? TYPE.schoolKey(s) : nk(s);
const sameSchool = (a, b) => (TYPE && TYPE.sameCollege) ? TYPE.sameCollege(a, b) : schoolKey(a) === schoolKey(b);
// every school each player is given, by source
const bySrc = new Map();
/* A source row is only compared when it is the same PERSON: it shares a club
   with the record (by franchise, so a renamed club still counts). Two players
   can share a name and a sport (check-namesakes.mjs), and a namesake's school
   is not a disagreement about this man. A row with no clubs is compared. */
const clubsOf = (sport, t) => new Set(FR.keysOf(sport, t || [], 0, 9999));
const note = (sport, name, school, src, t) => {
  if (!school) return;
  const k = sport + '|' + nk(name);
  if (!bySrc.has(k)) bySrc.set(k, []);
  for (const one of String(school).split(';').map(x => x.trim()).filter(Boolean)) bySrc.get(k).push([one, src, t ? clubsOf(sport, t) : null]);
};
for (const e of RAW_ENT) note(e.sport, e.name, e.col, 'entities.js', e.t);
for (const p of FORMER) note(p.sport, p.name, p.col, 'former.js', p.t);
for (const p of SUPP) note(p.sport, p.name, p.col, 'supplement.js', p.t);
for (const p of CJSON) for (const c of (p.attributes && p.attributes.college) || []) note(p.sport, p.display_name, c, 'corpus.json', p.attributes.teams);

const labels = {};
let compared = 0, cmpRows = 0;
for (const e of CORPUS) {
  const c = e.col;
  if (!c) continue;
  if (/\d/.test(c) || /high school|\bHS\b|academy|prep\b/i.test(c)) rows.college.push(`${who(e)}: "${c}" does not look like a college`);
  if (clubCount[e.sport + '|' + c]) rows.college.push(`${who(e)}: "${c}" is a club name, not a school`);
  const k = schoolKey(c);
  (labels[k] = labels[k] || new Set()).add(c);
  const mine = clubsOf(e.sport, e.t);
  const srcs = (bySrc.get(e.sport + '|' + nk(e.name)) || [])
    .filter(([, , clubs]) => !clubs || !clubs.size || [...clubs].some(x => mine.has(x)));
  const ok = (TRANSFERS[e.sport + '|' + nk(e.name)] || []).concat(e.cols || []);
  const attended = [c].concat(ok);
  const other = srcs.filter(([s]) => !attended.some(t => sameSchool(t, s)));
  if (srcs.length) { compared++; cmpRows += srcs.length; }
  if (other.length) rows.college.push(`${who(e)}: the corpus says "${c}", ${[...new Set(other.map(([s, src]) => src + ' says "' + s + '"'))].join(', ')}`);
  if (TRANSFERS[e.sport + '|' + nk(e.name)] && !TRANSFERS[e.sport + '|' + nk(e.name)].some(t => sameSchool(t, c))) rows.college.push(`${who(e)}: "${c}" is not one of the schools on the transfer list (${ok.join(', ')})`);
}
for (const k of Object.keys(labels)) if (labels[k].size > 1) rows.spelling.push(`${[...labels[k]].map(s => '"' + s + '"').join(' and ')} are one school spelled ${labels[k].size} ways`);

/* ---- report ---------------------------------------------------------------- */
const SECTIONS = [
  ['teams', 'Team names out of era', 'A club name the player could not have played under: the name was not in use at any point in his career.'],
  ['rare', 'Club names on only one record', 'Often a defunct club and fine. Sometimes a typo.'],
  ['franchise', 'Franchise counts', 'e.tk is what the games count. It should hold each franchise once and match the club names.'],
  ['awards', 'Awards by league and era', 'An award from another league, or one given for the first time after the career ended.'],
  ['college', 'Colleges', 'A school that does not look like a school, or sources that disagree. A known transfer is accepted and not listed.'],
  ['spelling', 'One school, several spellings', 'The games match these as one school. Listed so the data can be made consistent.']
];
const total = SECTIONS.reduce((n, [k]) => n + rows[k].length, 0);
let md = `# Athlete data audit\n\nGenerated by \`node scripts/audit-athletes.mjs\` over ${CORPUS.length} players. `
  + `${total} rows to review. Nothing here has been changed: each row is a question for a person.\n\n`;
md += `Colleges: ${compared} players with a school were checked against ${cmpRows} rows in the other source files.\n\n`;
md += '| Check | Rows |\n|---|---|\n' + SECTIONS.map(([k, t]) => `| ${t} | ${rows[k].length} |`).join('\n') + '\n';
for (const [k, title, blurb] of SECTIONS) {
  md += `\n## ${title}\n\n${blurb}\n\n`;
  md += rows[k].length ? [...new Set(rows[k])].sort().map(r => '- ' + r).join('\n') + '\n' : 'None.\n';
}
writeFileSync(new URL('../arcade/data/audit-athletes.md', import.meta.url), md);
console.log(`colleges compared for ${compared} players across ${cmpRows} source rows`);
console.log(`${CORPUS.length} players audited, ${total} rows to review -> arcade/data/audit-athletes.md`);
for (const [k, t] of SECTIONS) console.log(`  ${t}: ${rows[k].length}`);
if (PRINT) console.log('\n' + md);
