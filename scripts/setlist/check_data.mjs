/* Segue — guard the things that have actually gone wrong.
 *
 *   node scripts/setlist/check_data.mjs
 *
 * Every assertion here exists because the corresponding mistake was shipped or
 * nearly shipped once. This is not a general validator; it is a regression net.
 * Run by .github/workflows/setlist-checks.yml on any PR touching the game.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  'jamchart_note', 'transition', 'is_segue', 'tags', 'footnote', 'show_notes',
  'teases',
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
/* The role words are one rule EACH now, so `.chip.acc{` no longer exists and
   asserting it would be asserting the old shape. What matters is that every
   family still has a rule of its own: without one a chip silently falls back
   to the base grey and stops meaning anything. The per-role version of this
   check, plus the contrast every one of them has to clear, is in "the
   descriptors are readable" below. */
for (const [sel, what] of [['.chip.seg', 'segue'],
                           ['.chip.sand', 'sandwich'], ['.chip.rare', 'rarity'],
                           ['.chip.rec', 'recommended'], ['.chip.jc', 'jamchart']])
  check(game.includes(sel + '{'), `${what} chips are styled (${sel})`);
check(!/\.chip\.acc\{/.test(game),
  'and the role words are coloured per role rather than from the strip');

// Tie dye is the archive family's alone — it is what makes those two chips
// unmistakable, and it stops meaning anything if it spreads.
// Deduped: the jamchart chip has a second rule for its selected state.
const dyed = [...new Set([...game.matchAll(/\.chip\.([a-z]+)\{[^}]*var\(--dye\)/g)]
  .map(m => m[1]))].sort();
/* THE DYE IS THE ARCHIVE FAMILY'S, and only that family's. It stops meaning
   anything if it spreads to a third chip.
   It was down to RECOMMENDED alone for a while, because at 9.5px with no box
   to put it on a five-colour border round four letters was a smudge. Both of
   those conditions are gone: the pills are back and the type is 11px, so the
   wheel crosses a real border and JAMCHART is unmistakable again. */
check(dyed.join(',') === 'jc,rec', 'the tie dye belongs to the archive family',
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
/* THE ABOUT COPY IS BEHIND A BUTTON, and what used to be one guard is now
   several, because "folded away" was only ever half of what had to stay true.
   Five paragraphs about what a jam band is sat under every screen in the game;
   a <details> got them out of the reader's way, a sheet gets them off the page
   entirely. Either way this is the only page on the site that explains what
   Segue is, and it is indexed, so all of the following have to hold at once. */
const scriptless = game.replace(/<script[\s\S]*?<\/script>/g, '');
check(scriptless.includes('is a free setlist-builder game about jam bands'),
      'the about copy is in the served markup, not injected by the game');
/* A closed sheet is hidden by visibility. display:none would take the prose
   away from a crawler as well as from the reader, which is the whole reason
   this copy is not simply rendered on demand like every other screen. */
check(/\.sheet\{[^}]*visibility:hidden/.test(game),
      'and hidden by visibility, so it is still read');
check(!/\.about\{[^}]*display:none/.test(game) && !/\.about[^{]*\{[^}]*display:none/.test(game),
      'never by display:none');
check(/<footer class="sfoot">\s*<button[^>]*id="aboutBtn"[^>]*>[\s\S]*?<\/footer>/.test(gameBare),
      'the footer is one button');
check(/id="aboutSheet"/.test(gameBare) && /id="aboutClose"/.test(gameBare),
      'that opens a sheet which closes again');
/* The site links went into the sheet with the prose. A footer that quietly
   drops one of these is a policy problem rather than a layout one, so they are
   counted here rather than eyeballed. */
const abLinks = gameBare.match(/<div class="ab-links">([\s\S]*?)<\/div>/);
check(!!abLinks, 'the site links moved into the sheet');
for (const href of ['/', '/about.html', '/privacy.html', '/terms.html',
                    '/disclaimer.html', '/contact.html'])
  check(!!abLinks && new RegExp(`href="${href.replace(/\./g, '\\.')}"`).test(abLinks[1]),
        `  and it still links ${href}`);

/* The HUD's whole job is to make the clock feel like the thing you are
   playing against. It shipped once with the set name and the countdown at the
   same size over a full green bar, which reads as healthy progress. */
check(/\.hc-n\{[^}]*font-size:4\dpx/.test(game), 'the countdown is the biggest thing in the HUD');
/* THE RESPIN BUTTON CARRIES ITS PRICE, BUT NOT AS A CLOCK.
 *
 * It read "Respin · 5:00" once and the price was taken off, for a good reason
 * that still holds: an mm:ss beside a 44px mm:ss countdown is a second clock in
 * a HUD whose whole job is to make the first one the thing you play against.
 *
 * But hiding the price entirely put it in a hover title, which a phone never
 * shows, so the one control on the screen that spends the game's only resource
 * looked free and could only be priced by pressing it. Both of those are real,
 * and minutes settle it: the cost is on the face, and with no colon and no
 * seconds it cannot be misread as the countdown. */
check(/>Respin <b>\$\{Math\.round\(cost \/ 60\)\} min<\/b><\/button>/.test(game),
      'the respin button says what it costs');
check(!/Respin[^<]*\$\{fmtClock\(cost\)\}/.test(game),
      'in minutes, not as a second clock in the HUD');
check(/aria-label="\$\{can/.test(game),
      'and a screen reader gets the whole trade, not just the number');
check(/class="respin-cost"/.test(game), 'the confirm still spells the price out');
/* "Time" named the clock it sat beside rather than what pressing it does, which
   is open the setlist you have built so far. */
check(/id="openSets"[\s\S]{0,160}?>Setlist<\/button>/.test(game),
      'and the button beside it is named after what it opens');
check(!/id="openSets">Time<\/button>/.test(game), 'not after the clock next to it');
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

/* THE BOTTOM TAB BAR. The one thing the request was explicit about is that it
   must never scroll away, so the rule that makes it fixed to the foot of the
   viewport is the load-bearing one and is guarded first. It carries five
   destinations, the songs list among them by name, hides itself during the
   draft (where the game owns the bottom of the screen), and the page leaves
   room so the last row is not stranded behind it. */
console.log('the tab bar');
check(/\.tabbar\{[^}]*position:fixed/.test(game) && /\.tabbar\{[^}]*bottom:0/.test(game),
      'the tab bar is pinned to the foot of the screen, not scrolled with the page');
check((game.match(/data-tab="/g) || []).length === 5, 'it carries five tabs');
check(/data-tab="songs"/.test(game), 'and the songs list is one of them');
for (const dest of ['home', 'tour', 'songs', 'board', 'profile'])
  check(new RegExp(`data-tab="${dest}"`).test(game), `  including ${dest}`);
/* Shown only on the browsing screens: the default is display:none and a body
   class turns it on, so the draft (which is not in that set) never gets it. */
check(/\.tabbar\{[^}]*display:none/.test(game) && /body\.hasTabs \.tabbar\{display:block;?\}/.test(game),
      'it stands down unless the screen is one that wants it');
check(/const TAB_SCREENS = new Set\(\[[^\]]*\]\)/.test(gameBare)
   && !/const TAB_SCREENS = new Set\(\[[^\]]*'draft'[^\]]*\]\)/.test(gameBare),
      'and the draft is not one of those screens');
check(/body\.hasTabs \.wrap\{padding-bottom/.test(game),
      'the page leaves room so nothing hides behind the bar');
/* Static markup outside #app, so render() cannot carry it off; paintTabs keeps
   the lit tab and the bar in step, called from render() so it needs no wiring
   of its own. */
check(/function paintTabs\(\)/.test(gameBare) && /paintTabs\(\);/.test(gameBare),
      'the lit tab is kept in step with the screen');
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

/* THE SCORECARD READS TOP TO BOTTOM AS A STORY, and it did not. It opened with
   the score, then a regret, then four unlabelled numbers, then the setlist,
   then eleven hundred pixels of arithmetic, every block at the same volume:
   3388px at 390 wide, four full screens, over half of it the raw scoresheet.
   The order below is the order somebody asks the questions in, and the working
   is folded away rather than removed. */
{
  /* SCOPED TO renderResult, because three of these class names also appear
     earlier in the file: the draft has its own `card setlist` aside and the
     ceiling card has a second copy in the share renderer. Searching the whole
     file found those instead and reported an order nothing on screen has. */
  const from = game.indexOf('function renderResult()');
  const body = game.slice(from, game.indexOf('function openDetail(', from));
  check(body.length > 500, 'renderResult is findable');
  const order = ['scorebox', 'card ceiling', 'card setlist', 'card gotaway',
                 'card wherefrom'];
  const at = order.map(c => body.indexOf(`<div class="${c}`));
  check(at.every(i => i > -1), 'the scorecard has all five blocks');
  check(at.every((v, i) => i === 0 || v > at[i - 1]),
    'score, then the ceiling, then the show, then the regret, then the maths');
  // The setlist has to come before the regret: you read what you built first.
  check(body.indexOf('<div class="card setlist"') < body.indexOf('<div class="card gotaway"'),
    'and your own setlist outranks the one that got away');

  /* THE REGRET IS A SWAP, and the card has to show both halves of it.
   *
   * It used to print one number, "it was worth 176", beside a setlist whose
   * songs scored 27 to 59, because it took the best song ever offered and
   * judged it in the best of six roles it never had to earn. Measured over 300
   * random games it beat every song the player played in 296 of them: median
   * 166 against a best-played of 93. A card that always says you missed
   * something better than anything you did is not a finding, and the number it
   * printed had no peer anywhere on the page.
   *
   * Both numbers, the song it is measured against, and the clause saying the
   * swap was affordable. Any one of them missing and it is a taunt again. */
  const ga = body.slice(body.indexOf('<div class="card gotaway">'),
                        body.indexOf('<div class="card wherefrom">'));
  check(/S\.missed\.took\.subtotal/.test(ga), 'the card shows what the song you took scored');
  check(/S\.missed\.score\.subtotal/.test(ga), 'and what the one you left scored');
  check(/S\.missed\.instead\.song/.test(ga), 'naming the song it is measured against');
  check(/class="ga-fine"/.test(ga) && /no longer than the one you took/.test(ga),
    'and saying the clock was never what stopped you');
}
/* THE TWO MODULES CARRY A CACHE VERSION, and it has to be covered.
 *
 * index.html revalidates on every visit; scoring.js and dataLoader.js do not, so
 * the page reaches them as `./scoring.js?v=N` after a cached index.html met a
 * fresh scoring.js and served a blank page (#157).
 *
 * check-cachebust.mjs is what holds the version to the file, and until now it
 * only matched `<script src>` tags, so these two imports were invisible to it:
 * it reported "26 versioned scripts ok" while both files changed three times
 * under a frozen v=39. This asserts the import form the checker looks for is
 * the form the page actually uses, because a passing checker that reads
 * nothing is worse than no checker.
 */
console.log('the module cache version');
{
  const cb = read('scripts/check-cachebust.mjs');
  check(/const MOD = /.test(cb), 'the checker looks at module imports as well as script tags');
  check(/for \(const re of \[TAG, MOD\]\)/.test(cb), 'and runs both over every page');
  const mods = [...gameBare.matchAll(/from '\.\/([A-Za-z0-9_.-]+\.js)\?v=(\d+)'/g)];
  check(mods.length >= 2, `the page versions ${mods.length} sibling modules`);
  /* The checker's own regex, run against the page, has to find what the page
     has. Reading MOD out of the checker rather than restating it: a guard that
     writes its own copy of the pattern proves only that the copy works. */
  const src = (cb.match(/const MOD = \/(.*)\/gm;/) || [])[1];
  check(!!src, 'the module pattern is readable');
  const seen = src ? [...read('setlist/index.html').matchAll(new RegExp(src, 'gm'))] : [];
  check(seen.length === mods.length,
    `and the checker's own pattern finds all ${mods.length} of them`,
    `found ${seen.length}`);
  const man = JSON.parse(read('scripts/cachebust.json'));
  const page = man['setlist/index.html'] || {};
  for (const [, name] of mods)
    check(!!page[name], `  ${name} is recorded in the manifest`);
}

/* THE SWAP IS BUILT FROM THE PICKS, not from everything ever shown. Passing the
   flat seen list still runs and still returns a song, so this is asserted at the
   call site rather than left to the shape of the data. */
check(/theOneThatGotAway\(S\.drafted, S\.sets\)/.test(gameBare),
  'the regret is worked out from the rounds you actually played');
{
  const sc = read('setlist/scoring.js');
  const fn = sc.slice(sc.indexOf('export function theOneThatGotAway('),
                      sc.indexOf('// ── scoring a whole show'));
  check(fn.length > 200, 'theOneThatGotAway is findable');
  /* SAME ROLE for both halves, or the two numbers are not comparable and the
     card is back to grading one song on a curve the other never got. */
  check(/const role = roleAt\(si, idx, \(sets\[si\] \|\| \[\]\)\.length\);/.test(fn),
    'the slot the pick really filled decides the role');
  check(/const took = scorePerf\(d\.perf, role\);/.test(fn)
    && /const sc = scorePerf\(alt, role\);/.test(fn),
    'and both songs are scored in it');
  check(/const idx = at\[si\]\+\+;/.test(fn), 'the slot advances with the picks');
  /* AFFORDABLE, or the regret was never on offer. */
  check(/if \(!al \|\| al > len\) continue;/.test(fn),
    'an alternative longer than the song taken is not a missed chance');
  /* And the cap lets anything SHORT through, which surfaced a 1:23 snippet as
     the night's regret in 13% of measured games. This file already has a word
     for those and does not count them as songs anywhere else. */
  check(/if \(al < TEASE_SECONDS\) continue;/.test(fn),
    'nor is a take the game itself calls a tease');
  /* AND IT HAS TO BE ABLE TO FIND NOTHING. The old card fired every game. */
  check(/if \(gap <= 0\) continue;/.test(fn), 'only a better song is a regret');
  check(!/roleAt\(1, 2, 4\)/.test(fn),
    'no hypothetical best-of-six role is tried on the song you did not play');
}
/* FOLDED, NOT DELETED. A <details> so the full working is one tap away, and a
   summary that says what is inside rather than "details". */
check(/<details class="card scoresheet">/.test(game), 'the full maths is folded away');
check(/class="ss-open"/.test(game) && /See how every point was scored/.test(game),
  'behind a summary that says what it opens');
check(/\.scoresheet\[open\] \.ss-open:after\{content:'Hide';?\}/.test(game),
  'and the affordance says which way it goes');
/* The four category numbers had no title and a one-word label each, so nothing
   said they were a breakdown of the score at all. */
check(/Where the \$\{r\.total\} came from/.test(game),
  'the four numbers say what they are a breakdown of');
/* ALL FOUR, not "at least one". The first version of this passed with three of
   the four captions deleted, which is exactly the state it exists to catch. */
check((game.match(/class="bw"/g) || []).length === 4,
  'and all four say what they reward');

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

/* AN OPEN SEGUE IS A PRICE, NOT A LOCKED DOOR. closeSet used to refuse
   outright: if the last song segued and anything on screen could land it, the
   set would not close, and a player who wanted none of the songs on offer had
   no way out but a respin they had to pay for. A segue scores only when the
   next song in the SAME set completes it, so closing there already forfeits it.
   That is the cost, and it is the player's to accept. */
{
  const fn = gameBare.slice(gameBare.indexOf('function closeSet()'),
                            gameBare.indexOf('function closeSet()') + 1400);
  check(fn.length > 100, 'closeSet is findable');
  check(/S\.closeConfirm/.test(fn), 'an open segue asks before it closes the set');
  check(/S\.closed\[si\] = true;/.test(fn), 'and closing it is reachable');
  /* The old guard returned WITHOUT ever setting closed[si]. The confirm branch
     still returns early, so what makes this a price rather than a lock is that
     the second tap gets past it: the confirm is stored, and the same key
     satisfies the test next time. */
  check(/S\.closeConfirm = closeKey\(si\)/.test(fn) && /S\.closeConfirm !== closeKey\(si\)/.test(fn),
    'the second tap is the one that goes through');
  check(!/Play what it runs into before closing/.test(gameBare),
    'and the refusal it replaced is gone');
}
/* The confirm is consent to close THIS set with THIS song dangling, so playing
   another song has to void it. The key carries the length so that happens by
   construction rather than by remembering to clear it at every site. */
check(/function closeKey\(si\)\{ return `\$\{si\}:\$\{\(S\.sets\[si\] \|\| \[\]\)\.length\}`; \}/.test(gameBare),
  'the confirm is voided by playing another song');
/* BOTH close buttons, not either: there is one in the pick panel and one at the
   foot of the song list, and a player who scrolled to the list would otherwise
   get an unarmed button that closes on the first tap. An `||` here passed with
   one of the two reverted. */
check((gameBare.match(/closeArmed \? 'forfeit'/g) || []).length === 2,
  'both close buttons show the armed state');
check((gameBare.match(/Close anyway, lose the segue/g) || []).length === 2,
  'and both say what it gives up');
/* The banner used to offer a paid respin as the only alternative to playing
   on, which was true while the close was blocked and is not true now. */
check(/close the set\s*\n?\s*and give it up/.test(gameBare),
  'the hunt banner offers closing as a way out');

/* TIME CARRIES ONE SET FORWARD, and three separate bits of copy promise it to
   the player. They used to say "for the encore", which was true when both sets
   paid straight into it and is a lie now that Set I's leftovers are Set II's.
   budgets() is tested in verify-scoring; this is the promise agreeing with it.
   Named once so the three cannot drift apart. */
console.log('banked time');
check(/function bankGoesTo\(si\)\{ return SETS\[si \+ 1\] \? SETS\[si \+ 1\]\.label : null; \}/.test(gameBare),
  'where unused time goes is answered in one place');
check(!/for the encore/.test(gameBare), 'no copy still promises it to the encore');
check((gameBare.match(/bankGoesTo\(si\)/g) || []).length >= 3,
  'and every promise reads it rather than naming a set');
{
  const sc = read('setlist/scoring.js');
  const fn = sc.slice(sc.indexOf('export function budgets('),
                      sc.indexOf('export function remaining('));
  check(/let carry = 0;/.test(fn) && /carry = Math\.max\(0, out\[i\] - used\)/.test(fn),
    'budgets carries leftovers forward one set at a time');
  check(/out\[i\] \+= carry;/.test(fn), 'and each set spends what it inherited');
  check(!/out\[ENCORE_INDEX\] \+= spare;/.test(fn),
    'rather than dumping every set into the encore');
  /* An open set has banked nothing yet, so the chain has to stop dead there:
     without it an untouched night reports an encore budget of 2h35m. */
  check(/if \(closed && !closed\[i\]\) break;/.test(fn),
    'an open set stops the chain rather than being skipped over');
}

/* AND THE COPY DOES NOT SELL IT AS A PRIZE.
 *
 * The close button read "Banks 12:34 for Set II" and the rules read "you decide
 * when a set ends". Measured over 400 identical show sequences played greedily,
 * closing a set early cost points at every threshold tried and cost more the
 * earlier it happened: Set I -8 at four minutes out to -19 at twenty-five, Set
 * II -5 out to -29. 100% of sets ended on the clock, none on the eight song
 * cap. The cascade is not broken; there is simply nothing banking buys, since
 * the time score pays on budget used and the carried minutes inflate the next
 * set's budget as well.
 *
 * So no player-facing string may present unspent time as a gain on its own.
 * "carries" is a fact about where it goes; "banks" is a promise about what it
 * is worth, and the game cannot keep it. */
{
  const say = gameBare.replace(/\s+/g, ' ');
  check(!/\bBanks? \$\{fmtClock/.test(say) && !/\bBank \$\{fmtClock/.test(say),
    'no button offers to bank the clock');
  check(!/you decide when (a|the) set ends/i.test(say),
    'and the rules do not promise a decision the scoring punishes');
  /* The cost has to be said where the choice is made, or leaving it out is the
     same omission in the other direction. */
  check(/a short set scores less/.test(say),
    'the close button states what a short set costs');
  check(/the crowd notices a short set/.test(say),
    'and so does the hint beside it');
  /* WHERE it goes is still true and still said: the cascade is real. */
  check(/carries to \$\{esc\(bankGoesTo\(si\)\)\}/.test(gameBare),
    'while still saying where the time actually goes');
}

/* THE SHARE IS THE SETLIST. Under it sat three more lines: a stat line, the
   breadth tags, and the headline in quotes. The stat line's own clock was the
   worst of it, since fmtClock is mm:ss and a two and a half hour show read as
   "144:37". A score and where it came from is the whole job. */
{
  const fn = gameBare.slice(gameBare.indexOf('function shareText()'),
                            gameBare.indexOf('function renderLoading('));
  check(fn.length > 100, 'shareText is findable');
  check(/lines\.push\(`\$\{r\.total\} points`\);/.test(fn), 'the share says the score');
  check(/runthe\.gg\/setlist/.test(fn), 'and where it came from');
  check(!/r\.headline/.test(fn), 'and not the headline');
  check(!/r\.breadth/.test(fn), 'nor the breadth tags');
  check(!/fmtClock\(r\.totalUsed\)/.test(fn), 'nor a two-hour show as mm:ss');
  // The setlist itself, arrows and all, is the part that stays.
  check(/lines\.push\(p\.song \+ mark\)/.test(fn), 'the setlist itself is untouched');
}

/* SUITES: the songs that are movements of one piece.
 *
 * Jive I > Jive II > Jive Lee, Seekers on the Ridge pt I > pt II. The scoring
 * had these exactly backwards: familiarityMult discounts a pair by how often
 * the band plays it, and Seekers pt I > pt II is the MOST PLAYED PAIR IN THE
 * ARCHIVE at 57 times, so it sat on the 0.30 floor and scored 18 of a possible
 * 60. The most canonical link in the catalogue paid the least of any link.
 */
console.log('suites');
{
  const { suites, shows } = loadBand(read('setlist/data/goose.csv'));
  const title = new Map();
  for (const sh of shows) for (const p of sh.songs) title.set(p.song_id, p.song);
  const fams = new Map();
  for (const [id, key] of suites) {
    if (!fams.has(key)) fams.set(key, []);
    fams.get(key).push(title.get(id));
  }
  check(fams.size === 3, `three families in this catalogue (${fams.size})`);
  for (const [key, want] of [
    ['jive', ['Jive I', 'Jive II', 'Jive Lee']],
    ['seekers on the ridge', ['Seekers on the Ridge pt I', 'Seekers on the Ridge pt II']],
    ['interlude', ['Interlude I', 'Interlude II', 'Interlude III']],
  ]) {
    const got = (fams.get(key) || []).slice().sort();
    check(JSON.stringify(got) === JSON.stringify(want.slice().sort()),
      `  ${key}: ${want.join(', ')}`, `got ${got.join(', ') || 'nothing'}`);
  }
  /* JIVE LEE HAS NO NUMERAL and belongs anyway, which is the whole reason the
     stem rule exists alongside the part rule. */
  check((fams.get('jive') || []).includes('Jive Lee'),
    'a sibling with no numeral of its own still joins its family');
  /* THE SEPARATOR IN THE PART RULE, asserted on the rule and not on its output,
     because the output cannot currently fail. Without the separator "Yeti"
     parses as "Yet" + roman numeral I and "2021" as "202" + 1 -- but both are
     the only claimant of their stem, and a family needs two members, so the
     size filter rejects them anyway and every title check still passes. The
     separator is what stops that becoming a real family the day a song called
     "Yet Another" or "202 Reasons" is played, and this is the only place that
     can say so. */
  const loader = read('setlist/dataLoader.js');
  check(/const PART = \/\^\(\.\{3,\}\?\)\[\\s,:\]\+/.test(loader),
    'a part marker must be separated from its stem, so "Yeti" is not "Yet I"');
  // Belt and braces: today's catalogue really does keep them out.
  for (const t of ['Yeti', '2021', 'Weird Fishes / Arpeggi']) {
    const id = [...title].find(([, v]) => v === t);
    if (!id) continue;
    check(!suites.has(id[0]), `  and "${t}" is in no family`);
  }
}
/* The scoring side: exempt from both brakes, and paid a bonus. verify-scoring
   owns the arithmetic; this owns the wiring, which is what a UI change breaks. */
check(/const fam = suite \? 1 : familiarityMult\(times\)/.test(read('setlist/scoring.js')),
  'a suite link is not discounted for being canonical');
check(/scoreShow\(S\.sets, S\.data\.segues, S\.spent, S\.data\.segueCounts, S\.data\.suites\)/.test(gameBare),
  'the game passes its suites to the scorer');
/* THE CEILING HAS TO KNOW TOO. Without it a player who lands a suite is
   measured against a best line scored as if suites paid nothing, and can beat
   100% of a target that is supposed to be unreachable. */
check(/bestPossible\(S\.drafted, S\.data\.segues, S\.data\.segueCounts, S\.spent, S\.data\.suites\)/.test(gameBare),
  'and to the ceiling, or a suite could beat an unbeatable target');
check(/COMPLETES THE SUITE/.test(gameBare), 'the draft names a suite when one is on offer');
check(/Two movements of one piece/.test(gameBare), 'and the scoresheet explains what it paid for');

/* CHANGING YOUR NAME, and being able to find where. Reported as "I don't see
   where to adjust my user name": the only route in was tapping your own name in
   the top bar, which reads as a status chip rather than a control, and the
   profile screen (the one TITLED with that name) said nothing about it. */
console.log('your name');
check(/id="editName"/.test(gameBare), 'the profile offers a way to change your name');
check(/getElementById\('editName'\)\.addEventListener\('click', \(\) => openAuth\('me'\)\)/.test(gameBare),
  'and it opens the account panel');
/* AND WHEN THE COLUMN IS NOT THERE, IT SAYS SO. The panel used to render
   nothing at all when profiles.segue_name was unreadable, so somebody who had
   run the migration and come looking found an account sheet with no field and
   no explanation. 68_setlist_username.sql promises it "reports itself
   unavailable"; that promise is the guard. */
check(/class="namebox off"/.test(gameBare),
  'and says so when the project cannot store one');
check(/68_setlist_username\.sql/.test(gameBare), 'naming the migration it needs');
check(/schema cache/.test(gameBare),
  'and the usual cause when the migration HAS been run');
/* The title is a 42px display face holding a name somebody else chose. Without
   this it shoved the button off the right edge: 8px for "sellybros711" and
   252px for a 20-character name, at 390 wide. */
check(/\.namehd h2\{[^}]*min-width:0/.test(game),
  'a long name wraps rather than pushing the button off screen');

/* THE CURATORS' OWN WORDS, which the game had been throwing away.
 *
 * elgoose keeps a `footnote` on a PERFORMANCE ("Unfinished.", "80s synth
 * version.", "With Carol Of The Bells teases from Rick.") and `shownotes` on a
 * SHOW ("This was Aaron and Kris' first show as members of Goose."). Nothing
 * else the game shows about a version is anything but arithmetic over lengths
 * and counts, so this is the only prose in the data.
 */
console.log('the archive notes');
{
  const rows = parseCSV(read('setlist/data/goose.csv'));
  const withFoot = rows.filter(r => r.footnote).length;
  check(withFoot > 1500, `performances carry a footnote (${withFoot})`);
  /* WRITTEN ONCE PER SHOW, NOT ON EVERY ROW. Denormalising it the way
     crowd_rating is denormalised adds 436KB raw to a 1.2MB file for one string
     repeated eleven times, and the archive is parsed on every draft. This is
     the guard that keeps a well-meaning "fill in the blanks" from costing a
     third of the parse. */
  const noted = rows.filter(r => r.show_notes);
  const shows = new Set(noted.map(r => r.show_id));
  check(noted.length === shows.size,
    'the show note is written once per show, not onto every row',
    `${noted.length} rows carry one across ${shows.size} shows`);
  check(shows.size > 250, `shows carry a note (${shows.size})`);
  // And the note has to survive the trip through the loader.
  const { shows: loaded } = loadBand(read('setlist/data/goose.csv'));
  const hoisted = loaded.filter(s => s.notes).length;
  check(hoisted === shows.size,
    'and the loader hoists every one of them onto its show',
    `${hoisted} of ${shows.size}`);
  /* NOT THE SITE'S OWN NAVIGATION. One row arrived with
     "Next Show: 2021-06-07 ... Livingston, MT ... Pine Creek Lodge" in the
     shownotes field, double-encoded bullets and all. One row today, but a CLASS
     of value rather than a typo, and this text is printed to players now. */
  check(!rows.some(r => /^(next|previous|prev)\s+show\s*:/i.test(r.show_notes)),
    'no show note is really the site\'s next-show navigation');
  /* One line each. 610 raw values arrive with newlines in them; the CSV would
     survive that and a reviewer reading the diff would not. */
  check(!rows.some(r => /[\n\r]/.test(r.footnote) || /[\n\r]/.test(r.show_notes)),
    'notes are stored as one line');
}
/* WHAT A FIRST-TIME PLAYER ACTUALLY HIT, reported by one in her own words and
 * confirmed by a second person sitting next to her. Four separate defects, and
 * none of them is about the rules being wrong: they are about the game never
 * saying what it just did.
 */
console.log('the first five minutes');
/* ONE VERB FOR ONE ACTION. The panel header said "Add to Set I" and the button
   under it said "Play it": "Add to set 1 makes sense bc that's what I thought I
   was doing, building a setlist. But then Play it confused me bc I thought I
   was adding it." */
check(/Add to \$\{esc\(cfg\.label\)\} \(\$\{fmtClock\(lenOf\(S\.pickedSong\)\)\}\)/.test(gameBare),
  'the confirm button and the panel above it use the same verb');
check(!/`Play it \(/.test(gameBare), 'and "Play it" is gone');
/* THE RECEIPT. Confirming a song used to drop you straight into a full-screen
   slot machine labelled "Spinning the archive" with nothing about the song just
   added, and two people read it as the game restarting: "it spun the wheel
   again and I didn't think I was resetting anything, I thought I was adding". */
check(/class="added"/.test(gameBare), 'the next show is preceded by what you just added');
check(/Added to \$\{esc\(SETS\[just\.si\]\.label\)\}/.test(gameBare),
  'naming the set it went into');
check(/song\$\{inSet === 1 \? '' : 's'\} in/.test(gameBare),
  'and how many are in that set now');
check(/Drawing your next show/.test(gameBare),
  'and the reels say they are drawing the NEXT one, not spinning from scratch');
/* A METER, NOT TABS: "At first I thought set 1 and two were tab buttons." */
check(/\.nightstrip\{[^}]*pointer-events:none/.test(game),
  'the set meter cannot be pressed');
check(/\.ns-seg\{[^}]*height:7px/.test(game), 'and is a bar rather than a row of boxes');
check(/\.ns-seg i\{[^}]*position:absolute/.test(game),
  'with its labels under the track rather than centred inside like button text');
/* Clipping the track clips those labels, which is how they vanished once. */
check(!/\.nightstrip\{[^}]*overflow:hidden/.test(game),
  'and the track does not clip them away');
/* THE HELP WHERE IT WAS ASKED FOR: "I think this screen is where you need the
   prompt for help." The draft screen had none. */
check(/class="firsthint"/.test(gameBare), 'the draft screen says what to do with the list');
check(/!S\.sets\.flat\(\)\.length \? `<div class="firsthint">/.test(gameBare),
  'only until the first song lands');
/* AND NOT A WALL ON THE BUTTON ITSELF: "too much wording there that no one will
   read and they will be tempted to just click". */
{
  const i = gameBare.indexOf("hd: 'Press this one first'");
  const step = gameBare.slice(i, gameBare.indexOf('extra:', i));
  check(i > -1 && (step.match(/<p>/g) || []).length === 1,
    'the start step is one paragraph, not three');
}

/* PLAYED COLD, START TO SCORECARD, WITH NOTHING IN LOCALSTORAGE. Six things a
 * first-time player was never told, each one measured on the rendered page
 * rather than argued about.
 */
console.log('arriving knowing nothing');

/* Both helpers are declared here rather than reached for: the walkthrough
   section further down has its own copies, and a shared one at module scope
   would be read by this block before its own initialiser ran. */
const cdSlice = (from, to) => {
  const i = gameBare.indexOf(from);
  return i < 0 ? '' : gameBare.slice(i, gameBare.indexOf(to, i + from.length));
};
const homePage = cdSlice('function renderHome(){', '\n}');
check(!!homePage, 'renderHome can be read');

/* 1. THE RULES WERE BELOW THE PLAY BUTTON. "How it works" is the clearest
      explanation on the site and it sat 420px under the thing it explains, so
      the walkthrough existed to carry it up. It is above the band panel now,
      and the order is asserted because it is one edit away from drifting back:
      both blocks live in the same template literal. */
{
  const how = homePage.indexOf('<section class="how">');
  const bands = homePage.indexOf('<div class="bands">');
  check(how > -1 && bands > -1, 'the home screen has rules and a band panel');
  check(how < bands, 'and the rules come before the button that needs them');
  /* Exactly one copy of it. It was moved rather than duplicated, and a second
     "How it works" further down is the obvious bad merge. */
  check((homePage.match(/<section class="how">/g) || []).length === 1,
    'stated once, not twice');
}
/* AND THE HERO STATES THE LOOP. "Choose a band. Build the show you've always
   dreamed of." is a tagline: it says nothing about what a turn is. The three
   facts a player needs before the first press are one show at a time, one song
   off each, and that the song costs its running time. */
{
  const hero = homePage.slice(homePage.indexOf('<div class="hero">'),
    homePage.indexOf('</div>', homePage.indexOf('<p>', homePage.indexOf('<div class="hero">'))));
  /* \s+ between the words rather than a literal space: the source wraps these
     sentences at 80 columns, so where a phrase breaks across two lines is an
     accident of formatting and a guard that depends on it fails on a reflow. */
  check(/one\s+real\s+concert\s+at\s+a\s+time/i.test(hero),
    'the hero says one show at a time');
  check(/a\s+song\s+off\s+each/i.test(hero), 'and one song off each');
  check(/running\s+time/i.test(hero), 'and what that song costs');
}

/* 2. THE SAMPLE BAND WAS ON THE LIVE PAGE, one tap under the real one, over the
      words "Made-up data we use for testing". Nothing on the page told a new
      player that is not part of the game. */
check(/const DEV_MODE = /.test(gameBare), 'the sample band needs dev mode');
check(/const test = DEV_MODE \? BANDS\.filter\(b => b\.sample\) : \[\]/.test(gameBare),
  'and the home screen offers it only there');
check(/dev'\) === '1'/.test(gameBare) && /localhost/.test(gameBare),
  'which is localhost or an explicit ?dev=1');

/* 3. TEN UNDEFINED WORDS ON THE DRAFT SCREEN, counted on one rendered list:
      SEGUE, LANDS THE SEGUE, JAMCHART, opener, peak, jam, cover, closer,
      encore and "44 show gap". Every one is a scoring input, so not knowing
      them is not knowing what the game pays for. Each term the draft can print
      has to be defined in the glossary, and the list is derived from the chips
      the renderer can emit rather than typed out here, so a new chip fails
      this until it is explained. */
{
  /* To the next sheet, not to the next `</div>`: the glossary is nested markup
     and the first `</div>` after it is one of its own rows. */
  const key = cdSlice('id="keySheet"', '<div class="sheet"');
  check(!!key && /id="keyBtn"/.test(gameBare), 'the draft screen opens a glossary');
  check(/openKey\(\); return;/.test(gameBare), 'and the button is wired');
  /* AND THE WAY OUT IS BOUND WHERE THE BUTTON ACTUALLY IS. The close button is
     static markup outside #app, so wiring it into the app's own click handler
     leaves the backdrop as the only exit. */
  check(/getElementById\('keySheet'\)\.addEventListener/.test(gameBare),
    'and the sheet closes itself');
  const draft = cdSlice('function renderDraft(){', '\n}');
  /* The leading `${...}` is optional because the sandwich chip opens with its
     own icon constant, and a chip that draws an icon still needs defining. */
  const chipped = [...new Set([...draft.matchAll(
    /<span class="chip [a-z]+">(?:\$\{[A-Z_]+\})?([A-Z][A-Za-z ]*)</g)].map(m => m[1].trim()))];
  check(chipped.length >= 5, `the draft can print ${chipped.length} named chips`);
  const undefinedTerms = chipped.filter(t => !key.includes(t));
  check(!undefinedTerms.length, 'and every one of them is in the glossary',
    undefinedTerms.length ? `missing: ${undefinedTerms.join(', ')}` : '');
  /* The role chips are interpolated (`acc.chip`), so they never appear as
     literals above. They come from accentOf, which is the one list of them. */
  const roles = [...new Set([...gameBare.matchAll(/chip: '([a-z]+)' \}/g)].map(m => m[1]))];
  check(roles.length >= 6, `accentOf can print ${roles.length} role chips`);
  const undefinedRoles = roles.filter(t => !key.includes(`>${t}<`));
  check(!undefinedRoles.length, 'and the glossary defines each role too',
    undefinedRoles.length ? `missing: ${undefinedRoles.join(', ')}` : '');
  /* IN THE COLOUR THE GAME ACTUALLY USES, and by the same rule rather than a
     copy of it. Each of these carried an inline --acc, because a role chip
     used to read its colour off the song row it sits on and a sheet has no
     song row: shipped without one, the whole group drew in the fallback ink
     and the key taught a colour that appears nowhere in the game.
     The colour is on the class now, so key and list cannot drift. What is
     left to check is that the key uses the class at all, and that the class
     really is what carries the colour (asserted per role, with the contrast
     each has to clear, under "the descriptors are readable"). */
  const accents = [...gameBare.matchAll(/return \{ v: 'var\(--[a-zA-Z]+\)',\s+chip: '([a-z]+)' \}/g)]
    .map(m => m[1]);
  check(accents.length >= 6, `accentOf assigns ${accents.length} roles`);
  const uncoloured = accents.filter(a => !key.includes(`class="chip acc ${a}"`));
  check(!uncoloured.length, 'each shown as the chip class that colours it',
    uncoloured.length ? `wrong: ${uncoloured.join(', ')}` : '');
  check(!/class="chip acc [a-z]+" style="--acc:/.test(key),
    'and not by an inline colour the list does not use');
  /* The two marks that are not chips and were explained nowhere at all. */
  check(/class="keyseg"/.test(key), 'the segue mark after a title is explained');
  check(/class="keybar"/.test(key), 'and so is the coloured length bar');
}

/* 4. TWO DIFFERENT "SET I"s ON ONE SCREEN. The list is grouped by the sets of
      the show that was dealt while the clock above says you are filling Set I,
      and nothing distinguished them. */
check(/<span class="sg-w">Their<\/span> \$\{\s*esc\(setLabel\(k\)\)\}/.test(gameBare),
  'the dealt show\'s sets are named as the band\'s');

/* 5. THE SCORE LED WITH A NUMBER THAT MEANS NOTHING ALONE. 1053 at 124px, and
      the game's own answer to "was that good" ("80% of it") in 13px prose in a
      card below. The percentage is now under the score, in the grade colour. */
{
  const box = gameBare.slice(gameBare.indexOf('<div class="scorebox">'),
    gameBare.indexOf('</div>', gameBare.indexOf('band-meta', gameBare.indexOf('<div class="scorebox">'))));
  check(/class="sb-pct"/.test(box), 'the percentage is inside the score box');
  check(/best show those nights had in them/.test(box), 'and says what it is a percentage of');
  check(/grade-\$\{gradeScore\(r\.total\)\}/.test(box), 'coloured by the same grade as the score');
  /* Above the headline, not below it: the quip is flavour and this is the
     answer to the question the player is actually asking. */
  check(box.indexOf('sb-pct') < box.indexOf('class="headline"'),
    'and it reads before the quip');
  /* NOT SAID TWICE. The ceiling card used to carry the same percentage in the
     same sentence, which is what made neither of them land. */
  /* The interpolation is part of the anchor: rankCard reuses `.ceiling` for
     the leaderboard panel and comes first in the file, so `class="card
     ceiling` alone sliced the wrong card and the guard could not fail. */
  const ceil = cdSlice('class="card ceiling${gap <= 0', 'ceil-fine');
  check(!/\$\{pct\}%/.test(ceil), 'the card below does not repeat the figure');
}

/* THE DRIFT GATE HAS TO COUNT LENGTH AS AN INPUT.
 *
 * data_drift lets a derived value move only for a song whose own inputs moved.
 * Tags derive from a song's MEDIAN LENGTH, and elgoose types a setlist up the
 * night of the show but adds track times days or weeks later, so a refresh that
 * backfills times for a tour legitimately moves tags for songs whose play count
 * and jamchart count are both unchanged. Without length in the fingerprint the
 * gate called that unexplained and the scheduled refresh would have gone red on
 * the first honest run after a tour. Reproduced against the five untimed August
 * 2026 shows: one song moved "jam|encore" to "encore" on a length arriving.
 */
{
  const gate = read('scripts/setlist/data_drift.mjs');
  check(/timed: 0, secs: 0/.test(gate), 'the drift gate fingerprints a song\'s timings');
  check(/a\.timed !== b\.timed \|\| a\.secs !== b\.secs/.test(gate),
    'and counts a length arriving as an input that moved');
}

/* TEASES: what the band quoted without playing.
 *
 * A few bars of somebody else's song dropped inside this one. It exists only as
 * footnote prose ("With Axel F teases from Rick"), so the ingester parses it out
 * into its own column and this checks the parse against the prose it came from.
 */
{
  const rows = parseCSV(read('setlist/data/goose.csv'));
  const mentions = rows.filter(r => /\btease[sd]?\b/i.test(r.footnote || ''));
  const parsed = rows.filter(r => r.teases);
  check(mentions.length > 200, `footnotes mention teases (${mentions.length})`);
  /* EVERY MENTION MUST YIELD A SONG. The rule got there in two goes: an
     acronym's own full stop is not a sentence end ("Still D.R.E.", "S.O.S."),
     and "teases from Rick and Stuart Bogie on saxophone" splits on "and" into
     a song and a person. Both were found by looking at what it missed, and a
     silent 99% would have shipped without this. */
  const missed = mentions.filter(r => !r.teases);
  check(!missed.length, 'and every one of them names a song',
    missed.length ? `${missed.length} missed, e.g. "${missed[0].footnote}"` : '');
  check(parsed.length === mentions.length, 'nothing is parsed out of a footnote without one');
  const all = parsed.flatMap(r => r.teases.split('|').filter(Boolean));
  check(all.length > mentions.length,
    `some performances carry more than one (${all.length} teases in ${mentions.length} rows)`);
  // Junk the rule is written to exclude, checked on the output.
  const junk = all.filter(t => /\bon\s+(guitar|sax|saxophone|trumpet|keys|drums|percussion|vocals)$/i.test(t));
  check(!junk.length, 'and a guest musician is not read as a teased song',
    junk.length ? `e.g. "${junk[0]}"` : '');
  check(!all.some(t => /\btease/i.test(t)), 'nor is the word "tease" itself');
  check(!all.some(t => t.length > 60), 'and nothing absurdly long got through');
  /* COMMAS ARE PART OF TITLES, and the first version of the rule split on them:
     "With One In, One Out teases" became two songs and "Mercy, Mercy, Mercy"
     became three. Both are single teases of a single song, and both are in this
     archive, so they are named. */
  for (const t of ['One In, One Out', 'Mercy, Mercy, Mercy'])
    check(all.some(x => x.toLowerCase() === t.toLowerCase()),
      `a title with a comma survives whole: "${t}"`);
  // And an acronym's own full stop is not a sentence end.
  for (const t of ['Still D.R.E.', 'S.O.S.'])
    check(all.some(x => x.toLowerCase() === t.toLowerCase()),
      `  as does an acronym: "${t}"`);
}
/* The profile stat. Counted in teases rather than performances, which is why
   PERF_STATS.teases carries an expand: 254 rows hold 284 of them. */
check(/teases:\s*\{ label: 'Teases you caught'/.test(gameBare),
  'the profile counts teases');
check(/expand: p => String\(p\.teases\)/.test(gameBare),
  'and counts each one, not each performance that has any');
check(/st\.teases \? \[st\.teases, 'teases', 'teases'\]/.test(gameBare),
  'the tile is on the profile and opens its list');
check(/p\._tease \|\| p\.song/.test(gameBare),
  'and the list names the song that was teased');

/* WHERE THEY SHOW UP. Four surfaces, and the draft is the one that was asked
   for: the note on the take you are choosing between. */
check(/function perfNote\(perf\)/.test(gameBare), 'the note is read through one helper');
/* 43% of footnotes are nothing but the cover artist, which the row already
   prints as "orig. X" directly above. Without this the row reads "orig. The
   Clash" and then "The Clash." */
check(/n\.replace\(new RegExp\(`\^\$\{esc\}/.test(gameBare),
  'and it strips a cover attribution the row already shows');
check(/class="fnote"/.test(gameBare), 'the draft row carries the version note');
check(/class="snote/.test(gameBare), 'the show card carries the night note');
check(/class="bdnote"/.test(gameBare), 'the scorecard sheet carries it too');
check(/class="ng-note"/.test(gameBare) && /class="ng-nrow"/.test(gameBare),
  'and your own nights carry both');
/* The night note runs to 851 characters at the long end and the song list is
   what the draft screen is for, so it is clamped and openable rather than
   dumped above the list. */
check(/-webkit-line-clamp:3/.test(game) && /\.snote\.open\{-webkit-line-clamp:unset/.test(game),
  'the night note is clamped on the draft screen and opens on a tap');
check(/S\.showNote = false;/.test(gameBare),
  'and a new show does not inherit the last one being open');

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
/* THE PILLS ARE BACK, and the fill is OPAQUE, which the old ones were not.
   A translucent tint always moves the ground towards the ink: it lightens in a
   dark theme and darkens in a light one, so the text loses contrast either
   way. Measured on the old 20% hue tints, every light-theme chip failed at
   every strength from 36% down to 12%, because no tint of a colour fails to
   drag the ground toward that colour. The pill sits BACK from the page
   instead, a deeper navy in the dark theme and white in the light, and being
   opaque it also measures the same on a song row as inside a sheet. */
check(/\.chip\{[^}]*background:color-mix\(in srgb, var\(--chipHue/.test(game),
  'the base chip is a pill again');
check(/var\(--pillBase\)\)/.test(game), 'filled onto an opaque base');
check(/--pillBase:#0A1A2E/.test(game) && /--pillBase:#FFFFFF/.test(game),
  'which sits back from the page in both themes');
check(/\.chip\{[^}]*padding:2px 7px/.test(game), 'with padding to be a box at all');
check(/\.chip\{[^}]*border-color:color-mix\(in srgb, var\(--chipHue/.test(game),
  'and the hue on a border, which cannot touch the text contrast');
/* Boxes space themselves, so the middot that separated bare words has to go:
   a dot between two pills reads as a third chip. */
check(!/\.chip \+ \.chip:before\{[^}]*content:/.test(game),
  'and no middot between them, because boxes space themselves');
check(/\.chips\{gap:5px;\}/.test(game), 'the gap does the separating instead');
// The rarity, monotony and archive words are colour only. The role words are
// too, but one rule per role rather than one shared rule, so they are checked
// against accentOf's list in the chip-legibility block below.
/* Rarity and monotony are tinted pills like the roles: a hue and an ink. The
   jamchart is the dyed one and is checked with the archive family above. */
for (const k of ['rare', 'mono'])
  check(new RegExp(`\\.chip\\.${k}\\{--chipHue:var\\(--[a-z]+\\); color:var\\(--c[A-Z][a-zA-Z]*\\);\\}`).test(game),
    `the ${k} descriptor declares a hue and an ink`);

/* AND THEY HAVE TO BE READABLE, which is a different claim from having a
 * colour and was not being made at all.
 *
 * A chip is text. It borrowed the accent tokens, which are a 3px STRIP down the
 * side of a row, and a strip has no contrast requirement because nobody reads
 * a bar. Measured against the worst background each theme actually puts a chip
 * on, four of them failed AA in the light theme and one, the opener, failed
 * even the 3:1 large-text floor at 2.93:1.
 *
 * Computed here rather than listed, so a palette change cannot quietly drop one
 * back under the bar. Everything below is derived from the file: the chip ink
 * tokens, their light-theme overrides, and which rule each role points at.
 */
console.log('the descriptors are readable');
{
  const hex = h => { h = h.replace('#',''); return [0,2,4].map(i => parseInt(h.slice(i,i+2),16)); };
  const lin = c => { c/=255; return c<=.03928 ? c/12.92 : Math.pow((c+.055)/1.055,2.4); };
  const lum = h => { const [r,g,b]=hex(h); return .2126*lin(r)+.7152*lin(g)+.0722*lin(b); };
  const ratio = (a,b) => { const x=lum(a),y=lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };

  /* 11px at weight 900 is NORMAL text to WCAG. Large starts at 18.66px bold,
     so the bar is 4.5 and not 3. */
  const size = (game.match(/\.chip\{[^}]*font-size:([\d.]+)px/) || [])[1];
  check(Number(size) >= 11, `the chip is ${size}px, big enough to be read`);
  const track = (game.match(/\.chip\{[^}]*letter-spacing:([\d.]+)px/) || [])[1];
  /* Tracking is a ratio to the size, not an absolute: 1.6px on 9.5px type is
     17% of the em, which spaces a word into loose letters. */
  check(Number(track) / Number(size) <= 0.09,
    `tracking is ${(100 * Number(track) / Number(size)).toFixed(0)}% of the em, not a row of separate letters`);

  /* THE ACCENT PALETTE IS REDEFINED PER THEME, so it has to be read per theme.
     Scraping --*T across the whole file collects the dark block and then the
     light one overwrites it, which had this guard measuring light values
     against the dark ground and reporting nine failures that do not exist. */
  const palette = (block) => {
    const t = {};
    for (const m of block.matchAll(/--([a-zA-Z]+T):\s*(#[0-9A-Fa-f]{6})/g)) t[m[1]] = m[2];
    return t;
  };
  const darkRoot  = (game.match(/:root\{\s*\n\s*--bg:#071426;[\s\S]*?\n  \}/) || [''])[0];
  const lightRoot = (game.match(/:root\[data-theme="light"\]\{\s*\n\s*--bg:[\s\S]*?\n  \}/) || [''])[0];
  check(!!darkRoot && !!lightRoot, 'both theme palettes are readable');
  const tokDark = palette(darkRoot);
  const tokLight = { ...tokDark, ...palette(lightRoot) };

  /* The ink names, and which accent each one defaults to. */
  const baseBlock = (game.match(/:root\{ --cGreen:[\s\S]*?\}/) || [''])[0];
  const defaults = {};
  for (const m of baseBlock.matchAll(/--(c[A-Z][a-zA-Z]*):var\(--([a-zA-Z]+)\)/g))
    defaults[m[1]] = m[2];
  const lightBlock = (game.match(/:root\[data-theme="light"\]\{ --cGreen:[\s\S]*?\}/) || [''])[0];
  const inkBase = {}, inkLight = {};
  for (const [name, acc] of Object.entries(defaults)) {
    inkBase[name] = tokDark[acc];
    inkLight[name] = tokLight[acc];
  }
  for (const m of lightBlock.matchAll(/--(c[A-Z][a-zA-Z]*):(#[0-9A-Fa-f]{6})/g))
    inkLight[m[1]] = m[2];
  check(Object.keys(inkBase).length >= 8, `${Object.keys(inkBase).length} chip inks are defined`);

  /* THE MEDIA-QUERY COPY HAS TO MATCH THE ATTRIBUTE COPY. The theme is set
     three ways (system, [data-theme=light], [data-theme=dark]) and a value
     redefined in only one of them makes the toggle disagree with the OS. */
  const mq = (game.match(/:root:not\(\[data-theme="dark"\]\)\{ --cGreen:[\s\S]*?\}/) || [''])[0];
  const pairs = s => [...s.matchAll(/--(c[A-Z][a-zA-Z]*):(#[0-9A-Fa-f]{6})/g)]
    .map(m => `${m[1]}=${m[2]}`).sort().join(' ');
  check(!!mq && pairs(mq) === pairs(lightBlock),
    'the light theme reads the same by system setting and by toggle');

  /* WHICH INK EACH CHIP DRAWS IN AND WHAT IT DRAWS ON, both read off the
     rules. The pill is what makes this interesting: the ground is no longer
     the page, it is the chip's own fill, and a fill of the ink's own hue is
     exactly the thing that eats contrast. */
  const rules = {};
  for (const m of game.matchAll(
    /\.chip(?:\.acc)?\.([a-z]+)\s*\{--chipHue:var\(--([a-zA-Z]+)\);\s*color:var\(--(c[A-Z][a-zA-Z]*)\);/g))
    rules[m[1]] = { hue: m[2], ink: m[3] };
  const roleNames = roles.map(r => r.chip).filter(c => c && c !== '(none)');
  const unstyled = roleNames.filter(r => !rules[r]);
  check(!unstyled.length, `all ${roleNames.length} roles from accentOf declare a hue and an ink`,
    unstyled.length ? `no rule for ${unstyled.join(', ')}` : '');
  for (const extra of ['rare', 'mono'])
    check(!!rules[extra], `  and so does ${extra}`);

  /* The base hues live in the dark root and are NOT redefined by the light
     theme; only the *T inks are. --pinkT is a *T, so it moves. Resolving per
     theme rather than assuming either way. */
  const hueOf = (name, theme) => (theme === 'light' ? tokLight[name] : tokDark[name])
    || (palette(darkRoot)[name])
    || (darkRoot.match(new RegExp(`--${name}:(#[0-9A-Fa-f]{6})`)) || [])[1];

  const pill = {
    dark: (game.match(/:root\{ --pillBase:(#[0-9A-Fa-f]{6}); \}/) || [])[1],
    light: (game.match(/:root\[data-theme="light"\]\{ --pillBase:(#[0-9A-Fa-f]{6}); \}/) || [])[1],
  };
  check(!!pill.dark && !!pill.light, `pill base: dark ${pill.dark}, light ${pill.light}`);
  /* `[^)]*` stopped at the `)` of the nested var() fallback, so this read NaN
     and the whole contrast sweep below then passed VACUOUSLY: mixing at NaN
     gives an unparseable colour, ratio() gives NaN, and `NaN < 4.5` is false,
     so every failing cell was filtered out as if it had passed. A guard that
     cannot fail is worse than no guard, so the parse is asserted first and
     every composited colour is checked for being a colour at all. */
  const tintPct = Number((game.match(/var\(--chipHue[\s\S]{0,40}?(\d+)%/) || [])[1]);
  check(Number.isFinite(tintPct) && tintPct > 0 && tintPct <= 20,
    `the fill carries ${tintPct}% of the hue`);

  const mix = (fg, pct, bg) => {
    const F = hex(fg), B = hex(bg);
    return '#' + F.map((v, i) => Math.round(v * pct + B[i] * (1 - pct))
      .toString(16).padStart(2, '0')).join('');
  };
  const AA = 4.5;
  for (const [theme, ink, base] of [['dark', inkBase, pill.dark], ['light', inkLight, pill.light]]) {
    const cells = [];
    for (const [chip, r] of Object.entries(rules)) {
      const hue = hueOf(r.hue, theme);
      if (!hue || !ink[r.ink]) continue;
      /* A chip may override the shared tint, and .opens does: a clipped chip
         cannot keep a border, so its fill has to carry the shape. Read the
         override rather than assuming every chip is at the base strength,
         or the sweep measures the wrong ground and passes for the wrong
         reason. */
      const own = (game.match(new RegExp(
        `\\.chip(?:\\.acc)?\\.${chip}\\s*\\{[^}]*background:color-mix\\(in srgb, var\\(--[a-zA-Z]+\\) (\\d+)%`)) || [])[1];
      cells.push({ chip, ink: ink[r.ink], on: mix(hue, (own ? Number(own) : tintPct) / 100, base) });
    }
    /* The dyed one draws --ink on the plain base, and the three solid ones put
       a near-black on a saturated fill. Both are in the sweep, not exempt. */
    cells.push({ chip: 'jamchart', ink: theme === 'dark' ? '#F4F7FB' : '#0D1B2C', on: base });
    for (const [chip, hue, lit] of [['segue', 'green', '#06210F'],
                                    ['sandwich', 'green', '#06210F'],
                                    ['suite', 'violet', '#120A24']])
      cells.push({ chip, ink: lit, on: hueOf(hue, theme) });
    const HEX = /^#[0-9A-Fa-f]{6}$/;
    const unreadable = cells.filter(c => !HEX.test(c.ink) || !HEX.test(c.on));
    check(!unreadable.length, `  every ${theme} cell resolved to a real colour`,
      unreadable.map(c => `${c.chip}: ink ${c.ink} on ${c.on}`).join('; '));
    check(cells.length >= 10, `  ${cells.length} ${theme} chips measured`);
    const bad = cells.map(c => ({ ...c, r: ratio(c.ink, c.on) }))
      .filter(c => !(c.r >= AA)).sort((x, y) => x.r - y.r);
    check(!bad.length, `every chip clears ${AA}:1 against its own fill, ${theme} theme`,
      bad.map(c => `${c.chip} ${c.ink} on ${c.on} is ${c.r.toFixed(2)}`).join('; '));
  }
}
/* THE THREE THAT ARE SOLID, not tinted. They are not descriptions of the song,
   they are a thing the player can do this turn, and they land on a handful of
   rows at most, so they are the ones allowed to shout. Dark ink on a saturated
   fill is also the most legible pairing on the row: the sandwich measures
   8.66:1 against its own green. */
for (const [sel, what] of [['seg', 'landing a segue'], ['sand', 'closing a sandwich'],
                           ['suite', 'completing a suite']])
  check(new RegExp(`\\.chip\\.${sel}\\{[^}]*background:var\\(--(green|violet)\\)`).test(game),
    `${what} gets a solid fill`);
/* AND THE TWO THAT ARE SHAPED LIKE WHAT THEY MEAN. A setlist writes a segue as
   ">", so the chip points at the song it lands on, and a suite link is still a
   segue. The shape is the thing a player recognises before the word. */
for (const sel of ['seg', 'suite', 'opens'])
  check(new RegExp(`\\.chip\\.${sel}\\{[^}]*clip-path:polygon`).test(game),
    `  and .${sel} keeps the arrow a setlist draws`);
/* A CLIPPED CHIP CANNOT KEEP A BORDER. The clip cuts the box and the border
   with it, leaving the right edge as a sliver floating clear of the body: the
   arrow rendered as a pill with a crumb after it. Anything with a clip-path
   has to state border-color:transparent and carry its shape in the fill. */
for (const sel of ['seg', 'suite', 'opens'])
  check(new RegExp(`\\.chip\\.${sel}\\{[^}]*border-color:transparent`).test(game),
    `  .${sel} drops the border its clip would slice`);

/* AND THE SHAPE IS LOAD-BEARING, not decoration. SEGUE and the JAM role are
   both violet and both turn up on the same row: violet is the segue colour
   everywhere else in the game, and every other hue in the palette is spoken
   for, so the arrow is the only thing telling them apart. A role must never
   point at anything or the distinction collapses. */
{
  const hueOfChip = (sel) => (game.match(
    new RegExp(`\\.chip(?:\\.acc)?\\.${sel}\\s*\\{--chipHue:var\\(--([a-zA-Z]+)\\)`)) || [])[1];
  const shared = hueOfChip('opens');
  check(!!shared && shared === hueOfChip('jam'),
    'SEGUE and the JAM role really do share a hue, so this is not a dead guard',
    `opens ${hueOfChip('opens')}, jam ${hueOfChip('jam')}`);
  const pointing = roles.map(r => r.chip).filter(r => r && r !== '(none)').filter(r =>
    new RegExp(`\\.chip\\.acc\\.${r}\\s*\\{[^}]*clip-path`).test(game));
  check(!pointing.length, 'and no role chip points at anything', pointing.join(', '));
}
/* The peak melts, which needs a body to carve out of. The drip vanished with
   the boxes and comes back with them. */
check(/\.chip\.acc\.peak\{[^}]*mask:var\(--melt\)/.test(game),
  'and the peak melts again');

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
   A refresh appends. crowd_rating is derived, and while it was scaled against
   the current leader's tally one new write-up moved every song, so a refresh
   rewrote thousands of rows and the diff could not be the control. The ceiling
   is pinned now and data_drift enforces the rest, so the gates guard a diff a
   person can actually read. */
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

/* A REFRESH APPENDS, and the pinned esteem ceiling is what makes that true.
   Scaling against the current leader's tally meant one song being written up
   moved every other song: 9 of the 99 rated songs shift when the leader alone
   gains an entry. That churn rewrote thousands of rows per refresh, which made
   the diff unreviewable and re-sent the whole 1.2MB archive to every returning
   player every day. */
{
  const ing = read('scripts/setlist/ingest_band.mjs');
  check(/const ESTEEM_FULL = \d+;/.test(ing), 'the esteem ceiling is a pinned constant');
  check(/Math\.min\(n, ESTEEM_FULL\) \/ ESTEEM_FULL/.test(ing),
    'and esteem is scaled against it, clamped rather than rescaled');
  check(!/Math\.max\(1, \.\.\.tally\.values\(\)\)/.test(ing),
    'nothing scales against the current leader any more');
  /* THE PIN MUST STILL COVER THE DATA. Past it every top song shares the
     ceiling, which is honest but compresses the scale, and re-anchoring is a
     deliberate regeneration. Reported rather than failed: the day Goose passes
     it must not be the day the nightly refresh starts failing. */
  const full = Number((ing.match(/const ESTEEM_FULL = (\d+);/) || [])[1]);
  const tally = new Map();
  for (const r of parseCSV(read('setlist/data/goose.csv'))) {
    if (r.is_jamchart !== 'true' || !r.song_id) continue;
    tally.set(r.song_id, (tally.get(r.song_id) || 0) + 1 + (r.is_recommended === 'true' ? 2 : 0));
  }
  const lead = Math.max(0, ...tally.values());
  console.log(`  info  top jamchart tally is ${lead}, ceiling pinned at ${full}` +
    (lead > full ? ' — past it, songs now share the top. Re-anchor when convenient.' : ''));
}
/* And the gate that keeps it honest once pinned. */
check(/every derived change belongs to a song whose own history changed/
  .test(read('scripts/setlist/data_drift.mjs')),
  'a refresh may not move derived values for songs that did not change');
/* AND ITS PATCHES MUST COMPOSE. DATA_CONTRACT is patched twice, once for the
   performance counts and once for the show table's. When each patch computed
   its result from the copy on disk and the writes were replayed at the end,
   the second silently threw away the first: the contract reached main with a
   current show-table line and a stale performance line, and no check caught
   it because the guarded number is the one on the home screen. */
/* THE CACHE BUSTER MUST MATCH THE DATA IT IS BUSTING. This is the guard for a
   bug a player found: DATA_VERSION was hand-maintained and sat at 2 from 5
   August while goose.csv changed on the 14th, 16th and 17th. Four files served
   under one URL, so any cache kept the oldest, and somebody who marked the
   Greek Theatre on the 14th was told they had never heard the song that opened
   it. Their browser held an archive from before that night existed while the
   show table beside it was new enough to know about it. */
{
  const files = ['setlist/data/goose.csv', 'setlist/data/goose_shows.csv',
    'setlist/data/goose_latest.json'];
  const h = createHash('sha1');
  for (const f of files) h.update(read(f));
  const want = h.digest('hex').slice(0, 8);
  const said = (game.match(/const DATA_VERSION = '([0-9a-f]{8})'/) || [])[1];
  check(said === want, 'the cache buster matches the data it serves',
    said ? `page says ${said}, data hashes to ${want} (run sync_counts.mjs)`
         : 'DATA_VERSION is not a content hash');
  // All three files ride the same version, so all three must use it.
  const versioned = [...game.matchAll(/\$\{band\.(csv|shows|latest)\}\?v=\$\{DATA_VERSION\}/g)];
  check(versioned.length === 3,
    `every data file is fetched with the buster (${versioned.length} of 3)`);
}

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
/* AND UNTIL IT LANDS THERE IS NOTHING TO PUT IN THE TILES. Every field in that
   grid except the count is derived from the table, so rendering it early wrote
   "undefined" into five of the six tiles: for the length of the fetch on a good
   connection, and forever on a failed one. */
check(/if \(st\.partial\) return `<div class="fanband">/.test(gameBare),
  'and the panel waits rather than printing undefined into itself');
check(/partial: true/.test(gameBare), 'the half-built state is flagged as such');
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
  ['bigJams', 'the twenty-minute-plus jams'],
  ['bustouts', 'the bustouts you caught'],
  ['perShow', 'how many songs a night you get'],
  ['since', 'how long since your last one'],
  ['gapDays', 'the longest you ever went without'],
  ['onceOnly', 'songs you have heard exactly once'],
  ['encores', 'how many encores you stayed for'],
  ['backToBack', 'nights you did back to back'],
  ['topOpener', 'what keeps opening for you'],
]) check(new RegExp(`\\b${key}\\b`).test(gameBare), `the profile knows ${what}`);
/* An opener is the one slot every show has exactly one of, so "most common" is
   a fair count there and an artefact of set length anywhere else. */
check(/const first = sh\.songs\[0\];/.test(gameBare),
  'the opener count reads the first song of each show');
check(/topOpener\[1\] > 1/.test(gameBare), 'and one occurrence is not a pattern');
// "1 days ago".
check(/st\.since === 1 \? 'yesterday'/.test(gameBare), 'a day is not "1 days"');
/* fmtDate's short form drops the year, so a 636-day wait read "Nov 21 to Aug
   18" and looked like nine months. Years are the part that makes it make
   sense, and the full dates do not fit the column. */
check(/st\.gapFrom\.slice\(0, 4\)/.test(gameBare),
  'and states the years a long wait spanned, not bare month-days');
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

/* THE COLLECTION. "130 of 367 songs heard live" is the profile's headline and
   the next thing anybody who tracks this wants is WHICH ones, and when. That is
   not another statistic, it is the list, and it is the difference between a
   scoreboard and a collection. */
console.log('every song');
check(/if \(S\.screen === 'songs'\)/.test(gameBare), 'the collection is routed');
check(/function songCollection\(bandId\)/.test(gameBare), 'and built from the archive already loaded');
check(/data-go="songs"/.test(gameBare), 'the profile links to it');
/* KEYED ON song_id, NOT THE TITLE. Three titles here are two different songs
   each: Goose's own "All I Need" and an LP Giobbi cover of it, "Revival" by two
   writers, two "Happy Birthday"s. Folding those together credits somebody with
   a song they have never heard because they caught the other one, and makes the
   total disagree with the profile's. */
check(/const byId = new Map\(\);/.test(gameBare) && /byId\.get\(p\.song_id\)/.test(gameBare),
  'keyed on song_id so same-named songs stay separate');
check(/titles\.get\(s\.song\) > 1 && s\.artist/.test(gameBare),
  'and a shared title is qualified by whose song it is');
check(/const open = SONGS\.open === s\.id;/.test(gameBare),
  'opening one row cannot open its namesake');
/* THE DRAFT SCREEN ALREADY OWNS data-song, and this handler runs before its
   in the same listener, so the first version of the collection silently
   swallowed every pick in the game. The regression harness caught it: a
   playthrough that reported "picks 0". */
check(/data-songrow="\$\{esc\(s\.id\)\}"/.test(gameBare),
  'the collection ROW uses its own hook, not the draft\'s');
check(/const songBtn = e\.target\.closest\('\[data-song\]'\)/.test(gameBare),
  'and the draft still picks songs by data-song');
{
  const rows = parseCSV(read('setlist/data/goose.csv'));
  const ids = new Set(rows.map(r => r.song_id).filter(Boolean)).size;
  const titles = new Set(rows.map(r => r.song).filter(Boolean)).size;
  check(ids > titles, `same-named songs exist to be merged (${ids} ids, ${titles} titles)`);
}
/* Filter and sort are separate controls because "never heard, most played" is
   the most useful list on the screen: what you are missing, in the order you
   are most likely to fix it. */
check(/id="sFilter"/.test(gameBare) && /id="sSort"/.test(gameBare),
  'it filters and sorts independently');
check(/plays: \(a, b\) => b\.plays - a\.plays/.test(gameBare),
  'including by how often the band has played it');
check(/again\.setSelectionRange\(at, at\)/.test(gameBare), 'its search keeps its caret');
// Every sighting carries what makes it a memory rather than a row.
for (const f of ['venue', 'len', 'jam'])
  check(new RegExp(`${f}:`).test(gameBare), `a sighting records its ${f}`);

/* LOGGING SHOWS AND THE STATS BUILT FROM THEM IS A SIGNED-IN FEATURE. The point
   of an account here is that your attendance record outlives the browser it was
   made in, so the three personal screens ask for a name first and the mark
   buttons send you to sign in rather than writing a mark nothing would keep. The
   tour schedule and the song catalogue stay open, because neither is yours. */
console.log('attendance needs an account');
check(/function authWall\(/.test(gameBare), 'there is a sign-in wall to show');
for (const [heading, screen] of [
  ['Your shows', 'the profile'],
  ['Track your shows', 'the show browser'],
  ['Your nights', 'the nights list'],
]) check(new RegExp(`if \\(!ME\\.signedIn\\) return authWall\\('${heading}'`).test(gameBare),
      `${screen} is behind the wall when signed out`);
/* Exactly those three, so accidentally walling the open catalogue (a fourth
   authWall) or unwalling a personal screen (a second) both fail here. */
check((gameBare.match(/return authWall\(/g) || []).length === 3,
      'only the three personal screens are walled, not the catalogue');
/* The show-card button writes a mark, so signed out it must reach sign-in
   BEFORE toggleThere, never after. Order is the whole point, so this checks the
   guard comes first rather than merely existing. */
{
  const h = gameBare.slice(gameBare.indexOf("closest('#wereThereBtn')"));
  const gate = h.indexOf('!ME.signedIn');
  const write = h.indexOf('toggleThere');
  check(gate > -1 && write > -1 && gate < write,
    'marking a show asks you to sign in before it writes anything');
}
/* THE CATALOGUE STAYS OPEN. It is the band's song list, not yours, so signed
   out it keeps the songs and the play counts and only drops the "you were
   there" overlay, offering a nudge in its place. */
check(/const ids = ME\.signedIn \? attendedSet\(bandId\) : new Set\(\)/.test(gameBare),
      'signed out, the catalogue shows no attendance overlay');
check(/id="songsIn"/.test(gameBare), 'and nudges you to sign in instead of walling');
/* A wall has to become the real screen the instant an account arrives and go
   back the instant it leaves, so the auth-change handler repaints these. */
check(/function authScreen\(\)/.test(gameBare)
   && /\['home', 'profile', 'browse', 'nights', 'songs'\]\.includes\(S\.screen\)/.test(gameBare),
      'signing in or out repaints the screens that turn on it');

/* EVERY NUMBER ON THE PROFILE IS AUDITABLE. A tile saying "65 segues" is a
   claim, and until you can see the 65 it is one you have to take on trust. */
console.log('what is behind a number');
check(/const PERF_STATS = \{/.test(gameBare) && /const SHOW_STATS = \{/.test(gameBare),
  'each stat is defined in one place');
/* THE DEFINITION IS USED TWICE, to count it and to list it, and that is the
   whole reason the table exists. Two copies of "is this a segue" WILL drift,
   and a tile saying 65 that opens a list of 63 is worse than no list at all. */
check(/function statCount\(perf, key\)/.test(gameBare), 'the count comes from that definition');
check(/const segues = statCount\(perf, 'segues'\)/.test(gameBare),
  'and the profile counts through it rather than inline');
check(!/if \(String\(p\.is_segue\) === 'true'\) segues\+\+/.test(gameBare),
  'the old inline copies are gone');
/* SLICED PER FUNCTION, because both now open with the same line. This used to
   distinguish them by `let` versus `const`, which stopped telling them apart
   the moment statCount needed to reassign. A pattern that matches either one
   is satisfied by the counter alone, which is exactly the drift being guarded. */
{
  const fnBody = (name, end) => {
    const i = gameBare.indexOf(`function ${name}(`);
    return i < 0 ? '' : gameBare.slice(i, gameBare.indexOf(end, i));
  };
  const counter = fnBody('statCount', '\n}');
  const lister = fnBody('openStat', 'SHOW_STATS[key]');
  check(/perf\.filter\(def\.pick\)/.test(lister), 'the list filters through the same definition');
  check(/perf\.filter\(def\.pick\)/.test(counter), 'and so does the count');
  /* ONE PERFORMANCE CAN BE SEVERAL OF THE THING COUNTED. A tease footnote can
     name two songs, so 254 performances carry 284 teases. Both sites have to
     expand or the tile says 284 and opens a list of 254, which is the precise
     failure the count-equals-list contract exists to prevent. */
  check(/def\.expand/.test(counter), 'the count expands a row that holds several');
  check(/def\.expand/.test(lister), 'and the list expands it the same way');
}
check(/id="statSheet"/.test(gameBare) && /function openStat\(key\)/.test(gameBare),
  'tapping a number opens what is behind it');
check(/data-stat="\$\{esc\(stat\)\}"/.test(gameBare), 'the tiles carry the key they were counted with');
/* Counted as DISTINCT SONGS, so the list must show songs. "34 covers" means 34
   different ones, not 34 performances. */
check(/unique: true/.test(gameBare) && /new Set\(hits\.map\(p => p\.song_id \|\| p\.song\)\)/.test(gameBare),
  'covers count distinct songs, and the list matches');
/* An average is not a list of anything. */
check(/st\.perShow \? \[st\.perShow\.toFixed\(1\), 'songs a night'\] : null/.test(gameBare),
  'an average does not pretend to open a list');
check(/\.ftile\.tap\{/.test(gameBare) && /\.pstat\.tap\{/.test(gameBare),
  'and a tappable number looks tappable');

/* YOUR NIGHTS, the other half of the collection. "Every song" answers what you
   have heard; this answers what you were AT, and gives each night its setlist
   back. Until now the game could count your shows without ever showing you
   one. */
console.log('your nights');
check(/if \(S\.screen === 'nights'\)/.test(gameBare), 'your nights is routed');
check(/function myNights\(bandId\)/.test(gameBare), 'and built from the marked shows');
check(/data-go="nights"/.test(gameBare), 'the profile links to it');
/* A night with no setlist STILL GETS A ROW. It is a show you went to, and one
   in five played shows has never been typed up. */
check(/hasSet: !!sh/.test(gameBare), 'a night with no setlist is still a night');
check(/Nobody has typed this one up on elgoose yet/.test(gameBare), 'and says why it is bare');
// Multi-night runs are how anybody who was there describes a show.
check(/night \$\{n\.run\.night\} of \$\{n\.run\.of\}/.test(gameBare),
  'a night in a run says which night it was');
/* The facts line renders NOTHING rather than an empty rule. A show typed up
   overnight has no times and no jamchart entries yet, so all three parts of it
   can be blank, and the div was drawing its border under nothing. */
check(/return facts\.length \? `<div class="ng-facts">/.test(gameBare),
  'the night summary is omitted when it would be empty');

/* EVERY LIST ROW NEEDS ITS OWN HOOK. The collection shipped using data-song,
   which the DRAFT screen already owned, and swallowed every pick in the game.
   These three must stay distinct from each other and from the draft's. */
{
  const hooks = ['data-song', 'data-songrow', 'data-nightrow', 'data-mark', 'data-peek'];
  const readers = hooks.filter(h => new RegExp(`closest\\('\\[${h}\\]'\\)`).test(gameBare));
  check(readers.length === hooks.length,
    `every list hook has its own handler (${readers.length} of ${hooks.length})`);
  check(new Set(hooks).size === hooks.length, 'and none of them collide by name');
  check(/data-nightrow="\$\{esc\(n\.id\)\}"/.test(gameBare),
    'the night row uses its own hook, not the draft\'s');
}

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

/* THE WALKTHROUGH. It used to carry the rules, because on a 390x844 screen the
   "Draft a setlist" button sat at 414px and the first rule at 809px, so a
   first-time player met the button 400px before they met a word of
   explanation. That was a layout problem being papered over with a modal, and
   the layout is fixed: the rules are above the band panel now and the loop is
   in the hero. What is left is two steps and a pointer at the tab bar. */
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
const guideSrc = (() => {
  const at = gameBare.indexOf('const GUIDE_STEPS = [');
  return at < 0 ? '' : gameBare.slice(at, gameBare.indexOf('\n];', at));
})();
check(!!guideSrc, 'GUIDE_STEPS can be read');
check(guideSrc.includes(`aim: () => document.querySelector('.band:not(.soon) [data-start]')`),
  'a step aims at the play button');
check(guideSrc.includes(`aim: () => document.getElementById('tabbar')`),
  'and a step aims at the tab bar');

/* IT STAYS SHORT. Seven steps is not a how-to-play, it is a product tour, and
   five of those seven walked past screens that are now permanent tabs. The
   count is asserted rather than trusted because the failure mode is additive:
   every new screen wants a step, and nobody ever removes one. */
const stepCount = (guideSrc.match(/^  \{$/gm) || []).length;
check(stepCount > 0 && stepCount <= 3,
  `the walkthrough is ${stepCount} steps before the first press`);

/* AND EVERY SCREEN THE HOME PAGE LINKS TO IS ON THE TAB BAR, which is the
   guard that matters and the one direction that actually failed before: the
   walkthrough shipped covering Leaderboard and Your shows, two commits later
   On tour and Every show were added to the same row, and nothing said a word
   about them. The step that covers them is now one step naming a bar, so the
   thing to assert is that the bar really does reach all of them.
   Reading renderHome rather than the whole file on purpose: `data-go="browse"`
   also appears on the tour screen, and that one is a cross-link. */
const homeSrc = (() => {
  const at = gameBare.indexOf('function renderHome(){');
  return at < 0 ? '' : gameBare.slice(at, gameBare.indexOf('\n}', at));
})();
check(!!homeSrc, 'renderHome can be read');
const homeGos = [...new Set([...homeSrc.matchAll(/data-go="([a-z]+)"/g)].map(m => m[1]))];
const tabs = [...new Set([...gameBare.matchAll(/data-tab="([a-z]+)"/g)].map(m => m[1]))];
/* A screen with no tab of its own still counts as covered when TAB_LIT lights
   another tab for it: "browse" lives under You, and that is a real answer to
   "where did that go", not a gap. */
const litSrc = (() => {
  const at = gameBare.indexOf('const TAB_LIT = {');
  return at < 0 ? '' : gameBare.slice(at, gameBare.indexOf('};', at));
})();
const lit = [...new Set([...litSrc.matchAll(/([a-z]+):\s*'[a-z]+'/g)].map(m => m[1]))];
const stranded = homeGos.filter(g => !tabs.includes(g) && !lit.includes(g));
check(homeGos.length >= 4, `the home screen offers ${homeGos.length} screens`);
check(tabs.length >= 5, `the tab bar carries ${tabs.length} tabs`);
check(!stranded.length, 'every screen the home screen links to is on the tab bar',
  stranded.length ? `no tab reaches ${stranded.map(g => `"${g}"`).join(', ')}` : '');
/* AND THE STEP NAMES THEM. Pointing a ring at a bar of five icons and saying
   nothing about them is the same gap in a smaller box, so each tab's own label
   has to appear in the step's prose. Home is exempt: it is the screen the step
   is being read on. */
const tabWords = [...gameBare.matchAll(/data-tab="([a-z]+)"[\s\S]{0,900}?<span>([A-Za-z]+)<\/span>/g)]
  .map(m => ({ tab: m[1], word: m[2] })).filter(t => t.tab !== 'home');
const tabStep = (() => {
  const at = guideSrc.indexOf(`aim: () => document.getElementById('tabbar')`);
  return at < 0 ? '' : guideSrc.slice(at);
})();
check(tabWords.length >= 4, `the bar labels ${tabWords.length} tabs beyond Home`);
const unnamed = tabWords.filter(t => !new RegExp(`<b>${t.word}</b>`).test(tabStep));
check(!unnamed.length, 'and the step says what each one is',
  unnamed.length ? `unexplained: ${unnamed.map(t => t.word).join(', ')}` : '');
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
  'venue', 'city', 'state', 'country', 'has_setlist', 'show_order'];
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
     it heads. Measured: 470px for the draft button with the live section split
     around it, against 665px with the whole of it on top.
     The COUNTDOWN then moved below the button too, and that was measured as
     well: hoisting the rules above this panel put the draft button at 915px on
     a 390x844 screen, and the countdown was 91px of the way back down. The
     button now sits at 765px, above the fold, which is the only reason it is
     ordered this way. */
  const iNext = homeSrc.indexOf('class="nextline"');
  const iBtn = homeSrc.indexOf('data-start="${b.id}"');
  const iSet = homeSrc.indexOf('class="lastset"');
  check(iBtn > -1 && iNext > iBtn && iSet > iNext,
    'the button, then the countdown, then the setlist under its own heading');
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
/* SOME NIGHTS ARE TWO SHOWS. Seven date-and-venue pairs carry two distinct
   show_ids with entirely different setlists: the Cabo destination runs play
   twice in a day. Two identical rows is an invitation to tick the wrong one, on
   the screen whose whole job is claiming the right one. */
{
  const pairs = new Map();
  for (const r of showRows) {
    const k = `${r.show_date}|${r.venue}`;
    pairs.set(k, (pairs.get(k) || 0) + 1);
  }
  const doubled = [...pairs.values()].filter(n => n > 1).length;
  check(doubled > 0, `nights holding more than one show exist (${doubled})`);
  check(showRows.some(r => Number(r.show_order) > 1),
    'the table records which show of the night each one is');
  check(/show_order: String\(r\.showorder \|\| ''\)/.test(read('scripts/setlist/ingest_band.mjs')),
    'taken from elgoose rather than guessed from row order');
  check(/Show \$\{r\.show_order\} of \$\{n\}/.test(gameBare), 'and the browser says so');
  /* Counted over the whole table, not the filtered list, or the marker would
     appear and vanish as somebody narrows the year. */
  check(/for \(const r of all\) \{\s*\n\s*const k = `\$\{r\.show_date\}\|\$\{r\.venue\}`/.test(gameBare),
    'counted across every show, not the current filter');
}
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

/* The about copy states the size of the archive too, and it was wrong for
   weeks: 7,504 performances across 655 shows against a file holding 7,558 and
   659. It went stale for the ordinary reason, which is that it was typed once
   beside data that changes every morning. sync_counts.mjs maintains it now;
   this is what makes sure it kept doing so. */
const prose = game.match(/with ([\d,]+)\s*\n\s*recorded performances across ([\d,]+) shows/);
check(!!prose, 'the about copy states the archive size');
if (prose) {
  const rows = parseCSV(read('setlist/data/goose.csv'));
  const saidPerf = Number(prose[1].replace(/,/g, ''));
  const saidShows = Number(prose[2].replace(/,/g, ''));
  const realShows = loadBand(read('setlist/data/goose.csv')).shows.length;
  check(saidPerf === rows.length,
    `about copy says ${saidPerf} performances and the data has ${rows.length}`);
  check(saidShows === realShows,
    `about copy says ${saidShows} shows and the data has ${realShows}`);
}

console.log();
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
