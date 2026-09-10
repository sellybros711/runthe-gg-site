/* The four things that keep an unfinished game out of an AdSense review.
 *
 *   node mythiball/check-posture.mjs
 *
 * MythiBall is an unlaunched preview, the same status as the wrestling
 * game and Run The Floor. That is a set of DELIBERATE choices rather than a
 * stage it happens to be at:
 *
 *   noindexed              a crawler is told not to index it
 *   absent from sitemap    nothing points a crawler at it in the first place
 *   no ad tag              it is not trying to serve an ad it has not earned
 *   linked from nowhere    a visitor browsing runthe.gg cannot stumble on it
 *
 * THESE NOW CARRY WEIGHT THEY DID NOT BEFORE. The game is SERVED: it answers
 * at runthe.gg/mythiball/ so testers can reach it, where before the directory
 * sat in the repo and nothing on the internet returned it. Unlisted is the
 * whole of the gate. Anyone who is handed the URL can play, which is what was
 * asked for and is worth saying out loud: this is not access control, and if
 * the game ever needs one, it needs a real one rather than a quiet path.
 *
 * WHY THIS IS A CHECK AND NOT A HABIT. scripts/check-adsense.mjs walks every
 * INDEXABLE page on the site and asserts each one can carry an ad and can reach
 * the policy pages. It skips anything noindexed. So the robots tag on this game
 * is the single line holding it out of the reviewed surface, and deleting it
 * does not fail anything: it quietly ADDS an unfinished game to the site being
 * reviewed. Launching the game should be a decision somebody makes by editing
 * THIS file, not a guard nobody notices.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const problems = [];
const page = read('mythiball/index.html');

/* 1. Noindexed. This is the line that does the work. */
if (!/name=["']robots["'][^>]*noindex/i.test(page)) {
  problems.push('mythiball/index.html is not noindexed. That puts an unfinished game into the '
    + 'indexable site, which is the surface AdSense reviews.');
}

/* 2. No ad tag. It is not a page that should be trying to serve one. */
if (page.includes('pagead2.googlesyndication.com')) {
  problems.push('mythiball/index.html carries the AdSense publisher tag. An unlaunched preview '
    + 'with a placeholder roster should not be serving ads.');
}

/* 3. Not in the sitemap, which is what would invite a crawler in. Case
      insensitive, because /Mythiball/ is a second real URL (see 4b) and a
      crawler pointed at either one has been pointed at the game. */
if (/\/mythiball/i.test(read('sitemap.xml'))) {
  problems.push('sitemap.xml lists /mythiball/. A noindexed page in the sitemap is a '
    + 'contradiction a crawler will report back to you.');
}

/* 4. Linked from nowhere a visitor browsing the site would find it. Checked
      against the pages that actually carry navigation, rather than the whole
      repo: this file, any build script and the game itself obviously mention it. */
for (const nav of ['index.html', '404.html', 'about.html']) {
  if (/href=["'][^"']*\/mythiball\//i.test(read(nav))) {
    problems.push(`${nav} links to /mythiball/. Linking it from the site is the step that `
      + 'launches it, and that step has not been taken.');
  }
}

/* 4b. THE CAPITAL ALIAS. The URL that gets typed and pasted is
      runthe.gg/Mythiball, so Mythiball/index.html exists to answer it, the
      way Wrestling/ and Tour/ answer theirs. It is a second public entry
      point to an unlaunched game, so it carries the same robots tag and it
      has to actually land on the game: a stub that redirects to a path that
      no longer exists is a dead link nobody would find until a tester did. */
{
  const alias = 'Mythiball/index.html';
  if (!fs.existsSync(path.join(ROOT, alias))) {
    problems.push(`${alias} is missing. runthe.gg/Mythiball is the URL that gets shared, and `
      + 'without the stub it is a 404 while the lower case path works.');
  } else {
    const stub = read(alias);
    if (!/name=["']robots["'][^>]*noindex/i.test(stub)) {
      problems.push(`${alias} is not noindexed. It is a second door to the same unlaunched `
        + 'game, and it needs the same tag as the first.');
    }
    if (!stub.includes('/mythiball/')) {
      problems.push(`${alias} does not point at /mythiball/. The alias has to land on the `
        + 'game, or the shared URL is a dead end.');
    }
  }
}

/* 5. The roster the game loads is present and holds the twenty-three characters
      the design finalized on. Under that count something has been dropped in a
      rewrite: the team select screen asks the player to pick nine, and the
      opponent teams below draw from this pool, so a silently shorter roster
      thins both sides of every game. */
const rosterMatch = page.match(/const ROSTER = \[([\s\S]*?)\n\];/);
if (!rosterMatch) {
  problems.push('could not find the ROSTER array in mythiball/index.html. Has the file been '
    + 'restructured? This check keeps the roster from silently shrinking.');
} else {
  const count = (rosterMatch[1].match(/\{ k:/g) || []).length;
  if (count < 45) {
    problems.push(`ROSTER holds ${count} characters. The current roster runs past fifty; `
      + 'a drop below forty-five means somebody has been cut in a rewrite.');
  }
  /* Every quirk key referenced on a roster row must be one the engine knows,
     or the character silently plays like the base template and the quirk note
     on the card lies about them. */
  const allowedQuirks = new Set(['transform','confuse','skittish','monument',
                                  'hex','naughty','stall','frenzy','drain',
                                  'petrify','rebirth','moonrise','unlucky','fragile']);
  const quirks = [...rosterMatch[1].matchAll(/quirk:'([^']+)'/g)].map(m => m[1]);
  const unknown = quirks.filter(q => !allowedQuirks.has(q));
  if (unknown.length) {
    problems.push(`ROSTER references unknown quirks: ${[...new Set(unknown)].join(', ')}. `
      + 'Add the mechanic to resolveSwing (or startAtBat for at bat scoped mods) before '
      + 'shipping the character with it on the card.');
  }
}

/* 5b. EVERY CHARACTER HAS A GENERATED SPRITE, AND IT IS THE DECLARED SIZE.
      Sprites come from mythiball/gen_sprites_v2.py as a V2_SPRITES table.
      The renderer walks a fixed V2_W by V2_H box and reads row[x] per cell,
      so a short row renders transparent at the end and a long one silently
      loses its tail: both look like a slightly wrong drawing rather than a
      bug. An earlier hand written sprite set shipped with twenty of those
      and nothing failed, which is why this check exists. It also catches a
      roster entry with no sprite at all, which would throw on first draw. */
{
  const wM = page.match(/V2_W = (\d+)/);
  const hM = page.match(/V2_H = (\d+)/);
  const tableM = page.match(/const V2_SPRITES = \{([\s\S]*?)\n\};/);
  if (!wM || !hM || !tableM) {
    problems.push('could not read V2_W / V2_H / V2_SPRITES from mythiball/index.html. '
      + 'Has the generated sprite block been replaced by hand?');
  } else {
    const W = +wM[1], H = +hM[1];
    const spriteKeys = new Set();
    /* The table is one character per block: a palette line, then one
       line per frame holding the run length encoded rows (see v2Frame in
       the page). Parsed line by line, decoded the same way the page does,
       and every decoded row has to be exactly the declared size. */
    const decode = (raw) => raw.split('/').map(r => {
      let out = '', num = '';
      for (const ch of r) {
        if (ch >= '0' && ch <= '9') { num += ch; continue; }
        out += ch.repeat(num ? parseInt(num, 10) : 1);
        num = '';
      }
      return out;
    });
    let key = null, palKeys = null, seen = null;
    const finish = () => {
      if (!key) return;
      for (const need of ['idle', 'run1', 'run2', 'back', 'backrun1', 'backrun2',
                          'windup', 'release', 'swing', 'catch', 'throw',
                          'load', 'follow', 'kick', 'ready']) {
        if (!seen.has(need)) problems.push(`sprite "${key}" is missing the "${need}" frame.`);
      }
    };
    for (const line of tableM[1].split('\n')) {
      const head = line.match(/^  (\w+):\{p:\{(.*)\},f:\{$/);
      if (head) {
        finish();
        key = head[1]; spriteKeys.add(key);
        palKeys = new Set([...head[2].matchAll(/'(.)':'#/g)].map(m => m[1]));
        seen = new Set();
        continue;
      }
      const fr = line.match(/^    (\w+):'(.*)',$/);
      if (!fr || !key) continue;
      const pose = fr[1];
      seen.add(pose);
      const rows = decode(fr[2]);
      if (rows.length !== H) {
        problems.push(`sprite "${key}" pose "${pose}" has ${rows.length} rows, expected ${H}.`);
      }
      const bad = rows.map((r, i) => [i, r.length]).filter(([, l]) => l !== W);
      if (bad.length) {
        problems.push(`sprite "${key}" pose "${pose}" has ${bad.length} row(s) not ${W} wide `
          + `(first: row ${bad[0][0]} is ${bad[0][1]}).`);
      }
      const used = new Set();
      for (const r of rows) for (const ch of r) if (ch !== '.') used.add(ch);
      const missing = [...used].filter(c => !palKeys.has(c));
      if (missing.length) {
        problems.push(`sprite "${key}" pose "${pose}" uses palette keys with no color: ${missing.join(', ')}.`);
      }
    }
    finish();
    if (rosterMatch) {
      const rosterCharKeys = [...rosterMatch[1].matchAll(/\{ k:'([^']+)'/g)].map(m => m[1]);
      const noSprite = rosterCharKeys.filter(k => !spriteKeys.has(k));
      if (noSprite.length) {
        problems.push(`roster characters with no generated sprite: ${noSprite.join(', ')}. `
          + 'Add a SPEC in mythiball/gen_sprites_v2.py and regenerate.');
      }
    }
  }
}

/* 6. Every opponent's lineup is nine characters, and every key in every lineup
      is a real roster key. This is the failure mode you would never see by
      opening the game: a mistyped key falls through to undefined, and the
      first at bat throws in a place nobody was looking. */
const opponentsMatch = page.match(/const OPPONENTS = \[([\s\S]*?)\n\];/);
const rosterKeys = new Set([...page.matchAll(/\{ k:'([^']+)',/g)].map(m => m[1]));
if (!opponentsMatch) {
  problems.push('could not find the OPPONENTS array. Has the file been restructured?');
} else {
  const lineups = [...opponentsMatch[1].matchAll(/roster:\[([^\]]+)\]/g)];
  if (lineups.length < 4) {
    problems.push(`only ${lineups.length} opponent teams defined. The season plays seven `
      + 'games, so any fewer than seven forces the schedule to reuse opponents in a way the '
      + 'schedule builder does not currently handle.');
  }
  lineups.forEach((m, i) => {
    const keys = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
    if (keys.length !== 9) {
      problems.push(`opponent #${i+1} has ${keys.length} players in its lineup. Nine required.`);
    }
    const missing = keys.filter(k => !rosterKeys.has(k));
    if (missing.length) {
      problems.push(`opponent #${i+1} references unknown roster keys: ${missing.join(', ')}.`);
    }
  });
}

/* ---------------------------------------------------------------- the press
   Two things about the cutscene tables can only go wrong quietly.

   A speaker key that is not in PRESS_CAST falls back to Dick Tracy, so a
   typo does not throw: it just silently attributes somebody else's line to
   the wrong reporter, forever.

   A {slot} nobody fills is worse. It used to print as the literal text
   {star} on screen, and now it is stripped, which means a new template
   naming a slot that does not exist quietly loses half its sentence and
   still reads as English. Both need catching here rather than in play. */
{
  const castBlock = page.match(/const PRESS_CAST = \{([\s\S]*?)\n\};/);
  const pressBlock = page.match(/const PRESS = \{([\s\S]*?)\n\};/);
  const cbBlock = page.match(/const PRESS_CALLBACK = \{([\s\S]*?)\n\};/);
  if (!castBlock || !pressBlock) {
    problems.push('the press tables (PRESS_CAST / PRESS) are missing or no longer '
      + 'match the shape this check reads.');
  } else {
    const cast = new Set([...castBlock[1].matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]));
    const body = pressBlock[1] + (cbBlock ? cbBlock[1] : '');

    const speakers = [...body.matchAll(/\[\s*"(\w+)"\s*,/g)].map(m => m[1]);
    const whos = [...body.matchAll(/who:\s*['"](\w+)['"]/g)].map(m => m[1]);
    /* A line may also be spoken by one of the fifty four, since the
       clubhouse and the press box share this screen. */
    const rosterSpeakers = new Set([...page.matchAll(/\{ k:'(\w+)'/g)].map(m => m[1]));
    const unknown = [...new Set([...speakers, ...whos])]
      .filter(k => !cast.has(k) && !rosterSpeakers.has(k));
    if (unknown.length) {
      problems.push(`press lines are attributed to speakers with no PRESS_CAST entry: `
        + `${unknown.join(', ')}. They would all be delivered by whoever is first in the cast.`);
    }

    /* Every slot the templates use has to be one something actually sets:
       pressCtx builds the common ones and the call sites add the rest. */
    const known = new Set(['team','foe','park','rec','gameNo','lastTag','rivalNote',
                           'you','them','margin','star','starKey','won','slot','ask']);
    const slots = [...new Set([...body.matchAll(/\{(\w+)\}/g)].map(m => m[1]))];
    const orphan = slots.filter(k => !known.has(k));
    if (orphan.length) {
      problems.push(`press templates use slots nothing fills: ${orphan.join(', ')}. `
        + `They are stripped at render time, so the line still reads as a sentence `
        + `with a piece missing. Add them to pressCtx or to this list.`);
    }
  }
}

/* ----------------------------------------------------------- how to play
   The help once taught a marker sweeping a bar under the field, with green
   and yellow bands and a five second pitch clock, for a long time after the
   game had replaced all three with a ring at the plate and a Throw It
   button, and then taught the ring for a while after the plate camera had
   replaced THAT with a zone. Nothing failed, because help text is not code. The figures are
   drawn by the game's own functions now, and the copy is held to the
   controls that exist. */
{
  const howto = page.match(/function renderHowTo\(\)[\s\S]*?\n\}\n/);
  if (!howto) {
    problems.push('could not find renderHowTo() in mythiball/index.html.');
  } else {
    const text = howto[0];
    for (const stale of ['marker', 'meter under the field', 'five seconds', 'shakes off the sign',
                         'Throw It', 'howtoRing(', 'closes as the pitch']) {
      if (text.includes(stale)) {
        problems.push(`How To Play still says "${stale}". That control no longer exists; the help `
          + 'is describing a game the player is not playing.');
      }
    }
    /* Since the plate camera: the strike zone and the bat's cursor, the
       reticle and the release bar, the Throw button, the stat legend and
       the two drawn fielding reads. The ring is gone and the help must
       not teach it. */
    for (const live of ['strike zone', 'where your bat will be', 'reticle', 'Throw</b>',
                        'STAT_LEGEND', 'howtoCatch(', 'howtoThrow(']) {
      if (!text.includes(live)) {
        problems.push(`How To Play no longer mentions "${live}". The zone and the bat's cursor, the `
          + 'reticle and the release, the Throw button, the stat legend and the drawn figures '
          + 'are what keep the help honest.');
      }
    }
  }
}

if (problems.length) {
  console.error(`MythiBall posture: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error('  ' + p);
  console.error('\nIf one of these is now intentional, change THIS FILE in the same commit, so');
  console.error('launching the game is a decision somebody made rather than a guard nobody');
  console.error('noticed. See the header for what each check is holding up.');
  process.exit(1);
}

console.log('MythiBall posture: noindexed, no ad tag, not in the sitemap, linked from nowhere.');
