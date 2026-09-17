/* THE STANDINGS SCREEN.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_standings.mjs
 *
 * WHY THIS SCREEN EXISTS AT ALL is the thing worth knowing first. Every piece of the board
 * was already built and deployed: 96_commish_terms.sql records each finished term with its
 * doctrine and its score, commish_doctrine_board ranks them, and splits.js has carried the
 * client call since the day it shipped. NOTHING EVER CALLED IT. A player saw their placement
 * once, on the ending screen, in the second the term finished, and then it was gone. No way
 * back, no way to see who was above them, nothing to send anybody.
 *
 * So the assertions here are mostly about the states a board is in when it is NOT a happy
 * list of twenty rows, because those are the states that ship broken:
 *
 *   the boards are unreachable        say so in words, never a blank box or a dead spinner
 *   nobody has finished a term        a different sentence from the one above, and true
 *   you have never finished one       a third sentence, because it needs a different action
 *   a row belongs to somebody with no profile     still counted, still drawn
 *
 * THE RPCs ARE STUBBED AT THE NETWORK, not by patching the page, so what is exercised is
 * splits.js's real transport and the page's real painter. The stub answers the same shapes
 * the SQL returns, which supabase/test/tenure_test.sql pins against a real Postgres.
 */
import { chromium } from 'playwright';

const URL = 'http://localhost:8080/cfb/commish/index.html';
const UID = '11111111-1111-1111-1111-111111111111';
const TESTER = 'standings-test';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const arm = `
(function(){ var v;
  Object.defineProperty(window,'PS_CFB_COMMISH_ACCESS',{configurable:true,
    get:function(){ return v; },
    set:function(a){ v=a; try{ a.TESTERS.push(${JSON.stringify(TESTER)}); }catch(e){} }});
})();`;
const auth = (products) => `
window.supabase={createClient(){
  const session={access_token:'x',user:{id:'${UID}',email:'c@e.com'}};
  return {auth:{onAuthStateChange(cb){ setTimeout(function(){cb('SIGNED_IN',session);},0); return {data:{}}; },
    getSession:()=>Promise.resolve({data:{session}}),
    signOut:()=>Promise.resolve({})},
    from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve(
      {data:{username:'${TESTER}'}})}}}}}},
    rpc:(fn)=>Promise.resolve(fn==='premium_products'
      ? {data:${JSON.stringify(products || ['cfb_premium'])},error:null}
      : {data:null,error:null})}}};`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

/* THE BOARD RPCs, ANSWERED AT THE WIRE. `answers` maps an RPC name to what it returns;
   anything not named 404s, which is how the unreachable case is produced honestly rather
   than by breaking splits.js. */
async function open(answers, label) {
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  await p.route('**/rest/v1/rpc/**', async (route) => {
    const fn = route.request().url().split('/rpc/')[1].split('?')[0];
    if (!Object.prototype.hasOwnProperty.call(answers, fn)) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(answers[fn]) });
  });
  await p.addInitScript(arm + auth());
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(2600);
  await p.click('#g-start').catch(() => {});
  await p.waitForTimeout(900);
  for (let i = 0; i < 6; i++) {
    const up = await p.$eval('#s-scene', (e) => e.classList.contains('on')).catch(() => false);
    if (!up) break;
    await p.click('#b-scene-skip').catch(() => {});
    await p.waitForTimeout(300);
  }
  console.log('\n=== ' + label + ' ===');
  return p;
}
const txt = (p, sel) => p.$eval(sel, (e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).catch(() => '');
const on = (p, id) => p.$eval('#' + id, (e) => e.classList.contains('on')).catch(() => false);

/* `champions` IS EQUAL TO `years` ON EVERY ROW, AND THAT IS THE FIXTURE BEING HONEST.
   The world takes a champion every season, so the stored count is a count of seasons and
   can never be anything else. This fixture used to invent 3 champions against 8 years, which
   described a row the database cannot produce, and that is exactly why the suite watched the
   board print "3 titles" without a word. Read from production before it was corrected: seven
   accounts, champions equal to years on all seven, 11/11, 5/5, 5/5, 2/2 and 1/1.
   A fixture that cannot occur is not a harder test than the truth. It is a different game. */
const ROWS = [
  { place: 1, score: 91, grade: 'A', removed: false, years: 8, rulings: 40, champions: 8,
    purse: 0, gate: 0, stage: 0, throne: 0, created_at: '2026-01-01',
    author_name: 'ada', author_color: '#f00', author_initials: 'AD' },
  { place: 2, score: 77, grade: 'B', removed: true, years: 4, rulings: 20, champions: 4,
    purse: 0, gate: 0, stage: 0, throne: 0, created_at: '2026-01-02',
    author_name: TESTER, author_color: '#0f0', author_initials: 'ST' },
  /* A TERM BY SOMEBODY WITH NO PROFILE ROW. The SQL left joins on purpose so the account is
     still counted; a board that dropped it would lie about how many people have played. */
  { place: 3, score: 40, grade: 'D', removed: false, years: 2, rulings: 9, champions: 2,
    purse: 0, gate: 0, stage: 0, throne: 0, created_at: '2026-01-03',
    author_name: null, author_color: null, author_initials: null },
];
const TEN = [
  { place: 1, years: 21, terms: 2, longest: 13, removed: 0, champions: 21,
    first_at: '2026-01-01', author_name: 'ada', author_color: '#f00', author_initials: 'AD' },
  { place: 2, years: 12, terms: 4, longest: 5, removed: 3, champions: 12,
    first_at: '2026-01-02', author_name: TESTER, author_color: '#0f0', author_initials: 'ST' },
];

/* ── a board with people on it ───────────────────────────────────────────────────────── */
{
  const p = await open({
    commish_doctrine_board: ROWS,
    commish_tenure_board: TEN,
    commish_my_tenure: { served: true, years: 12, terms: 4, longest: 5, place: 2, total: 37 },
  }, 'a board with people on it');

  ok('the office offers a way in', !!(await p.$('#b-stand')));
  await p.click('#b-stand');
  await p.waitForTimeout(900);
  ok('  which opens the standings', await on(p, 's-stand'));

  const rows = await p.$$eval('#st-board .strow', (e) => e.length);
  ok('the score board draws a row per term', rows === 3, rows + ' rows');
  ok('  ranked by score, best first',
    /^1 ada 91/.test(await txt(p, '#st-board .strow')), await txt(p, '#st-board .strow'));
  /* A REMOVAL IS NOT A FOOTNOTE ON THIS SCREEN. Being voted out is the loudest thing that can
     happen to a commissioner and this is the one place it can be compared. */
  ok('  and says who was voted out', /voted out/.test(await txt(p, '#st-board')));
  /* THE WHOLE POINT OF OPENING A BOARD IS TO FIND YOURSELF ON IT. */
  const mine = await p.$$eval('#st-board .strow.me', (e) => e.length);
  ok('  your own row is marked', mine === 1, mine + ' marked');
  /* AN ACCOUNT WITH NO USERNAME IS STILL A PERSON. */
  ok('  and a term with no profile is still drawn',
    /A commissioner/.test(await txt(p, '#st-board')));

  /* A COMMISSIONER WINS NO TITLES, AND THE BOARD SHIPPED SAYING THEY DO.
     `champions` counts seasons, so the row read "Grade A · 8 years · 8 titles" and credited
     the reader with eight national championships that belong to eight different schools. It
     is a valid sentence, it rendered perfectly, and nothing on the site could report it.
     Asserted as the WORD and not as the number, because the number is the defect: any count
     of titles on this board is wrong however it is phrased, and a check written against "8
     titles" would pass the moment somebody rounded it or changed the separator. */
  const boardTxt = await txt(p, '#st-board');
  ok('  and credits nobody with titles they did not win',
    !/\btitles?\b/i.test(boardTxt), boardTxt.slice(0, 120));

  ok('the tenure board is there too', (await p.$$eval('#st-tenure .strow', (e) => e.length)) === 2);
  ok('  ranked on years in the chair',
    /^1 ada 21/.test(await txt(p, '#st-tenure .strow')), await txt(p, '#st-tenure .strow'));
  /* THE TIEBREAK IS VISIBLE RATHER THAN IMPLIED. Twenty years over two contracts and twenty
     over six are different commissioners, so the board shows the terms. */
  ok('  and shows the terms so two equal totals can be told apart',
    /2 terms/.test(await txt(p, '#st-tenure')));

  ok('your own line is above both boards', !(await p.$eval('#st-me', (e) => e.hidden)));
  ok('  with your years and your place', /12 years in the chair, 2 of 37/.test(await txt(p, '#st-me')),
    await txt(p, '#st-me'));

  /* NINE BOARDS, AND YOU CAN READ SOMEBODY ELSE'S. That is the whole argument of 96: the
     score is ranked inside a doctrine so nobody can be top of everything. */
  const picks = await p.$$eval('#st-picker button', (e) => e.length);
  ok('all nine doctrines are pickable', picks === 9, picks + ' tabs');
  await p.click('#st-picker button[data-d="gate+"]');
  await p.waitForTimeout(700);
  ok('  and picking one opens its board',
    await p.$eval('#st-picker button[data-d="gate+"]', (e) => e.classList.contains('on')));

  await p.click('#b-stback');
  await p.waitForTimeout(800);
  ok('back lands on the office', await on(p, 's-office'));
  ok('nothing threw', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
  await p.close();
}

/* ── the board opens on YOURS ────────────────────────────────────────────────────────────
   NINE TABS AND ONE OF THEM IS YOU. The screen is opened to find yourself, so the board it
   opens on has to be your own doctrine and the tab has to say which one that is.

   THE LIVE TERM IS THE WRONG PLACE TO ASK, ON ITS OWN. doctrine.profile() reads the rulings
   made so far and answers null when there are none, which is correct and is also the state
   somebody is in at the start of a term, which is the most likely moment to open a board. The
   first cut of this screen read only the live term, so the gold mark never appeared for
   anybody and the board always opened on the Caretaker. The fallback is the career shelf, and
   this is the assertion that would have caught it. */
{
  const p = await open({
    commish_doctrine_board: ROWS,
    commish_tenure_board: TEN,
    commish_my_tenure: { served: true, years: 12, terms: 4, longest: 5, place: 2, total: 37 },
  }, 'the board opens on the doctrine you have been');
  /* A FINISHED TERM ON THE SHELF, written the way logTerm writes one: the doctrine is stored
     as the NAME a person reads, not as the id the boards are keyed on. */
  await p.evaluate(() => {
    localStorage.setItem('cfb_commish_career', JSON.stringify({
      v: 1, rulings: 40, terms: [{ from: 2025, to: 2029, removed: false, reason: 'served',
        doctrine: 'The Reformer', grade: 'B', score: 74, rulings: 40, champions: 1, seasons: 5 }],
    }));
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await p.click('#g-start').catch(() => {});
  await p.waitForTimeout(900);
  for (let i = 0; i < 6; i++) {
    const up = await p.$eval('#s-scene', (e) => e.classList.contains('on')).catch(() => false);
    if (!up) break;
    await p.click('#b-scene-skip').catch(() => {});
    await p.waitForTimeout(300);
  }
  await p.click('#b-stand');
  await p.waitForTimeout(900);
  const mine = await p.$eval('#st-picker button.mine', (e) => e.dataset.d).catch(() => null);
  ok('the doctrine you have been is marked', mine === 'purse+', String(mine));
  ok('  and its board is the one that opened',
    await p.$eval('#st-picker button[data-d="purse+"]', (e) => e.classList.contains('on')));
  ok('nothing threw', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
  await p.close();
}

/* ── the states that ship broken ─────────────────────────────────────────────────────── */
{
  /* NOBODY HAS FINISHED A TERM. On a mode this new this is the common case, and an empty box
     is how a feature teaches somebody it is broken. */
  const p = await open({
    commish_doctrine_board: [],
    commish_tenure_board: [],
    commish_my_tenure: { served: false, total: 0 },
  }, 'a board with nobody on it yet');
  await p.click('#b-stand');
  await p.waitForTimeout(900);
  const t = await txt(p, '#st-board');
  ok('an empty board says it is empty, in words', /Nobody has finished a term/.test(t), t.slice(0, 90));
  ok('  and says being first is the prize', /first one to do it is top/.test(t));
  ok('the tenure board says it too', /No finished terms yet/.test(await txt(p, '#st-tenure')));
  ok('and your own line offers the opening', /would be the first/.test(await txt(p, '#st-me')),
    await txt(p, '#st-me'));
  ok('nothing threw', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
  await p.close();
}
{
  /* SIGNED IN, NOTHING FINISHED. A different sentence from the one above, because it needs a
     different action: there ARE boards, you are just not on them. */
  const p = await open({
    commish_doctrine_board: ROWS,
    commish_tenure_board: TEN,
    commish_my_tenure: { served: false, total: 37 },
  }, 'boards exist and you are not on them');
  await p.click('#b-stand');
  await p.waitForTimeout(900);
  const t = await txt(p, '#st-me');
  ok('it says how many have played', /37 commissioners have finished a term/.test(t), t);
  ok('  and what puts you on it', /when you finish one/.test(t));
  ok('  and does not claim a place you do not have', !/ of 37,/.test(t) && !/^0 /.test(t));
  ok('nothing threw', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
  await p.close();
}
{
  /* UNREACHABLE. Every call in splits.js resolves to null rather than rejecting, so the
     failure mode this guards is a screen that sits on "Reading the board" for ever. */
  const p = await open({}, 'the boards cannot be reached');
  await p.click('#b-stand');
  await p.waitForTimeout(1600);
  const t = await txt(p, '#st-board');
  ok('it says it could not reach the board', /Could not reach the board/.test(t), t.slice(0, 80));
  ok('  and that your terms are kept anyway', /still recorded/.test(t));
  ok('  rather than sitting on a spinner', !/Reading the board/.test(t));
  ok('the tenure board says so too', /Could not reach/.test(await txt(p, '#st-tenure')));
  /* THE SCREEN IS STILL A SCREEN. You can leave it. */
  await p.click('#b-stback');
  await p.waitForTimeout(800);
  ok('and it can still be left', await on(p, 's-office'));
  ok('nothing threw', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
  await p.close();
}

await b.close();
console.log(bad ? '\n' + bad + ' FAILURES' : '\nall clear');
process.exit(bad ? 1 : 0);
