/* BACKSTAGE: the band soundchecking behind Segue's front screen.
 *
 * The same four players as the show, in the same frames, moved by the same function (world.js's
 * bandPose), so the band on the menu can never drift from the band on the stage. Everything else here
 * is a few dozen rectangles: a treeline, the tour bus with the next real show's date on its sign, the
 * truss with its six pods, the deck, the rug, two amps and the yellow kit.
 *
 * Cheap on purpose. It draws into a small pixel buffer about twelve times a second, stops when it is
 * off screen or the tab is hidden, and draws one still frame when motion is reduced. The band's frames
 * are painted in a worker; until they land the deck is empty, and if they never do it stays that way.
 * It names no venue: the bus shows a date and how many days away it is, nothing else.
 */
import { bandPose, PLAYERS, bandFrames } from './world.js?v=3';

// A 3 by 5 pixel face for the bus's sign. Only what a date needs.
const GLYPH = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111101101101', N: '101111111111101', O: '010101101101010', P: '110101110100100',
  R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111',
  V: '101101101101010', W: '101101111111101', Y: '101101010010010', ' ': '000000000000000',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010',
  8: '010101010101010', 9: '010101011001110', '.': '000000000000010',
};

/* The band's frames, painted once per visit: the front screen re-renders when the tour dates land,
   and every render shares this one job. */
let framesJob = null;
function bandFramesOnce(){
  return framesJob || (framesJob = bandWorker().then(f => f || bandFrames()).catch(() => null));
}

function bandWorker(){
  return new Promise(res => {
    try {
      if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') return res(null);
      const w = new Worker(new URL('./world-worker.js?v=4', import.meta.url), { type: 'module' });
      const done = v => { clearTimeout(timer); w.terminate(); res(v); };
      const timer = setTimeout(() => done(null), 8000);
      w.onmessage = e => done(e.data && e.data.frames ? e.data.frames : null);
      w.onerror = () => done(null);
      w.postMessage({ id: 1, kind: 'band' });
    } catch (err) { res(null); }
  });
}

/* `sign` is the bus's text, already worked out by the page ("NOV 3", or "TONIGHT"), or null for no
   show on the books, which parks the bus dark. */
export function createBackstage(view, opts = {}){
  const reduce = !!opts.reduce;
  const out = view.getContext('2d');
  let buf = document.createElement('canvas'), g = buf.getContext('2d');
  let W = 4, H = 4, k = 1, frames = null, dead = false, raf = 0, last = 0, seen = true;
  const t0 = performance.now();

  function fit(){
    const host = view.parentElement || document.body;
    const dpr = window.devicePixelRatio || 1;
    const cw = host.clientWidth || 390, ch = view.clientHeight || 140;
    // About two and a half screen pixels to one of the band's on a phone, the chunk the show is drawn at;
    // a little chunkier on a wide screen, so the deck is not a postage stamp in the middle of it.
    k = Math.max(2, Math.round((cw >= 900 ? 4 : 2.6) * dpr));
    W = Math.ceil(cw * dpr / k); H = Math.ceil(ch * dpr / k);
    buf.width = W; buf.height = H;
    view.width = W * k; view.height = H * k;
    view.style.width = (W * k / dpr) + 'px';
    view.classList.add('on');
    draw(performance.now());
  }

  const rect = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); };
  function text(s, x, y, c){
    g.fillStyle = c;
    for (const ch of String(s).toUpperCase()){
      const gl = GLYPH[ch] || GLYPH[' '];
      for (let i = 0; i < 15; i++) if (gl[i] === '1') g.fillRect(x + i % 3, y + (i / 3 | 0), 1, 1);
      x += 4;
    }
  }

  function draw(now){
    const t = (now - t0) / 1000;
    g.clearRect(0, 0, W, H);
    const cx = W >> 1, deckW = Math.min(124, W - 12), dx = cx - (deckW >> 1);
    // The deck sits on the bottom edge; the truss hangs from the top of the frame when the frame is short.
    const floorY = H - 2, deckY = floorY - 30, trussY = Math.max(0, deckY - 30);
    // A lick now and then: the room wakes up for two seconds, then it is a soundcheck again.
    const lick = !reduce && (t % 9) > 6.8 && (t % 9) < 8.8;
    const energy = lick ? .7 : .22;

    // The treeline and the glow of the lot behind it.
    for (let x = 0; x < W; x += 6){
      const h = 7 + ((x * 37) % 5);
      rect('#13241d', x, deckY - 14 - h, 7, h + 14);
      rect('#1b3326', x + 1, deckY - 14 - h, 5, 2);
    }
    rect('#0d0a1c', 0, deckY - 2, W, H);

    // The bus, parked stage right, its sign lit with the next real show.
    // Only where there is room beside the deck: on a phone the countdown under the hero carries the date.
    if (W >= deckW + 60){
      const bx = Math.min(W - 50, dx + deckW + 6), by = Math.max(9, deckY - 22);
      rect('#e9e4d6', bx, by, 46, 4); rect('#9a2f5e', bx, by + 4, 46, 13); rect('#7a2248', bx + 44, by + 4, 2, 13);
      for (let i = 0; i < 6; i++) rect(opts.sign ? '#bfe3f0' : '#3a4a60', bx + 3 + i * 7, by + 6, 5, 5);
      rect('#f4cc2c', bx + 1, by + 15, 44, 2);
      rect('#15101f', bx + 6, by + 17, 6, 3); rect('#15101f', bx + 32, by + 17, 6, 3);
      if (opts.sign){
        const s = opts.sign.slice(0, 11), w = s.length * 4 + 3;
        rect('#1a0e08', bx + 23 - (w >> 1), by - 8, w, 7);
        text(s, bx + 25 - (w >> 1), by - 7, '#ffb347');
      }
    }

    // The truss and its six pods, chasing slowly, faster on a lick.
    rect('#8890a8', dx, trussY, deckW, 2); rect('#5a6078', dx, trussY + 2, deckW, 1);
    rect('#5a6078', dx, trussY, 2, 31); rect('#5a6078', dx + deckW - 2, trussY, 2, 31);
    rect('#221c34', dx + 2, trussY + 3, deckW - 4, 27);
    const pods = 6, gap = (deckW - 16) / (pods - 1);
    for (let i = 0; i < pods; i++){
      const px = Math.round(dx + 8 + i * gap), py = trussY + 8 + (i % 2) * 3;
      rect('#5a6078', px, trussY + 3, 1, 3);
      rect('#7078a0', px - 3, py, 7, 1); rect('#7078a0', px - 2, py + 1, 5, 1); rect('#7078a0', px - 1, py + 2, 3, 1);
      const on = Math.sin(t * (lick ? 7 : 1.6) - i * .9) > .2;
      rect(on ? (i % 2 ? '#5be0e6' : '#ff6fc1') : '#3a3654', px, py + 3, 1, 1);
    }

    // The deck: planks, the rug, two amps.
    rect('#8a5e3e', dx, deckY, deckW, 26);
    for (let y = deckY + 1; y < deckY + 26; y += 4) rect('#a8744c', dx, y, deckW, 1);
    rect('#6a4630', dx, deckY + 26, deckW, 2); rect('#2a1f34', dx, deckY + 28, deckW, 3);
    const rx = cx - 26;
    rect('#c0503c', rx, deckY + 12, 52, 12); rect('#f2c24a', rx + 2, deckY + 14, 48, 8);
    rect('#4a6a9a', rx + 6, deckY + 16, 40, 4); rect('#c0503c', rx + 14, deckY + 17, 24, 2);
    for (const ax of [dx + 4, dx + deckW - 16]){
      rect('#403a48', ax, deckY + 5, 12, 3); rect('#262230', ax, deckY + 8, 12, 10);
      rect('#8a8498', ax + 2, deckY + 10, 8, 6); rect('#111016', ax + 3, deckY + 11, 6, 4);
    }

    // The band. Back to front: the drummer on the riser behind his kit, then keys, guitar, bass.
    if (frames){
      const mood = { energy, mode: 0, bow: false };
      const spot = { drums: [cx + 34, deckY + 10], keys: [cx - 44, deckY + 14], guitar: [cx - 12, deckY + 21], bass: [cx + 12, deckY + 22] };
      const order = ['drums', 'keys', 'guitar', 'bass'];
      for (const role of order){
        const i = PLAYERS.findIndex(p => p[0] === role);
        const { img, bob } = bandPose(frames, i, t, mood);
        const [px, py] = spot[role];
        g.drawImage(img, px - 17, py - 38 - bob);
        if (role === 'drums'){
          // The kit in front of him, in its yellow shells.
          for (const [ox, oy, r] of [[0, 2, 5], [-8, 3, 3], [8, 3, 3]]){
            g.fillStyle = '#d8a62a'; g.beginPath(); g.ellipse(px + ox, py + oy, r, r * .6, 0, 0, 7); g.fill();
            rect('#f4d46a', px + ox - r + 1, py + oy - 1, r * 2 - 2, 1);
          }
          const hit = Math.sin(t * (lick ? 11 : 4)) > .6;
          rect(hit ? '#fff6d0' : '#e8e0c4', px - 13, py - 6, 6, 1); rect('#e8e0c4', px + 8, py - 7, 7, 1);
        }
      }
    }
    // A warm work light over the deck: it is a soundcheck, not the show.
    g.fillStyle = lick ? 'rgba(255,120,200,.10)' : 'rgba(255,220,160,.06)';
    g.fillRect(dx, trussY, deckW, deckY + 28 - trussY);

    out.imageSmoothingEnabled = false;
    out.clearRect(0, 0, view.width, view.height);
    out.drawImage(buf, 0, 0, W * k, H * k);
  }

  function frame(now){
    if (dead) return;
    if (!view.isConnected){ destroy(); return; }
    raf = requestAnimationFrame(frame);
    // Twelve frames a second is plenty for a soundcheck, and a fifth of the cost of sixty.
    if (!seen || document.hidden || now - last < 80) return;
    last = now;
    draw(now);
  }

  let io = null;
  if (typeof IntersectionObserver === 'function'){
    io = new IntersectionObserver(es => { seen = es.some(e => e.isIntersecting); });
    io.observe(view);
  }
  function destroy(){
    dead = true; cancelAnimationFrame(raf);
    if (io) io.disconnect();
    window.removeEventListener('resize', fit);
  }

  window.addEventListener('resize', fit);
  fit();
  // The band arrives from the worker; a browser without one paints them here, after the first frame.
  const ready = bandFramesOnce().then(f => {
    if (dead || !f) return;
    frames = f;
    draw(performance.now());
  }).catch(() => {});
  if (!reduce) raf = requestAnimationFrame(frame);
  return { destroy, ready };
}
