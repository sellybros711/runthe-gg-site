/* =============================================================================
 * Run The Arcade — corpus builder / validator
 *
 *   node grid/build-corpus.js
 *
 * Reads every *.json file in grid/data/ (the drop folder), validates it against
 * the shared schema, dedupes, and compiles the athlete/coach entries into
 * grid/match/entities.js (what the Daily Match generator loads). Team and
 * term entries are validated and counted here too — they're the shared corpus
 * the Daily Crossword will read.
 *
 * This is the ONE contract the chat-generated data must satisfy. If a file is
 * malformed or two entries collide on id, the build fails loudly instead of
 * letting bad data reach a board. Wrong-but-well-formed facts still need a
 * human spot-check — the validator can't know a tag is factually wrong, only
 * that it's shaped right and internally consistent.
 * ========================================================================== */
'use strict';
var fs = require('fs'), path = require('path');
var DATA_DIR = path.join(__dirname, 'data');
var OUT = path.join(__dirname, 'match', 'entities.js');

/* ---- controlled vocabularies (categories only group on exact strings) ----- */
var AWARDS = {
  NBA: ['NBA MVP', 'Finals MVP', 'Defensive Player of the Year', 'Rookie of the Year', 'Sixth Man of the Year', 'Scoring Champion', 'All-Star', 'All-NBA', 'Hall of Fame'],
  NFL: ['NFL MVP', 'Super Bowl MVP', 'Offensive Player of the Year', 'Defensive Player of the Year', 'Offensive Rookie of the Year', 'Defensive Rookie of the Year', 'Pro Bowl', 'First-Team All-Pro', 'Hall of Fame'],
  MLB: ['MLB MVP', 'Cy Young', 'World Series Champion', 'Rookie of the Year', 'Gold Glove', 'Silver Slugger', 'All-Star', 'Batting Title', 'Hall of Fame']
};
var MILES = {
  NBA: ['40,000 Point Club', '30,000 Point Club', '20,000 Point Club'],
  NFL: ['2,000-Yard Season', '10,000 Rushing Yards', '50,000 Passing Yards', '100 Career TDs'],
  MLB: ['500 Home Run Club', '3,000 Hit Club', '300 Win Club', '3,000 Strikeout Club']
};
var SPORTS = ['NFL', 'NBA', 'MLB', 'NHL', 'Golf', 'Tennis', 'Soccer', 'Boxing', 'UFC', 'Olympics'];

var errors = [], warnings = [];
function err(m) { errors.push(m); }
function warn(m) { warnings.push(m); }

/* ---- read every json file in the drop folder ----------------------------- */
if (!fs.existsSync(DATA_DIR)) { console.error('No grid/data/ folder.'); process.exit(1); }
var files = fs.readdirSync(DATA_DIR).filter(function (f) { return /\.json$/i.test(f); });
if (!files.length) { console.error('No .json files in grid/data/.'); process.exit(1); }

var all = [];
files.forEach(function (f) {
  var raw;
  try { raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); }
  catch (e) { err(f + ': invalid JSON — ' + e.message); return; }
  if (!Array.isArray(raw)) { err(f + ': top level must be a JSON array'); return; }
  raw.forEach(function (o, i) { o.__src = f + '[' + i + ']'; all.push(o); });
});

/* ---- validate + partition ------------------------------------------------- */
var ids = {}, athletes = [], teams = [], terms = [], other = [];
all.forEach(function (o) {
  var where = o.__src;
  if (!o.id) { err(where + ': missing id'); return; }
  if (ids[o.id]) { err('duplicate id "' + o.id + '" (' + where + ' and ' + ids[o.id] + ')'); return; }
  ids[o.id] = where;
  if (!o.name && !o.term) { err(where + ' (' + o.id + '): missing name/term'); return; }
  if (o.sport && SPORTS.indexOf(o.sport) === -1) warn(where + ' (' + o.id + '): unusual sport "' + o.sport + '"');
  if (typeof o.fame !== 'number' || o.fame < 1 || o.fame > 5) warn(where + ' (' + o.id + '): fame should be 1-5 (got ' + o.fame + ')');

  var type = o.type || 'athlete';
  if (type === 'team') { teams.push(o); return; }
  if (type === 'term') { terms.push(o); return; }
  if (type !== 'athlete' && type !== 'coach') { other.push(o); warn(where + ' (' + o.id + '): unknown type "' + type + '"'); return; }

  // athlete/coach field checks
  if (o.awards) {
    var vocab = AWARDS[o.sport] || [];
    o.awards = o.awards.filter(function (a) {
      if (vocab.indexOf(a) === -1) { warn(o.id + ': dropped off-vocabulary award "' + a + '"'); return false; }
      return true;
    });
  }
  if (o.milestones) {
    var mv = MILES[o.sport] || [];
    o.milestones = o.milestones.filter(function (m) {
      if (mv.indexOf(m) === -1) { warn(o.id + ': dropped off-vocabulary milestone "' + m + '"'); return false; }
      return true;
    });
  }
  if (o.draftYear != null && (o.draftYear < 1940 || o.draftYear > 2035)) warn(o.id + ': suspicious draftYear ' + o.draftYear);
  if (o.draftPick != null && (o.draftPick < 1 || o.draftPick > 500)) warn(o.id + ': suspicious draftPick ' + o.draftPick);
  if (o.jersey && !o.jersey.every(function (n) { return typeof n === 'number'; })) warn(o.id + ': jersey numbers must be numeric');
  athletes.push(o);
});

/* ---- map athletes to the generator's compact entity format ---------------- */
function compact(o) {
  var e = { id: o.id, name: o.name, sport: o.sport, f: o.fame };
  if (o.teams && o.teams.length) e.t = o.teams;
  if (o.jersey && o.jersey.length) e.j = o.jersey;
  if (o.draftYear) e.dy = o.draftYear;
  if (o.draftPick) e.dp = o.draftPick;
  if (o.college) e.col = o.college;
  if (o.birthPlace) e.b = o.birthPlace;
  if (o.position) e.pos = o.position;
  if (o.awards && o.awards.length) e.aw = o.awards;
  if (o.championships) e.ch = o.championships;
  if (o.milestones && o.milestones.length) e.ml = o.milestones;
  return e;
}

if (errors.length) {
  console.error('\nBUILD FAILED — ' + errors.length + ' error(s):');
  errors.forEach(function (m) { console.error('  ✗ ' + m); });
  process.exit(1);
}

var compactList = athletes.map(compact);
var header = '/* GENERATED by grid/build-corpus.js from grid/data/*.json — DO NOT EDIT BY HAND.\n' +
  ' * Edit the JSON in grid/data/ and re-run: node grid/build-corpus.js */\n';
var body = '(function (root, factory) {\n' +
  '  var mod = factory();\n' +
  '  if (typeof module !== "undefined" && module.exports) module.exports = mod;\n' +
  '  else root.GRID_ENTITIES = mod;\n' +
  '})(typeof self !== "undefined" ? self : this, function () {\n' +
  '  "use strict";\n  return ' + JSON.stringify(compactList) + ';\n});\n';
fs.writeFileSync(OUT, header + body);

/* ---- report --------------------------------------------------------------- */
function dist(list, keyFn) { var d = {}; list.forEach(function (x) { var k = keyFn(x); d[k] = (d[k] || 0) + 1; }); return d; }
console.log('\n=== RunTheGrid corpus build ===');
console.log('  files read: ' + files.join(', '));
console.log('  athletes/coaches: ' + athletes.length + '   teams: ' + teams.length + '   terms: ' + terms.length + (other.length ? '   other: ' + other.length : ''));
console.log('  athletes by sport: ' + JSON.stringify(dist(athletes, function (a) { return a.sport; })));
console.log('  athletes by fame:  ' + JSON.stringify(dist(athletes, function (a) { return a.f || a.fame; })));
console.log('  -> wrote ' + compactList.length + ' entities to match/entities.js');
if (warnings.length) {
  console.log('\n  ' + warnings.length + ' warning(s) (built anyway):');
  warnings.slice(0, 40).forEach(function (m) { console.log('    ! ' + m); });
  if (warnings.length > 40) console.log('    … +' + (warnings.length - 40) + ' more');
}
console.log('\nOK. Now run: cd grid/match && node verify-generator.js\n');
