/* Shut The Door: the result card as an image. window.STD_CARD.
 *
 *   STD_CARD.render(card, size)  -> Promise<canvas>
 *   STD_CARD.blob(canvas)        -> Promise<Blob> (image/png)
 *   STD_CARD.SIZES               tall 1080x1350 (a feed post), wide 1200x630 (a link card)
 *
 * `card` is built by ui.js from the result and nothing else:
 *   {outcome, strip, pitches, percentile, label ('#12' or 'preview'), title,
 *    vsReal, vsHead, vsWhy, pitchedLike}
 * Every word and number on the image is one of those, the contract's outcome
 * label, or the contract's SHARE_URL. Nothing is invented to fill a space: a
 * missing value leaves its block out.
 *
 * Type is the game's own Barlow Condensed (fonts/, declared in style.css) and
 * the marks are brand/mark.svg and brand/wordmark-dark.svg. Drawing waits for
 * all three Barlow faces to load, so a share never goes out in a fallback font.
 */
(function () {
'use strict';
var C = window.STD_CONTRACT;

var SIZES = { tall: { w: 1080, h: 1350 }, wide: { w: 1200, h: 630 } };
var FAMILY = '"Barlow Condensed"';
var INK = '#0b0f17', INK_2 = '#1a2130', WHITE = '#f4f5f7', DIM = 'rgba(244, 245, 247, .66)', SIGNAL = '#ff4f1f', DATA = '#2b59ff';
var BAND = { green: '#22a45d', yellow: '#f2b827', orange: '#f08424', red: '#e5383b' };
var OUT_COLOR = { door_shut: '#ffffff', tie_held: '#f2b827', doors_open: '#f08424', walk_off: '#e5383b' };

/* ---- what has to be in before the first stroke ---- */

var fontsP = null;
function fonts() {
  if (fontsP) return fontsP;
  var F = document.fonts;
  if (!F || !F.load) return (fontsP = Promise.resolve());
  fontsP = Promise.all([
    F.load('600 40px ' + FAMILY),
    F.load('italic 800 40px ' + FAMILY),
    F.load('italic 900 40px ' + FAMILY),
  ]).then(function () { return F.ready; }).catch(function () {});
  return fontsP;
}

/* An SVG drawn to a canvas needs a size of its own (Firefox draws nothing
   without one), so each mark is read as text and given its viewBox's size. */
var imgs = {};
function svgImage(src) {
  if (imgs[src]) return imgs[src];
  imgs[src] = fetch(src).then(function (r) { if (!r.ok) throw new Error(src); return r.text(); }).then(function (t) {
    var vb = (t.match(/viewBox="([^"]+)"/) || [])[1];
    var p = vb ? vb.split(/[\s,]+/).map(Number) : [0, 0, 512, 512];
    t = t.replace('<svg ', '<svg width="' + p[2] + '" height="' + p[3] + '" ');
    var url = URL.createObjectURL(new Blob([t], { type: 'image/svg+xml' }));
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res({ img: im, w: p[2], h: p[3] }); };
      im.onerror = rej;
      im.src = url;
    });
  }).catch(function () { delete imgs[src]; return null; });
  return imgs[src];
}

/* ---- drawing helpers ---- */

function font(ctx, weight, px, italic) { ctx.font = (italic ? 'italic ' : '') + weight + ' ' + px + 'px ' + FAMILY; }
function spacing(ctx, em, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = (em * px).toFixed(1) + 'px'; }
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/* the largest size up to max at which the text fits the width */
function fit(ctx, text, weight, max, width, italic, min) {
  var px = max;
  for (;;) { font(ctx, weight, px, italic); if (ctx.measureText(text).width <= width || px <= (min || 20)) return px; px -= 2; }
}
function clip(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  var t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > width) t = t.slice(0, -1);
  return t.replace(/[\s,]+$/, '') + '…';
}
/* the words wrapped to the width, at most `lines` lines */
function wrap(ctx, text, width, lines) {
  var words = String(text).split(/\s+/), out = [], cur = '';
  words.forEach(function (w) {
    var t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > width && cur) { out.push(cur); cur = w; } else cur = t;
  });
  if (cur) out.push(cur);
  if (out.length > lines) { out = out.slice(0, lines); out[lines - 1] = clip(ctx, out[lines - 1] + ' …', width); }
  return out;
}

function background(ctx, W, H) {
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, INK_2); g.addColorStop(1, INK);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255, 255, 255, .025)';
  for (var x = 0; x < W; x += 30) ctx.fillRect(x, 0, 1.5, H);
}

/* the stitch line, as the page's .seam draws it */
function seam(ctx, x, y, w, s) {
  ctx.save();
  ctx.strokeStyle = SIGNAL; ctx.lineCap = 'round';
  ctx.globalAlpha = .45; ctx.lineWidth = 1.6 * s;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
  ctx.globalAlpha = 1; ctx.lineWidth = 2.4 * s;
  for (var i = x + 6 * s; i < x + w; i += 15 * s) {
    ctx.beginPath(); ctx.moveTo(i, y - 3 * s); ctx.lineTo(i - 2.6 * s, y - 7.6 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, y + 3 * s); ctx.lineTo(i - 2.6 * s, y + 7.6 * s); ctx.stroke();
  }
  ctx.restore();
}

function brand(ctx, marks, x, y, h) {
  if (marks.mark) ctx.drawImage(marks.mark.img, x, y, h, h);
  if (marks.word) {
    var wh = h * .5, ww = wh * marks.word.w / marks.word.h;
    ctx.drawImage(marks.word.img, x + h + h * .26, y + (h - wh) / 2, ww, wh);
  }
}

/* a pill at the top right: '#12' or 'preview' */
function pill(ctx, text, right, y, px) {
  font(ctx, 800, px, true); spacing(ctx, .08, px);
  var t = String(text).toUpperCase(), w = ctx.measureText(t).width + px * 1.1, h = px * 1.5;
  ctx.fillStyle = SIGNAL; rr(ctx, right - w, y, w, h, px * .32); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText(t, right - w / 2, y + h / 2 + px * .04);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; spacing(ctx, 0, px);
}

function label(ctx, text, x, y, px, color, width) {
  font(ctx, 600, px); spacing(ctx, .12, px);
  ctx.fillStyle = color || DIM;
  ctx.fillText(width ? clip(ctx, String(text).toUpperCase(), width) : String(text).toUpperCase(), x, y);
  spacing(ctx, 0, px);
}

/* DOOR SHUT. in its colour, the full stop in signal, as large as the width allows */
function outcome(ctx, c, x, y, width, max) {
  var word = (C.OUTCOME_LABEL[c.outcome] || '').toUpperCase();
  var px = fit(ctx, word + '.', 900, max, width, true, 40);
  ctx.fillStyle = OUT_COLOR[c.outcome] || '#ffffff';
  ctx.fillText(word, x, y);
  var w = ctx.measureText(word).width;
  ctx.fillStyle = SIGNAL; ctx.fillText('.', x + w, y);
  return px;
}

/* a fact tile: a big number, a small word under it */
function fact(ctx, x, y, w, h, big, sup, small, s) {
  ctx.fillStyle = 'rgba(255, 255, 255, .07)'; rr(ctx, x, y, w, h, 18 * s); ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, .1)'; ctx.lineWidth = 1.5 * s; ctx.stroke();
  var px = 64 * s;
  font(ctx, 900, px, true); ctx.fillStyle = '#ffffff';
  var bx = x + 22 * s, by = y + 22 * s + px * .78;
  ctx.fillText(big, bx, by);
  if (sup) { var bw = ctx.measureText(big).width; font(ctx, 900, px * .46, true); ctx.fillText(sup, bx + bw + 3 * s, by - px * .42); }
  label(ctx, small, bx, y + h - 20 * s, 21 * s, DIM);
}

function ordSuffix(n) { var t = n % 100; if (t >= 11 && t <= 13) return 'th'; return ['th', 'st', 'nd', 'rd'][n % 10] || 'th'; }

/* the graded strip, numbered like the result screen's, sized to fit its box */
function strip(ctx, list, x, y, w, maxH, s) {
  var n = list.length, gap = 12 * s, size = 72 * s, per, rows;
  for (;;) {
    per = Math.max(1, Math.floor((w + gap) / (size + gap)));
    rows = Math.ceil(n / per);
    if (rows * (size + gap) - gap <= maxH || size <= 14 * s) break;
    size -= 4 * s; gap = Math.max(5 * s, size * .17);
  }
  list.forEach(function (b, i) {
    var cx = x + (i % per) * (size + gap), cy = y + Math.floor(i / per) * (size + gap);
    ctx.fillStyle = BAND[b] || 'rgba(255, 255, 255, .15)';
    rr(ctx, cx, cy, size, size, size * .22); ctx.fill();
    if (size >= 40 * s) {
      font(ctx, 800, size * .42, true);
      ctx.fillStyle = b === 'yellow' ? '#2a2000' : '#ffffff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), cx + size / 2, cy + size / 2 + size * .03);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  });
  return rows * (size + gap) - gap;
}

/* the verdict's height: its label, its headline and up to two lines of why, padded */
function verdictHeight(ctx, c, w, s) {
  var px = 22 * s, iw = w - 60 * s;
  var hp = fit(ctx, String(c.vsHead).toUpperCase(), 900, 64 * s, iw, true, 30 * s);
  var h = 26 * s + px * 1.3 + hp * .82 + 30 * s;
  if (c.vsWhy) { var wp = 27 * s; font(ctx, 600, wp); h += 14 * s + wp + (wrap(ctx, c.vsWhy, iw, 2).length - 1) * wp * 1.18 + 4 * s; }
  return h;
}

/* you vs the real game: signal when you rewrote history, data blue when you matched it, ink when history did better */
function verdict(ctx, c, x, y, w, h, s) {
  if (c.vsReal === 'beat' || c.vsReal === 'matched') {
    var g = ctx.createLinearGradient(x, y, x + w, y + h);
    if (c.vsReal === 'beat') { g.addColorStop(0, '#ff7247'); g.addColorStop(.45, SIGNAL); g.addColorStop(1, '#d9400f'); }
    else { g.addColorStop(0, '#5b82ff'); g.addColorStop(.5, DATA); g.addColorStop(1, '#1b3fc4'); }
    ctx.fillStyle = g;
  } else ctx.fillStyle = '#222b3e';
  rr(ctx, x, y, w, h, 26 * s); ctx.fill();
  if (c.vsReal === 'lost') {
    ctx.save(); rr(ctx, x, y, w, h, 26 * s); ctx.clip();
    ctx.fillStyle = BAND.red; ctx.fillRect(x, y, 8 * s, h); ctx.restore();
  }
  var px = 22 * s, ix = x + 30 * s, iw = w - 60 * s;
  label(ctx, c.vsLabel, ix, y + 26 * s + px * .8, px, 'rgba(255, 255, 255, .85)', iw);
  var hp = fit(ctx, String(c.vsHead).toUpperCase(), 900, 64 * s, iw, true, 30 * s);
  ctx.fillStyle = c.vsReal === 'lost' ? '#ff8a8c' : '#ffffff';
  ctx.fillText(String(c.vsHead).toUpperCase(), ix, y + 26 * s + px * 1.3 + hp * .82);
  if (c.vsWhy) {
    var wp = 27 * s;
    font(ctx, 600, wp); ctx.fillStyle = 'rgba(255, 255, 255, .92)';
    var lines = wrap(ctx, c.vsWhy, iw, 2), ly = y + 26 * s + px * 1.3 + hp * .82 + 14 * s + wp;
    lines.forEach(function (t, i) { ctx.fillText(t, ix, ly + i * wp * 1.18); });
  }
}

function footer(ctx, W, y, pad, s, marks) {
  ctx.fillStyle = 'rgba(255, 255, 255, .14)'; ctx.fillRect(pad, y - 34 * s, W - pad * 2, 1.5 * s);
  font(ctx, 600, 34 * s); spacing(ctx, .04, 34 * s);
  ctx.fillStyle = '#ffffff'; ctx.fillText(C.SHARE_URL, pad, y + 6 * s);
  spacing(ctx, 0, 34 * s);
  if (marks.mark) ctx.drawImage(marks.mark.img, W - pad - 44 * s, y - 24 * s, 44 * s, 44 * s);
}

/* ---- the two layouts ---- */

function drawTall(ctx, c, marks) {
  var W = 1080, H = 1350, P = 84, s = 1, iw = W - P * 2, y;
  background(ctx, W, H);
  brand(ctx, marks, P, 72, 84);
  if (c.label) pill(ctx, c.label, W - P, 88, 34);
  y = 274;
  label(ctx, ['final', c.title].filter(Boolean).join(' · '), P, y, 30, DIM, iw);
  var op = outcome(ctx, c, P - 4, y + 176, iw, 210);
  y += 176 + 8 + Math.max(0, (210 - op) * .1);
  seam(ctx, P, y + 26, iw * .62, 1.9);
  y += 66;
  var fw = (iw - 20) / 2, fh = 150;
  fact(ctx, P, y, fw, fh, String(c.pitches), '', c.pitches === 1 ? 'pitch' : 'pitches', 1.25);
  if (c.percentile != null) { var p = Math.round(c.percentile); fact(ctx, P + fw + 20, y, fw, fh, String(p), ordSuffix(p), 'percentile of closers', 1.25); }
  y += fh + 52;
  label(ctx, 'your calls, graded', P, y, 26, 'rgba(244, 245, 247, .9)');
  y += 26;
  var sh = strip(ctx, c.strip || [], P, y, iw, 250, 1);
  y += sh + 44;
  if (c.vsHead) {
    var vh = verdictHeight(ctx, c, iw, 1.15);
    verdict(ctx, c, P, y, iw, vh, 1.15);
    y += vh + 36;
  }
  if (c.pitchedLike && y < H - 190) {
    label(ctx, 'pitched like', P, y + 20, 24, DIM);
    font(ctx, 900, 44, true); ctx.fillStyle = '#ffffff';
    ctx.fillText(clip(ctx, String(c.pitchedLike).toUpperCase(), iw - 170), P + 160, y + 24);
  }
  footer(ctx, W, H - 66, P, 1, marks);
}

function drawWide(ctx, c, marks) {
  var W = 1200, H = 630, P = 56, s = .74, lw = 560, rx = P + lw + 40, rw = W - P - rx, y;
  background(ctx, W, H);
  brand(ctx, marks, P, 46, 60);
  if (c.label) pill(ctx, c.label, W - P, 56, 26);
  y = 164;
  label(ctx, ['final', c.title].filter(Boolean).join(' · '), P, y, 22, DIM, lw);
  outcome(ctx, c, P - 3, y + 118, lw, 150);
  seam(ctx, P, y + 150, lw * .62, 1.5);
  var fy = y + 182, fw = (lw - 16) / 2, fh = 120;
  fact(ctx, P, fy, fw, fh, String(c.pitches), '', c.pitches === 1 ? 'pitch' : 'pitches', 1);
  if (c.percentile != null) { var p = Math.round(c.percentile); fact(ctx, P + fw + 16, fy, fw, fh, String(p), ordSuffix(p), 'percentile of closers', 1); }
  y = 164 - 22;
  label(ctx, 'your calls, graded', rx, y + 22, 20, 'rgba(244, 245, 247, .9)');
  var sh = strip(ctx, c.strip || [], rx, y + 40, rw, 150, .8);
  if (c.vsHead) {
    var vy = Math.max(y + 40 + sh + 30, 300), vh = Math.min(verdictHeight(ctx, c, rw, .9), H - 96 - vy);
    verdict(ctx, c, rx, vy, rw, vh, .9);
  }
  footer(ctx, W, H - 40, P, s, marks);
}

function render(c, size) {
  var dim = SIZES[size] || SIZES.tall;
  return Promise.all([fonts(), svgImage('brand/mark.svg?v=1'), svgImage('brand/wordmark-dark.svg?v=1')]).then(function (got) {
    var marks = { mark: got[1], word: got[2] };
    var cv = document.createElement('canvas');
    cv.width = dim.w; cv.height = dim.h;
    var ctx = cv.getContext('2d');
    (size === 'wide' ? drawWide : drawTall)(ctx, c, marks);
    return cv;
  });
}

function blob(cv) {
  return new Promise(function (res, rej) {
    cv.toBlob(function (b) { if (b) res(b); else rej(new Error('no image')); }, 'image/png');
  });
}

window.STD_CARD = { API_VERSION: 1, SIZES: SIZES, render: render, blob: blob, fonts: fonts };
})();
