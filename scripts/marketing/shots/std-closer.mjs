/* Shut The Door, one whole outing as a guest: the day's spot, the mound, every pitch (type, aim, the two
   meter stops) to the result. The day is pinned so the take is the same spot every time:

     --arg <YYYY-MM-DD>    the Eastern day to play (default 2026-11-24, Mariano Rivera, 2009 ALCS Game 6)

   The clock is moved to that day before the page loads, and the day's scenario is seeded the way the
   page keeps a vote it already knows (std_picks_v1, as test/check-browser.mjs does), so no server is
   asked. The outing is the real engine, seeded by the day as it is for everyone.

   PLAN is the pitches thrown, in order: [arsenal index, zone cell 0-24 in screen order, power ms,
   release ms], the waits from the meter showing to each tap. A different plan is a different outing. */
export const page = '/shut-the-door/';
export const seconds = 240;
export const hide = [];
export const viewport = { width: 432, height: 768 };
const DAY = process.env.STD_DAY || '2026-11-24';
const PACK = process.env.STD_PACK || 'std-2009-alcs6-rivera';
export const init = `(() => {
  const target = Date.parse('${DAY}T17:00:00Z'), shift = target - Date.now(), D = Date;
  function F(...a) { return a.length ? new D(...a) : new D(D.now() + shift); }
  F.prototype = D.prototype; F.now = () => D.now() + shift; F.parse = D.parse; F.UTC = D.UTC;
  window.Date = F;
  try {
    localStorage.setItem('std_picks_v1', JSON.stringify({ v: 1, days: { '${DAY}': '${PACK}' } }));
    localStorage.setItem('std_ui_v1', JSON.stringify({ meter: true, quick: false, sound: false }));
    localStorage.setItem('runthegrid_theme', 'dark');
  } catch (e) {}
})();`;

// what the trailer's camera frames (record.mjs writes where each is, every frame)
export const track = {
  head: '#h-head', title: '#h-title', sit: '#h-sit', hpitcher: '#h-pitcher', setup: '#h-setup', take: '#b-take',
  score: '#s-mound.on #m-us', inn: '#s-mound.on #m-inn', count: '#s-mound.on #m-count', outs: '#s-mound.on #m-outs', bases: '#s-mound.on #m-bases',
  abs: '#m-abs-b', absr: '#m-absr:not([hidden])', zone: '#s-mound.on #m-aim',
  card: '#s-mound.on #m-card', pname: '#m-pname', bname: '#m-bname', say: '#m-say',
  arsenal: '#s-mound.on #m-arsenal', aim: '#s-mound.on #m-aim', throw: '#m-throw', meter: '#m-meter:not([hidden])', pbp: '#m-pbp', scene: '#m-scene',
  outcome: '#s-result.on #r-outcome', pct: '#s-result.on #r-pct', pctline: '#r-pctline', like: '#r-like', real: '#r-real', eyebrow: '#r-eyebrow',
};

export const PLAN = JSON.parse(process.env.STD_PLAN || '[]');
// the pitches (0-based) whose called ball the pitcher's side challenges with ABS, right after the call
const CH = JSON.parse(process.env.STD_CH || '[]');
const on = (sel) => `!!document.querySelector('${sel}')`;

export async function setup(page, t) {
  await t.until(new Function(`return ${on('#h-main:not([hidden])')}`), 120000);
  await t.until(() => !!(window.STD_STAGE && window.STD_STAGE.current && window.STD_STAGE.current.loaded), 120000).catch(() => {});
  await t.hold(1500);
}

export async function play(page, t) {
  await t.hold(1800);
  await t.tap('#b-take', { before: 300, after: 300 });
  await t.until(new Function(`return ${on('#s-mound.on #m-aim .cell')}`), 120000);
  await t.until(() => !!(window.STD_STAGE && window.STD_STAGE.current && window.STD_STAGE.current.loaded), 120000).catch(() => {});
  await t.hold(1200);
  if (process.env.STD_ONLY_MOUND) { await t.hold(3000); return; }
  for (let i = 0; i < 40; i++) {
    if (await page.locator('#s-result.on').count()) break;
    // power at 600 ms is his ordinary effort (meter.js effortAt 0.67); the ring is best 260 + 514 ms later
    const [pi, cell, pw = 600, rl = 774] = PLAN[i] || [0, 12];
    const pitches = page.locator('#m-arsenal .pitch');
    await t.tap(pitches.nth(Math.min(pi, (await pitches.count()) - 1)), { before: 300, after: 250 });
    await t.tap(page.locator(`#m-aim .cell[data-cell="${cell}"]`), { before: 200, after: 250 });
    await t.tap('#m-throw', { before: 150, after: 0 });
    // the meter's clock starts when it shows: watch for it every frame, so the stops land when planned
    for (let f = 0; f < 600 && !(await page.locator('#m-meter:not([hidden])').count()); f++) await t.hold(1);
    await t.hold(pw);
    await t.tap('#m-meter', { before: 0, after: 0 });
    await t.hold(rl);
    await t.tap('#m-meter', { before: 0, after: 0 });
    // the pitch flies and plays out: wait for the next call or the result
    await t.until(() => !!document.querySelector('#s-result.on') || (() => { const b = document.querySelector('#m-throw'); return b && !/pitch/i.test(b.textContent) && !document.querySelector('#m-meter:not([hidden])'); })(), 60000);
    await t.hold(900);
    // ABS: don't like the call? challenge it, before the next throw, and let the replay box play out
    if (CH.includes(i) && !(await page.locator('#s-result.on').count())) {
      await t.tap('#m-abs-b', { before: 500, after: 300 });
      await t.hold(4500);
    }
    // a half over: the card between halves, or the box score, waits for a tap
    for (let k = 0; k < 4 && !(await page.locator('#s-result.on').count()) && !(await page.locator('#s-mound.on #m-aim .cell').count()); k++) {
      const go = page.locator('#s-mound.on button:visible, .sheet.on button:visible').first();
      if (await go.count()) await t.tap(go, { before: 600, after: 600 }); else await t.hold(800);
    }
  }
  await t.until(new Function(`return ${on('#s-result.on')}`), 60000);
  await t.hold(5000);
}
