/* The way out of an account is an exit and not an invitation.
 *
 *   (nohup node cfb/build/test/gzip_server.mjs &)     # 8081, serves the whole repo
 *   node cfb/build/test/test_delete_button.mjs
 *
 * Delete my account was a full-width filled red button, the only filled control on a page
 * whose other three are ghosts, which made ending your account the visual headline of
 * managing it. It is a small outlined control now.
 *
 * THREE THINGS, AND THE SECOND IS THE ONE THAT WILL ROT. That it is SMALL is the change and
 * is easy to check. That it is still FINDABLE is what stops the change going too far, and
 * nothing but a test will notice if a later tidy-up hides it behind a menu. And that it
 * still GROWS at the armed step is what keeps the loud shape where loud is honest: the tap
 * after that one ends the account.
 *
 * BOTH GAMES, from one file, because it is one account and one deletion. The two pages are
 * character-for-character the same flow and the only thing that differs is which game's
 * sheet you opened, so a check that runs on one and not the other would let them drift.
 */
import { chromium } from 'playwright';
const SS = process.env.SS || '/tmp/';
const HOST = process.env.HOST || 'http://localhost:8081';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

/* Signed in, with a name, which is the only state that can see this section at all. */
const IN = `window.supabase={createClient(){return{
  auth:{onAuthStateChange(cb){setTimeout(()=>cb('SIGNED_IN',{user:{id:'u1',email:'a@b.c'}}),0);return{data:{}}},
    getSession:()=>Promise.resolve({data:{session:{user:{id:'u1',email:'a@b.c'}}}}),
    signOut:()=>Promise.resolve({})},
  from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve({data:{username:'tester'}})}}}}}},
  rpc:()=>Promise.resolve({data:null,error:null})}}};`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

/* The two games open their account page by different routes, so each names its own. */
const GAMES = [
  { name: 'college', path: '/cfb/index.html' },
  { name: 'football', path: '/football/index.html' },
];

for (const g of GAMES) {
  console.log('\n=== ' + g.name + ' ===');
  const p = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(IN);
  await p.goto(HOST + g.path, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(3200);

  /* openProfile lives inside the page's IIFE, so the account page is reached the way a
     player reaches it: the avatar in the header, then the Account row. */
  await p.evaluate(() => {
    const a = document.getElementById('b-avatar') || document.querySelector('.avatarbtn, #b-profile');
    if (a) a.click();
  });
  await p.waitForTimeout(900);
  let del = await p.$('#a-del');
  if (!del) {
    await p.evaluate(() => {
      for (const el of document.querySelectorAll('#sheet-in button, #sheet-in .pfrow')) {
        if (/account/i.test(el.textContent || '')) { el.click(); return; }
      }
    });
    await p.waitForTimeout(900);
    del = await p.$('#a-del');
  }
  ok('the account page has a way to delete the account', !!del);
  if (!del) { await p.close(); continue; }

  const shape = () => p.evaluate(() => {
    const d = document.getElementById('a-del');
    const box = d.getBoundingClientRect();
    const sheet = document.getElementById('sheet-in').getBoundingClientRect();
    const cs = getComputedStyle(d);
    const filled = !/^(none|rgba\(0, 0, 0, 0\)|transparent)$/.test(cs.backgroundImage === 'none' ? cs.backgroundColor : cs.backgroundImage);
    return { w: Math.round(box.width), sheetW: Math.round(sheet.width),
      h: Math.round(box.height), font: parseFloat(cs.fontSize), filled,
      text: (d.textContent || '').trim(),
      /* Everything else on the page that is a button, to compare loudness against. VISIBLE
         ones only: the way back out is in the markup from the start and hidden until the
         first tap, and a control nobody can see is not competing for the eye. */
      others: [...document.querySelectorAll('#sheet-in .btn')].filter((e) => e !== d)
        .map((e) => Math.round(e.getBoundingClientRect().width)).filter((w) => w > 0) };
  });

  /* ── at rest ─────────────────────────────────────────────────────────────── */
  const rest = await shape();
  console.log('  at rest: ' + JSON.stringify(rest));
  ok('at rest it does not span the sheet', rest.w < rest.sheetW * 0.7,
    rest.w + 'px of ' + rest.sheetW);
  ok('at rest it is not a filled button', !rest.filled);
  ok('at rest it is smaller type than a real button', rest.font <= 13, String(rest.font));
  /* THE POINT OF THE WHOLE CHANGE. It must not be the biggest control on a page whose job
     is managing an account, because the biggest thing on a screen is a suggestion.
     Not "narrower than everything": the half-width pair (Send feedback, Sign out) is
     narrower than this and should be, because those two sit side by side. What has to be
     true is that something else is the widest thing here, and that this is not filled while
     the page's real controls are. */
  ok('and it is not the widest control on the page',
    rest.others.some((w) => w > rest.w),
    rest.w + ' vs ' + rest.others.join(', '));
  await p.screenshot({ path: SS + 'del_' + g.name + '_rest.png' });

  /* ── but still findable ──────────────────────────────────────────────────── */
  const found = await p.evaluate(() => {
    const d = document.getElementById('a-del');
    const box = d.getBoundingClientRect();
    const cs = getComputedStyle(d);
    return { visible: box.width > 0 && box.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0',
      tappable: box.height >= 28,
      labelled: /delete/i.test(d.textContent || ''),
      heading: /delete your account/i.test(document.getElementById('sheet-in').textContent || '') };
  });
  ok('it is visible and says what it does', found.visible && found.labelled, JSON.stringify(found));
  /* Quiet is not silent: before any tap the page still says this ends the account across
     the whole site and cannot be taken back. */
  const restNote = await p.$eval('#pf-delnote', (e) => (e.textContent || '').replace(/\s+/g, ' '));
  ok('and the resting note still says it is site-wide and permanent',
    /every game on the site/i.test(restNote) && /permanent/i.test(restNote), restNote);
  ok('it is still under its own heading rather than buried', found.heading);
  ok('and it is still big enough to tap', found.tappable);

  /* ── and it grows once it is about to be true ────────────────────────────── */
  await p.evaluate(() => document.getElementById('a-del').click());   // step 1: the warning
  await p.waitForTimeout(400);
  const warned = await shape();
  ok('the first tap warns and changes nothing else', /understand|continue/i.test(warned.text),
    warned.text);
  /* THE FULL WARNING ARRIVES HERE, not on the resting page. The resting note is one line,
     so everything it used to say has to be in this one or the shortening cost real
     disclosure rather than just noise. */
  const warnText = await p.$eval('#pf-delnote', (e) => (e.textContent || '').replace(/\s+/g, ' '));
  ok('  ...and it spells out the whole loss',
    /cannot be undone/i.test(warnText) && /every RunThe\.GG game/i.test(warnText)
      && /leaderboard/i.test(warnText), warnText.slice(0, 120));
  ok('  ...and the way back appears', !!(await p.$('#a-delcancel')));
  ok('  ...and the button is still quiet at this step', !warned.filled && warned.w < warned.sheetW * 0.7,
    warned.w + 'px, filled=' + warned.filled);

  await p.evaluate(() => document.getElementById('a-del').click());   // step 2: the field
  await p.waitForTimeout(400);
  const armed = await shape();
  console.log('  armed: ' + JSON.stringify(armed));
  ok('the armed step opens a field to type into', !!(await p.$('#a-delname')));
  ok('and the button becomes loud, because the next tap does it',
    armed.filled && armed.w > armed.sheetW * 0.9, JSON.stringify({ w: armed.w, filled: armed.filled }));
  ok('  ...and is dead until the name is typed',
    await p.evaluate(() => document.getElementById('a-del').disabled));
  await p.screenshot({ path: SS + 'del_' + g.name + '_armed.png' });

  /* ── and there is a way back out of all of it ─────────────────────────────── */
  await p.evaluate(() => document.getElementById('a-delcancel').click());
  await p.waitForTimeout(400);
  const back = await shape();
  ok('backing out returns it to the quiet resting state',
    !back.filled && back.w < back.sheetW * 0.7 && /^delete my account$/i.test(back.text),
    back.text + ' ' + back.w + 'px');

  ok('nothing logged', errs.length === 0, errs.join(' | ') || 'none');
  await p.close();
}

await b.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
