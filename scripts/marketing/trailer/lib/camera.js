/* THE CAMERA, for a trailer page: it frames the part of the game a caption is about, read off the
   recording's own tracking (record.mjs writes <clip>.track.json beside the clip: where each part the
   shot names sat on screen, every frame, and every tap).

     await CAM.load({ desk: '/foot/desk.track.json', ... })
     CAM.focus('desk', sec, ['options'], { pad: 40, min: 560 })     -> { cx, cy, cw } in clip pixels
     CAM.path('desk', sec, l, [[0, ['brief']], [1.2, ['opt1']], [2.4, ['rule']]])   eases between shots

   cw is the crop width of a 9:16 frame (its height is cw * 16 / 9), the shape every take is filmed
   in, so the same answer serves the 9:16 cut and the 5:4 cut's phone panel. A part that is not on
   screen at that moment falls back to the whole frame rather than guessing. */
(function () {
  const T = {}, SRC = { w: 1080, h: 1920 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (x) => { x = clamp(x, 0, 1); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  async function load(map) {
    await Promise.all(Object.entries(map).map(async ([k, url]) => { try { T[k] = await (await fetch(url)).json(); } catch (e) { T[k] = null; } }));
  }
  // the union of the named parts on one frame, in clip pixels, or null
  function box(clip, n, names) {
    const t = T[clip]; if (!t || !t.frames.length) return null;
    const f = t.frames[clamp(n, 0, t.frames.length - 1)]; if (!f) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of names) { const r = f[k]; if (!r) continue; const s = t.scale;
      x0 = Math.min(x0, r[0] * s); y0 = Math.min(y0, r[1] * s); x1 = Math.max(x1, (r[0] + r[2]) * s); y1 = Math.max(y1, (r[1] + r[3]) * s); }
    return x0 === Infinity ? null : [x0, y0, x1, y1];
  }
  // a part moves with the page (a scroll, a list growing): average a few frames so the camera glides
  /* `w` fixes the crop width (a real zoom: a phone's cards span the whole screen, so fitting a card is
     no zoom at all), `ax` anchors it on the part's left edge, centre or right edge, and `at` is where the
     part's middle sits down the frame (CAM.at, set by the page: above a caption band). */
  function focus(clip, sec, names, { pad = 40, min = 520, max = 1080, smooth = 5, dy = 0, w = 0, ax = 'center', at = null, top = false } = {}) {
    if (CAM.fit) { w = 0; ax = 'center'; pad = Math.min(pad, 20); }
    const t = T[clip], fps = t ? t.fps : 30, n = Math.round(sec * fps);
    let sx = 0, sy = 0, sw = 0, c = 0;
    for (let i = -smooth; i <= smooth; i++) {
      const b = box(clip, n + i, names); if (!b) continue;
      const bw = b[2] - b[0] + 2 * pad, bh = b[3] - b[1] + 2 * pad, cw = w || Math.max(bw, bh * 9 / 16);
      sw += cw;
      sx += ax === 'left' ? b[0] - pad + cw / 2 : ax === 'right' ? b[2] + pad - cw / 2 : (b[0] + b[2]) / 2;
      sy += top ? b[1] - pad : (b[1] + b[3]) / 2; c++;
    }
    if (!c) return { cx: SRC.w / 2, cy: SRC.h / 2, cw: SRC.w };
    const cw = clamp(sw / c, min, max), ch = cw * 16 / 9, frac = at == null ? CAM.at : at;
    // put the part's middle (or its top edge) at `frac` of the frame's height
    return { cx: sx / c, cy: sy / c + (0.5 - frac) * ch + dy, cw };
  }
  /* A move: shots at local times, each easing into the next over `glide` seconds. A shot is a list of
     part names, or { names, pad, min, dy } for its own framing. */
  function path(clip, sec, l, shots, glide = 0.45) {
    const at = (s) => (Array.isArray(s) ? { names: s } : s);
    let i = 0; while (i + 1 < shots.length && l >= shots[i + 1][0]) i++;
    const a = at(shots[i][1]), A = focus(clip, sec, a.names, a);
    if (i === 0 && shots.length === 1) return A;
    const p = i === 0 ? 1 : ease((l - shots[i][0]) / glide);
    if (p >= 1 || i === 0) return A;
    const b = at(shots[i - 1][1]), B = focus(clip, sec, b.names, b);
    return { cx: B.cx + (A.cx - B.cx) * p, cy: B.cy + (A.cy - B.cy) * p, cw: B.cw + (A.cw - B.cw) * p };
  }
  // the taps the take made, for a caption timed to the moment of a tap
  const taps = (clip) => (T[clip] ? T[clip].taps : []);
  window.CAM = { load, focus, path, taps, box, at: 0.5, fit: false };
})();
