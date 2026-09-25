/*
 * check-modes.mjs - Conquest, Fix History and Six Passes.
 *
 *   node hoops/check-modes.mjs            the rules, the copy, the SQL, a browser walk
 *   node hoops/check-modes.mjs --quick    the rules and the copy only, no browser
 *
 * ── WHAT CAN GO WRONG HERE, AND WHY NONE OF IT THROWS ─────────────────────
 *
 * Every rule in modes.js answers with a valid-looking value when it is
 * wrong. A ladder with a repeated team is a ladder. A steal into a slot the man
 * cannot play is a roster the engine rates without complaint. A Fix History
 * score drawn from a different set of seasons on each device is a number, and
 * a leaderboard ranks it. A Six Passes par that is not the shortest chain is
 * a puzzle somebody can beat. So each is asked as a PROPERTY.
 *
 * THE BALANCE IS A BAND, measured the way modes.js's header measured it: 200
 * Conquest runs taking the best steal and 200 taking none. The claim is the
 * SHAPE (the steal decides the run, and a run that never steals never clears)
 * rather than one number, because the ladder is drawn off the pool and a
 * refreshed season moves every figure a little.
 *
 * THE BROWSER NEVER REACHES THE BOARD. Every request off local.test is
 * answered by a stand-in or refused, because the live project holds real
 * leaderboards and a checker must not file a play on one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const req = createRequire(import.meta.url);
const E = req('./engine.js');
const R = req('./run.js');
const M = req('./modes.js');
E.setTeams(JSON.parse(fs.readFileSync(path.join(HERE, 'data/teams.json'), 'utf8')));
E.setCuratedChemistry(JSON.parse(fs.readFileSync(path.join(HERE, 'data/chemistry.json'), 'utf8')));
const D = R.indexData(JSON.parse(fs.readFileSync(path.join(HERE, 'data/players.json'), 'utf8')));
const QUICK = process.argv.includes('--quick');

const failures = [];
let passed = 0;
function ok(cond, what) { if (cond) passed++; else failures.push(what); }
function section(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

// ── 1. Conquest's rules ─────────────────────────────────────────────────────
section('1. Conquest: the ladder, the steal and the lives');
{
  const a = M.cqCreate(D, 'checkseed01'), b = M.cqCreate(D, 'checkseed01');
  ok(JSON.stringify(a) === JSON.stringify(b), 'one seed is one run: same crew, same ladder');
  ok(a.ladder.length === M.CQ.RUNGS, `the ladder is ${M.CQ.RUNGS} rungs (${a.ladder.length})`);
  ok(new Set(a.ladder).size === a.ladder.length, 'no team-season stands in line twice');
  const top = [...D.teamSeasons].sort((x, y) => y.rating - x.rating)[0].team_season_id;
  ok(a.ladder[a.ladder.length - 1] === top, `the last rung is the best team in the data (${top})`);
  const rt = a.ladder.map((ts) => D.teamStats[ts].rating);
  ok(rt[0] < 35 && rt[rt.length - 2] > 85, `the line climbs from weak to great (${rt[0]} to ${rt[rt.length - 2]})`);
  ok(a.roster.every((k, i) => E.canFillSlot(D.allPlayers[k], E.SLOTS[i])), 'every crew man can play his slot');
  ok(new Set(a.roster.map((k) => D.allPlayers[k].i)).size === 5, 'the crew is five different men');

  /* THE STEAL. Played forward until a win, then every offered swap checked
     against the rule it claims to follow. */
  const st = M.cqCreate(D, 'checksteal02');
  let guard = 0;
  while (!st.pending && !st.lost && guard++ < 10) M.cqPlay(st, D);
  ok(!!st.pending, 'a crew can win a game against the first rungs');
  const opts = M.cqSteals(st, D);
  ok(opts.length > 0, `a win offers steals (${opts.length})`);
  ok(opts.every((o) => E.canFillSlot(D.allPlayers[o.take], E.SLOTS[o.slot])),
    'every offered steal can play the slot it goes into');
  const ids = new Set(st.roster.map((k) => D.allPlayers[k].i));
  ok(opts.every((o) => !ids.has(D.allPlayers[o.take].i) || D.allPlayers[st.roster[o.slot]].i === D.allPlayers[o.take].i),
    'no steal puts one man on the roster twice');
  let threw = false;
  const bad = M.bestFive(D, st.pending.ts).find((p) => !E.canFillSlot(p, 'PG'));
  try { if (bad) M.cqSteal(JSON.parse(JSON.stringify(st)), D, E.pkey(bad), 0); } catch (e) { threw = true; }
  ok(!bad || threw, 'a steal into a slot he cannot play is refused');

  /* LIVES. A loss is forced by recording one, the way the live board would. */
  const lv = M.cqCreate(D, 'checklives03');
  M.cqPlay(lv, D, { won: false, yourPoints: 90, oppPoints: 100, ot: 0 });
  ok(lv.lives === M.CQ.LIVES - 1 && !lv.lost && lv.rung === 0, 'a loss costs a life and the same team stays on');
  M.cqPlay(lv, D, { won: false, yourPoints: 90, oppPoints: 100, ot: 0 });
  M.cqPlay(lv, D, { won: false, yourPoints: 90, oppPoints: 100, ot: 0 });
  ok(lv.lives === 0 && !!lv.lost, 'the last life lost ends the run');
  const bs = M.cqCreate(D, 'checkboss04');
  bs.lives = 1; bs.rung = M.CQ.BOSS_EVERY - 1;
  ok(M.cqIsBoss(bs.rung), `rung ${bs.rung + 1} is a boss`);
  M.cqPlay(bs, D, { won: true, yourPoints: 110, oppPoints: 100, ot: 0 });
  M.cqSteal(bs, D, null, null);
  ok(bs.lives === 2, 'beating a boss gives a life back');
  const full = M.cqCreate(D, 'checkboss05');
  full.rung = M.CQ.BOSS_EVERY - 1;
  M.cqPlay(full, D, { won: true, yourPoints: 110, oppPoints: 100, ot: 0 });
  M.cqSteal(full, D, null, null);
  ok(full.lives === M.CQ.LIVES, 'and never past the most you can have');

  /* A REMATCH IS A NEW GAME. With the attempt left out of the rng tag, a loss
     would replay itself until the lives ran out. */
  let losses = 0, differ = 0;
  for (let i = 0; i < 40 && losses < 8; i++) {
    const r = M.cqCreate(D, 'checkrematch' + i);
    const g1 = M.cqPlay(r, D);
    if (g1.won) continue;
    losses++;
    const g2 = M.cqPlay(r, D);
    if (g2.you !== g1.you || g2.opp !== g1.opp) differ++;
  }
  ok(losses > 0 && differ === losses, `every rematch is a new game (${differ} of ${losses})`);
}

// ── 2. the chance printed before tip-off is the chance the game plays ───────
section('2. the win chance is the one resolveGame plays');
{
  const st = M.cqCreate(D, 'checkchance07');
  for (const rung of [0, 8, 16]) {
    st.rung = rung; st.tries = 0;
    const pv = M.cqPreview(st, D);
    const rng = E.createSeededRNG(1234 + rung);
    let w = 0; const N = 20000;
    for (let i = 0; i < N; i++) if (E.resolveGame(pv.means.pointsFor, pv.means.pointsAgainst, rng, pv.adv).won) w++;
    const sim = w / N;
    ok(Math.abs(sim - pv.chance) < 0.02,
      `rung ${rung}: printed ${(pv.chance * 100).toFixed(1)}% against ${(sim * 100).toFixed(1)}% played`);
  }
}

// ── 3. the balance band ─────────────────────────────────────────────────────
section('3. the steal decides the run');
{
  const N = QUICK ? 60 : 200;
  const smart = (st) => {
    let b = null;
    for (const x of M.cqSteals(st, D)) if (x.delta > 0 && (!b || x.rating > b.rating)) b = x;
    return b;
  };
  const play = (bot) => {
    const wins = []; let clear = 0;
    for (let i = 0; i < N; i++) {
      const st = M.cqCreate(D, 'band' + i);
      let g = 0;
      while (!st.lost && g++ < 80) {
        M.cqPlay(st, D);
        if (st.pending) { const x = bot(st); M.cqSteal(st, D, x ? x.take : null, x ? x.slot : null); }
      }
      wins.push(M.cqStreak(st)); if (M.cqCleared(st)) clear++;
    }
    wins.sort((a, b) => a - b);
    return { median: wins[Math.floor(N / 2)], clear: clear / N, mean: wins.reduce((s, x) => s + x, 0) / N };
  };
  const a = play(smart), b = play(() => null);
  console.log(`  best steal: median ${a.median}, mean ${a.mean.toFixed(1)}, clears ${(a.clear * 100).toFixed(1)}%`);
  console.log(`  no steals:  median ${b.median}, mean ${b.mean.toFixed(1)}, clears ${(b.clear * 100).toFixed(1)}%`);
  ok(a.median >= 4 && a.median <= 12, `a good run is a handful of wins, not one and not fifty (median ${a.median})`);
  ok(a.clear > 0 && a.clear < 0.2, `clearing the ladder is possible and rare (${(a.clear * 100).toFixed(1)}%)`);
  ok(b.clear === 0, 'a run that never steals never clears');
  ok(a.mean > b.mean + 1.5, `stealing is worth wins (${a.mean.toFixed(1)} against ${b.mean.toFixed(1)})`);
}

// ── 4. Fix History ──────────────────────────────────────────────────────────
section('4. Fix History: one team a day, one legal move, one score everywhere');
{
  const list = M.fxCandidates(D);
  ok(list.length > 300, `enough teams that a year never repeats one (${list.length})`);
  const seen = new Set(); let baseMax = 0, baseMin = 1;
  for (let d = 1; d <= 30; d++) {
    const f = M.fxDaily(D, d);
    seen.add(f.ts);
    ok(f.five.every((p, i) => E.canFillSlot(p, E.SLOTS[i])), `day ${d}: every man in ${f.ts} can play his slot`);
    ok(!E.wonTitle(f.ts.split('_')[0], Number(f.ts.split('_')[1])), `day ${d}: ${f.ts} did not win the title`);
    if (d <= 6) {
      const o = M.fxOdds(D, f.five, d, 300).odds;
      baseMax = Math.max(baseMax, o); baseMin = Math.min(baseMin, o);
    }
  }
  ok(seen.size === 30, `thirty days, thirty teams (${seen.size})`);
  ok(baseMax < 0.5, `nobody starts with the title in hand (best ${(baseMax * 100).toFixed(0)}%)`);

  const f = M.fxDaily(D, 11);
  const whole = M.fxOdds(D, f.five, 11, 240).odds;
  let t = 0;
  for (let i = 0; i < 240; i += 37) t += M.fxOddsStep(D, f.five, 11, i, Math.min(240, i + 37)).titles;
  ok(Math.abs(whole - t / 240) < 1e-12, 'the odds come out the same played in slices as all at once');
  ok(M.fxOdds(D, f.five, 11, 120).odds === M.fxOdds(D, f.five, 11, 120).odds, 'and the same twice');

  const out = f.five[0];
  const dear = D.players.find((p) => p.t !== 'TOT' && p.p > out.p + 1 && E.canFillSlot(p, 'PG'));
  const wrong = D.players.find((p) => p.t !== 'TOT' && p.p < out.p && !E.canFillSlot(p, 'PG'));
  const twin = f.five[1];
  ok(/costs more/.test(M.fxRefusal(D, f.five, 0, E.pkey(dear)) || ''), 'a dearer man is refused');
  ok(/cannot play/.test(M.fxRefusal(D, f.five, 0, E.pkey(wrong)) || ''), 'a man who cannot play the slot is refused');
  ok(!!M.fxRefusal(D, f.five, 0, E.pkey(twin)), 'a man already on the team is refused');
  const cheap = D.players.find((p) => p.t !== 'TOT' && p.p <= out.p && E.canFillSlot(p, 'PG')
    && !f.five.some((q) => q.i === p.i));
  ok(M.fxRefusal(D, f.five, 0, E.pkey(cheap)) === null, 'a cheaper man who can play it is allowed');
}

// ── 5. Six Passes ───────────────────────────────────────────────────────────
section('5. Six Passes: a year of puzzles, every par a real shortest chain');
{
  const g = M.psGraph(D);
  let missing = 0; const pars = {};
  for (let d = 1; d <= 365; d++) {
    const p = M.psDaily(g, d);
    if (!p) { missing++; continue; }
    pars[p.par] = (pars[p.par] || 0) + 1;
    if (d <= 40) {
      const path = M.psPath(g, p.from, p.to);
      ok(path && path.length === p.par + 1, `day ${d}: par ${p.par} is a real chain`);
      ok(path.every((id, i) => i === 0 || M.psCanPass(g, path[i - 1], id)), `day ${d}: every pass in it is to a teammate`);
      ok(M.psBfs(g, p.from)[p.to] === p.par, `day ${d}: and nothing is shorter`);
      ok(g.stars[p.from] >= M.PS.STARS && g.stars[p.to] >= M.PS.STARS, `day ${d}: both ends are All-Stars`);
    }
  }
  ok(missing === 0, `every day of a year has a puzzle (${missing} missing)`);
  ok(Object.keys(pars).every((k) => k >= M.PS.PAR_MIN && k <= M.PS.PAR_MAX && k < M.PS.CLOCK),
    `every par fits the shot clock (${JSON.stringify(pars)})`);
  ok(Object.keys(pars).length >= 2, 'and the par varies');
}

// ── 6. a number a player reads is the number the game plays ─────────────────
section('6. the copy and the SQL agree with the constants');
{
  const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const ORD = ['', '', 'second', 'third', 'fourth', 'fifth', 'sixth'];
  const how = fs.readFileSync(path.join(HERE, 'how-to-play.html'), 'utf8');
  ok(how.includes('<b>' + WORD[M.CQ.LIVES] + ' lives</b>'), `the rules page says ${WORD[M.CQ.LIVES]} lives`);
  ok(how.includes('shot clock is ' + WORD[M.PS.CLOCK] + ' passes'), `the rules page says ${WORD[M.PS.CLOCK]} passes`);
  ok(how.includes('Every ' + ORD[M.CQ.BOSS_EVERY] + ' team is a boss'), `the rules page says every ${ORD[M.CQ.BOSS_EVERY]} team is a boss`);

  const sql = fs.readFileSync(path.join(ROOT, 'supabase/116_hoops_modes.sql'), 'utf8');
  ok(sql.includes("date '" + M.DAILY_EPOCH + "'"), `116 counts days from ${M.DAILY_EPOCH}, as modes.js does`);
  const page = fs.readFileSync(path.join(HERE, 'index.html'), 'utf8');
  ok(page.includes("var DAILY_EPOCH = '" + M.DAILY_EPOCH + "'"), 'and so does the page');
  ok(sql.includes('v_passes > ' + M.PS.CLOCK), `116 refuses a chain past the ${M.PS.CLOCK} pass shot clock`);
  ok(sql.includes('p_lives > ' + M.CQ.LIVES), `116 refuses more than ${M.CQ.LIVES} lives`);
  ok(sql.includes('p_slot > ' + (E.SLOTS.length - 1)), 'and a slot past the last one');
  ok(sql.includes('p_par > 6') && M.PS.PAR_MAX <= 6, 'and a par past what the puzzle ever sets');
  ok(M.dayNumberOf(M.DAILY_EPOCH) === 1, 'the epoch is day 1');
}

// ── 7. the page ─────────────────────────────────────────────────────────────
if (!QUICK) {
  section('7. the page, all three modes, the board stood in for');
  const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const pw = createRequire('/opt/node22/lib/node_modules/')('playwright');
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
  const posts = [];
  const escaped = [];
  async function serve(route) {
    const u = new URL(route.request().url());
    /* THE BOARD, stood in for. Submits answer an id; reads answer a row and a
       count in Content-Range, which is what PostgREST sends. */
    if (/supabase\.co$/.test(u.hostname)) {
      if (u.pathname.includes('/rpc/')) {
        posts.push({ fn: u.pathname.split('/').pop(), body: JSON.parse(route.request().postData() || '{}') });
        return route.fulfill({ status: 200, contentType: 'application/json', body: '77' });
      }
      if (u.pathname.endsWith('/rtf_plays')) {
        /* Three counts the page asks: how many are ahead (score=gt), how many
           made the same move (fix_in), and the whole field. Answered as
           different numbers so each line can be told apart. */
        const q = u.search;
        const n = /score=gt/.test(q) ? 2 : /fix_in=/.test(q) ? 5 : 41;
        return route.fulfill({ status: 200, contentType: 'application/json',
          headers: { 'content-range': '0-0/' + n, 'access-control-expose-headers': 'content-range' },
          body: '[]' });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (u.hostname !== 'local.test') { escaped.push(u.hostname); return route.abort(); }
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return route.abort();
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream',
      body: fs.readFileSync(f) });
  }
  const browser = await pw.chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('rtf.guide.v1', '1'); } catch (e) {}
    window.RTF_BOARD_URL = 'https://stand-in.supabase.co';
  });
  const page = await ctx.newPage();
  const boom = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  await page.route('**/*', serve);
  await page.goto('http://local.test/hoops/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#b-today:not([disabled])', { timeout: 60000 });

  const home = await page.evaluate(() => ({
    cards: ['mc-fix', 'mc-ps', 'mc-cq'].map((id) => !!document.getElementById(id)),
    dock: document.querySelector('#dock').textContent.trim(),
  }));
  ok(home.cards.every(Boolean), 'the front page has a card for each of the three');
  ok(/Fix History/.test(home.dock), `the dock offers today's Fix History first ("${home.dock}")`);

  // Fix History, end to end.
  await page.click('#mc-fix');
  await page.waitForSelector('.fx-man');
  const five = await page.evaluate(() => {
    const M = window.RTF_MODES, D = window.RTF_PAGE.data;
    const d = window.RTF_PAGE.dayNumberOf(window.RTF_PAGE.easternISO());
    const f = M.fxDaily(D, d);
    const out = f.five[4];
    const cand = D.players.find((p) => p.t !== 'TOT' && M.fxRefusal(D, f.five, 4, window.RTF_ENGINE.pkey(p)) === null
      && p.n.split(' ').length === 2 && p.w > 4);
    return { day: d, name: cand.n, season: cand.s, key: window.RTF_ENGINE.pkey(cand), out: out.n };
  });
  await page.click('.fx-man[data-slot="4"]');
  await page.fill('#fx-q', five.name.split(' ')[1] + ' ' + String(five.season).slice(-2));
  await page.waitForTimeout(100);
  const hit = await page.$(`.fx-hit[data-k="${five.key}"]`);
  ok(!!hit, `searching "${five.name.split(' ')[1]} ${String(five.season).slice(-2)}" finds ${five.name} ${five.season}`);
  if (hit) {
    await hit.click();
    await page.click('#fx-yes');
    await page.waitForSelector('#fx-share', { timeout: 30000 });
    await page.waitForTimeout(300);
    const saved = await page.evaluate((d) => JSON.parse(localStorage.getItem('rtf.fix.v1')).days[d], five.day);
    ok(!!saved && saved.inKey === five.key, 'the move is kept for the day');
    const sub = posts.find((p) => p.fn === 'rtf_submit_fix');
    ok(!!sub && sub.body.p_in === five.key && sub.body.p_day === five.day, 'and filed with the board, the move and the day');
    ok(sub && Math.abs(sub.body.p_odds - saved.odds) < 1e-4, 'with the odds the screen shows');
    const place = await page.textContent('#fx-place');
    ok(/3rd of 41 today/.test(place), `the place comes off the board ("${place.trim()}")`);
    ok(/4 others made the same move/.test(place), 'and so does how many made the same move');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#b-today:not([disabled])', { timeout: 60000 });
    await page.click('#mc-fix');
    ok(await page.$('#fx-share') !== null && await page.$('.fx-man:not([disabled])') === null,
      'a reload lands on the result: one move a day');
    const dock = await page.evaluate(() => { window.RTF_PAGE.goHome(); return document.querySelector('#dock').textContent.trim(); });
    ok(/Six Passes/.test(dock), `with Fix done, the dock moves on to Six Passes ("${dock}")`);
  }

  // Six Passes, along a shortest chain, through the filter a player uses.
  await page.click('#mc-ps');
  await page.waitForSelector('#ps-q');
  const chain = await page.evaluate(() => {
    const M = window.RTF_MODES, g = M.psGraph(window.RTF_PAGE.data);
    const d = window.RTF_PAGE.dayNumberOf(window.RTF_PAGE.easternISO());
    const p = M.psDaily(g, d);
    return { day: d, par: p.par, path: M.psPath(g, p.from, p.to), names: M.psPath(g, p.from, p.to).map((i) => g.nameOf[i]) };
  });
  for (let i = 1; i < chain.path.length; i++) {
    await page.fill('#ps-q', chain.names[i].split(' ').pop());
    await page.click(`.ps-mate[data-id="${chain.path[i]}"]`);
    await page.waitForTimeout(50);
  }
  const psDone = await page.evaluate((d) => JSON.parse(localStorage.getItem('rtf.passes.v1')).days[d], chain.day);
  ok(psDone && psDone.done && psDone.solved && psDone.chain.length === chain.par + 1, 'a chain at par solves the day');
  const pssub = posts.find((p) => p.fn === 'rtf_submit_passes');
  ok(!!pssub && pssub.body.p_par === chain.par && pssub.body.p_solved === true, 'and is filed with its par and solved');
  ok(/Perfect pass/i.test(await page.textContent('#s-pass')), 'a chain at par is called a perfect pass');

  // Conquest: a game, and the count is not spoiled while it is on.
  await page.evaluate(() => window.RTF_MODES_UI.openConquest());
  await page.click('#cq-new');
  const before = await page.textContent('#cq-wins');
  await page.click('#cq-go');
  const during = await page.textContent('#cq-wins');
  ok(during === before, `the win count does not move before the game is over (${before} then ${during})`);
  await page.waitForFunction(() => document.querySelector('.mx-stamp'), null, { timeout: 20000 });
  const st = await page.evaluate(() => window.RTF_MODES_UI._cq());
  ok(!!(st.pending || st.losses.length), 'the game is recorded on the run');

  // Play it out and check the end is filed once.
  for (let i = 0; i < 200; i++) {
    const s = await page.evaluate(() => { const c = window.RTF_MODES_UI._cq(); return { lost: !!c.lost, pending: !!c.pending }; });
    if (s.lost) break;
    if (await page.$('#cq-again')) { await page.click('#cq-again'); continue; }
    if (await page.$('#cq-keep')) { await page.click('#cq-keep'); continue; }
    if (await page.$('#cq-go')) { await page.click('#cq-go'); await page.waitForFunction(() => document.querySelector('.mx-stamp'), null, { timeout: 20000 }); continue; }
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(500);
  if (await page.$('#cq-end')) { await page.click('#cq-end'); await page.waitForTimeout(300); }
  const cqsub = posts.filter((p) => p.fn === 'rtf_submit_conquest');
  ok(cqsub.length === 1, `a finished run is filed once (${cqsub.length})`);
  ok(cqsub[0] && cqsub[0].body.p_lives === 0 && /^[a-z0-9]{6,40}$/.test(cqsub[0].body.p_seed),
    'with no lives left and a seed the server accepts');

  /* Fonts and the supabase-js bundle are asked for and refused, which is
     fine. What must never appear is a database host: every one is answered by
     the stand-in above, so reaching this list would mean one got past it. */
  const db = escaped.filter((h) => /supabase/.test(h) && !/jsdelivr/.test(h));
  ok(db.length === 0, `no request reached a database (${db.join(', ') || 'none'})`);
  ok(boom.length === 0, `no page errors (${boom.join(' | ') || 'none'})`);
  await browser.close();
}

console.log('');
if (failures.length) {
  console.error(`${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  FAIL: ' + f);
  process.exit(1);
}
console.log(`${passed} assertions passed.`);
