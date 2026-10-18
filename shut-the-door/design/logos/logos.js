/* Shut The Door: three logo options, drawn as SVG.
 *
 * Design work for the owner to pick from. Not loaded by the game. Each option
 * has a lockup (light and dark), a horizontal header lockup and an icon mark
 * (512 viewBox) that has to hold up as an app icon and at 32 px in a header.
 *
 * Every option mixes vintage ballpark lettering (the owner liked direction B,
 * the scorecard program) with clean modern type (direction C), aimed at a
 * premium sports title, because the game itself is going realistic 3D.
 *
 * Fonts are open licence, kept beside this file with their licences:
 * Yellowtail (Apache 2.0), Graduate, Alfa Slab One, Barlow Condensed (OFL).
 * A shipped logo would have its letters converted to outlines.
 */
(function () {
'use strict';

var SCRIPT = "'Yellowtail', cursive", VARSITY = "'Graduate', serif", SLAB = "'Alfa Slab One', serif";
var COND = "'Barlow Condensed', sans-serif";

function svg(vb, body, cls) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" class="' + (cls || '') + '">' + body + '</svg>';
}
var uid = 0;
function id(p) { return p + (++uid); }

/* A baseball's red stitches along a path: little V pairs at even steps. Drawn
   in the browser after layout (needs getPointAtLength), so here it is a
   placeholder the page fills in. */
function stitchPath(d, color, w, gap, size) {
  return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-opacity=".45" stroke-width="' + w + '" stroke-linecap="round" data-stitch="' + gap + ',' + size + ',' + color + '"/>';
}

/* ---- option 1: Night Script ------------------------------------------------ */

var P1 = { navy: '#0d1b2e', navy2: '#16294a', cream: '#f4ead5', red: '#c8322b', brass: '#e3a83b', ink: '#0d1b2e', paper: '#f7f1e3' };

function o1Lockup(dark) {
  var fg = dark ? P1.cream : P1.navy, cap = dark ? P1.brass : P1.red, shadow = dark ? P1.red : P1.red;
  return svg('0 0 800 380',
    /* the tracked caps with ruled ends, the modern half */
    '<g font-family="' + COND + '" font-weight="600" text-anchor="middle">' +
    '<text x="400" y="92" font-size="50" letter-spacing="17" fill="' + cap + '">SHUT THE</text>' +
    '<line x1="150" y1="76" x2="232" y2="76" stroke="' + cap + '" stroke-width="4"/><line x1="568" y1="76" x2="650" y2="76" stroke="' + cap + '" stroke-width="4"/>' +
    '</g>' +
    /* the script, jersey style: a shadow copy, then the word */
    '<g font-family="' + SCRIPT + '" font-size="228" text-anchor="middle">' +
    '<text x="408" y="268" fill="' + shadow + '" transform="translate(7 7)">Door</text>' +
    '<text x="408" y="268" fill="' + fg + '" stroke="' + (dark ? P1.navy : P1.paper) + '" stroke-width="3" paint-order="stroke">Door</text>' +
    '</g>' +
    /* the tail swash under the word, ending in a ball */
    '<path d="M 214 296 C 330 330, 480 330, 612 290 C 620 287, 626 285, 632 284 C 612 300, 470 362, 214 296 Z" fill="' + P1.red + '" transform="translate(5 5)"/>' +
    '<path d="M 214 296 C 330 330, 480 330, 612 290 C 620 287, 626 285, 632 284 C 612 300, 470 362, 214 296 Z" fill="' + fg + '"/>' +
    '<circle cx="652" cy="280" r="19" fill="' + (dark ? P1.cream : '#ffffff') + '" stroke="' + (dark ? P1.cream : P1.navy) + '" stroke-width="3"/>' +
    '<path d="M 641 266 Q 649 280 641 294 M 663 266 Q 655 280 663 294" fill="none" stroke="' + P1.red + '" stroke-width="2.6" stroke-dasharray="3 2.6"/>' +
    '<text x="400" y="360" font-family="' + COND + '" font-weight="600" font-size="22" letter-spacing="8" text-anchor="middle" fill="' + (dark ? 'rgba(244,234,213,.62)' : 'rgba(13,27,46,.6)') + '">A DAILY CLOSER GAME</text>');
}
function o1Mark() {
  var g = id('g'), r = id('r');
  return svg('0 0 512 512',
    '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + P1.navy2 + '"/><stop offset="1" stop-color="#08121f"/></linearGradient>' +
    '<radialGradient id="' + r + '" cx=".5" cy=".18" r=".7"><stop offset="0" stop-color="#ffffff" stop-opacity=".16"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs>' +
    '<rect width="512" height="512" rx="112" fill="url(#' + g + ')"/><rect width="512" height="512" rx="112" fill="url(#' + r + ')"/>' +
    '<rect x="22" y="22" width="468" height="468" rx="92" fill="none" stroke="' + P1.brass + '" stroke-width="6" opacity=".85"/>' +
    /* home plate from above, a doorway cut in it, a red knob */
    '<path d="M 116 130 H 396 V 300 L 256 430 L 116 300 Z" fill="' + P1.cream + '"/>' +
    '<path d="M 206 356 V 230 A 50 50 0 0 1 306 230 V 356 Z" fill="' + P1.navy + '"/>' +
    '<circle cx="285" cy="292" r="10" fill="' + P1.red + '"/>');
}
function o1Header(dark) {
  var fg = dark ? P1.cream : P1.navy, cap = dark ? P1.brass : P1.red;
  return svg('0 0 300 60',
    '<text x="0" y="41" font-family="' + COND + '" font-weight="600" font-size="25" letter-spacing="3" fill="' + cap + '">SHUT THE</text>' +
    '<text x="112" y="46" font-family="' + SCRIPT + '" font-size="52" fill="' + fg + '">Door</text>');
}

/* ---- option 2: Grandstand ------------------------------------------------------ */

var P2 = { green: '#1f4a35', deep: '#0f2a1e', cream: '#f3e9d3', brass: '#d9a62e', red: '#b3362b', ink: '#1f2b45', amber: '#f4b63f', paper: '#f3e9d3' };

function o2Lockup(dark) {
  var arc = id('a'), sh = '';
  for (var i = 7; i >= 1; i--) sh += '<text x="' + (400 + i * 1.4) + '" y="' + (316 + i * 1.4) + '" fill="' + P2.deep + '">DOOR</text>';
  return svg('0 -24 800 512',
    '<defs><path id="' + arc + '" d="M 220 226 A 190 190 0 0 1 580 226"/></defs>' +
    (dark ? '' : '<path d="M 156 452 V 232 A 244 244 0 0 1 644 232 V 452 Z" fill="rgba(31,43,69,.18)" transform="translate(6 8)"/>') +
    /* the ballpark gate: an arch, brass rim, a cream keyline */
    '<path d="M 156 452 V 232 A 244 244 0 0 1 644 232 V 452 Z" fill="' + P2.green + '" stroke="' + P2.brass + '" stroke-width="12"/>' +
    '<path d="M 176 440 V 234 A 224 224 0 0 1 624 234 V 440 Z" fill="none" stroke="' + P2.cream + '" stroke-width="2.5" opacity=".7"/>' +
    /* arched varsity caps, stars at the ends */
    '<text font-family="' + VARSITY + '" font-size="46" letter-spacing="6" fill="' + P2.cream + '" text-anchor="middle"><textPath href="#' + arc + '" startOffset="50%">SHUT THE</textPath></text>' +
    '<text x="218" y="238" font-size="26" fill="' + P2.brass + '" text-anchor="middle">★</text><text x="582" y="238" font-size="26" fill="' + P2.brass + '" text-anchor="middle">★</text>' +
    /* the slab, block shadow and a brass keyline */
    '<g font-family="' + SLAB + '" font-size="118" text-anchor="middle" letter-spacing="1">' + sh +
    '<text x="400" y="316" fill="' + P2.cream + '" stroke="' + P2.brass + '" stroke-width="3" paint-order="stroke">DOOR</text></g>' +
    /* the ribbon with the modern line */
    '<path d="M 182 356 H 618 L 600 382 L 618 408 H 182 L 200 382 Z" fill="' + P2.red + '"/>' +
    '<text x="400" y="392" font-family="' + COND + '" font-weight="600" font-size="27" letter-spacing="5" fill="' + P2.cream + '" text-anchor="middle">THREE OUTS. YOUR CALL.</text>' +
    '<text x="400" y="434" font-family="' + COND + '" font-weight="600" font-size="17" letter-spacing="6" fill="' + P2.brass + '" text-anchor="middle">A DAILY CLOSER GAME</text>');
}
function o2Mark() {
  var g = id('g'), glow = id('w');
  var bulbs = [196, 262, 328].map(function (y) {
    return '<circle cx="256" cy="' + y + '" r="33" fill="' + P2.deep + '"/><circle cx="256" cy="' + y + '" r="25" fill="url(#' + glow + ')"/>';
  }).join('');
  return svg('0 0 512 512',
    '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#275a41"/><stop offset="1" stop-color="' + P2.deep + '"/></linearGradient>' +
    '<radialGradient id="' + glow + '" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#fff3c4"/><stop offset=".55" stop-color="' + P2.amber + '"/><stop offset="1" stop-color="#c9801c"/></radialGradient></defs>' +
    '<rect width="512" height="512" rx="112" fill="url(#' + g + ')"/>' +
    /* the arched door, a brass frame; three out lights; a brass knob */
    '<path d="M 140 452 V 196 A 116 116 0 0 1 372 196 V 452" fill="#163a29" stroke="' + P2.brass + '" stroke-width="18" stroke-linejoin="round"/>' +
    '<line x1="96" y1="452" x2="416" y2="452" stroke="' + P2.brass + '" stroke-width="18" stroke-linecap="round"/>' +
    bulbs +
    '<circle cx="330" cy="398" r="13" fill="' + P2.brass + '"/>');
}
function o2Header(dark) {
  return svg('0 0 300 60',
    '<text x="0" y="42" font-family="' + SLAB + '" font-size="30" letter-spacing="1" fill="' + (dark ? P2.cream : P2.green) + '">SHUT THE <tspan fill="' + (dark ? P2.brass : P2.red) + '">DOOR</tspan></text>');
}

/* ---- option 3: Strike Zone --------------------------------------------------------- */

var P3 = { ink: '#0b0f17', ink2: '#1a2130', white: '#ffffff', signal: '#ff4f1f', data: '#2b59ff', paper: '#f4f5f7', mute: '#8a93a6' };

function o3MarkBody(fgGrid, bg) {
  return '<rect x="104" y="104" width="304" height="304" rx="34" fill="none" stroke="' + fgGrid + '" stroke-width="20"/>' +
    '<line x1="205" y1="114" x2="205" y2="398" stroke="' + fgGrid + '" stroke-width="10"/>' +
    '<line x1="114" y1="205" x2="300" y2="205" stroke="' + fgGrid + '" stroke-width="10"/>' +
    '<line x1="114" y1="307" x2="300" y2="307" stroke="' + fgGrid + '" stroke-width="10"/>' +
    /* the last column, a door almost shut: narrower at its free edge */
    '<path d="M 300 120 L 398 104 Q 408 104 408 116 V 396 Q 408 408 398 408 L 300 392 Z" fill="' + P3.signal + '"/>' +
    '<circle cx="320" cy="256" r="11" fill="' + bg + '"/>';
}
function o3Mark() {
  var g = id('g');
  return svg('0 0 512 512',
    '<defs><linearGradient id="' + g + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d2536"/><stop offset="1" stop-color="' + P3.ink + '"/></linearGradient></defs>' +
    '<rect width="512" height="512" rx="112" fill="url(#' + g + ')"/>' + o3MarkBody(P3.white, P3.ink));
}
function o3Lockup(dark) {
  var fg = dark ? P3.white : P3.ink;
  return svg('0 0 860 360',
    '<g transform="translate(20 50) scale(0.47)">' + o3MarkBody(fg, dark ? P3.ink : P3.paper) + '</g>' +
    '<g font-family="' + COND + '" font-style="italic">' +
    '<text x="300" y="128" font-weight="800" font-size="76" letter-spacing="3" fill="' + fg + '">SHUT THE</text>' +
    '<text x="292" y="270" font-weight="900" font-size="196" letter-spacing="2" fill="' + fg + '">DOOR</text>' +
    '</g>' +
    /* the vintage half: a chain of seam stitches under the word */
    stitchPath('M 304 298 Q 520 318 748 292', P3.signal, 2.5, 13, 10) +
    '<text x="304" y="346" font-family="' + COND + '" font-weight="600" font-size="22" letter-spacing="7" fill="' + (dark ? P3.mute : '#5b6476') + '">ONE INNING. YOUR CALLS.</text>');
}
function o3Header(dark) {
  var fg = dark ? P3.white : P3.ink;
  return svg('0 0 300 60',
    '<text x="0" y="44" font-family="' + COND + '" font-style="italic" font-weight="900" font-size="36" letter-spacing="1" fill="' + fg + '">SHUT THE <tspan fill="' + P3.signal + '">DOOR</tspan></text>');
}

window.STD_LOGOS = {
  1: { key: 'night-script', name: 'Night Script', idea: 'A ballpark script under clean tracked caps. Home plate with a doorway cut in it.',
    lockup: o1Lockup, mark: o1Mark, header: o1Header, pal: P1,
    bgLight: P1.paper, bgDark: '#0a1626', note: 'navy, cream and stitch red. The script is the vintage half, the tracked condensed caps the modern half.' },
  2: { key: 'grandstand', name: 'Grandstand', idea: 'The ballpark gate as a badge. An arched door with three out lights: three lit, door shut.',
    lockup: o2Lockup, mark: o2Mark, header: o2Header, pal: P2,
    bgLight: '#efe4cc', bgDark: '#10261b', note: 'board green, brass and scorer red. Varsity and slab on the gate, a modern condensed line on the ribbon.' },
  3: { key: 'strike-zone', name: 'Strike Zone', idea: 'A premium sports title. The strike zone with its last column swinging shut as a door.',
    lockup: o3Lockup, mark: o3Mark, header: o3Header, pal: P3,
    bgLight: P3.paper, bgDark: P3.ink, note: 'ink, white and signal orange. Condensed italic caps, a chain of seam stitches as the vintage touch.' },
};

/* fill in the stitches once a path can be measured */
window.STD_LOGOS.stitch = function (root) {
  root.querySelectorAll('path[data-stitch]').forEach(function (p) {
    var a = p.getAttribute('data-stitch').split(','), gap = +a[0], size = +a[1], col = a[2];
    var L = p.getTotalLength(), out = '';
    for (var s = gap / 2; s < L; s += gap) {
      var q = p.getPointAtLength(s), q2 = p.getPointAtLength(Math.min(L, s + 1));
      var ang = Math.atan2(q2.y - q.y, q2.x - q.x), nx = -Math.sin(ang), ny = Math.cos(ang), tx = Math.cos(ang), ty = Math.sin(ang);
      /* two rows of short ticks, apart from the seam and from each other:
         how stitches are drawn on a ball, so they never read as arrows */
      [-1, 1].forEach(function (side) {
        var ax = q.x + nx * side * size * 0.42, ay = q.y + ny * side * size * 0.42;
        var bx = q.x + nx * side * size * 1.15 - tx * size * 0.32, by = q.y + ny * side * size * 1.15 - ty * size * 0.32;
        out += 'M ' + ax.toFixed(1) + ' ' + ay.toFixed(1) + ' L ' + bx.toFixed(1) + ' ' + by.toFixed(1) + ' ';
      });
    }
    var el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', out); el.setAttribute('stroke', col); el.setAttribute('stroke-width', Math.max(2.5, size * 0.36));
    el.setAttribute('stroke-linecap', 'round'); el.setAttribute('fill', 'none');
    p.parentNode.insertBefore(el, p.nextSibling);
  });
};
})();
