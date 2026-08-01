import { chromium } from 'playwright';
const SS = '/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
let done = false;
for (let run = 0; run < 25 && !done; run++) {
  const p = await b.newPage({ viewport: { width: 430, height: 950 } });
  p.on('pageerror', (e) => console.log('PAGE ERROR ' + e.message));
  await p.goto('http://localhost:8080/cfb/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2400);
  await p.evaluate(() => document.getElementById('b-play-intro').click());
  await p.waitForTimeout(2200);
  for (let i = 0; i < 12; i++) {
    const d = await p.evaluate(() => {
      const t = [...document.querySelectorAll('#opts .tile:not(.off)')];
      if (!t.length) return null;
      let best = t[0], bv = -1;
      for (const x of t) { const n = parseFloat((x.querySelector('.pp, .ppg, .v')?.textContent || '0').replace(/[^\d.]/g, '')); if (n > bv) { bv = n; best = x; } }
      best.click(); return true;
    });
    if (d === null) { await p.waitForTimeout(1100); continue; }
    await p.waitForTimeout(1900);
    if (await p.$('#s-squad.on')) break;
  }
  await p.evaluate(() => document.getElementById('b-play').click());
  await p.waitForTimeout(1100);
  for (let i = 0; i < 34 && !done; i++) {
    if (await p.$('#s-over.on')) break;
    if (await p.$('#s-po.on')) {
      const t = await p.evaluate(() => {
        const el = document.getElementById('po-bug');
        const rd = (e) => ['.cd', '.rc', '.rk'].map((s) => (e.querySelector(s)?.textContent || '').trim()).filter(Boolean).join(' ');
        return { you: rd(el.querySelector('.bt.you')), them: rd(el.querySelector('.bt.them')),
                 round: (document.getElementById('po-round')?.textContent || '').trim(),
                 seed: window.PS_CFB_RUN && document.title ? null : null };
      });
      if (t.you) {
        console.log(t.round + ':  YOU [' + t.you + ']   THEM [' + t.them + ']');
        await p.locator('#po-bug').screenshot({ path: SS + 'seed_po.png' });
        done = true;
      }
    }
    await p.evaluate(() => { for (const id of ['b-sim','b-po-fast','b-po-skip','b-po','b-bowl-fast']) { const x = document.getElementById(id); if (x && !x.hidden && x.offsetParent !== null) { x.click(); return; } } });
    await p.waitForTimeout(950);
  }
  await p.close();
}
await b.close();
console.log(done ? 'captured' : 'no playoff game in 25 runs');
