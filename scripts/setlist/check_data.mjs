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
/* THE SAME FILE WITH ITS COMMENTS REMOVED, and it exists because this suite has
   now caught its own documentation three times. A guard that bans a phrase, a
   class name or a declaration has to be pointed at the CODE; the comment above
   the fix routinely quotes the thing being banned, which is exactly what makes
   the comment worth reading. Any guard whose subject is prose or markup should
   test this rather than `game`. CSS guards can use either, since a rule cannot
   hide inside a comment. */
const gameBare = game
  .replace(/\/\*[\s\S]*?\*\//g, '')     // CSS and JS block comments
  .replace(/<!--[\s\S]*?-->/g, '');    // HTML comments
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
/* THE DYE IS DOWN TO ONE CHIP, and that is the same lesson as the segue arrow
   and the account pill: it needs room. At 9.5px a five-colour border around
   four letters is a smudge, so JAMCHART is gold now (the colour the archive
   already uses for its other flag). RECOMMENDED keeps it because it is not in
   the draft list at all: it appears once on the playback screen, on its own
   line, at full badge size. */
check(dyed.join(',') === 'rec', 'only the archive badge uses tie dye',
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
/* COMMENTS STRIPPED FIRST, for the reason the `.hero p` guard below strips
   them: this matches a bare word, so a CSS comment that merely NAMES the class
   while explaining what does not wear it counts as the bug. Second time that
   has happened; the guard should test the markup, not the prose about it. */
check(!/\bheromark\b/.test(gameBare), 'the hero does not repeat the top bar mark');
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
/* The name is read SERVER-SIDE and never taken from the client. Since
   68_setlist_username.sql that read goes through segue_display_name() rather
   than an inline select, so the guard follows it there; the property it
   protects is unchanged. */
check(/from profiles where id = p_user/.test(sql),
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

/* Two things that looked fine in the CSS and were wrong on the screen. */
console.log('the header');
/* THE BLURB IS CENTRED BY AUTO SIDE MARGINS, and it is capped at 32ch, so the
   two have to be in ONE declaration. They were in two, two hundred lines apart,
   and the later `margin:0` shorthand reset both sides to zero: the sentence sat
   10px left of the wordmark above it while text-align still reported `center`,
   because the text was centred inside a box that was not. */
check(/\.hero p\{margin:0 auto;/.test(game), 'the hero blurb is centred');
{
  /* Comments stripped first: the explanation above the rule QUOTES the old
     broken declaration, and a guard that counts its own documentation as the
     bug is a guard nobody will keep. */
  const withMargin = [...gameBare.matchAll(/\.hero p\{([^}]*)\}/g)]
    .filter(m => /margin/.test(m[1]));
  check(withMargin.length === 1, 'and its margin is set in exactly one rule',
    `${withMargin.length} rules set it`);
}
check(!/\.hero p\{margin:0;/.test(game), 'no bare margin:0 on the blurb');

/* THE ACCOUNT CHIP HAS NO BASE RULE TO INHERIT. There is no `.pill` in this
   file: every shared property lives on `.pill.site`, so `.pill.me` has to
   declare its own or it renders as a sharp-cornered box. */
for (const prop of ['border-radius:99px', 'padding:', 'border:1px solid'])
  check(new RegExp(`\\.pill\\.me\\{[^}]*${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(game),
    `the account chip declares its own ${prop.replace(/:.*/, '')}`);
/* A gradient's axis has to match the shape's long axis. --dye-line is 180deg,
   built for a tall thin arrow; on a chip four times wider than tall it is a red
   box with a purple underline. Third time this has been the lesson. */
check(!/\.pill\.me\.in\{[^}]*var\(--dye-line\)/.test(game),
  'and does not wear the vertical dye');
check(/\.pill\.me\.in\{[^}]*linear-gradient\(90deg/.test(game),
  'its sweep runs the long way');

/* A NAME FOR THIS GAME ONLY. One account, two display names, and the whole
   feature rests on three things staying true. */
console.log('the Segue name');
const sql68 = read('supabase/68_setlist_username.sql');

// 1. It is a DISPLAY name. Nothing here may touch the login or the site name.
check(/alter table profiles add column if not exists segue_name citext/.test(sql68),
  'the Segue name is its own nullable column');
check(!/update profiles set username/.test(sql68),
  'and nothing in it rewrites the site username');
check(/coalesce\(segue_name, username\)/.test(sql68),
  'an unset name falls back to the site username');

/* 2. UNIQUENESS SPANS BOTH NAMESPACES. The board renders
   coalesce(segue_name, username) into one column, so a Segue name that could
   equal somebody else's site username is an impersonation, not a collision. */
check(/username = p_name or segue_name = p_name/.test(sql68),
  'availability checks both namespaces');
check(/username = v_name or segue_name = v_name/.test(sql68),
  'and so does the setter');
check(/id is distinct from auth\.uid\(\)/.test(sql68) && /id <> v_user/.test(sql68),
  'while leaving you your own names');

/* 3. THE SWITCH IS ONE FUNCTION. 67 routes every name read through
   segue_display_name() so 68 can change the answer without restating
   segue_submit_run()'s validation. If a caller goes back to reading profiles
   directly, that caller silently keeps using the site name. */
check(/create or replace function segue_display_name/.test(sql),
  '67 defines the one name lookup');
check((sql.match(/segue_display_name\(v_user\)/g) || []).length === 3,
  'and all three writers go through it',
  `${(sql.match(/segue_display_name\(v_user\)/g) || []).length} call sites`);
check(!/select username::text into v_name/.test(sql),
  'none of them reads profiles directly');
check(/create or replace function segue_display_name/.test(sql68),
  '68 changes the answer by replacing it');

// The client, and the one-migration-behind fallback.
check(/setSegueName/.test(authjs) && /segueNameFree/.test(authjs),
  'auth.js exposes the setter and the check');
check(/let segueColumn = true/.test(authjs),
  'and survives a project that has not run 68');
check(/segueColumn \? 'username,segue_name' : 'username'/.test(authjs),
  'by dropping the column from the profile read');
check(/id="segueNameForm"/.test(game), 'the account sheet has the name form');
check(/ME\.canRename \?/.test(game),
  'which is hidden when the migration has not run');
// The sheet is the one place both names are shown, so the field cannot read as
// "rename my whole account".
check(/Your RunThe\.GG account is still/.test(game),
  'and says plainly that the site account is unchanged');
check(/e\.target\.id === 'segueNameForm'/.test(game),
  'the name form is handled before the sign-in branch');

/* THE SEGUE MECHANIC IN THE DRAFT LIST. Measured against the real archive:
   27% of rows can start a segue, and once you play one a partner turns up in
   the next show 73.8% of the time. Three quarters of the time the player is
   handed the chance, so every one of these guards a way that chance goes back
   to being invisible. */
console.log('the segue in the list');
// The dye does not fit a 14px glyph. Solid violet in the list, playback and
// scorecard; the dye keeps the surfaces that have room for it.
check(/\.song \.segout[^{]*\{background:var\(--violetT\)/.test(game),
  'the list mark is solid, not dye');
check(/--dye-line\)/.test(game), 'and the dye survives where it belongs');
// A glyph says a row is different; only a word says what it is for.
check(/class="chip opens">SEGUE</.test(game), 'the affordance is named');
check(/\.chip\.opens\{/.test(game), 'and styled');
/* THE STATE THAT WAS DEAD. `.song` has border:0, so the old
   `.song.finishes{border-color:...}` coloured a border that does not exist.
   These are the properties that actually paint. */
check(/\.song\.finishes\{[^}]*background:/.test(game),
  'a row that lands a segue is filled');
/* The accent strip this used to check is gone: the time bar replaced it and
   carries the role colour now, so the landing state takes the BAR. Asserted
   with the rest of the time bar below; the property here is just that the row
   still shouts. */
check(/\.song\.finishes \.tbar\{/.test(game), 'and takes the bar');
check(/\.song\.finishes \.t\{[^}]*color:var\(--greenT\)/.test(game),
  'and its title');
check(!/\.song\.finishes\{border-color:[^;]*;\}/.test(game),
  'and does not rely on a border it does not have');
/* THE ACCENT BAR IS NOT AVAILABLE for the opens state: it carries what KIND of
   song a row is, and segue-violet both erased that and collided with jam. */
check(!/\.song\.opens:before\{/.test(game),
  'the opens state leaves the role accent alone');
// The line names the partner and nothing else. The old "or 14 more" counted
// archive-wide partners, which is not what the next round offers.
check(/Ran into\s*\n?\s*<b>/.test(game), 'the line names the partner');
check(!/or \$\{partnerCount - 1\} more/.test(gameBare),
  'and no longer advertises the archive-wide count');
// And the commit line invites rather than warns.
check(/most shows have a song that can/i.test(game),
  'committing to a segue reads as an invitation');
check(!/the transition is lost/.test(gameBare), 'not as a risk');

/* THE SONG TITLE IS NOT SET IN THE DISPLAY FACE. Anton is a condensed poster
   type; a song title is mixed case with apostrophes, ampersands and brackets,
   read ten to a screen. The line-fitting argument for keeping it was measured
   across all 364 distinct titles at the 309px a title really gets: Anton wraps
   3, Archivo 800 wraps 9. Six songs out of 364. */
console.log('the song title');
check(!/\.song \.t\{[^}]*font-family:var\(--ui\)/.test(game),
  'the song title is not the display face');
check(/\.song \.t\{[^}]*font-weight:800/.test(game), 'it is Archivo 800');
// The draft list and the scorecard list are the same list twice. One voice.
check(/\.rr-t\{[^}]*font-weight:800/.test(game),
  'and the scorecard setlist matches it');
// Anton keeps the jobs a display face is for.
check(/\.hc-n\{[^}]*font-family:var\(--ui\)/.test(game),
  'the countdown keeps the display face');
check(/\.showcard \.d\{[^}]*font-family:var\(--ui\)/.test(game),
  'and so does the show date');

/* THE DESCRIPTORS ARE TYPE, AND THE ROW DRAWS ITS OWN LENGTH.
   Measured across all 6,886 rows of the archive: the MEDIAN row carries one
   descriptor and 74% carry none or one. The pills were never solving a density
   problem, so the box came off and the colour stayed. */
console.log('the descriptors');
check(/\.chip\{[^}]*background:none/.test(game), 'the base chip has no fill');
check(/\.chip\{[^}]*padding:0/.test(game), 'and no padding');
check(/\.chip \+ \.chip:before\{[^}]*content:/.test(game),
  'descriptors are separated by a middot instead');
// The role, rarity, monotony and archive words are colour only now.
for (const k of ['acc', 'rare', 'mono', 'jc'])
  check(new RegExp(`\\.chip\\.${k}\\{color:var\\(--[a-zA-Z]+\\);\\}`).test(game),
    `the ${k} descriptor is colour only`);
/* THE TWO THAT KEEP A FILL are not descriptions of the song, they are a thing
   the player can do this turn, and they land on a handful of rows at most. */
check(/\.chip\.seg\{[^}]*background:color-mix/.test(game),
  'landing a segue keeps its fill');
check(/\.chip\.sand\{[^}]*background:var\(--green\)/.test(game),
  'and so does closing a sandwich');

/* THE TIME BAR. Length is the resource the game spends and it was a number you
   had to convert. The 25 minute scale is measured: 20 clips 7.2% of songs, 25
   clips 1.4%, 30 clips 0.3%, and at 25 the median fills 41% with p05-p95
   spanning 17%-84%, so the bar has real range. */
console.log('the time bar');
check(/const TBAR_FULL = 25 \* 60;/.test(game), 'the bar scale is 25 minutes');
check(/class="tbar\$\{/.test(game), 'every row draws one');
check(/aria-hidden="true"/.test(game) && /class="tbar/.test(game),
  'and it is hidden from assistive tech, since the clock states the length');
/* FULL BASIS, PAINTED WIDTH. `.l` is a wrapping flex row, and flexbox breaks on
   an item's hypothetical main size: sizing the bar with max-width clamps that
   too, so a short bar rides up beside the title on any row with no sub-line. */
check(/\.tbar\{[^}]*flex:0 0 100%/.test(game), 'the bar takes a whole line');
check(/\.tbar\{[^}]*background-size:max\(5px, var\(--w/.test(game),
  'and varies its paint, not its width');
check(/\.tbar\.over\{/.test(game), 'the ones that clip say so');
// It replaced the left accent strip rather than joining it.
check(!/\.song:before\{/.test(game), 'the left accent strip is gone');
check(/\.song\.finishes \.tbar\{[^}]*background:var\(--greenT\)/.test(game),
  'and the landing state takes the bar');

/* THE REFRESH RUNS ITSELF, and these guard the parts that make that safe.
   A refresh is not an append: crowd_rating is derived from the jamchart
   standings, so one new show restates ~4,000 of 7,500 rows. The commit diff can
   never be the control, so the gates are. */
console.log('the automatic refresh');
const wf = read('.github/workflows/setlist-data.yml');
check(/cron:/.test(wf), 'the refresh is scheduled');
/* --strict IS THE WHOLE SAFETY STORY. Without it the ingester warns about a
   throttled year, a truncated year or a jamchart outage and still exits 0,
   which for an unattended job means committing a broken file over a good one. */
check(/ingest_band\.mjs --strict/.test(wf), 'and fetches in strict mode');
check(/const STRICT = process\.argv\.includes\('--strict'\)/.test(read('scripts/setlist/ingest_band.mjs')),
  'which the ingester implements');
check(/if \(STRICT && degraded\.length\)/.test(read('scripts/setlist/ingest_band.mjs')),
  'and exits non-zero on a degraded run');
// All four gates run before anything is committed.
for (const [step, why] of [
  ['sync_counts.mjs', 'the copy follows the counts'],
  ['data_drift.mjs', 'the drift is inside bounds'],
  ['check_data.mjs', 'this net runs'],
  ['verify-scoring.mjs', 'the scoring spec runs'],
]) check(wf.includes(step), `before committing, ${why}`);
check(wf.indexOf('git commit') > wf.indexOf('verify-scoring.mjs'),
  'and the commit comes after every gate');
/* sync_counts exists because check_data asserts the home screen's archive size
   against the file, so every SUCCESSFUL refresh would otherwise fail here. */
check(existsSync(resolve(repoRoot, 'scripts/setlist/sync_counts.mjs')),
  'the counts in the copy can be regenerated');
/* AND ITS PATCHES MUST COMPOSE. DATA_CONTRACT is patched twice, once for the
   performance counts and once for the show table's. When each patch computed
   its result from the copy on disk and the writes were replayed at the end,
   the second silently threw away the first: the contract reached main with a
   current show-table line and a stale performance line, and no check caught
   it because the guarded number is the one on the home screen. */
const sync = read('scripts/setlist/sync_counts.mjs');
check(/const current = file => pending\.has\(file\) \? pending\.get\(file\) : read\(file\)/.test(sync),
  'a second patch to one file reads the first one\'s result');
check(/const before = current\(file\)/.test(sync) && !/const before = read\(file\)/.test(sync),
  'and no patch reads around it');
/* The counts it maintains must actually agree with the data, which is the
   whole point and was not true on main. */
{
  const contract = read('setlist/data/DATA_CONTRACT.md');
  const perf = contract.match(/\*\*(\d[\d,]*) performances · (\d[\d,]*) shows/);
  const rows = parseCSV(read('setlist/data/goose.csv'));
  check(!!perf && Number(perf[1].replace(/,/g, '')) === rows.length,
    'DATA_CONTRACT states the real performance count',
    perf ? `says ${perf[1]}, file has ${rows.length}` : 'line not found');
  // Parsed here rather than reusing the show table section's copy: that one is
  // declared further down the file and this would read it before it exists.
  const tableRows = parseCSV(read('setlist/data/goose_shows.csv'));
  const tbl = contract.match(/\*\*(\d[\d,]*) shows · (\d[\d,]*) with a setlist/);
  check(!!tbl && Number(tbl[1].replace(/,/g, '')) === tableRows.length,
    'and the real show table size',
    tbl ? `says ${tbl[1]}, file has ${tableRows.length}` : 'line not found');
}

/* WHICH VERSION YOU PICKED, which is the premise of the game and was invisible
   everywhere after the draft screen. Across the 166 songs with five or more
   plays the longest version is a median of 2.7x the shortest and 13.8x at the
   90th percentile; Echo of a Rose runs 1:00 to 44:24 over 114 plays. */
console.log('the version you picked');
const loader = read('setlist/dataLoader.js');
check(/p\.version_rank = rank;/.test(loader), 'the loader ranks every version');
check(/if \(len !== prev\)/.test(loader), 'and ties share a rank');
check(/function versionNote\(/.test(game), 'the standing has words');
check(/function whichNight\(/.test(game), 'and the night has a line');
// All three surfaces.
check(/class="rr-night"/.test(game), 'the scorecard row names the night');
check(/class="bdnight"/.test(game), 'the detail sheet leads with it');
check(/const ver = versionNote\(p\);/.test(game), 'the share card notes lead with the standing');
// The card lists performances, so it states their lengths.
check(/const time = fmtClock\(lenOf\(p\)\);/.test(game),
  'and the card prints every running time');
/* ordinal() was written for the monotony run ("starts at 3, rarely passes 6")
   and special-cased only 3, so the version standing shipped "2th longest". */
check(!/n === 3 \? 'rd' : 'th'/.test(game), 'ordinal is general, not run-length only');

/* THE PROFILE, FOR THE PEOPLE WHO TRACK THIS ALREADY. A show count is something
   anybody can keep on their own; what only this can say is how much of the
   catalogue those nights actually covered, because only this knows what was
   played on each of them. Measured against the archive: 25 marked shows reach
   129 of 367 songs, and 100 shows still leave 147 unheard, so the number moves
   for years and is worth stating. */
console.log('the fan profile');
check(/function attendanceStats\(/.test(gameBare), 'the marked shows are turned into stats');
for (const field of ['songsSeen', 'songsTotal', 'venues', 'years', 'mostSeen'])
  check(new RegExp(`\\b${field}\\b`).test(gameBare), `stats carry ${field}`);
/* THE HEADLINE IS SONGS, NOT SHOWS. If this ever regresses to a show count the
   panel says nothing the player could not already count themselves. */
check(/songs heard live/.test(gameBare), 'the headline counts songs, not shows');
check(/class="fanbar"/.test(gameBare), 'and shows the catalogue as a bar');
/* A show id outlives a data refresh that drops it, so the marked list can
   outrun the archive. Said out loud rather than quietly subtracted. */
check(/\bunmatched\b/.test(gameBare), 'shows that fell out of the archive are reported');

/* A SHOW YOU WENT TO IS NOT THE SAME THING AS A SETLIST SOMEBODY TYPED UP, and
   conflating them was a reported bug: twelve marked shows showed as ten. One in
   five played shows has no setlist in the archive, the browser rightly lets
   those be ticked, and the profile counted only the ones it could find in the
   SETLIST archive. The dropped ones were then reported as "no longer in the
   archive", which is not what happened to them. */
{
  // Parsed here, not reused from the show table section: that is declared
  // further down the file and this would read it before it exists.
  const table = parseCSV(read('setlist/data/goose_shows.csv'));
  const played = table.filter(r => r.show_date < new Date().toISOString().slice(0, 10));
  const noSet = played.filter(r => r.has_setlist !== 'true').length;
  check(noSet > 50, `played shows with no setlist exist to be miscounted (${noSet})`);
}
check(/const table = TOUR_STATE\.rows;/.test(gameBare),
  'the show table is what counts your shows');
check(/const mine = table\.filter\(r => ids\.has\(r\.show_id\)\)/.test(gameBare),
  'and every marked show it knows about is counted');
/* Song-level stats can only come from the shows that were transcribed, so the
   panel says which subset they cover rather than quietly shrinking the total. */
check(/out\.withSetlist = withSet\.length/.test(gameBare),
  'songs are counted from the transcribed subset');
check(/Songs are counted from the \$\{st\.withSetlist\} of your/.test(gameBare),
  'and the panel says so out loud');
check(!/no longer in the archive/.test(gameBare),
  'an untranscribed show is not called missing');
/* THE PROFILE HAS TO REPAINT WHEN THE TABLE LANDS. It reads two files and
   whichever arrives second must trigger the render; leaving the profile out of
   that list left the panel half built whenever the table lost the race. */
check(/S\.screen === 'tour' \|\| S\.screen === 'browse' \|\| S\.screen === 'profile'/.test(gameBare),
  'the profile repaints when the show table arrives');
check(/^\s*loadTourRows\(\);$/m.test(gameBare.slice(gameBare.indexOf('function renderProfile'),
  gameBare.indexOf('function renderProfile') + 700)),
  'and asks for it in the first place');

/* THE STATS THEMSELVES. Measured on a real 12-show profile: 17h 7m of music,
   131 song plays, 44 segues, 20 jamcharts, 19 covers, a 72-show-gap bustout
   and a 27:39 Animal. */
for (const [key, what] of [
  ['seconds', 'how long you have stood there'],
  ['segues', 'segues witnessed'],
  ['jamcharts', 'jamchart versions caught'],
  ['covers', 'covers heard'],
  ['debuts', 'debuts caught'],
  ['rarest', 'the rarest thing you caught'],
  ['longest', 'the longest version you saw'],
  ['topVenue', 'the venue you go to most'],
  ['bigYear', 'your biggest year'],
  ['tours', 'tours caught'],
]) check(new RegExp(`\\b${key}\\b`).test(gameBare), `the profile knows ${what}`);
/* THE INVERSE, which is the one a tracker actually wants: not what you have
   seen but what the band keeps playing while you are not in the room. */
check(/const wanted = \[\.\.\.playCount\]/.test(gameBare)
  && /\.filter\(\(\[song\]\) => !seenTitles\.has\(song\)\)/.test(gameBare),
  'and what it keeps playing without you');
check(/Most played, never seen/.test(gameBare), 'which is shown');
// A venue seen once is not a favourite, and a one-show year is not a big year.
check(/venues\[0\]\[1\] > 1 \? \{ venue/.test(gameBare),
  'a venue only counts as a favourite on a repeat');
/* Two words at most in a tile label: a third of a 390px screen clipped
   "songs played to you" to "SONGS PLAYED TO" over "YOU". */
check(!/'songs played to you'/.test(gameBare), 'tile labels fit their tile');

/* THE PROFILE LOADS THE ARCHIVE ITSELF. Reached from the home screen there has
   never been a draft, so S.data is empty and the panel used to degrade to a
   bare count on exactly the path most players take. */
check(/const FAN_DATA = new Map\(\)/.test(gameBare), 'the profile caches the archive it fetches');
/* IN FLIGHT IS ITS OWN SET. Claiming the work by writing null into the cache
   made fanData's own `has` check hand that null straight back, so the fetch it
   was guarding never ran. The two must not be the same store. */
check(/const FAN_FETCHING = new Set\(\)/.test(gameBare),
  'in-flight bands are tracked apart from the cache');
check(/FAN_FETCHING\.add\(/.test(gameBare) && !/FAN_DATA\.set\([^,]+, null\)/.test(gameBare),
  'the in-flight claim never writes null into the cache');

/* HOW THIS VERSION COMPARED, which needs the song's typical length and not just
   its rank: "9th longest of 62" does not say whether it was a jam or a radio
   cut. Median rather than mean because the long tail is the whole point. */
check(/p\.version_median = med;/.test(read('setlist/dataLoader.js')),
  'the loader carries each song\'s typical length');
check(/class="bdmed"/.test(gameBare), 'and the detail sheet compares this take to it');

/* THE BLOCK SITS IN A BARE .card, which carries no padding, so without its own
   the band name and the play count are printed ON the border. */
check(/\.fanband\{[^}]*padding:/.test(gameBare), 'the fan block has its own padding');
/* "Seen most" measures 74px at this size and tracking, so a 74px column wraps it
   onto a second line and knocks its whole row out of alignment. */
const fanLabel = gameBare.match(/\.fanrow i\{[^}]*\}/s);
check(!!fanLabel && /white-space:nowrap/.test(fanLabel[0]), 'the row labels do not wrap');
check(!!fanLabel && Number((fanLabel[0].match(/flex:0 0 (\d+)px/) || [])[1]) >= 80,
  'and the label column is wide enough for the longest of them');

/* THE WALKTHROUGH, and the measurement that says it has to exist. On a 390x844
   screen the "Draft a setlist" button sits at 414px while the first rule starts
   at 809px and all five end below the fold, so a first-time player meets the
   button 400px before they meet a single word of explanation. */
console.log('the walkthrough');
check(/const GUIDE_STEPS = \[/.test(gameBare), 'a first visit gets walked through the page');
check(/id="guide"/.test(gameBare), 'the overlay is in the markup');
/* IT MUST BE GETTABLE BACK. A walkthrough you can only ever see once is a
   popup; the button under the rules is what makes it a manual. */
check(/id="guideBtn"/.test(gameBare), 'and can be reopened afterwards');
check(/if \(e\.target\.closest\('#guideBtn'\)\)\{ openGuide\(0\); return; \}/.test(gameBare),
  'the reopen button is wired');
/* ONCE. Guarded by a stored key AND an in-session flag, because a home screen
   re-render would otherwise bring it back after somebody closed it. */
check(/const GUIDE_KEY = 'segue_guide_v1'/.test(gameBare), 'it remembers being seen');
check(/!guideAutoTried && !guideSeen\(\)/.test(gameBare),
  'and cannot reappear later in the same session');

/* EVERY STEP AIMS AT SOMETHING THAT EXISTS. The arrow is positioned from the
   target's measured rect, so a renamed hook does not throw, it silently points
   at nothing. */
for (const sel of ['.band:not(.soon) [data-start]', '[data-go="board"]',
  '[data-go="tour"]', '[data-go="browse"]', '[data-go="profile"]'])
  check(gameBare.includes(`aim: () => document.querySelector('${sel}')`),
    `a step aims at ${sel}`);

/* AND EVERY BUTTON ON THE HOME SCREEN HAS A STEP, which is the guard that
   matters, because the other direction is the one that actually failed. The
   walkthrough shipped covering Leaderboard and Your shows; two commits later
   On tour and Every show were added to the same row and nothing said a word
   about them, which is precisely the gap the walkthrough exists to close,
   reopened by the person who closed it.
   Reading renderHome rather than the whole file on purpose: `data-go="browse"`
   also appears on the tour screen, and that one is a cross-link, not a thing a
   first visit has to be introduced to. */
const homeSrc = (() => {
  const at = gameBare.indexOf('function renderHome(){');
  return at < 0 ? '' : gameBare.slice(at, gameBare.indexOf('\n}', at));
})();
check(!!homeSrc, 'renderHome can be read');
const homeGos = [...new Set([...homeSrc.matchAll(/data-go="([a-z]+)"/g)].map(m => m[1]))];
const aimed = [...new Set([...gameBare.matchAll(/aim: \(\) => document\.querySelector\('\[data-go="([a-z]+)"\]'\)/g)]
  .map(m => m[1]))];
const unexplained = homeGos.filter(g => !aimed.includes(g));
check(homeGos.length >= 4, `the home screen offers ${homeGos.length} screens`);
check(!unexplained.length, 'every screen the home screen links to gets a step',
  unexplained.length ? `no step for ${unexplained.map(g => `"${g}"`).join(', ')}` : '');
check(/class="card band"/.test(gameBare) && /class="card band soon"/.test(gameBare)
  && /data-start="\$\{b\.id\}"/.test(gameBare),
  'and the home screen still carries the hooks they aim at');

/* THE LAYOUT MATHS MEASURES FROM THE RING, NOT THE TARGET. The ring is the
   target plus a 6px halo; leaving the halo out put the arrow's tip on top of
   the ring's own border. */
check(/const ringTop = r\.top - GUIDE_PAD, ringBottom = r\.bottom \+ GUIDE_PAD;/.test(gameBare),
  'the arrow is placed off the ring, halo included');
/* Centring the target and then asking which side fitted could never work: a
   350px panel plus a 68px arrow and its gaps needs 442px, and a centred target
   on an 844px screen leaves 393 above and 392 below. Room is made first. */
check(/window\.scrollBy\(0, r\.bottom - wantBottom\)/.test(gameBare),
  'and room is made before a side is chosen');
/* At 320px the nav row wants 315px of a 260px content width. */
check(/\.g-nav\{[^}]*flex-wrap:wrap/.test(gameBare), 'the panel nav wraps rather than overflowing');
/* THE SPOTLIT THING IS PRESSABLE, or the spotlight is a lie. The overlay covers
   the page, so a press on the very button the arrow points at reaches the
   overlay and nothing else; without the hand hit test, "press this one first"
   steps the walkthrough forward instead of dealing a show. */
check(/e\.clientX >= r\.left && e\.clientX <= r\.right/.test(gameBare),
  'pressing the highlighted element does what it says');
check(/closeGuide\(\);\s*target\.click\(\);/.test(gameBare),
  'and the press is forwarded to it');

/* THE SHOW TABLE, and the reason it is a second file rather than more columns:
   the setlist CSV is one row per PERFORMANCE, so a show with no setlist has
   nothing to put in it, and every date the band has not played yet is exactly
   that. It also carries the tour name, which the setlist endpoint never
   returns. Measured Aug 2026: 855 shows, 658 with a setlist, 28 still to play,
   43 distinct tours. */
console.log('the show table');
const showsPath = 'setlist/data/goose_shows.csv';
check(existsSync(resolve(repoRoot, showsPath)), 'the show table exists');
const showRows = parseCSV(read(showsPath));
const SHOW_COLS = ['show_id', 'show_date', 'year', 'tour_id', 'tour',
  'venue', 'city', 'state', 'country', 'has_setlist'];
const showHead = read(showsPath).slice(0, read(showsPath).indexOf('\n')).trim().split(',');
check(showHead.length === SHOW_COLS.length && showHead.every((h, i) => h === SHOW_COLS[i]),
  'its header matches DATA_CONTRACT', `got ${showHead.join(',')}`);
check(showRows.length > 700, `it covers the whole history (${showRows.length} shows)`);
check(showRows.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.show_date || '')),
  'every show_date is YYYY-MM-DD');
const tourNames = new Set(showRows.map(r => r.tour).filter(Boolean));
check(tourNames.size >= 20, `tour names are present (${tourNames.size} distinct)`);
/* "Not Part of a Tour" is elgoose's label for a one-off and it is a sentence,
   not a name. The ingester blanks it so the UI decides how to say it; letting
   it through would put that string in a dropdown. */
check(!tourNames.has('Not Part of a Tour'), "elgoose's one-off placeholder is blanked, not a tour");
/* EVERY SHOW IN THE ARCHIVE MUST BE IN THE TABLE, because the browser reads
   the table and the attendance stats read the archive. A show missing here is
   one a player cannot tick and therefore cannot ever be credited for. */
const tableIds = new Set(showRows.map(r => r.show_id));
const archiveIds = new Set(parseCSV(read('setlist/data/goose.csv')).map(r => r.show_id));
const missing = [...archiveIds].filter(id => !tableIds.has(id));
check(!missing.length, 'every archived show is in the table',
  missing.length ? `${missing.length} missing, e.g. ${missing[0]}` : '');
check([...tableIds].some(id => !archiveIds.has(id)),
  'and the table carries shows the archive cannot (unplayed and untranscribed)');
const flagged = showRows.filter(r => r.has_setlist === 'true').map(r => r.show_id);
check(flagged.every(id => archiveIds.has(id)) && flagged.length === archiveIds.size,
  `has_setlist agrees with the archive (${flagged.length} of ${archiveIds.size})`);

/* THE HOME SCREEN'S OWN LITTLE FILE. ~1KB, and that size is the argument: the
   panel prints last night's setlist and a countdown, and reading those out of
   the 1.2MB archive or the 72KB table is not defensible for something that has
   to be on screen before anybody has decided to play. */
console.log('last night and next up');
const latestPath = 'setlist/data/goose_latest.json';
check(existsSync(resolve(repoRoot, latestPath)), 'the latest file exists');
const latest = JSON.parse(read(latestPath));
check(read(latestPath).length < 20000,
  `and stays small (${read(latestPath).length} bytes)`);
check(!!latest.last && /^\d{4}-\d{2}-\d{2}$/.test(latest.last.date || ''),
  'it names a last show');
check(Array.isArray(latest.last.sets) && latest.last.sets.length > 0
  && latest.last.sets.every(s => s.label && Array.isArray(s.songs) && s.songs.length),
  'with a real setlist in it');
/* THE LAST SHOW MUST BE THE LAST SHOW. Taking the wrong end of the sort, or a
   show the archive no longer holds, is the failure nobody would notice: the
   panel keeps rendering, just with a setlist from years ago. */
{
  const dates = showRows.filter(r => r.has_setlist === 'true').map(r => r.show_date).sort();
  check(latest.last.date === dates[dates.length - 1],
    'and it is genuinely the most recent one played',
    `file says ${latest.last.date}, archive's newest is ${dates[dates.length - 1]}`);
  check(tableIds.has(latest.last.show_id), 'whose show_id is in the table');
}
/* THREE DATES, NOT ONE. Written by a scheduled job, read whenever somebody
   visits: one date goes stale the moment the band plays it. */
check(Array.isArray(latest.upcoming), 'it carries an upcoming list');
check(latest.upcoming.length !== 1,
  `and more than a single date when there are any (${latest.upcoming.length})`);
check(latest.upcoming.every(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date || '')),
  'every upcoming date is YYYY-MM-DD');
/* SET ORDER COMES FROM THE GAME'S OWN LOADER, not a second implementation that
   could disagree with it about where an encore goes. */
check(/import \{ loadBand, setLabel \} from '\.\.\/\.\.\/setlist\/dataLoader\.js'/
  .test(read('scripts/setlist/ingest_band.mjs')),
  'the ingester groups it with the loader the game reads with');
check(/git add[\s\S]{0,180}goose_latest\.json/.test(wf), 'the refresh commits it');

/* THE PANEL IS OPTIONAL, and has to be. The game is a static page reading a
   CSV; a blocked request or a file that has not been generated yet must leave
   the home screen exactly as usable as it was. */
check(/const LATEST = \{ data: null, tried: false \}/.test(gameBare),
  'the home screen loads it separately from the archive');
check(/catch \(e\) \{ \/\* the panel simply does not appear \*\//.test(game)
  || /catch \(e\) \{ \}/.test(gameBare) || /catch \(e\) \{\s*\}/.test(gameBare),
  'and swallows a failure rather than breaking the screen');
check(/function nextShow\(\)/.test(gameBare) && /up\.find\(s => s\.date >= today\)/.test(gameBare),
  'the countdown skips dates that have already been played');

/* THE BAND OWNS ITS OWN THINGS. This screen had four identical ghost buttons in
   two rows: Leaderboard, Your shows, On tour, Every show. They read as peers
   and are not: two are about GOOSE and two are about YOU, and flattening that
   into one grid is what made the page a pile rather than a structure. */
console.log('the band panel');
check(/class="nextline"/.test(gameBare), 'the panel carries the countdown');
check(/class="lastset"/.test(gameBare), 'and last night\'s setlist');
check(/class="ls-hd"/.test(gameBare), 'with the heading it belongs to');
check(/class="bandlinks"/.test(gameBare), "the band's own pages sit inside the band panel");
check(/class="youlinks"/.test(gameBare), 'and the player links are a separate, quieter row');
check(!/class="homelinks"/.test(homeSrc), 'the old grid of equal ghost buttons is gone');
{
  /* The order is load-bearing and was wrong once. The setlist is the LAST
     show's detail, so a button between them separates a heading from the thing
     it heads; the countdown is one line and earns the space above the primary
     action. Measured: 470px for the draft button this way against 665px with
     the whole live section on top of it. */
  const iNext = homeSrc.indexOf('class="nextline"');
  const iBtn = homeSrc.indexOf('data-start="${b.id}"');
  const iSet = homeSrc.indexOf('class="lastset"');
  check(iNext > -1 && iBtn > iNext && iSet > iBtn,
    'countdown, then the button, then the setlist under its own heading');
}
/* The separator TRAILS its song: in a setlist the mark belongs to the song it
   leaves, and reading it off the previous song put every caret one title late. */
check(/esc\(sg\.n\) \+ \(i === s\.songs\.length - 1 \? ''/.test(gameBare),
  'a segue mark trails the song it leaves');

/* ON TOUR. The band is playing right now, and the archive is silent about that
   by construction: it only knows shows that have already happened. */
console.log('on tour');
check(/if \(S\.screen === 'tour'\)/.test(gameBare), 'the tour screen is routed');
check(/shows: '\/setlist\/data\/goose_shows\.csv'/.test(gameBare), 'the band points at its show table');
/* A SEPARATE FETCH, deliberately: 72KB against the archive's 1.2MB. Making
   somebody download every performance to see who is playing tomorrow would be
   indefensible, so fetchShowTable must not go through fetchBand. */
check(/async function fetchShowTable\(band\)/.test(gameBare), 'the table is fetched on its own');
check(!/fetchBand[\s\S]{0,200}goose_shows/.test(gameBare),
  'and not dragged in behind the whole archive');
/* THE COUNTDOWN IS IN DAYS AND THAT IS THE DATA'S FAULT, not laziness: elgoose
   returns null for showtime and timezone on every row in the table, so there
   is no set time to count to and no venue clock to count it in. An
   hours-and-minutes readout would be inventing both. */
check(/function daysUntil\(/.test(gameBare) && /function countdownWords\(/.test(gameBare),
  'the countdown is computed in whole days');
check(!/getHours\(\)[\s\S]{0,120}countdown/i.test(gameBare),
  'and no finer unit is invented from a date alone');
check(/class="card nextshow"/.test(gameBare) && /\.nextshow\{/.test(gameBare),
  'the next show gets its own card');

/* EVERY SHOW. Marking attendance one night at a time during a draft was the
   only way in, and for somebody with a hundred shows behind them that means
   playing until the game happens to deal each of them. */
console.log('every show');
check(/if \(S\.screen === 'browse'\)/.test(gameBare), 'the browser is routed');
check(/id="bYear"/.test(gameBare) && /id="bTour"/.test(gameBare),
  'it filters by year and by tour');
/* The tour list follows the year, because 43 tours in one dropdown is a scroll
   and only a handful of them happened in the year you picked. */
check(/!BROWSE\.year \|\| r\.year === BROWSE\.year\)\s*\n\s*\.map\(r => r\.tour\)/.test(gameBare),
  'and the tour list narrows to the chosen year');
check(/data-mark=/.test(gameBare), 'rows can be ticked');
check(/toggleThere\(band\.id, mark\.dataset\.mark\)/.test(gameBare),
  'and a tick reaches the same store the draft writes to');
/* Repainting the row rather than the screen: a re-render throws away the
   scroll position, and somebody working through a year taps a lot of these. */
check(/mark\.classList\.toggle\('on', now\)/.test(gameBare),
  'ticking repaints the row, not the whole list');
/* A date the band has not reached cannot be one you were at. */
check(/r\.show_date < today\)\.reverse\(\)/.test(gameBare), 'only played shows can be ticked');
/* Typing re-renders the list, so the field has to be handed its caret back or
   every second keystroke lands at the start of the box. */
check(/again\.setSelectionRange\(at, at\)/.test(gameBare), 'the search box keeps its caret');

/* SIX IN THE MORNING, EASTERN, EVERY DAY. */
console.log('the refresh schedule');
check(/cron: '0 10 \* \* \*'/.test(wf) && /cron: '0 11 \* \* \*'/.test(wf),
  'the refresh runs daily on both UTC hours');
/* TWO ENTRIES BECAUSE GITHUB CRON HAS NO DAYLIGHT SAVING. 6am Eastern is 10:00
   UTC from March to November and 11:00 UTC the rest of the year, so a single
   entry would be 5am for half of it. The gate lets exactly one through. */
check(/TZ=America\/New_York date \+%H/.test(wf), 'and only the one that is 6am in New York proceeds');
check(/steps\.when\.outputs\.go == 'yes'/.test(wf), 'every later step is gated on it');
check(/workflow_dispatch/.test(wf) && /github\.event_name.*workflow_dispatch/.test(wf),
  'a manual run is always let through');
check(/git add[\s\S]{0,120}goose_shows\.csv/.test(wf), 'the refresh commits the show table too');
check(/ingest_band\.mjs[\s\S]{0,400}goose_shows/.test(read('scripts/setlist/ingest_band.mjs'))
  || /SHOWS_OUT/.test(read('scripts/setlist/ingest_band.mjs')),
  'and the ingester writes it');
/* AN EMPTY SCHEDULE IS NOT AN ERROR. A band between tours has no announced
   dates, and failing --strict on that would block every setlist refresh until
   they booked something. The collapse that IS an error is the row count. */
check(!/degrade\('no upcoming shows/.test(read('scripts/setlist/ingest_band.mjs')),
  'an empty schedule does not fail the run');
check(/the show table did not shrink/.test(read('scripts/setlist/data_drift.mjs')),
  'but a collapsed show table does');

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
