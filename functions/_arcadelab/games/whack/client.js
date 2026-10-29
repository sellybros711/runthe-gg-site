/* Whack the Right Player in the browser: the grid, the cards, the prompt,
 * and the report sheet. The rules are sim.js, which the server replays with
 * the same published slate. A tap counts on the frame it lands: the whole
 * cell is the target, not just the card. */
import { CONFIG as C } from './config.js';
import * as S from './sim.js';
import { bootGame } from '../../shared/app.js';

const COLS = 3, ROWS = 3;

function makeView(env) {
  const cv = env.canvas, cx = env.ctx;
  let W = 1, H = 1, st = null, grid = null, banner = '', bannerAt = -999, fx = [];

  function layout() {
    const top = 64, pad = 10;
    const cw = Math.min((W - pad * 2) / COLS, 200);
    const ch = Math.max(90, Math.min((H - top - pad - 30) / ROWS, cw * 1.05));
    const gx = (W - cw * COLS) / 2, gy = top + 14;
    grid = { cw, ch, gx, gy };
  }
  const cell = h => ({ x: grid.gx + (h % COLS) * grid.cw, y: grid.gy + Math.floor(h / COLS) * grid.ch });
  /* The nearest cell to a point anywhere on the grid: a forgiving target. */
  function holeAt(px, py) {
    if (px < grid.gx - 12 || px > grid.gx + grid.cw * COLS + 12 || py < grid.gy - 12 || py > grid.gy + grid.ch * ROWS + 12) return -1;
    const c = Math.max(0, Math.min(COLS - 1, Math.floor((px - grid.gx) / grid.cw)));
    const r = Math.max(0, Math.min(ROWS - 1, Math.floor((py - grid.gy) / grid.ch)));
    return r * COLS + c;
  }
  cv.addEventListener('pointerdown', e => {
    if (!env.playing()) return;
    e.preventDefault();
    const rc = cv.getBoundingClientRect(), h = holeAt(e.clientX - rc.left, e.clientY - rc.top);
    if (h >= 0) env.input({ h });
  });
  /* Keyboard: the number pad, or Q W E / A S D / Z X C. */
  const KEY = { Numpad7: 0, Numpad8: 1, Numpad9: 2, Numpad4: 3, Numpad5: 4, Numpad6: 5, Numpad1: 6, Numpad2: 7, Numpad3: 8,
    KeyQ: 0, KeyW: 1, KeyE: 2, KeyA: 3, KeyS: 4, KeyD: 5, KeyZ: 6, KeyX: 7, KeyC: 8 };
  addEventListener('keydown', e => { if (env.playing() && e.code in KEY && !e.repeat) { e.preventDefault(); env.input({ h: KEY[e.code] }); } });

  function initials(n) { const p = String(n).split(' ').filter(Boolean); return ((p[0] || '')[0] || '') + ((p[p.length - 1] || '')[0] || ''); }
  function fit(text, max, size, weight) {
    let s = size; cx.font = weight + ' ' + s + 'px Outfit, sans-serif';
    while (cx.measureText(text).width > max && s > 9) { s -= 1; cx.font = weight + ' ' + s + 'px Outfit, sans-serif'; }
    return s;
  }
  function card(c, f) {
    const { x, y } = cell(c.hole), { cw, ch } = grid;
    const rise = Math.min(1, (f - c.at) / C.RISE), fall = f > c.downAt ? Math.max(0, 1 - (f - c.downAt) / C.GRACE) : 1;
    const k = env.RM ? (f <= c.downAt ? 1 : 0) : Math.min(rise, fall);
    if (k <= 0) return;
    const w = cw - 12, hgt = (ch - 14) * k, cx0 = x + 6, cy0 = y + ch - 8 - hgt;
    cx.save(); cx.beginPath(); cx.rect(x, y, cw, ch - 8); cx.clip();
    cx.fillStyle = c.hit ? (c.ok ? '#22B07D' : '#E0533D') : '#ffffff';
    cx.strokeStyle = '#141414'; cx.lineWidth = 2;
    cx.beginPath(); cx.roundRect(cx0, cy0, w, ch - 14, 10); cx.fill(); cx.stroke();
    const ink = c.hit ? '#fff' : '#141414';
    const av = Math.min(34, (ch - 14) * 0.34);
    cx.fillStyle = c.hit ? 'rgba(255,255,255,.25)' : '#EFEDE8';
    cx.beginPath(); cx.arc(cx0 + w / 2, cy0 + 8 + av / 2, av / 2, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = ink; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = '800 ' + (av * 0.42) + 'px Outfit, sans-serif'; cx.fillText(initials(c.card.n), cx0 + w / 2, cy0 + 8 + av / 2);
    fit(c.card.n, w - 8, Math.min(16, cw * 0.13), '800');
    cx.fillText(c.card.n, cx0 + w / 2, cy0 + 14 + av + 10);
    if (c.card.pos) { cx.font = '600 ' + Math.min(12, cw * 0.1) + 'px DM Sans, sans-serif'; cx.fillStyle = c.hit ? '#fff' : '#5d5a54'; cx.fillText(c.card.pos, cx0 + w / 2, cy0 + 14 + av + 28); }
    cx.restore();
  }

  return {
    resize(w, h) { W = w; H = h; layout(); },
    snap: () => null,
    onStart(s) { st = s; fx = []; banner = s.slate.rounds[0].title; bannerAt = 0; env.host.set('idle'); env.hint(''); },
    onInput() {},
    onEvent(e, s) {
      if (e.type === 'roundStart') { banner = s.slate.rounds[e.round].title; bannerAt = s.frame; env.host.set('idle'); env.sound.play('launch'); }
      else if (e.type === 'hit') { fx.push({ hole: e.hole, txt: '+' + e.pts, col: '#22B07D', at: s.frame }); env.sound.play(e.mult > 1 ? 'good' : 'land'); env.haptics.buzz(10); if (e.combo >= 5) env.host.set('hype'); }
      else if (e.type === 'strike') { fx.push({ hole: e.hole, txt: 'STRIKE', col: '#E0533D', at: s.frame }); env.sound.play('foul'); env.haptics.buzz([40, 30, 40]); env.host.set('nervous'); env.pop('Strike ' + e.strikes + ' of ' + C.STRIKES, '#E0533D'); }
      else if (e.type === 'miss') { fx.push({ hole: e.hole, txt: 'missed', col: '#5d5a54', at: s.frame }); }
      else if (e.type === 'over') env.host.set(e.out ? 'disappointed' : 'celebrate');
    },
    onOver() {},
    /* The combo is drawn under the grid, where the eyes already are. */
    hud(s) {
      return '<div class="stat"><b>' + s.score + '</b><span>Score</span></div>' +
        '<div class="stat"><b>' + Math.min(C.ROUNDS, s.round + 1) + '/' + C.ROUNDS + '</b><span>Round</span></div>' +
        '<div class="stat"><b>' + '●'.repeat(s.strikes) + '○'.repeat(Math.max(0, C.STRIKES - s.strikes)) + '</b><span>Strikes</span></div>';
    },
    render() {
      cx.fillStyle = '#EFEDE8'; cx.fillRect(0, 0, W, H);
      if (!st) return;
      const f = st.frame;
      // the prompt: big during the intro, a strip during play
      const inIntro = f - st.round * S.ROUND_LEN < C.INTRO_FRAMES && !st.over;
      cx.fillStyle = '#141414'; cx.beginPath(); cx.roundRect(10, 8, W - 20, 48, 12); cx.fill();
      cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      fit(banner, W - 40, 18, '800'); cx.fillText(banner, W / 2, 32);
      // holes
      for (let h = 0; h < C.HOLES; h++) {
        const { x, y } = cell(h);
        cx.fillStyle = '#d9d5cc'; cx.beginPath(); cx.ellipse(x + grid.cw / 2, y + grid.ch - 8, grid.cw / 2 - 6, 7, 0, 0, Math.PI * 2); cx.fill();
      }
      for (const c of st.live) card(c, f);
      if (st.combo >= C.COMBO_STEP) {
        cx.fillStyle = '#22B07D'; cx.textAlign = 'center'; cx.font = '800 20px Outfit, sans-serif';
        cx.fillText('Combo x' + S.mult(st.combo) + '  (' + st.combo + ' in a row)', W / 2, grid.gy + grid.ch * ROWS + 22);
      }
      // hit and strike labels rise from the hole
      fx = fx.filter(x => f - x.at < 40);
      for (const x of fx) {
        const { x: X, y: Y } = cell(x.hole), t = (f - x.at) / 40;
        cx.globalAlpha = 1 - t; cx.fillStyle = x.col; cx.font = '800 18px Outfit, sans-serif'; cx.textAlign = 'center';
        cx.fillText(x.txt, X + grid.cw / 2, Y + grid.ch / 2 - (env.RM ? 0 : t * 24)); cx.globalAlpha = 1;
      }
      if (inIntro) {
        cx.fillStyle = 'rgba(239,237,232,.92)'; cx.fillRect(0, 60, W, H - 60);
        cx.fillStyle = '#141414'; cx.textAlign = 'center';
        cx.font = '700 15px DM Sans, sans-serif'; cx.fillText('Round ' + (st.round + 1) + ' of ' + C.ROUNDS, W / 2, H * 0.4);
        fit(banner, W - 40, 26, '800'); cx.fillText(banner, W / 2, H * 0.4 + 34);
        cx.font = '600 13px DM Sans, sans-serif'; cx.fillStyle = '#5d5a54'; cx.fillText('Leave the rest alone.', W / 2, H * 0.4 + 64);
      }
      if (env.DEBUG) env.debug('round ' + st.round + ' combo ' + st.combo + ' live ' + st.live.length + ' next ' + st.next + '/' + st.spawns.length);
    }
  };
}

/* "This was wrong": the cards that cost this player, for an editor to check. */
function report(d, ui) {
  const items = [...(d.struck || []).map(x => ({ ...x, why: 'struck me, but fits' })), ...(d.missed || []).map(x => ({ ...x, why: 'counted as fitting, but does not' }))];
  const round = i => (d.rounds || [])[i] || {};
  ui.sheet('<h2>Which card was wrong?</h2><p class="mut">Pick the card. An editor checks every report.</p>' +
    (items.length ? '<div class="chips">' + items.map((x, i) => '<button class="chip" data-i="' + i + '">' + ui.esc(x.n || x.id) +
      ' <span class="mut">(' + ui.esc(round(x.round).title || '') + ': ' + x.why + ')</span></button>').join('') + '</div>'
      : '<p>No card cost you anything today.</p>') +
    '<p><button class="btn alt" id="bBack">Back</button></p>');
  document.getElementById('bBack').onclick = ui.back;
  document.querySelectorAll('.chip[data-i]').forEach(b => b.onclick = async () => {
    const x = items[+b.dataset.i];
    const r = await ui.api('POST', 'whack/report', { promptId: round(x.round).promptId, athleteId: x.id, note: x.why }).catch(() => null);
    b.disabled = true; b.textContent = r && r.status === 200 ? 'Reported. Thank you.' : 'Could not send. Try again later.';
  });
}

bootGame({
  id: 'whack', name: 'Whack the Right Player', version: 'whack-1', sim: S, unit: 'points', needsConfig: true, practiceAfterDaily: true,
  practiceCfg: today => today && today.practice,
  rule: 'Hit every player who fits. Leave the rest alone.',
  howto: 'Three rounds of 20 seconds, each with its own prompt. Tap a card that fits. Hitting one that does not is a strike, and three strikes end the run. Hits in a row build a combo. Keyboard: Q W E, A S D, Z X C.',
  resultExtra: d => '<p class="mut">' + (d.rounds || []).map((r, i) => 'Round ' + (i + 1) + ': ' + r.score + (r.perfect ? ' (perfect)' : '')).join(' · ') + '</p>',
  report,
  makeView
});
