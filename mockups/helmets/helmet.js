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
   * Facing right, 26 wide by 24 tall. The mask is part of the same grid rather than a
   * second sprite: a mask drawn separately has to be positioned per team and there is no
   * reason for it to move.
   */
  /* ── the shell ────────────────────────────────────────────────────────────────
   *
   * THREE QUARTERS ON, not side on, and that was the second attempt rather than a style
   * choice. A side profile is the obvious way to draw a helmet and it falls apart at this
   * size: the shell becomes an egg, the mask becomes a fence beside the egg, and the face
   * opening that would have made it read is four pixels of nothing. Turned toward you the
   * mask is a CAGE OVER A DARK FACE, a shape the eye gets instantly, and the whole left of
   * the shell is left over for the mark.
   *
   * HAND PLACED, not generated. The third attempt built this from a silhouette function
   * and a stripe derived from the shell edge, which is the programmer's instinct and the
   * wrong one: derived, the stripe inherits every jog in the outline and comes out as a
   * dotted ladder rather than a stripe. Pixel art is placed. So it is typed out, and
   * anybody can move a pixel without reading a line of code.
   *
   *   .  nothing     #  shell        o  shell underside     =  stripe    -  stripe trim
   *   M  mask bar    e  face, which is dark whatever the shell is
   *
   * THE STRIPE IS SIX WIDE, four of colour and one of trim either side, and it started at
   * four. At four it read as a candy cane rather than a stripe: the band steps one pixel
   * left per row, so a one pixel trim sits directly under the colour above it and the eye
   * joins them diagonally into alternating beads. Widening the colour is what separates
   * the two trim lines enough to read as edges of one band.
   */
  const HELMET = [
    '........................',
    '........................',
    '.......#-====-##........',
    '.....##-====-#####......',
    '....##-====-#######.....',
    '...##-====-#########....',
    '..##-====-###########...',
    '..#-====-############...',
    '.##-====-#############..',
    '.#-====-####MMMMMMMMM#..',
    '.#-====-####MeeeMeeeM#..',
    '.###########MeeeMeeeM#..',
    '.###########MMMMMMMMM#..',
    '.###########MeeeMeeeM#..',
    '.###########MeeeMeeeM#..',
    '.###########MMMMMMMMM...',
    '..###########MMMMMM#....',
    '..############MMMM#.....',
    '...###############......',
    '....oooooooooooo........',
    '........................',
    '........................',
    '........................',
    '........................',
  ];

  /* Where the mark sits, and how big a box it gets. Every logo is drawn inside this box, so
     a mark too big for a helmet is caught by the box rather than by somebody noticing it
     later. Low and left, which is where a club actually puts one and, not by accident, the
     only part of a turned helmet with room for it. */
  const LOGO_BOX = { x: 3, y: 11, w: 9, h: 7 };

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
    const pad = Math.max(0, Math.floor((LOGO_BOX.w - w) / 2));
    const out = ['.........'];
    for (let r = 0; r < 5; r++) {
      out.push(('.'.repeat(pad) + rows[r].replace(/0/g, '.').replace(/1/g, '1'))
        .padEnd(LOGO_BOX.w, '.').slice(0, LOGO_BOX.w));
    }
    out.push('.........');
    return out;
  }

  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  };
  const shade = (hex, amount) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)]
      .map((v) => v.toString(16).padStart(2, '0')).join('');
  };

  /* ── drawing ──────────────────────────────────────────────────────────────────
   * kit fields: shell, mask, stripe (an array of one to three colors), logo (a glyph name
   * or {word:'GB'}), ink (the logo's colors), pattern (an optional glyph drawn across the
   * whole shell, for a club whose shell is not one flat color).
   */
  function paint(ctx, kit, scale, ox, oy) {
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

    for (let y = 0; y < HELMET.length; y++) {
      const row = HELMET[y];
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (c === '.') continue;
        if (c === '#') put(x, y, shell);
        else if (c === 'o') put(x, y, shade(shell, -0.13));
        else if (c === '^') put(x, y, shade(shell, 0.13));
        /* No stripe at all is a real look, not a missing field: Cleveland and Tampa Bay
           wear a bare shell, so an empty stripe paints shell and the crown disappears. */
        else if (c === '=') put(x, y, stripe[0]);
        else if (c === '-') put(x, y, stripe[1] || stripe[0]);
        else if (c === '_') put(x, y, stripe[2] || stripe[0]);
        else if (c === 'M') put(x, y, mask);
        else if (c === 'm') put(x, y, shade(mask, -0.12));
        /* The face opening is dark whatever the shell is: it is the inside of a helmet
           with a head in it, not a tinted version of the paint. */
        else if (c === 'e') put(x, y, faceInk);
      }
    }

    /* The stripe rides the crown. Three colors means an outline either side of a centre
       band, which is what most of the league's stripes actually are. */
    if (kit.pattern) {
      const g = GLYPHS[kit.pattern];
      for (let y = 0; y < HELMET.length; y++) {
        for (let x = 0; x < HELMET[y].length; x++) {
          if (HELMET[y][x] !== '#') continue;
          const p = g[y % g.length][x % g[0].length];
          if (p === '1') put(x, y, kit.patternInk || '#000000');
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
        put(gx, gy, c === '2' ? (ink[1] || ink[0]) : ink[0]);
      }
    }
  }

  function render(canvas, kit, scale) {
    const w = HELMET[0].length, h = HELMET.length;
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paint(ctx, kit, scale, 0, 0);
    return canvas;
  }

  window.PixelHelmet = { HELMET, GLYPHS, FONT, LOGO_BOX, render, paint, wordGlyph, shade };
})();
