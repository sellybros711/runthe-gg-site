/*
 * PIXEL HELMETS, as a mockup. Nothing here is wired into a game.
 *
 * A helmet is not thirty two drawings, it is ONE drawing and thirty two paint jobs. The
 * shell shape, the ear hole, the chin, the mask bars and where a logo sits are the same
 * for every club in the league; what differs is four colors, a stripe, sometimes a shell
 * pattern, and a small mark on the side. So the shape lives here once as a character grid
 * and a team is a handful of fields.
 *
 * THE GRID. Each row is a string, one character per pixel, read top to bottom:
 *
 *   .  nothing            #  shell             o  shell shadow (back and underside)
 *   ^  shell highlight    =  stripe 1          -  stripe 2          _  stripe 3
 *   M  facemask           m  facemask shadow   e  ear hole          E  ear hole ring
 *   L  where the logo goes: the top left pixel of the logo box
 *
 * Everything is drawn at 1x into a canvas and scaled up with smoothing off, so a helmet is
 * crisp at any whole multiple and never blurry the way a scaled PNG is.
 */
(function () {
  'use strict';

  /* ── the shell ────────────────────────────────────────────────────────────────
   *
   * TURNED TOWARD YOU, the way the reference is, and the mask is the whole reason. Side on,
   * a facemask is two or three bars in profile and there is nothing there to recognise. From
   * the front you get the shape everybody actually knows: A BROW BAR, TWO EYE OPENINGS WITH
   * THE NOSE BAR BETWEEN THEM, and a mouth under it. That arrangement is what says helmet.
   *
   * THE GAPS IN A CAGE ARE HOLES, and that one word is what three attempts at the facemask
   * got wrong. Filling the space between the bars with a dark face colour is the honest
   * thing to do and it is fatal: on a dark page a dark fill and a dark outline weld the bars
   * into one slab, and the slab reads as a window, a picture frame or a welding mask
   * depending on how it is bordered. It was tried as an even grid of four openings, as a
   * bordered box, and as a bordered box on a rounder shell. All three are a rectangle stuck
   * on a ball.
   * You can SEE THROUGH a facemask. So the gaps are nothing at all, the bars are lines with
   * daylight round them, and the mask joins the silhouette instead of decorating it.
   *
   * HAND PLACED, not generated. An earlier version built the outline from a function and
   * derived the stripe from the shell edge, which is the programmer's instinct and the wrong
   * one: derived, the stripe inherits every jog in the outline and comes out as a dotted
   * ladder. Pixel art is placed. So it is typed out, and anybody can move a pixel without
   * reading a line of code.
   *
   *   .  nothing     #  shell        o  shell underside     ^  the glint
   *   =  stripe      -  stripe trim
   *   M  cage bar    e  an opening, dark whatever the shell is
   *   E  ear hole ring       g  ear hole
   */
  /* ── THE ANGLE IS AN OPEN QUESTION, so all three are here ─────────────────────
   *
   * Seven silhouettes went past before this file admitted it was guessing. The note that
   * sent it back each time was about the angle, and the angle is the one thing a mockup
   * cannot reason its way to: it is a taste call about which reading of a helmet a person
   * has in their head. So the three that are actually different are kept, drawn from the
   * same paint job, and the page shows them together.
   *
   *   side     dead on from the side. The cage is a cage because it hangs in front of the
   *            shell with daylight through it, and this is the version that reads as a
   *            helmet fastest. The stripe is nearly edge on and the far cheek is invisible.
   *
   *   turned   rotated toward the viewer. You get the crown, so the stripe is a stripe, and
   *            a sliver of the far side of the shell past the cage. The cage flattens.
   *
   *   front    turned further again, the cage square on over the face. The most information
   *            about the mask and the least about the helmet: at small sizes the bars and
   *            the openings start reading as a face rather than a facemask.
   *
   * WHAT EACH SHAPE CARRIES is its own grid, its own logo box and its own dome for the
   * lighting, because a shape whose lighting was fitted to a different silhouette looks
   * lit from somewhere else.
   */
  const SHAPES = {
    side: {
      logo: { x: 12, y: 9, w: 9, h: 7 },
      dome: { cx: 13.5, cy: 13.5, rx: 13.0, ry: 12.0 },
      grid: [
    '..............................',
    '..............................',
    '.........#-====-#.............',
    '.......##-====-###............',
    '......##-====-#####...........',
    '.....##-====-^^#####..........',
    '....##-====-^^########........',
    '...##-====-###########........',
    '...##-====-#############......',
    '..##-====-###############.....',
    '..#######################.....',
    '..########################....',
    '..#######################.....',
    '..#####################MMMMMMM',
    '..###################.......MM',
    '..######EEE##########.......MM',
    '..######EgE##########.......MM',
    '..######EEE##########MMMMMMMMM',
    '..###################.......MM',
    '..###################......MM.',
    '..####################....MM..',
    '...###################MMMMM...',
    '....#################.........',
    '.....##############...........',
    '.......ooooooooo..............',
    '.........ooooo................',
    '..............................',
    '..............................',
    '..............................',
    '..............................',
  ],
    },
    front: {
      logo: { x: 5, y: 16, w: 9, h: 7 },
      dome: { cx: 15.0, cy: 13.5, rx: 14.0, ry: 12.0 },
      grid: [
    '................................',
    '................................',
    '...........##-====-##...........',
    '.........###-====-#####.........',
    '.......####-====-########.......',
    '......####-====-^^#########.....',
    '.....####-====-^^###########....',
    '....####-====-###############...',
    '...####-====-################...',
    '...###-====-#################...',
    '..###-====-###################..',
    '..############################..',
    '..############################..',
    '..###E############eeeeeee###....',
    '..#EgE#########MMMMMMMMMMMMM#...',
    '..###E##########eeeeMeeee###....',
    '..##############eeeeMeeee###....',
    '..##############eeeeeeeee##.....',
    '..#############MMMMMMMMMMMMM....',
    '...##############eeeeeeee##.....',
    '...###############eeeeee##......',
    '....############MMMMMMMMMMM.....',
    '.....############MMMMMMMM.......',
    '.......###########MMMMM.........',
    '.........ooooooooo..............',
    '...........oooo.................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
  ],
    },
  };


  /* ── a tiny alphabet ──────────────────────────────────────────────────────────
   * 3x5, because a helmet's side is nine pixels across and two letters plus a gap is
   * seven of them. Every club whose real mark is a letter or two gets a real mark out of
   * this; the rest are the drawn glyphs below.
   */
  const FONT = {
    A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
    C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'],
    E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
    G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
    I: ['111', '010', '010', '010', '111'], J: ['001', '001', '001', '101', '010'],
    K: ['101', '110', '100', '110', '101'], L: ['100', '100', '100', '100', '111'],
    M: ['101', '111', '111', '101', '101'], N: ['101', '111', '111', '111', '101'],
    O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
    Q: ['010', '101', '101', '110', '011'], R: ['110', '101', '110', '110', '101'],
    S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
    U: ['101', '101', '101', '101', '011'], V: ['101', '101', '101', '101', '010'],
    W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
    Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
  };

  /* ── the drawn marks ──────────────────────────────────────────────────────────
   * 1 and 2 are the logo's own two colors, so one glyph serves a club and its throwbacks
   * without being redrawn. Nine across by seven down, the size of the box above.
   *
   * WHAT IS AND IS NOT HERE. These are the marks that survive being seven pixels tall:
   * a star is a star at any size. A leaping panther is not, and the clubs whose marks are
   * that detailed carry a letter mark for now and are listed as such on the page. Drawing
   * those properly is pixel art rather than programming and wants a real pass.
   */
  const GLYPHS = {
    star: ['....1....', '....1....', '.1111111.', '..11111..', '..11111..', '.11...11.', '.........'],
    horseshoe: ['..11.11..', '.1111111.', '.11...11.', '.11...11.', '.11...11.', '.11...11.', '.........'],
    bolt: ['.....111.', '....111..', '...111...', '..1111111', '....111..', '...111...', '..111....'],
    horns: ['11.....11', '1.1...1.1', '1..1.1..1', '1..11111.', '.1.11111.', '..1......', '.........'],
    fleur: ['....1....', '...111...', '.1.111.1.', '1..111..1', '.1.111.1.', '..11111..', '...111...'],
    wing: ['11.......', '1111.....', '111111...', '.11111111', '..1111111', '....11111', '.......11'],
    shield: ['.1111111.', '.1122111.', '.1121211.', '.1122111.', '..11111..', '...111...', '....1....'],
    flag: ['.1111111.', '.1.212.1.', '.11212.1.', '.1..2..1.', '.1.212.1.', '.1111111.', '.........'],
    dolphin: ['.....11..', '....1111.', '..1111111', '.11111112', '111111.1.', '.111.....', '..1......'],
    /* A head with a beak, not a whole bird. Five clubs wear one and at nine pixels the only
       part that says bird rather than fish is the beak, so the beak gets the pixels. */
    bird: ['..111....', '.11111...', '1111111..', '11121111.', '111111111', '.111111..', '..111....'],
    bull: ['1.......1', '11.....11', '.1111111.', '11121211.', '.1111111.', '..11111..', '...1.1...'],
    arrow: ['...111...', '..11111..', '.1111111.', '111111111', '.1112111.', '..12221..', '...111...'],
    ram: ['.11...11.', '1..1.1..1', '1..1.1..1', '.11...11.', '..11111..', '...121...', '.........'],
    /* Sparse on purpose. Tiled dense, Cincinnati came out as a solid field of stripes and
       stopped being a helmet; a stripe wants space around it to read as a stripe. */
    /* SEVEN IDENTICAL ROWS, and that is the whole trick. The pattern is tiled nine across
       by seven down, so anything that changes from row to row breaks at every seventh row
       and comes out as scattered blobs rather than stripes: two attempts at a wavy stripe
       did exactly that. Rows that repeat tile into unbroken vertical bands down the shell,
       which is what Cincinnati actually wears. */
    tiger: ['.1..1..1.', '.1..1..1.', '.1..1..1.', '.1..1..1.', '.1..1..1.', '.1..1..1.', '.1..1..1.'],
    paw: ['.11.11.11', '.11.11.11', '.........', '..11111..', '.1111111.', '.1111111.', '..11111..'],
    hypo: ['.........', '..1.1.1..', '.111211..', '..1.1.1..', '.........', '.........', '.........'],
    none: ['.........', '.........', '.........', '.........', '.........', '.........', '.........'],
  };

  /* A two letter mark, centred in the box, for the clubs whose real logo is one. */
  function wordGlyph(text) {
    const rows = ['', '', '', '', ''];
    const chars = String(text).toUpperCase().split('').filter((c) => FONT[c]).slice(0, 2);
    chars.forEach((c, i) => {
      for (let r = 0; r < 5; r++) rows[r] += (i ? '0' : '') + FONT[c][r];
    });
    const w = rows[0].length;
    /* Every shape's logo box is nine across, which is not a coincidence: a mark drawn for
       one angle has to fit the others or the whole point of sharing glyphs is lost. */
    const BOX_W = 9;
    const pad = Math.max(0, Math.floor((BOX_W - w) / 2));
    const out = ['.........'];
    for (let r = 0; r < 5; r++) {
      out.push(('.'.repeat(pad) + rows[r].replace(/0/g, '.').replace(/1/g, '1'))
        .padEnd(BOX_W, '.').slice(0, BOX_W));
    }
    out.push('.........');
    return out;
  }

  const rgb = (hex) => {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  };
  const hex = (a) => '#' + a.map((v) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const lum = (c) => {
    const [r, g, b] = rgb(c);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  const shade = (c, amount) => hex(rgb(c).map((v) => v + amount * 255));
  /* TOWARD WHITE AND TOWARD BLACK, not plus and minus a fixed amount, which is what this
     used to do and why every dark helmet lost its shading. Adding 40 to a navy is a visible
     step and adding 40 to a white is nothing at all, so a white shell had a highlight and a
     black one did not. Moving a proportion of the distance to the end of the range keeps
     the hue, keeps the step visible at both ends, and cannot clip. */
  const lighten = (c, k) => hex(rgb(c).map((v) => v + (255 - v) * k));
  const darken = (c, k) => hex(rgb(c).map((v) => v * (1 - k)));
  const mix = (a, b, k) => {
    const A = rgb(a), B = rgb(b);
    return hex(A.map((v, i) => v + (B[i] - v) * k));
  };

  /* ── LIGHT ────────────────────────────────────────────────────────────────────
   *
   * FLAT FILL IS WHAT A SHAPE LOOKS LIKE WITH NOTHING SHINING ON IT. The silhouette was
   * right and every helmet still read as a sticker, because one colour across a curved
   * object tells the eye the object is not curved. A helmet is close to a sphere and a
   * sphere is the easiest thing there is to light, so it gets lit properly: a normal is
   * worked out for every pixel from where it sits on the dome, dotted against a light up
   * and to the left, and quantised to five tones.
   *
   * FIVE TONES, NOT A GRADIENT. Anything smoother stops being pixel art: the bands ARE the
   * style, the same way they are on a Mario coin or a Zelda pot. The ramp is anchored so
   * tone 2 is the school's actual colour, with two above it and two below, which is what
   * keeps a crimson helmet crimson rather than turning it into a pink one with a red edge.
   *
   * AND A RIM, because a lit sphere is not enough on its own: where the shell turns away at
   * the bottom and the back it gets one tone darker still, and the whole silhouette carries
   * a dark outline. The outline is the single thing that makes a sprite sit on a background
   * rather than float in front of it.
   */
  const LIGHT = { x: -0.52, y: -0.66, z: 0.54 };

  function domeLevel(x, y, DOME) {
    const nx = (x + 0.5 - DOME.cx) / DOME.rx;
    const ny = (y + 0.5 - DOME.cy) / DOME.ry;
    const nz = Math.sqrt(Math.max(0.05, 1 - Math.min(1, nx * nx + ny * ny)));
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    const d = (nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z) / len;
    return Math.max(0, Math.min(4, Math.round((d + 0.42) * 3.1)));
  }

  /* Tone 2 is the colour as given. The steps either side are deliberately uneven: the eye
     forgives a dark side that is too dark long before it forgives a highlight that has
     turned the paint into a different colour. */
  const RAMP = [0.34, 0.16, 0, 0.13, 0.30];
  const tone = (c, level) => (level === 2 ? c
    : level > 2 ? lighten(c, RAMP[level]) : darken(c, RAMP[level]));

  /* ── drawing ──────────────────────────────────────────────────────────────────
   * kit fields: shell, mask, stripe (an array of one to three colors), logo (a glyph name
   * or {word:'GB'}), ink (the logo's colors), pattern (an optional glyph drawn across the
   * whole shell, for a club whose shell is not one flat color).
   */
  function paint(ctx, kit, scale, ox, oy, shapeName) {
    const SHAPE = SHAPES[shapeName || (kit && kit.shape) || 'side'] || SHAPES.side;
    const HELMET = SHAPE.grid, LOGO_BOX = SHAPE.logo, DOME = SHAPE.dome;
    const shell = kit.shell || '#ffffff';
    const put = (x, y, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    };
    const stripe = kit.stripe && kit.stripe.length ? kit.stripe : [shell];
    const ink = kit.ink || ['#000000', '#ffffff'];
    /* A NAVY CAGE ON A NAVY SHELL IS NOT A CAGE. Five clubs wear a facemask the same colour
       as the helmet, and drawn honestly the whole front of those disappears: Houston,
       Seattle, Tennessee, Tampa Bay and Pittsburgh came out as plain dark circles. Real
       helmets get away with it because they are lit; pixels have to be told. So when the
       mask and the shell are too close to tell apart, the mask is nudged away from the
       shell rather than left to vanish, which is what a shadow would have done anyway. */
    const rawMask = kit.mask || '#4a5568';
    const dark = lum(shell) < 0.4;
    const mask = Math.abs(lum(rawMask) - lum(shell)) > 0.12 ? rawMask
      : shade(rawMask, dark ? 0.17 : -0.17);
    /* AND A BLACK CAGE OVER A BLACK FACE IS NOT A CAGE EITHER, which is the same mistake
       one layer in. Half the league wears a black or near black mask, and against a face
       painted the honest colour of the inside of a helmet those came out as one dark
       lozenge with no bars in it: the Raiders, the Saints, the Eagles and the Browns were
       all a blob. So the face is lifted off a dark mask rather than sunk into it. It is
       the wrong way round physically and it is the only way the shape survives. */
    const faceInk = kit.face || (lum(mask) < 0.28 ? shade(mask, 0.19)
      : (dark ? shade(shell, -0.24) : '#131a26'));

    /* THE OUTLINE GOES DOWN FIRST, into the empty pixels touching the sprite, so nothing
       has to know where the edge is: it is wherever paint meets nothing. Mixed toward the
       page's own dark rather than pure black, which keeps a black helmet from having an
       outline that is invisible and a white one from wearing a hard cartoon border. */
    const solid = (x, y) => {
      const row = HELMET[y];
      return !!row && row[x] && row[x] !== '.';
    };
    const outline = mix(shell, '#080b14', 0.74);
    for (let y = 0; y < HELMET.length; y++) {
      for (let x = 0; x < HELMET[y].length; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
          put(x, y, outline);
        }
      }
    }

    for (let y = 0; y < HELMET.length; y++) {
      const row = HELMET[y];
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (c === '.') continue;
        /* Where the shell turns away at the edge it loses another tone. Only on the dark
           side: the top left edge is where the light lands and darkening it there would
           put a shadow on the brightest part of the helmet. */
        let L = domeLevel(x, y, DOME);
        const edge = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
        if (edge && L <= 2) L = Math.max(0, L - 1);

        if (c === '#') put(x, y, tone(shell, L));
        else if (c === 'o') put(x, y, tone(shell, Math.max(0, L - 1)));
        /* THE GLINT, and it is placed rather than computed. The lit side of the dome is
           already a tone brighter than the rest and it reads as a lit surface; four pixels
           of near white read as a hard shiny one, which is what a helmet is. It is the only
           part of the shading that is not derived from the geometry, for the same reason a
           painter puts the catchlight in an eye by hand. */
        else if (c === '^') put(x, y, lighten(shell, 0.62));
        /* The stripe curves with the shell it is painted on, which is the whole reason it
           reads as paint rather than as a sticker laid over the top. Same light, same five
           tones, its own colour. */
        else if (c === '=') put(x, y, tone(stripe[0], L));
        else if (c === '-') put(x, y, tone(stripe[1] || stripe[0], L));
        else if (c === '_') put(x, y, tone(stripe[2] || stripe[0], L));
        /* The cage is not on the dome, it hangs in front of it, so it is lit by height
           instead: the top bar catches the light, the chin bar is in its own shadow. */
        else if (c === 'M') put(x, y, tone(mask, y <= 14 ? 3 : y <= 18 ? 2 : 1));
        else if (c === 'm') put(x, y, tone(mask, 1));
        /* The face opening is dark whatever the shell is: it is the inside of a helmet
           with a head in it, not a tinted version of the paint. */
        else if (c === 'e') put(x, y, faceInk);
        /* The ear hole, a diamond rather than a square: three by three filled reads as a
           sticker on the side of the helmet, and the corners knocked off reads as round.
           The ring above the hole catches light and the hole itself never does. */
        else if (c === 'E') put(x, y, tone(shell, Math.min(4, L + 1)));
        else if (c === 'g') put(x, y, darken(shell, 0.55));
      }
    }

    if (kit.pattern) {
      const g = GLYPHS[kit.pattern];
      for (let y = 0; y < HELMET.length; y++) {
        for (let x = 0; x < HELMET[y].length; x++) {
          if (HELMET[y][x] !== '#') continue;
          const p = g[y % g.length][x % g[0].length];
          if (p === '1') put(x, y, tone(kit.patternInk || '#000000', domeLevel(x, y, DOME)));
        }
      }
    }

    const glyph = kit.logo && kit.logo.word ? wordGlyph(kit.logo.word)
      : GLYPHS[kit.logo] || GLYPHS.none;
    for (let y = 0; y < glyph.length; y++) {
      for (let x = 0; x < glyph[y].length; x++) {
        const c = glyph[y][x];
        if (c === '.') continue;
        const gx = LOGO_BOX.x + x, gy = LOGO_BOX.y + y;
        if ((HELMET[gy] || '')[gx] !== '#') continue;   // never paint outside the shell
        put(gx, gy, tone(c === '2' ? (ink[1] || ink[0]) : ink[0], domeLevel(gx, gy, DOME)));
      }
    }
  }

  function render(canvas, kit, scale, shapeName) {
    const SHAPE = SHAPES[shapeName || (kit && kit.shape) || 'side'] || SHAPES.side;
    const w = SHAPE.grid[0].length, h = SHAPE.grid.length;
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paint(ctx, kit, scale, 0, 0, shapeName);
    return canvas;
  }

  window.PixelHelmet = { SHAPES, GLYPHS, FONT, render, paint, wordGlyph,
    shade, tone, domeLevel };
})();
