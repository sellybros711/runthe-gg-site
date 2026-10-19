/* Composes a trailer: gameplay footage inside a drawn phone and laptop, on a moving background, with
   title cards, cut to a timeline. One spec, any number of frame shapes (5:4 for X, 9:16 for Reels).

   Everything is one ffmpeg filter graph, so a device's screen and its body always move together:
     the background drifts;
     each device is its screen (the footage, cut scene by scene) under its drawing (the PNG from
     assets.mjs, its screen cut out), scaled to the layout, then slid along eased keyframes;
     each title card fades and rises in and fades out over its scene.

   A spec (see putt-trailer.mjs) gives the frame shapes and where things sit in each, the cards, and the
   scenes: how long each lasts, its card, and what each screen plays (clip, from, speed). */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FPS = 30;
const r2 = (n) => Math.round(n * 1000) / 1000;
export const probe = (f) => +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout.toString().trim();

/* A position that eases between keyframes [[t, v], ...]: a sum of smoothsteps, one a move. */
function eased(keys) {
  let e = String(keys[0][1]);
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
    if (v1 === v0) continue;
    const k = `clip((t-${r2(t0)})/${r2(Math.max(0.001, t1 - t0))},0,1)`;
    e += `+(${r2(v1 - v0)})*(${k})*(${k})*(3-2*(${k}))`;
  }
  return e;
}

export function compose({ spec, art, format, foot, out, music }) {
  const F = spec.formats[format], { W, H } = F;
  const T = spec.scenes.reduce((a, s) => a + s.dur, 0);
  const inputs = [], filters = [];
  const add = (args) => { inputs.push(...args); return inputs.filter((a) => a === '-i').length - 1; };
  const still = (file) => add(['-loop', '1', '-framerate', String(FPS), '-t', String(T), '-i', file]);

  // the background, drifting slowly across its extra 12%
  const bg = art.bg[format], bgi = still(bg.file);
  const dx = bg.w - W, dy = bg.h - H;
  filters.push(`[${bgi}:v]crop=${W}:${H}:x='${dx / 2}+${dx / 2 - 2}*sin(t*0.22)':y='${dy / 2}+${dy / 2 - 2}*cos(t*0.17)',format=rgba[bg0]`);
  /* A scene's BACKDROP: footage filling the whole frame instead of the green (the intro's "New in Run The
     Tour" over the Pro Tour round), dimmed so the card reads over it. It is <clip>-<format>.mp4, filmed at
     the frame's own shape. */
  let bgl = 'bg0', ts = 0;
  spec.scenes.forEach((s, k) => {
    if (s.backdrop) {
      const B = s.backdrop, ii = add(['-i', path.join(foot, `${B.clip}-${format}.mp4`)]), sp = B.speed || 1, from = typeof B.from === 'object' ? B.from[format] : B.from;
      filters.push(`[${ii}:v]trim=start=${r2(from || 0)}:duration=${r2(s.dur * sp + 0.1)},setpts=(PTS-STARTPTS)/${sp},fps=${FPS},`
        + `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=rgba,`
        + `colorchannelmixer=rr=${B.dim ?? 0.5}:gg=${B.dim ?? 0.5}:bb=${B.dim ?? 0.5},setpts=PTS+${r2(ts)}/TB[bd${k}]`,
        `[${bgl}][bd${k}]overlay=0:0:enable='between(t,${r2(ts)},${r2(ts + s.dur)})':eof_action=pass[bgb${k}]`);
      bgl = `bgb${k}`;
    }
    ts += s.dur;
  });
  filters.push(`[${bgl}]null[bg]`);

  // each device: its screen, scene by scene, under its drawing
  const devs = {};
  for (const d of ['laptop', 'phone']) {
    const A = art[d], segs = [];
    let at = 0;
    for (const s of spec.scenes) {
      const list = s[d] && s[d].length ? s[d] : [{ clip: spec.scenes.find((x) => x[d] && x[d].length)[d][0].clip, from: 0, speed: 1, dur: s.dur }];
      let used = 0;
      list.forEach((g, i) => {
        const dur = i === list.length - 1 ? s.dur - used : g.dur; used += dur;
        const file = path.join(foot, `${g.clip}-${d}.mp4`);
        const ii = add(['-i', file]);
        // `to` is where in the clip the segment ends (negative counts from its end); the speed is what fits
        const len = probe(file), to = g.to == null ? null : (g.to < 0 ? len + g.to : g.to);
        const sp = to != null ? Math.max(0.25, (to - (g.from || 0)) / dur) : (g.speed || 1);
        filters.push(`[${ii}:v]trim=start=${r2(g.from || 0)}:duration=${r2(dur * sp + 0.1)},setpts=(PTS-STARTPTS)/${sp},fps=${FPS},scale=${A.hole.w}:${A.hole.h},setsar=1,`
          + `tpad=stop_mode=clone:stop_duration=${r2(dur + 0.5)},trim=duration=${r2(dur)},setpts=PTS-STARTPTS,format=yuv420p[${d}${segs.length}]`);
        segs.push(`[${d}${segs.length}]`);
      });
      at += s.dur;
    }
    filters.push(`${segs.join('')}concat=n=${segs.length}:v=1:a=0,format=rgba[${d}scr]`);
    const pi = still(A.file);
    // the layout gives the SCREEN: its width (a laptop) or height (a phone), its centre line and its top
    const L = F[d], k = L.screenW ? L.screenW / A.hole.w : L.screenH / A.hole.h;
    const sw = Math.round(A.w * k), sh = Math.round(A.h * k);
    L.px = L.keys.map(([t, cx, top]) => [t, Math.round(cx - (A.hole.x + A.hole.w / 2) * k), Math.round(top - A.hole.y * k)]);
    // the drawing, then the game over its screen; a phone's screen has round bottom corners, so the
    // footage is masked to them (a still mask, made once)
    let scr = `${d}scr`;
    if (A.radius) {
      const mask = path.join(path.dirname(out), `mask-${d}.png`), R = A.radius, Wm = A.hole.w, Hm = A.hole.h;
      spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=white:s=${Wm}x${Hm},format=gray`, '-vf',
        `geq=lum='255*if(gt(Y,${Hm - R}),clip(${R}+0.5-hypot(if(lt(X,${R}),${R}-X,if(gt(X,${Wm - R}),X-${Wm - R},0)),Y-${Hm - R}),0,1),1)'`, '-frames:v', '1', mask]);
      const mi = still(mask);
      filters.push(`[${mi}:v]format=gray[${d}mk]`, `[${d}scr][${d}mk]alphamerge[${d}scrm]`);
      scr = `${d}scrm`;
    }
    filters.push(`[${pi}:v]format=rgba[${d}pic]`,
      `[${d}pic][${scr}]overlay=${A.hole.x}:${A.hole.y}:shortest=1,scale=${sw}:${sh}:flags=lanczos[${d}]`);
    devs[d] = { sw, sh };
  }

  // lay out: background, laptop, phone (in front)
  let last = 'bg';
  for (const d of ['laptop', 'phone']) {
    const K = F[d].px;   // [[t, x, y], ...] of the drawing's corner, from the screen's keys
    const xe = eased(K.map((k) => [k[0], k[1]])), ye = eased(K.map((k) => [k[0], k[2]]));
    filters.push(`[${last}][${d}]overlay=x='${xe}':y='${ye}':eval=frame:shortest=1[l${d}]`);
    last = 'l' + d;
  }

  // the cards
  let t0 = 0, n = 0;
  for (const s of spec.scenes) {
    if (s.card) {
      const C = art.cards[format + ':' + s.card], ci = still(C.file);
      const a = r2(t0 + (s.cardIn || 0.15)), b = r2(t0 + s.dur - (s.cardOut ?? 0.1));
      const x = Math.round((W - C.w) / 2), place = (F.cardAt && F.cardAt[s.card]) || F.cardY;
      const y = place === 'mid' ? Math.round((H - C.h) / 2) : place;
      // a card rises and fades in; a FLASH card is simply there when the white flash clears
      const fin = s.flash ? 0.04 : 0.35, rise = s.flash ? 0 : 40;
      filters.push(`[${ci}:v]format=rgba,fade=t=in:st=${a}:d=${fin}:alpha=1,fade=t=out:st=${r2(b - 0.3)}:d=0.3:alpha=1[cd${n}]`,
        `[${last}][cd${n}]overlay=x=${x}:y='${y}+${rise}*(1-clip((t-${a})/0.45,0,1))*(1-clip((t-${a})/0.45,0,1))':enable='between(t,${a},${b})':eval=frame:shortest=1[lc${n}]`);
      last = 'lc' + n; n++;
      if (s.flash) {
        // the white flash the scene opens on
        filters.push(`color=c=white:s=${W}x${H}:r=${FPS}:d=0.45,format=rgba,fade=t=out:st=0.05:d=0.4:alpha=1,setpts=PTS+${r2(t0)}/TB[fl${n}]`,
          `[${last}][fl${n}]overlay=0:0:enable='between(t,${r2(t0)},${r2(t0 + 0.45)})':eof_action=pass[lf${n}]`);
        last = 'lf' + n;
      }
      t0 += s.dur; continue;
    }
    t0 += s.dur;
  }

  // a fade from and to black, and the picture out
  filters.push(`[${last}]fade=t=in:st=0:d=0.4,fade=t=out:st=${r2(T - 0.6)}:d=0.6,format=yuv420p[v]`);
  const ai = music ? add(['-i', music]) : add(['-f', 'lavfi', '-t', String(T), '-i', 'anullsrc=r=44100:cl=stereo']);
  const graph = path.join(path.dirname(out), `graph-${format}.txt`);
  fs.writeFileSync(graph, filters.join(';\n'));
  const res = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex_script', graph, '-map', '[v]', '-map', `${ai}:a`,
    '-t', String(T), '-r', String(FPS), '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', ...(music ? ['-af', `afade=t=out:st=${r2(T - 1.2)}:d=1.2`] : []), '-movflags', '+faststart', out], { stdio: 'inherit' });
  if (res.status !== 0) throw new Error('ffmpeg failed for ' + format);
  return { out, T };
}
