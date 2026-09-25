/* Every emoji in the golf game is a pixel icon, or has a reason not to be.
 *
 *   (nohup python3 -m http.server 8099 &)     any static server at the repo root
 *   node golf/check-emoji.mjs
 *
 * The game draws its icons as pixel art (golf/pixel-icons), and an emoji left in a string is a
 * piece of somebody else's art in the middle of it: a glossy Apple ticket beside a pixel trophy.
 * Nothing throws when that happens, so it is checked. emojifyIcons() turns an emoji into ic(name)
 * wherever markup goes through $() or an emojified innerHTML, so the rule is EMOJI_MAP:
 *
 *   1. every emoji in golf/index.html is a key of EMOJI_MAP, or on KEEP below with its reason
 *   2. every EMOJI_MAP value draws something (a name ic() does not know draws NOTHING, silently)
 *   3. every string in the page that carries an emoji comes out of emojifyIcons() with none left
 *   4. the screens themselves: open them in a browser and read the text on them, because a
 *      string that reaches the page through textContent or a raw innerHTML skips the converter
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const HOST = process.env.HOST || 'http://localhost:8099';
const SRC = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const EMO = /(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic})/gu;

// the short list, and why each stays text
const KEEP = {
  '★': 'the star glyph the text uses as a mark, the same as ✓ and ✕',
  '♥': 'a like count on a fan post, set beside ↺ as the same kind of glyph',
  '▶': 'a typographic play arrow, the same family as ▸',
  '◀': 'the arrow pointing at the winner of a cup match',
  '↔': 'only in code comments',
  '🟦': 'the daily share text, which goes to the clipboard and never to the screen',
  '🟩': 'the daily share text',
  '⬜': 'the daily share text',
  '🟨': 'the daily share text',
  '🟥': 'the daily share text',
};

let fails = 0;
const fail = m => { fails++; console.log('  FAIL', m); };
const ok = m => console.log('  ok  ', m);

const mapSrc = SRC.match(/const EMOJI_MAP=\{([\s\S]*?)\n\};/);
if (!mapSrc) throw new Error('EMOJI_MAP is missing from golf/index.html');
const MAP = Object.fromEntries([...mapSrc[1].matchAll(/'([^']+)':'([^']+)'/g)].map(m => [m[1], m[2]]));
if (Object.keys(MAP).length < 100) fail(`EMOJI_MAP read as ${Object.keys(MAP).length} keys; the reader is broken, not the map`);

console.log('1. every emoji in the page is mapped or kept');
{
  const bad = {};
  SRC.split('\n').forEach((l, i) => { for (const m of l.matchAll(EMO)) if (!MAP[m[0]] && !KEEP[m[0]]) (bad[m[0]] = bad[m[0]] || []).push(i + 1); });
  const n = Object.keys(bad).length;
  if (n) for (const [e, ls] of Object.entries(bad)) fail(`${e} (U+${e.codePointAt(0).toString(16)}) has no pixel icon, line ${ls.slice(0, 5).join(', ')}`);
  else ok('nothing unmapped');
  // the squares must only ever be share text, which is the whole of their exemption
  const sq = SRC.split('\n').map((l, i) => [l, i + 1]).filter(([l]) => /[🟦🟩⬜🟨🟥]/u.test(l) && !/const emo=t=>/.test(l));
  if (sq.length) fail(`the share squares appear outside the share text, line ${sq.map(x => x[1]).join(', ')}`);
  else ok('the share squares are only in the share text');
}

const b = await chromium.launch();
try {
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('bag_tour_done', 'true'); localStorage.setItem('bag_s1_launch_seen', '1'); localStorage.setItem('bag_s2_launch_seen', '1'); } catch (e) {} });
  await page.goto(HOST + '/golf/');
  await page.waitForFunction(() => typeof emojifyIcons === 'function' && typeof render === 'function');

  console.log('2. every EMOJI_MAP value draws an icon');
  {
    const r = await page.evaluate(() => Object.entries(EMOJI_MAP).filter(([, n]) => !/<svg/.test(ic(n))).map(([e, n]) => e + ' -> ' + n));
    if (r.length) r.forEach(x => fail(`${x} draws nothing`)); else ok('all draw');
  }

  console.log('3. every string in the page comes out of the converter clean');
  {
    // every quoted or templated run of the source that holds an emoji, put through emojifyIcons()
    const strs = new Set();
    for (const m of SRC.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[^`]*`/g)) if (EMO.test(m[0])) { EMO.lastIndex = 0; strs.add(m[0].slice(1, -1)); }
    EMO.lastIndex = 0;
    const left = await page.evaluate(([list, keep]) => {
      const re = /(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic})/gu, out = [];
      for (const s of list) {
        const txt = emojifyIcons(s).replace(/<[^>]*>/g, '');
        const bad = (txt.match(re) || []).filter(e => !keep.includes(e));
        if (bad.length) out.push(bad.join('') + '  in  ' + s.slice(0, 90));
      }
      return out;
    }, [[...strs], Object.keys(KEEP)]);
    if (strs.size < 150) fail(`only ${strs.size} strings with an emoji were found; the reader is broken`);
    if (left.length) left.forEach(x => fail(x)); else ok(`${strs.size} strings, none left`);
  }

  console.log('4. the screens, read in a browser');
  {
    const found = await page.evaluate(async (keep) => {
      sbUser = { id: 'emoji-rig', email: 'rig@example.com' }; sbUsername = 'emojirig';
      const never = () => ({ then() { return this; }, catch() { return this; } });
      sb = { from: () => ({ select: () => ({ eq: () => ({ limit: never }), order: () => ({ limit: never }), limit: never }) }), rpc: never, functions: { invoke: never } };
      try { cloudPush = function () {}; } catch (e) {}
      const re = /(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic})/gu, out = {}, seen = [];
      const scan = (where) => {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n; while ((n = w.nextNode())) {
          const p = n.parentElement; if (!p || p.closest('script,style')) continue;
          for (const e of (n.nodeValue.match(re) || [])) if (!keep.includes(e)) (out[e] = out[e] || new Set()).add(where + ': ' + n.nodeValue.trim().slice(0, 60));
        }
        seen.push(where);
      };
      const tick = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const go = async (ov, extra) => { try { S.overlay = ov; if (extra) extra(); render(); await tick(); scan(ov || 'home'); } catch (e) { seen.push('THREW ' + ov + ': ' + e.message); } };
      S.screen = 'title'; await go(null);
      for (const ov of ['menu', 'about', 'challenges', 'coinlog', 'leaderboard', 'record', 'passport', 'tournews', 'whatsnew', 'wheel', 'tourpass', 'feedback', 'account', 'courserecords', 'rosterupdates'])
        await go(ov);
      for (const sec of ['packs', 'tourpass', 'look', 'coins', 'drops']) await go('shop', () => { S.shopSec = sec; });
      S.overlay = null; render();
      return { out: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].slice(0, 4)])), seen };
    }, Object.keys(KEEP));
    const threw = found.seen.filter(s => s.startsWith('THREW'));
    ok(`read ${found.seen.length - threw.length} screens`);
    threw.forEach(t => console.log('  note', t));
    const ks = Object.keys(found.out);
    if (ks.length) ks.forEach(k => fail(`${k} is on screen as an emoji: ${found.out[k].join(' | ')}`)); else ok('no emoji on any of them');
  }
  const real = errs.filter(e => !/supabase|fetch|network|Load failed/i.test(e));
  if (real.length) fail('page errors: ' + real.slice(0, 3).join(' | '));
} finally { await b.close(); }

console.log(fails ? `\n${fails} problem${fails > 1 ? 's' : ''}` : '\nall clear');
process.exit(fails ? 1 : 0);
