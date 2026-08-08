/* Segue — guard the things that have actually gone wrong.
 *
 *   node scripts/setlist/check_data.mjs
 *
 * Every assertion here exists because the corresponding mistake was shipped or
 * nearly shipped once. This is not a general validator; it is a regression net.
 * Run by .github/workflows/setlist-checks.yml on any PR touching the game.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import loadBand, { parseCSV } from '../../setlist/dataLoader.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = p => readFileSync(resolve(repoRoot, p), 'utf8');

let failures = 0;
const ok = m => console.log(`  ok    ${m}`);
const fail = m => { failures++; console.error(`  FAIL  ${m}`); };
const check = (cond, m, detail) => cond ? ok(m) : fail(`${m}${detail ? `: ${detail}` : ''}`);

// The column list DATA_CONTRACT.md promises, in order. dataLoader reads by name
// so order is not load-bearing, but a missing column silently degrades the game.
const COLUMNS = [
  'show_id', 'show_date', 'year', 'venue', 'city', 'state', 'set', 'position',
  'song', 'song_id', 'is_cover', 'original_artist', 'length_sec', 'show_gap',
  'times_played', 'rarity_rating', 'crowd_rating', 'is_jamchart', 'is_recommended',
  'jamchart_note', 'transition', 'is_segue', 'tags',
];

// Goose today: 7504 performances / 655 shows. The bounds are deliberately wide
// so a routine data refresh passes, but tight enough to catch the two ingest
// bugs that shipped: a 4000-row truncation (3998/387) trips the floor, and
// losing the artist_id filter (~14k rows of ~100 bands) trips the ceiling.
// If Goose genuinely outgrows the ceiling, raise it — do not delete it.
const BANDS = [
  { file: 'setlist/data/goose.csv', minPerf: 6000, maxPerf: 12000, minShows: 550, esteem: 60 },
  { file: 'setlist/data/sample.csv', minPerf: 100, maxPerf: 2000, minShows: 20 },
];

const NUM_ROUNDS = 8;          // must match scoring.js
const MIN_SONGS_PER_SHOW = 8;  // must match index.html drawableShows()

console.log('Setlist data checks\n');

for (const band of BANDS) {
  console.log(band.file);
  const text = read(band.file);
  const rows = parseCSV(text);

  const header = text.slice(0, text.indexOf('\n')).trim().split(',');
  check(
    header.length === COLUMNS.length && header.every((h, i) => h === COLUMNS[i]),
    'header matches DATA_CONTRACT',
    `got ${header.join(',')}`
  );

  const { shows, segues } = loadBand(text);
  check(
    rows.length >= band.minPerf && rows.length <= band.maxPerf,
    `performance count in range (${rows.length})`,
    `expected ${band.minPerf}–${band.maxPerf}`
  );
  check(shows.length >= band.minShows, `show count >= ${band.minShows} (${shows.length})`);

  // The bug that made players read "The Hollow Bar &amp; Kitchen" on screen:
  // the API returns HTML-encoded text and the UI escapes again on render.
  const entity = /&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-fA-F]+);/;
  const encoded = rows.filter(r => COLUMNS.some(c => entity.test(String(r[c] || ''))));
  check(!encoded.length, 'no HTML entities left in the data',
    encoded.length ? `${encoded.length} rows, e.g. "${encoded[0].venue}"` : '');

  const badDate = rows.filter(r => !/^\d{4}-\d{2}-\d{2}$/.test(r.show_date));
  check(!badDate.length, 'every show_date is YYYY-MM-DD',
    badDate.length ? `${badDate.length} bad, e.g. "${badDate[0].show_date}"` : '');

  const blank = rows.filter(r => !r.song || !r.song_id || !r.show_id);
  check(!blank.length, 'no blank song / song_id / show_id', `${blank.length} rows`);

  // Segues and gap are keyed on song_id, so a song splitting across two ids
  // would quietly break both. But a shared title is NOT evidence of that —
  // Goose's own "All I Need" and an LP Giobbi cover of the same name are two
  // songs and *should* have two ids. Nothing in the data distinguishes that
  // case from a genuine split, so this reports rather than fails; a jump from a
  // handful to dozens is the signal worth chasing.
  const idsPerTitle = new Map();
  for (const r of rows) {
    if (!idsPerTitle.has(r.song)) idsPerTitle.set(r.song, new Set());
    idsPerTitle.get(r.song).add(r.song_id);
  }
  const split = [...idsPerTitle].filter(([, ids]) => ids.size > 1);
  console.log(`  info  ${split.length} title(s) map to more than one song_id` +
    (split.length ? `: ${split.map(([t]) => `"${t}"`).join(', ')}` : ''));

  // The draw filters to full shows; there must still be a pool to draw from.
  const drawable = shows.filter(s => s.songs.length >= MIN_SONGS_PER_SHOW).length;
  check(drawable >= NUM_ROUNDS, `enough drawable shows (${drawable} with >= ${MIN_SONGS_PER_SHOW} songs)`);

  check(segues.size > 0, `segue pairs found (${segues.size})`);

  // The draft screen shows "ran into X" and highlights the song that finishes an
  // open segue. Both read fields the loader derives, so if that derivation
  // breaks the arrows quietly vanish and the mechanic goes back to being luck.
  const { partners } = loadBand(text);
  const withPartner = shows.flatMap(x => x.songs).filter(r => r.segued_into);
  check(withPartner.length > 0, `performances carrying a segue partner (${withPartner.length})`);
  check(partners && partners.size > 0, `songs with a known segue partner (${partners ? partners.size : 0})`);
  const bad = withPartner.filter(r => !r.segued_into_id || r.is_segue !== 'true');
  check(!bad.length, 'every segue partner belongs to a song that actually segued',
    bad.length ? `${bad.length} rows` : '');

  // Scoring reads crowd_rating as song esteem. If the jamchart join silently
  // breaks, every song collapses to the neutral base and the game goes flat —
  // which is exactly the bug v2 shipped with, so it is worth asserting.
  if (band.esteem) {
    const rated = new Set(rows.filter(r => r.crowd_rating).map(r => r.song_id));
    check(rated.size >= band.esteem, `songs carrying an esteem rating (${rated.size})`,
      `expected at least ${band.esteem}`);
    const vals = rows.map(r => Number(r.crowd_rating)).filter(n => Number.isFinite(n) && n > 0);
    const spread = new Set(vals).size;
    check(spread >= 10, `esteem takes a range of values (${spread} distinct)`,
      'a single value means the join collapsed');
    check(rows.some(r => r.is_recommended === 'true'), 'some versions are flagged recommended');
    check(rows.some(r => r.jamchart_note), 'jamchart notes are present');
  }
  console.log();
}

// The game is deliberately reachable only by URL while it is being tested:
// listed in the sitemap so it can be found, but linked from nowhere.
console.log('discoverability');
const home = read('index.html');
check(!/setlist/i.test(home), 'homepage does not link the game');

const sitemap = read('sitemap.xml');
check(sitemap.includes('<loc>https://runthe.gg/setlist/</loc>'), 'sitemap lists /setlist/');

const game = read('setlist/index.html');
check(!/noindex/i.test(game), 'game page is indexable (no noindex)');

console.log();

// A display font that is declared but never requested does not error — the
// browser quietly falls back and the page just looks wrong, which is exactly
// the kind of thing nobody notices in review.
console.log('typography');
const linked = new Set(
  [...game.matchAll(/fonts\.googleapis\.com\/css2\?([^"']+)/g)]
    .flatMap(m => [...m[1].matchAll(/family=([^&:]+)/g)].map(f => decodeURIComponent(f[1]).replace(/\+/g, ' '))));
for (const token of ['hero', 'ui', 'body']) {
  const decl = game.match(new RegExp(`--${token}:\\s*'([^']+)'`));
  check(!!decl, `--${token} names a font family`);
  if (decl) check(linked.has(decl[1]), `--${token} font "${decl[1]}" is loaded`,
    `linked: ${[...linked].join(', ') || 'none'}`);
}

console.log();

/* Two chips the same colour is invisible in review and obvious on a phone.
   COVER and PEAK shipped 3 degrees of hue apart; OPENER and CLOSER shipped
   identical; JAM and RECOMMENDED shipped identical twice, because outline vs
   fill is not enough separation at 9.5px. */
console.log('chip colour system');
const accent = game.slice(game.indexOf('function accentOf'), game.indexOf('// ── state'));
const roles = [...accent.matchAll(/v:\s*'var\((--[a-zA-Z]+)\)',\s*chip:\s*'([a-z]*)'/g)]
  .map(m => ({ v: m[1], chip: m[2] || '(none)' }));
check(roles.length >= 7, 'accentOf maps at least seven roles', `found ${roles.length}`);
const byVar = new Map();
for (const r of roles) byVar.set(r.v, [...(byVar.get(r.v) || []), r.chip]);
const shared = [...byVar].filter(([, v]) => v.length > 1);
check(shared.length === 0, 'every role has its own colour',
  shared.map(([v, c]) => `${v} used by ${c.join(' and ')}`).join('; '));

// Each family needs its own rule, or a chip silently falls back to the base
// grey and stops meaning anything.
for (const [sel, what] of [['.chip.acc', 'role'], ['.chip.seg', 'segue'],
                           ['.chip.sand', 'sandwich'], ['.chip.rare', 'rarity'],
                           ['.chip.rec', 'recommended'], ['.chip.jc', 'jamchart']])
  check(game.includes(sel + '{'), `${what} chips are styled (${sel})`);

// Tie dye is the archive family's alone — it is what makes those two chips
// unmistakable, and it stops meaning anything if it spreads.
// Deduped: the jamchart chip has a second rule for its selected state.
const dyed = [...new Set([...game.matchAll(/\.chip\.([a-z]+)\{[^}]*var\(--dye\)/g)]
  .map(m => m[1]))].sort();
check(dyed.join(',') === 'jc,rec', 'only the archive chips use tie dye',
  `dyed: ${dyed.join(', ') || 'none'}`);

console.log();

/* Segue has its own mark. It shipped for months wearing the RunThe.GG suite
   icon and the shared suite OG card, so every link unfurled as some other
   game. The assets are generated by scripts/setlist/make_brand.mjs; these
   assertions catch the page pointing at ones that are not there, and catch a
   quiet slide back to the suite defaults. */
console.log('\nbranding');
for (const n of [16, 32, 180, 192, 512]) {
  const f = `assets/segue-icon_${n}.png`;
  check(existsSync(resolve(repoRoot, f)), `${f} exists`);
}
check(existsSync(resolve(repoRoot, 'assets/segue-og_1200x630.png')), 'the OG card exists');
for (const [attr, want] of [['rel="icon"', 'segue-icon_32.png'],
                            ['rel="apple-touch-icon"', 'segue-icon_180.png']])
  check(game.includes(want), `${attr} points at ${want}`);
check(/og:image"\s+content="https:\/\/runthe\.gg\/assets\/segue-og_1200x630\.png"/.test(game),
      'og:image is Segue\'s own card, absolute');
check(!/(og:image|apple-touch-icon)[^>]*runthegames-/.test(game),
      'no share surface still points at the suite assets');
check(game.includes('twitter:card'), 'a twitter card type is declared');
// Every asset the page names must actually be on disk.
for (const m of game.matchAll(/["'(](\/assets\/[A-Za-z0-9_.-]+\.png)/g))
  check(existsSync(resolve(repoRoot, m[1].slice(1))), `${m[1]} is on disk`);

/* The mark is drawn in CSS and worn in two places: the home screen and the
   top bar. Matched on the class rather than on a whole class attribute, which
   is what broke when the tile picked up a second class. */
/* The mark lives in the top bar only. It was in the hero too, which put it
   and the wordmark twice on one screen about 60px apart. */
check(!/\bheromark\b/.test(game), 'the hero does not repeat the top bar mark');
check(/class="[^"]*\bsegmark-tile\b[^"]*"[^>]*--ms/.test(game), 'the top bar shows the mark');
check(/<a class="lockup"/.test(game), 'the top bar lockup goes home');
check(!game.includes('runthe-r-games.png'), 'the top bar is the game\'s, not the suite badge');

/* The redesign, guarded at the points it would silently regress to a default.
   The song list was fourteen identical rounded cards and the home page was a
   centred stack with numbered circles; both are the shapes a component
   library hands you, and both are one careless edit away from coming back. */
check(/\.hero\{[^}]*var\(--dye\)/.test(game),
      'the hero is a dye field, not a flat background');
/* The scrim that makes the hero type legible has to sit UNDER the type. In
   ::after it paints over the glyphs and washes them along with the field,
   which puts the contrast straight back where it was while still looking
   like a fix. */
check(/\.hero\{[^}]*linear-gradient\(rgba\(255,255,255/.test(game),
      'the contrast lift is in the hero background, below the content');
check(!/\.hero:after\{[^}]*rgba\(255,255,255/.test(game),
      'and not in an ::after that would cover the type');
check(/\.song\{[^}]*border-radius:0/.test(game), 'songs are sheet rows, not cards');
check(!/\.steps b\{[^}]*border-radius:50%/.test(game),
      'how-it-works dropped the numbered circles');
check(/<details class="about"/.test(game), 'the about wall is folded away');
check(/body\.playing \.about\{display:none/.test(game),
      'and gone entirely once you are playing');

/* The HUD's whole job is to make the clock feel like the thing you are
   playing against. It shipped once with the set name and the countdown at the
   same size over a full green bar, which reads as healthy progress. */
check(/\.hc-n\{[^}]*font-size:4\dpx/.test(game), 'the countdown is the biggest thing in the HUD');
check(/>Respin<\/button>/.test(game), 'the respin button just says Respin');
check(!/Respin\s*&middot;\s*\$\{fmtClock\(cost\)\}/.test(game),
      'and does not carry its price in the label');
check(/class="respin-cost"/.test(game), 'the price is on the confirm instead');
check(/class="nightstrip"/.test(game), 'the HUD shows the shape of the night');

/* The home page's block gaps were six different numbers before they were put
   on a scale. And nothing may key its spacing off .about being adjacent to
   the footer: an ad slot sits between them and is removed when unfilled, so
   such a rule silently applies or does not depending on timing. */
check(/--sp-1:/.test(game) && /--sp-4:/.test(game), 'the page spacing is a scale, not six numbers');
check(!/\.about\s*\+\s*\.sfoot/.test(game),
      'nothing keys spacing off .about being next to the footer');

/* The top bar is full bleed, and its dye rule is a HORIZONTAL sweep. It ran
   on the conic for months: a conic radiates from its own centre, so on a 3px
   tall strip only two hues are ever on screen and it read as a yellow bar
   that turned blue. Same geometry bug the segue arrow had. */
check(/\.topbar\{[^}]*margin:0 calc\(var\(--gut\) \* -1\)/.test(game),
      'the top bar reaches the screen edges');
check(/\.topbar:after\{[^}]*linear-gradient\(90deg/.test(game),
      'the top rule sweeps horizontally, not out of a conic');
check(!/\.topbar:after\{[^}]*var\(--dye\)[^}]*\}/.test(game),
      'and does not use the conic on a 3px strip');
/* The hero fade resolves to --bg, which is near-black on the dark theme, and
   the hero ink is pinned dark. Any type inside the faded zone is dark on
   dark: at 58% the blurb measured 2.55:1. It must start below the copy. */
check(/linear-gradient\(to bottom, transparent 7\d%, var\(--bg\)/.test(game),
      'the hero fade begins below the last line of type');

/* The hero wordmark is the same face as the top bar's, and it needs tracking:
   Alfa Slab One's slabs collide at zero letter-spacing above about 80px, so
   the word renders as one black mass with hairlines in it. */
check(/\.hero h1\{[^}]*font-family:var\(--hero\)/.test(game),
      'the hero wordmark uses the same face as the top bar');
check(/\.brand\{[^}]*font-family:var\(--hero\)/.test(game),
      'and the top bar still uses it too');
check(/\.hero h1\{[^}]*letter-spacing:\.0[5-9]em/.test(game),
      'the hero wordmark is tracked so the slabs do not collide');

/* The manifest is what makes it installable. A launcher crops a MASKABLE icon
   to whatever shape it likes and keeps only the middle, so shipping the
   rounded tile for that role gets its corners sliced off and the squircle
   re-cut at some other radius. Every other game in this repo does exactly
   that, which is why this asserts the two roles use different files. */
check(game.includes('rel="manifest"'), 'the page links a manifest');
let manifest = null;
try { manifest = JSON.parse(read('setlist/manifest.webmanifest')); ok('the manifest parses'); }
catch (e) { fail(`the manifest parses: ${e.message}`); }
if (manifest) {
  check(manifest.start_url === './' && manifest.scope === './', 'it is scoped to /setlist/');
  check(manifest.theme_color === '#071426', 'the theme colour is the game\'s navy');
  const byPurpose = p => (manifest.icons || []).filter(i => (i.purpose || 'any').split(/\s+/).includes(p));
  const any = byPurpose('any'), maskable = byPurpose('maskable');
  check(any.length > 0, 'it declares a normal icon');
  check(maskable.length > 0, 'it declares a maskable icon');
  const shared = maskable.filter(m => any.some(a => a.src === m.src)).map(m => m.src);
  check(!shared.length, 'the maskable icon is its own file, not the rounded one',
    shared.join(', '));
  for (const i of manifest.icons || [])
    check(existsSync(resolve(repoRoot, i.src.replace(/^\//, ''))), `${i.src} is on disk`);
}

/* Em dashes are banned from anything a player reads. They are easy to
   reintroduce one string at a time, so this strips the comments (where they
   are fine, and where most of them live) and fails on any that are left. */
console.log('copy');
const stripComments = src => src
  .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');       // line comments, sparing URLs
for (const file of ['setlist/index.html', 'setlist/scoring.js', 'setlist/dataLoader.js']) {
  const bare = stripComments(read(file));
  const hits = [...bare.matchAll(/.{0,44}[\u2014].{0,24}/g)].map(m => m[0].trim());
  check(!hits.length, `no em dashes in ${file}`,
    hits.length ? `${hits.length}, e.g. "${hits[0]}"` : '');
}

// The home screen states the size of the archive. A data refresh that moves
// the number must move the copy with it.
const claimed = game.match(/(\d[\d,]*)\s+shows from the elgoose\.net archive/);
check(!!claimed, 'the home screen states the archive size');
if (claimed) {
  const said = Number(claimed[1].replace(/,/g, ''));
  const actual = loadBand(read('setlist/data/goose.csv')).shows.length;
  check(said === actual, `home screen says ${said} shows and the data has ${actual}`);
}

console.log();
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
