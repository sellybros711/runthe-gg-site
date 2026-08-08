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

/* The band request goes to the address the rest of the site already uses, and
   there is no backend behind it, so the mailto is the delivery mechanism and
   not a decoration. Both fields are encoded: an unencoded ampersand in a band
   name ends the query parameter and truncates the message there. */
check(/class="card band soon"/.test(game), 'the more-bands-coming card is on the page');
check(/mailto:RunTheGames@outlook\.com/.test(game), 'the request goes to RunTheGames@outlook.com');
check(/subject=\$\{encodeURIComponent/.test(game) && /body=\$\{encodeURIComponent/.test(game),
      'and both the subject and the body are encoded');
check(/function toast\(/.test(game), 'toast() exists for the element that has always been there');

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
/* Leaving a draft throws the setlist away, so the logo has to ask first. The
   guard is against the two halves drifting apart: a confirm sheet with no
   handler asks nothing, and a handler with no sheet throws. */
console.log('leaving a draft');
check(/id="askSheet"/.test(game), 'the confirm sheet is in the page');
check(/id="askInner"/.test(game), 'the confirm sheet has a body to render into');
check(/function ask\(/.test(game), 'ask() exists');
check(/\.lockup'\)\.addEventListener\('click'/.test(game),
  'the logo is wired to the confirm');
check(/function draftInProgress\(/.test(game),
  'the confirm is gated on there being something to lose');

/* "You were there". The store is localStorage and nothing else reads it, so
   the key is load-bearing: renaming it silently forgets every show a player
   ever marked. */
console.log('you were there');
check(/const WERE_THERE_KEY = 'segue_were_there'/.test(game),
  "the attendance key is still 'segue_were_there'");
for (const fn of ['attendedAll', 'attendedSet', 'wasThere', 'toggleThere', 'attendedCount'])
  check(new RegExp(`function ${fn}\\(`).test(game), `${fn}() exists`);
check(/id="wereThereBtn"/.test(game), 'the show header carries the mark toggle');
check(/class="werethere"/.test(game), 'a marked show is tagged in the header');
check(/\.werethere\{/.test(game), 'the tag has styling');
// The tag is a brand mark, so it wears the dye rather than a flat colour.
check(/\.werethere\{[^}]*var\(--dye-line\)/.test(game), 'the tag is dyed');
check(/\.mine\{[^}]*white-space:nowrap/.test(game),
  'the home count wraps as one phrase');

/* THE LEADERBOARD, AND THE ONE PROPERTY THAT MATTERS MOST: it is optional. The
   game is a static page reading a CSV, and a blocked CDN or an unrun migration
   has to leave that page exactly as playable as it was. Everything below guards
   a way that could quietly stop being true. */
console.log('the board');
const board = read('setlist/board.js');
const authjs = read('setlist/auth.js');
const sql   = read('supabase/67_setlist_leaderboard.sql');

check(/<script src="\/setlist\/auth\.js\?v=\d+" defer><\/script>/.test(game),
  'auth.js is loaded, deferred and cache-versioned');
check(/<script src="\/setlist\/board\.js\?v=\d+" defer><\/script>/.test(game),
  'board.js is loaded, deferred and cache-versioned');
// The module and the two plain scripts have to move together or the page can be
// served against a stale board.
{
  const vs = [...game.matchAll(/(?:scoring|dataLoader)\.js\?v=(\d+)|setlist\/(?:auth|board)\.js\?v=(\d+)/g)]
    .map(m => m[1] || m[2]);
  check(new Set(vs).size === 1, 'every versioned script is on the same version',
    [...new Set(vs)].join(', '));
}

// The name is never sent by the client. This is the check that stays true only
// as long as nobody adds a convenience parameter for it.
check(!/p_display_name|p_username|p_name\b/.test(board),
  'board.js never sends a display name');
check(/select username::text into v_name from profiles/.test(sql),
  'the server reads the name out of profiles');

// Both axes exist and the percentage one is the one the draw cannot inflate.
check(/SORTS = \{ score: 'total', pct: 'pct_of_best' \}/.test(board),
  'the board has both axes');
check(/pct_of_best\s+numeric/.test(sql), 'the percentage is a stored column');
check(/v_pct := round\(100\.0 \* p_total/.test(sql),
  'and the server computes it rather than taking it from the client');

// The coherence checks the whole design rests on.
for (const [what, re] of [
  ['the parts have to sum to the total', /is not the sum of its parts/],
  ['breadth is valued server-side', /but those cards are worth/],
  ['the ceiling cannot be below the score', /a ceiling of % below a score of/],
  ['respins come out of the stage time', /plus %s of respins is more than/],
  ['segues cannot exceed the adjacent pairs', /which has at most % adjacent pairs/],
  ['a double submit is swallowed', /created_at > now\(\) - interval '1 minute'/],
]) check(re.test(sql), what);

// Attendance is the one private thing here, and it must stay private.
check(/create policy segue_attended_own[\s\S]{0,200}user_id = auth\.uid\(\)/.test(sql),
  'attendance is readable only by its owner');
check(!/segue_attended/.test(board.replace(/segue_(sync|forget)_attended/g, '')),
  'the client only ever reaches attendance through its two RPCs');
// The merge is the whole design of the sync: an absence is not a removal.
check(/on conflict do nothing/.test(sql), 'a sync merges rather than replaces');
check(/segue_forget_attended/.test(sql), 'and unmarking is its own call');

// Failing soft. Each of these is a way the board could start throwing into a
// finished show instead of quietly reporting itself unreachable.
check(/get offline\(\) \{ return offline; \}/.test(board), 'board.js reports being offline');
check((board.match(/failThrown\(/g) || []).length >= 6,
  'every network call has a catch that fails soft');
check(/const AUTH  = \(\) => window\.SEGUE_AUTH \|\| null/.test(game),
  'the page treats accounts as optional');
check(/if \(!a \|\| !a\.boot\(\)\) return;/.test(game),
  'and does nothing at all when the library is absent');
check(/API_VERSION/.test(authjs) && /API_VERSION/.test(board),
  'both modules carry an API version');

// The submit is not on the path to a finished show.
check(/recordShow\(\);\s*\/\/ fire and forget/.test(game),
  'recording a show is never awaited');

/* THE LAST TWO SCREENS. Both used to be stacks of rounded cards with the song
   titles coloured by tag, which is the pattern the rest of the game moved off
   and the one thing that competes with the dye. These guard the way back. */
console.log('the show and the scorecard');
// The scorecard's setlist is a sheet row with the accent as a bar, not a card
// with the accent as the title colour.
check(/class="rrow"/.test(game), 'the scorecard setlist uses sheet rows');
check(/\.rrow:before\{[^}]*background:var\(--acc/.test(game),
  'the accent is a bar on the row');
check(/\.rr-t\{[^}]*color:var\(--ink\)/.test(game),
  'and the song title is ink, not the accent');
// MID is the default role and eleven of them is not information.
check(/\/\^mid\$\/i\.test\(name\)/.test(game),
  'the default role is not printed');
// The playback feed is the same sheet, not seventeen stacked cards.
check(/\.sim-song\{[^}]*position:relative/.test(game)
  && !/\.sim-song\{[^}]*box-shadow:var\(--shadow\)/.test(game),
  'the playback feed is a sheet, not cards');
check(/\.sim-song:before\{[^}]*background:var\(--acc/.test(game),
  'and carries the same accent bar');
// Both score numbers are the full-bleed band, and neither is a card.
for (const [sel, what] of [['scorebox', 'the final score'], ['sim-head', 'the running score']]) {
  check(new RegExp(`\\.${sel}\\{[^}]*margin:0 calc\\(var\\(--gut\\) \\* -1\\)`).test(game),
    `${what} is full bleed`);
  check(new RegExp(`<div class="${sel}"`).test(game), `${what} is not a card`);
  check(new RegExp(`\\.${sel}:after\\{[^}]*linear-gradient\\(90deg`).test(game),
    `${what} closes on a dye rule`);
}
// The sticky one has to hide what scrolls under it.
check(/\.sim-head\{[^}]*background:var\(--bg\)/.test(game),
  'the sticky running score is opaque');
/* THE GRADE COLOURS ARE MEASURED, and the measurement is the comment above
   them. Both scores now sit on --bg rather than on --card, where the old green
   fell to 2.93:1: below even the 3:1 large-text floor, on the largest thing in
   the game. */
check(/--gradeHot:#127F3A/.test(game) && /--gradeWarm:#926607/.test(game),
  'the light-theme grades are the measured ones');
check(/\.grade-hot\{color:var\(--gradeHot\)/.test(game),
  'and the grade classes use them');
// Drawn, never typed. A caret glyph is 6px of ink in a 16px box.
check(!/content:'›'/.test(game), 'no typed chevrons are left');
check(/class="segout"/.test(game) && /class="segmark"/.test(game),
  'both screens use the drawn chevron');

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
