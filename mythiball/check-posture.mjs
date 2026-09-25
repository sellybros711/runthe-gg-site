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

/* 5b. EVERY CHARACTER HAS A SPRITE, AND IT IS THE DECLARED SIZE.
      The renderer walks a fixed V2_W by V2_H box and reads row[x] per cell,
      so a short row renders transparent at the end and a long one silently
      loses its tail: both look like a slightly wrong drawing rather than a
      bug. An earlier hand written sprite set shipped with twenty of those
      and nothing failed, which is why this check exists. It also catches a
      roster entry with no sprite at all, which would throw on first draw.

      THE TABLE IS JSON ON ONE LINE, AND READING IT AS PRETTY PRINTED LINES
      WENT SILENT. It used to come out of gen_sprites_v2.py one frame per
      line, so this parsed it line by line; the handoff pack builder
      minifies it, so every one of those patterns stopped matching, the
      key set came back EMPTY, and the whole section reported one problem
      (all 68 roster characters have no sprite) while the three checks it
      is actually for, the row size, the palette keys and the missing
      poses, ran over nothing at all. Fourth time an extractor in this repo
      has been wrong in silence. It is parsed rather than pattern matched
      now, so the next change of layout cannot repeat it.

      A POSE MAY BE A REFERENCE. Repeated art is stored as '@otherpose'
      and v2Frame resolves it before decoding, so this resolves it too: a
      reference has no rows of its own and measuring its string would
      report every shared drawing as the wrong size. */
{
  const wM = page.match(/V2_W = (\d+)/);
  const hM = page.match(/V2_H = (\d+)/);
  const tableM = page.match(/const V2_SPRITES = (\{.*?\});\n/s);
  let table = null;
  if (wM && hM && tableM) {
    try { table = JSON.parse(tableM[1]); } catch (e) { table = null; }
  }
  if (!table) {
    problems.push('could not read V2_W / V2_H / V2_SPRITES from mythiball/index.html. '
      + 'Has the sprite table been replaced by hand, or is it no longer JSON?');
  } else {
    const W = +wM[1], H = +hM[1];
    const decode = (raw) => raw.split('/').map(r => {
      let out = '', num = '';
      for (const ch of r) {
        if (ch >= '0' && ch <= '9') { num += ch; continue; }
        out += ch.repeat(num ? parseInt(num, 10) : 1);
        num = '';
      }
      return out;
    });
    /* BLEED_GAP in mythiball/sprites/tools/spritelib.py, which is where the
       band it sits in was measured. The two are a pair: this reads what that
       one wrote, so a build run with a different gap fails here rather than
       shipping. */
    const BLEED_GAP = 3;
    /* Detached blobs clear of the figure above or below, plus anything on a
       side edge. 8 connected, which is the connectivity the builder walks the
       CHARACTER at, so a cape hanging off a shoulder by one diagonal pixel is
       part of the character here too. Reading it at 4 would report half the
       roster.

       IT DOES NOT ASK WHETHER THE BLOB TOUCHES THE TOP OR THE BOTTOM, and it
       used to. That was the builder's rule and the builder was wrong about it:
       the sheet cuts some of the neighbour short, so 87 fragments stopped a
       few rows in and sailed through. The clearance is the whole test now, in
       both files. */
    const strayBlobs = (rows) => {
      const h = rows.length, w = rows[0] ? rows[0].length : 0;
      if (!h || !w) return [];
      const lab = new Int32Array(w * h).fill(-1);
      const blobs = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (rows[y][x] === '.' || lab[y * w + x] !== -1) continue;
        const id = blobs.length, st = [[x, y]];
        let n = 0, top = h, bot = -1, hitL = false, hitR = false;
        lab[y * w + x] = id;
        while (st.length) {
          const [cx, cy] = st.pop(); n++;
          if (cy < top) top = cy;
          if (cy > bot) bot = cy;
          if (cx === 0) hitL = true;
          if (cx === w - 1) hitR = true;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (rows[ny][nx] === '.' || lab[ny * w + nx] !== -1) continue;
            lab[ny * w + nx] = id; st.push([nx, ny]);
          }
        }
        blobs.push({ n, top, bot, hitL, hitR });
      }
      if (blobs.length < 2) return [];
      const main = blobs.reduce((a, c) => (c.n > a.n ? c : a));
      const out = [];
      for (const bl of blobs) {
        if (bl === main) continue;
        if (bl.hitL || bl.hitR) { out.push({ n: bl.n, side: 'the side' }); continue; }
        const below = bl.top - main.bot, above = main.top - bl.bot;
        if (Math.max(below, above) >= BLEED_GAP) {
          out.push({ n: bl.n, side: below > above ? 'below the figure' : 'above it' });
        }
      }
      return out;
    };
    /* The poses the page asks for by name. A missing one is not a blank
       frame: spriteFor falls back to idle, so the character silently
       plays the wrong drawing for that beat. */
    const NEED = ['idle', 'ready', 'load', 'swing1', 'swing', 'follow',
                  'run1', 'run2', 'run3', 'run4',
                  'back', 'backrun1', 'backrun2', 'slump',
                  'windup', 'kick', 'release', 'throw', 'catch', 'cheer'];
    const spriteKeys = new Set(Object.keys(table));
    for (const [key, rec] of spriteKeys.size ? Object.entries(table) : []) {
      const f = rec && rec.f;
      if (!f) { problems.push(`sprite "${key}" has no frames at all.`); continue; }
      const palKeys = new Set(Object.keys(rec.p || {}));
      for (const need of NEED) {
        if (!(need in f)) problems.push(`sprite "${key}" is missing the "${need}" frame.`);
      }
      for (const pose of Object.keys(f)) {
        let raw = f[pose], hops = 0;
        while (typeof raw === 'string' && raw.charCodeAt(0) === 64 && hops++ < 4) {
          const target = raw.slice(1);
          if (!(target in f)) {
            problems.push(`sprite "${key}" pose "${pose}" points at "${target}", which it does not have.`);
            raw = null; break;
          }
          raw = f[target];
        }
        if (raw == null) continue;
        if (typeof raw !== 'string' || raw.charCodeAt(0) === 64) {
          problems.push(`sprite "${key}" pose "${pose}" never resolves to a drawing.`);
          continue;
        }
        const rows = decode(raw);
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
        /* NOBODY ELSE'S DRAWING IN THIS FRAME. The strips were cut out of a
           taller sheet, so a 64px cell catches the bottom of the figure above
           it or the top of the one below, and `drop_edge_bleed` in the builder
           only ever tested the SIDE edges. Nineteen of the sixty eight shipped
           with a piece of another character in a pose the clubhouse draws: a
           pair of somebody's shoes over Alice's head, 278 pixels of another
           figure at Hermes' feet. Reported by a player.

           Every guard here asked whether a frame is its own art. None asked
           whether it is ONLY its own art, which is why a stray blob rode all
           the way to the screen: it is a valid drawing, the pose is present,
           and it differs from idle.

           THE FIGURE IS THE LARGEST BLOB, always, so it is never what is
           reported. A blob above or below it is allowed to be the character's
           own foot when it is within BLEED_GAP of him, which is the builder's
           own constant and the reason Paul Bunyan keeps his boot.

           A BLOB THAT OVERLAPS THE FIGURE'S OWN ROWS IS LEFT ALONE, and that
           is where the art is: Mother Nature's leaves and the ball off a bat
           are drawn WITH the character and have no clearance. Nothing in the
           geometry tells one of those from bleed, so the clearance is what
           decides and the overlap is never touched. */
        const strays = strayBlobs(rows);
        if (strays.length) {
          problems.push(`sprite "${key}" pose "${pose}" carries ${strays.length} detached `
            + `blob(s) clear of the figure: ${strays.map(s => s.n + 'px '
            + s.side).join(', ')}. That is a piece of the frame next door. `
            + 'Re-run mythiball/sprites/tools/build_table.py and install.py.');
        }

        /* AND HIS FEET ARE ON THE BOTTOM OF HIS OWN CELL. A sprite is drawn
           with the bottom of its CELL on the dirt, so a frame whose figure
           stops short is a figure hovering over its own shadow by however
           many rows are empty.

           `cleaned()` seats every frame at y=62, so the gap is 1 by
           construction and 0 for a character drawn the full height of the
           canvas. Anything more means the seat was refused, which is what
           left 291 of 1,360 frames floating up to 39 rows: the pitcher's
           windup hung a quarter of his own height over the mound, on every
           pitch, and nothing could report it because a frame drawn high in
           its cell is a perfectly valid frame.

           It is asked of the DECODED drawing, so a reference is resolved
           first, which is the lesson the three guards aliasing defeated
           already learnt. */
        let lastLit = -1;
        for (let y = 0; y < rows.length; y++) {
          if (/[^.]/.test(rows[y] || '')) lastLit = y;
        }
        const gap = lastLit < 0 ? 0 : (H - 1) - lastLit;
        if (gap > 1) {
          problems.push(`sprite "${key}" pose "${pose}" leaves ${gap} empty rows under `
            + 'the figure, so he is drawn hovering that far above the ground. '
            + 'cleaned() seats every frame on y=62. Re-run '
            + 'mythiball/sprites/tools/build_table.py and install.py.');
        }
      }
    }
    if (rosterMatch) {
      const rosterCharKeys = [...rosterMatch[1].matchAll(/\{ k:'([^']+)'/g)].map(m => m[1]);
      const noSprite = rosterCharKeys.filter(k => !spriteKeys.has(k));
      if (noSprite.length) {
        problems.push(`roster characters with no sprite: ${noSprite.join(', ')}. `
          + 'Build one into the handoff pack and re-run mythiball/sprites/tools/install.py.');
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
    /* The quick start above the prose teaches the same controls in fewer
       words, so a stale one there is the same lie told first. */
    const quick = page.match(/function howtoQuickStart\(\)[\s\S]*?\n\}\n/);
    if (!quick) problems.push('could not find howtoQuickStart() in mythiball/index.html.');
    else if (!howto[0].includes('howtoQuickStart()')) {
      problems.push('How To Play no longer shows the quick start. It is the part a stranger reads first.');
    }
    const text = howto[0] + (quick ? quick[0] : '');
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

/* 7. THE BRAND. The logo files are painted by the kit between MYPIX BEGIN and MYPIX END in the game and
      rendered by mythiball/build-logo.mjs, which reads that block out of this page by its markers. What can
      rot here, and all of it silently:

      - A marker renamed in a tidy up. The page still works, and the next person to rebuild the logo gets a
        throw from a build step nobody has run in months.
      - A file the page names and nobody rendered. A 404 icon is a blank tab and a blank home screen.
      - TWO ?v= ON ONE FILE. Each file is named in up to three places (the game, the capital alias that is
        the URL people actually paste, and the manifest), all written by hand. Bump one and not the others
        and a chat app that has seen either name goes on serving the old card out of its own cache. The
        baseball card shipped that way inside one edit. A number that MOVED when the bytes did is not
        knowable here, because there is no earlier version to compare against; build-logo.mjs's header
        says so.
      - The two pages carrying different previews, which is the same drift one level up.
      - A source page losing its robots tag, which is two build templates in the indexable site. */
{
  const DIR = path.join(ROOT, 'mythiball');
  const alias = read('Mythiball/index.html');
  const manifest = read('mythiball/manifest.webmanifest');
  if (!page.includes('/* ==================== MYPIX BEGIN') || !page.includes('/* ==================== MYPIX END ==================== */')) {
    problems.push('mythiball/index.html has lost a MYPIX marker. logo-source.html and og-source.html find '
      + 'the pixel kit by those two exact lines, so the logo can no longer be rebuilt.');
  }
  for (const src of ['logo-source.html', 'og-source.html']) {
    const f = path.join(DIR, src);
    if (!fs.existsSync(f)) { problems.push(`mythiball/${src} is missing. build-logo.mjs renders from it.`); continue; }
    if (!/name=["']robots["'][^>]*noindex/i.test(fs.readFileSync(f, 'utf8'))) {
      problems.push(`mythiball/${src} is not noindexed. It is a build template, served like any file here.`);
    }
  }
  // every file any of the three names, with the version it gives
  const seen = new Map();
  const note = (where, text, re) => { for (const m of text.matchAll(re)) {
    const file = m[1].replace(/^.*\//, ''), v = m[2] || null;
    if (!seen.has(file)) seen.set(file, []);
    seen.get(file).push({ where, v });
  } };
  const REF = /["'](?:https:\/\/runthe\.gg)?(?:\/mythiball\/)?((?:icon|favicon|og|mark|logo|lockup)[\w-]*\.png)(?:\?v=(\d+))?["']/g;
  note('mythiball/index.html', page, REF);
  note('Mythiball/index.html', alias, REF);
  note('mythiball/manifest.webmanifest', manifest, REF);
  if (seen.size < 6) {
    problems.push(`The brand check found only ${seen.size} image references across the two pages and the `
      + 'manifest. Either the head lost its icon and preview tags, or this reader stopped matching them.');
  }
  for (const [file, refs] of seen) {
    if (!fs.existsSync(path.join(DIR, file))) {
      problems.push(`${refs[0].where} names mythiball/${file}, which does not exist. Run build-logo.mjs.`);
    }
    const vs = [...new Set(refs.map(r => r.v))];
    if (vs.length > 1) {
      problems.push(`mythiball/${file} is asked for as ${refs.map(r => `?v=${r.v} in ${r.where}`).join(' and ')}. `
        + 'One file, one version, or a cache that has seen either name keeps the old picture.');
    }
  }
  // the two pages unfurl identically
  const tagsOf = (h) => [...h.matchAll(/<meta (?:property|name)=["']((?:og|twitter):[\w:]+)["'] content=["']([^"']*)["']/g)]
    .map(m => m[1] + '=' + m[2]).sort().join('\n');
  const gameTags = tagsOf(page), aliasTags = tagsOf(alias);
  if (!/og:image=https:\/\/runthe\.gg\/mythiball\/og\.png/.test(gameTags)) {
    problems.push('mythiball/index.html carries no og:image. A pasted link to an unlisted game is the only way '
      + 'anybody reaches it, and without one it unfurls as a bare line of text.');
  }
  if (gameTags !== aliasTags) {
    problems.push('Mythiball/index.html and mythiball/index.html carry different link previews. The capital '
      + 'alias is the URL people paste, so it has to unfurl as the game does, tag for tag.');
  }
  // the preview is the size its tags declare, read off the PNG header rather than trusted
  const og = path.join(DIR, 'og.png');
  if (fs.existsSync(og)) {
    const b = fs.readFileSync(og), w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    const dw = +(gameTags.match(/og:image:width=(\d+)/) || [])[1], dh = +(gameTags.match(/og:image:height=(\d+)/) || [])[1];
    if (w !== dw || h !== dh) problems.push(`mythiball/og.png is ${w}x${h} and its tags say ${dw}x${dh}.`);
  }
  // the header draws its mark with the kit rather than fetching a file, so the two cannot drift
  if (!/MYPIX\.icon\(N, 0\)/.test(page)) {
    problems.push('The header no longer draws its mark with MYPIX. A mark drawn any other way is a second '
      + 'drawing of the logo, and it drifts from the files the first time either is touched.');
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
