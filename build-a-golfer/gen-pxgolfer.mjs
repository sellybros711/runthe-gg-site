// Regenerate golf/pxgolfer.js from build-a-golfer.html.
//
// pxgolfer.js is a STANDALONE extract of the pixel-golfer engine, used by the hub homepage's golf card
// (index.html) and by nothing else. It was hand-carved once and then never updated, so it silently drifted
// behind the game. This script rebuilds it from the game file so a refresh is one command instead of an
// afternoon of copy-paste.
//
// It is a VERBATIM line-range extraction: each symbol below is pulled from the game's own source with its
// comments intact, in dependency order. A few symbols are SHIMS instead - the game's versions reach into
// the shop catalog, the save, or the sprite cache, none of which exist out here - and those are written
// out literally and marked so the next person can see exactly what was substituted and why.
//
// Run it FROM THE REPO ROOT (golf/ only exists on main, so in practice: from a worktree on main):
//   node build-a-golfer/gen-pxgolfer.mjs [outfile]      (default: golf/pxgolfer.js)
//
// Then prove it: scratchpad/pxg_parity.mjs renders a spread of looks through the game AND through the
// extract and requires the data URLs to match byte for byte. Syntax checks do not catch the failure
// that matters here - a helper the game grew and this file does not carry, which parses fine and
// throws the first time the card draws.
import fs from 'fs';

const SRC = 'build-a-golfer/build-a-golfer.html';
const OUT = process.argv[2] || 'golf/pxgolfer.js';

// ---- the manifest: what the card needs, in the order it must be declared -------------------------------
// A string is a symbol extracted verbatim from the game. An object is a shim written out as-is.
const MANIFEST = [
  {shim:`var S={};   // the card has no save; avLook reads S.look inside a try, so an empty object is enough`},
  'avHexRgb', 'SKINS', 'skinRampHex', 'skinToneOf', 'POLOS', 'PANTS', 'SHOES', 'shoeCol', 'HAIRS',
  'DEFLOOK', 'HAIRSTYLES',
  // The shop's shirt colours come along too. They used to be shimmed away (findShirt fell back to POLOS[0]),
  // which quietly drew a teal golfer for every Pro Shop colour - the parity run caught it on 'red'. The
  // entries' req() callbacks reference game-only helpers, but nothing here ever calls them: the renderer
  // reads .m and .s and nothing else.
  'COSMETIC_SHIRTS', 'allShirts', 'findShirt',
  'CLUB_LEGACY', 'normClub',
  'PXG_W', 'PXG_H', 'PXG_BODY',
  'PXG_WITCH', 'PXG_ELF', 'PXG_ANTLERS', 'PXG_FOOTBALL', 'PXG_FLOPPY', 'PXG_KNIGHT',
  'PXG_GOLDSHADES', 'PXG_BEACHSHADES', 'PXG_EYEBLACK', 'PXG_CLUB_SCEPTER', 'PXG_CLUB_CANDY', 'PXG_CAPE',
  'PXG_CLUBS', 'PXG_CLUB_PAL', 'CLUB_RECOLOR', 'CLUBS', 'CLUBS_BY',
  {shim:`// SHIM: club tags come off a career save. The card draws a random club, so these are never consulted.\n`+
        `function clubSetTag(look){return null;} function h2hUnitClubTag(u){return null;}`},
  'CLUB_SEL', 'PXG_BALL', 'PXG_BALL_PAL', 'PXG_CLEATS', 'PXG_CLEATS_PAL',
  'PXG_HAIR', 'PXG_HAIR_HAT',
  'PXG_CAP', 'PXG_VISOR', 'PXG_BUCKET', 'PXG_FLAT', 'PXG_SHADES',
  'PXG_COWBOY', 'PXG_WIZARD', 'PXG_CROWN', 'PXG_PARTY', 'PXG_TOPHAT', 'PXG_PROPELLER', 'PXG_HEADBAND',
  'PXG_EW_HEART', 'PXG_EW_STAR', 'PXG_EW_THREED', 'PXG_EW_MONOCLE', 'PXG_NOV',
  'PXG_BEANIE', 'PXG_FEDORA', 'PXG_SOMBRERO', 'PXG_HALO', 'PXG_VIKING', 'PXG_CHEF', 'PXG_BERET',
  'PXG_HEADPHONES', 'PXG_FLATBRIM', 'PXG_SANTA', 'PXG_SAFARI',
  'PXG_EW_AVIATORS', 'PXG_EW_ROUND', 'PXG_EW_GOGGLES', 'PXG_EW_EYEPATCH', 'PXG_EW_VISORBAND',
  'PXG_CARDIGAN', 'PXG_BLAZER', 'PXG_PLUSFOURS', 'PXG_TWEED', 'PXG_STRAW', 'PXG_FLOATIE',
  'PXG_TOPS', 'PXG_TOP_PAL', 'PXG_LEGS', 'PXG_LEG_PAL', 'PXG_HERITAGE_HAT_PAL', 'PXG_LAUREL', 'PXG_HATS',
  'PXG_PRISM_SHADES', 'PXG_EW_WAYFARER', 'PXG_EW_SPORT', 'PXG_EW_CATEYE', 'PXG_EW_READERS', 'PXG_EW_ROSE',
  'PXG_EW_STEAMPUNK', 'PXG_EW_CYBER', 'PXG_EW_PATRIOT', 'PXG_EW_GROUCHO', 'PXG_EW_DIAMOND', 'PXG_EYEWEAR',
  'PXG_HAT_OPEN', 'PXG_FIX', 'pxShade', '_pxURL', '_HND4', 'PXPAT', 'PXPAT_BY', 'pxLum', '_pxCanvas',
  'PX_CACHE_CAP', 'pxCacheSet', '_pxAddr', 'CLUB_GX',
  // ITEM 18: the club is re-anchored to the ball at runtime rather than re-authored, so the standing
  // golfer cannot be drawn without this. It was the first thing the parity run caught.
  'pxClubAddress',
  // NOTE: the 3/4 swing (PXG_SWING*), overhead (PXG_TOP*) and 8-direction (PXG_DIR8*) sprite sets used to
  // be carried here and were never reachable - the card calls RTGolfer.url, which is the STANDING golfer
  // and nothing else. The prune pass below drops that kind of dead weight automatically, so there is no
  // list to keep in sync; the game has since renamed those sets anyway.
  // ITEM 20: the ageing module. avLook resolves the palette for every renderer, so the card gets the
  // ageing golfer for free - but only when a look carries an explicit age, since there is no career here.
  'AGE_GREY_START', 'AGE_CROWN_FULL', 'AGE_TEMPLE_FULL', 'AGE_GREY_MAX',
  'AGE_TAN_START', 'AGE_TAN_YEARS', 'AGE_TAN_MAX', 'AGE_GREY_HEX', 'AGE_TEMPLE_Y0', 'AGE_TEMPLE_Y1',
  'avAgeOf', 'withAge', 'avGreyAmt', 'avMixHex', 'avTanTone',
  'avLook', 'pxGolferCanvas', 'pxGolferURL',
];

// the footer is this file's own, not the game's: it is what the hub card actually calls
const FOOTER = `
function _pick(a){return a[Math.floor(Math.random()*a.length)];}
function _k(o){return Object.keys(o);}
function randomLook(){
  var L={ skinTone:Math.floor(Math.random()*101), hair:_pick(HAIRS).id, hairStyle:_pick(HAIRSTYLES).id,
    polo:_pick(POLOS).id, hat:_pick(POLOS).id, pants:_pick(PANTS).id, shoes:_pick(SHOES).id,
    cap:Math.random()<0.72, hatStyle:_pick(_k(PXG_HATS)), club:_pick(_k(PXG_CLUBS)),
    lefty:Math.random()<0.15, gender:Math.random()<0.5?'male':'female' };
  if(Math.random()<0.42) L.eyewear=_pick(_k(PXG_EYEWEAR));
  if(Math.random()<0.28) L.shirtPat=_pick(PXPAT).id;
  if(Math.random()<0.22) L.top=_pick(_k(PXG_TOPS));
  if(Math.random()<0.18) L.leg=_pick(_k(PXG_LEGS));
  if(Math.random()<0.14) L.cleats=_pick(_k(PXG_CLEATS));
  if(Math.random()<0.30) L.ball=_pick(_k(PXG_BALL));
  // ITEM 20: a card golfer is somewhere in a career, so give them a plausible age. The engine ages a look
  // only when one is stamped on it, so without this line every golfer on the hub would be twenty-two.
  L.age = 22 + Math.floor(Math.random()*40);
  return L;
}
window.RTGolfer={ url:pxGolferURL, randomLook:randomLook, W:PXG_W, H:PXG_H };
`;

// ---- extraction ---------------------------------------------------------------------------------------
const html = fs.readFileSync(SRC, 'utf8');
const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const js = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');   // the game is the biggest block
const lines = js.split('\n');

// Walk a declaration to its end by tracking nesting depth, ignoring anything inside a string, a template
// literal or a comment. Regex literals are not tracked: none of the extracted symbols contains one, and
// the parity run would fail loudly if that ever stopped being true.
function endOf(start) {
  let depth = 0, i = start, str = null, line = false, blk = false, started = false;
  for (; i < lines.length; i++) {
    const s = lines[i];
    for (let c = 0; c < s.length; c++) {
      const ch = s[c], nx = s[c + 1];
      if (line) break;
      if (blk) { if (ch === '*' && nx === '/') { blk = false; c++; } continue; }
      if (str) { if (ch === '\\') { c++; continue; } if (ch === str) str = null; continue; }
      if (ch === '/' && nx === '/') { line = true; break; }
      if (ch === '/' && nx === '*') { blk = true; c++; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { str = ch; continue; }
      if (ch === '{' || ch === '[' || ch === '(') { depth++; started = true; }
      else if (ch === '}' || ch === ']' || ch === ')') depth--;
    }
    line = false;
    if (started && depth <= 0) return i;
    if (!started && depth === 0 && /;\s*(\/\/.*)?$/.test(s)) return i;   // a one-line `const X=1;`
  }
  throw new Error('unterminated declaration starting at line ' + (start + 1));
}

// The game co-declares plenty of these (`const PXG_W=44, PXG_H=56;`, `var AGE_TAN_START=24, AGE_TAN_YEARS=30`),
// so index EVERY name a declaration introduces, not just the head. Naming any one of them in the manifest
// then pulls the whole statement, and the emitted-set below stops it being pulled twice.
const index = new Map();
lines.forEach((s, i) => {
  const m = /^(?:const|var|let|function)\s+([A-Za-z_$][\w$]*)/.exec(s);
  if (!m) return;
  if (!index.has(m[1])) index.set(m[1], i);
  if (/^function\b/.test(s)) return;
  for (const c of s.matchAll(/[,\s]([A-Za-z_$][\w$]*)\s*=/g)) if (!index.has(c[1])) index.set(c[1], i);
});

const out = [], missing = [], emitted = new Set();
let extracted = 0, shims = 0;
for (const entry of MANIFEST) {
  if (typeof entry === 'object') { out.push({src: entry.shim, shim: true}); shims++; continue; }
  const start = index.get(entry);
  if (start == null) { missing.push(entry); continue; }
  if (emitted.has(start)) continue;            // already came along with a co-declared name
  emitted.add(start);
  out.push({src: lines.slice(start, endOf(start) + 1).join('\n'), shim: false});
  extracted++;
}
if (missing.length) {
  console.error('MISSING from ' + SRC + ': ' + missing.join(', '));
  console.error('The game renamed or removed these. Fix the manifest rather than shipping a partial engine.');
  process.exit(1);
}

// ---- prune to what the card can actually reach ---------------------------------------------------------
// The card's only entry point is RTGolfer.url, i.e. the STANDING golfer. Anything the roots below cannot
// reach is dead weight on the hub homepage, which is a page that has to load fast, so drop it. Doing this
// by reachability rather than by a hand-kept exclusion list means the next person cannot get it wrong.
const ROOTS = ['pxGolferURL', 'pxGolferCanvas', 'randomLook'];
const decl = out.map(e => ({
  src: e.src, shim: e.shim,
  names: [...e.src.matchAll(/^(?:const|var|let|function)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1])
    .concat([...e.src.split('\n')[0].matchAll(/[,\s]([A-Za-z_$][\w$]*)\s*=/g)].map(m => m[1])),
}));
const ownerOf = new Map();
decl.forEach((d, i) => d.names.forEach(n => { if (!ownerOf.has(n)) ownerOf.set(n, i); }));

// FOOTER counts as a root body: it is what the page calls into.
const keep = new Set();
const queue = [];
const seed = body => { for (const m of body.matchAll(/[A-Za-z_$][\w$]*/g)) { const i = ownerOf.get(m[0]);
  if (i != null && !keep.has(i)) { keep.add(i); queue.push(i); } } };
seed(FOOTER);
ROOTS.forEach(r => { const i = ownerOf.get(r); if (i != null && !keep.has(i)) { keep.add(i); queue.push(i); } });
while (queue.length) seed(decl[queue.pop()].src);
// Shims are ALWAYS kept and are roots in their own right. A shim can declare more than one thing on a
// line (`function allShirts(){...} function findShirt(id){...}`), so only its first name is indexed and
// reaching it by name is unreliable - which silently dropped findShirt the first time this ran.
decl.forEach((d, i) => { if (d.shim && !keep.has(i)) { keep.add(i); queue.push(i); } });
while (queue.length) seed(decl[queue.pop()].src);

const kept = decl.filter((_, i) => keep.has(i));
const dropped = decl.filter((_, i) => !keep.has(i)).flatMap(d => d.names);

const header = `// GENERATED by build-a-golfer/gen-pxgolfer.mjs from build-a-golfer/build-a-golfer.html - do not hand-edit.
// A standalone extract of the pixel-golfer engine for the hub homepage's golf card. Re-run the generator
// after any change to the golfer's art or palette, or this file silently drifts behind the game.
(function(){
`;
const body = header + kept.map(d => d.src).join('\n') + '\n' + FOOTER + '\n})();\n';

// ---- catch a symbol the game added that the manifest does not know about --------------------------------
// This is the failure mode that matters: the extract PARSES fine and then throws the moment it draws,
// because the game grew a new helper (pxClubAddress, from item 18, was exactly this). A free identifier
// that is CALLED and is declared nowhere in the file is the signature, so fail the build on it rather than
// shipping a file that only breaks in a browser.
{
  const declaredAll = new Set();
  for (const m of body.matchAll(/\b(?:const|var|let|function|class)\s+([A-Za-z_$][\w$]*)/g)) declaredAll.add(m[1]);
  // anything ASSIGNED is declared somewhere, including comma-continued declarators (`const A=..,B=..`).
  // This scanner is a smoke alarm, not a type checker: a called-but-never-declared name is the one shape
  // of bug it exists to catch, and that shape is never assigned.
  for (const m of body.matchAll(/([A-Za-z_$][\w$]*)\s*=[^=]/g)) declaredAll.add(m[1]);
  for (const m of body.matchAll(/function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g))
    m[1].split(',').forEach(p => { const n = p.trim().split(/[=\s]/)[0].replace(/[{}\[\].]/g, ''); if (n) declaredAll.add(n); });
  for (const m of body.matchAll(/\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>/g)) declaredAll.add(m[1]);
  for (const m of body.matchAll(/\(([^)]*)\)\s*=>/g))            // multi-arg arrow params, e.g. (map,minY,pal)=>
    m[1].split(',').forEach(p => { const n = p.trim().split(/[=\s]/)[0].replace(/[{}\[\].]/g, ''); if (n) declaredAll.add(n); });
  for (const m of body.matchAll(/(?:for\s*\(\s*(?:const|let|var)\s+|catch\s*\(\s*)([A-Za-z_$][\w$]*)/g)) declaredAll.add(m[1]);
  const GLOBALS = new Set(('window document Math Object Array String Number JSON Map Set WeakMap Date RegExp Boolean ' +
    'Error TypeError parseInt parseFloat isNaN undefined null true false this typeof console navigator Image ' +
    'requestAnimationFrame Promise Infinity NaN Symbol Intl encodeURIComponent decodeURIComponent btoa atob ' +
    'setTimeout globalThis arguments performance ' +
    // Only ever named inside COSMETIC_SHIRTS' req() callbacks, which gate a purchase in the game and are
    // never invoked out here - the renderer reads the colours off those entries and nothing else.
    'repAtLeast badgeMetrics ' +
    // playerAge is the game's, is read behind `typeof ... === "function"` inside a try, and can never fire
    // here because avAgeOf only consults it when the look IS S.look, which the shim leaves undefined.
    'playerAge').split(' '));
  const KEYWORDS = new Set(('const var let function return if else for while do break continue new delete in of ' +
    'instanceof try catch finally throw switch case default void yield await async class extends super static ' +
    'get set').split(' '));
  const code = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/`(?:\\.|[^`\\])*`/g, '``');
  const free = new Map();
  // Check EVERY free identifier, not just called ones. Narrower rules kept missing real gaps by one shape
  // at a time - _pxAddr was used as a value, CLUB_HDX as a bare operand in `x+CLUB_HDX` - and each miss cost
  // a browser round-trip to find. Property accesses (`.name`) and object keys (`name:`) are excluded, which
  // is what keeps this from drowning in noise; anything left over that is genuinely a global goes in GLOBALS.
  for (const m of code.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)(?![\w$])(?!\s*:)/g)) {
    const n = m[2];
    if (declaredAll.has(n) || GLOBALS.has(n) || KEYWORDS.has(n) || free.has(n)) continue;
    free.set(n, code.slice(Math.max(0, m.index - 60), m.index + 40).replace(/\s+/g, ' '));
  }
  if (free.size) {
    console.error('UNDEFINED, and it would throw the first time the card drew:');
    for (const [n, ctx] of free) console.error(`  ${n}   ...${ctx}...`);
    console.error('Add them to the manifest (or shim them) and re-run.');
    process.exit(1);
  }
}

fs.writeFileSync(OUT, body);
console.log(`${OUT}: ${extracted} extracted + ${shims} shims, ${kept.length} kept, ${dropped.length} pruned as unreachable, ${fs.statSync(OUT).size} bytes`);
if (dropped.length) console.log('  pruned: ' + dropped.join(', '));
