/* The defense draft: the pool, the arithmetic, and the mode played through a browser.
 *
 *   node football/build/test/test_defense.mjs                 (pool + engine only)
 *   (nohup node cfb/build/test/gzip_server.mjs &)
 *   BROWSER=1 node football/build/test/test_defense.mjs       (adds the played season)
 *
 * The claim this file defends is not "a defense mode exists". It is that the defense mode
 * is the SAME GAME from the other side, which is a much easier thing to get wrong, and
 * three ways in particular:
 *
 *   THE MONEY HAS TO MEAN THE SAME THING. The cap puzzle is the game. If a $30M defender
 *   buys more or less than a $30M receiver, the two modes are two different games sharing
 *   an interface and a player moving between them has to relearn what money is worth.
 *
 *   THE DRAFT HAS TO MATTER AS MUCH. The achievable spread on defense is a third of the
 *   offensive one, because IDP scoring is tackle-led and tackle counts barely separate
 *   starters. That is what DEF_POWER exists to correct, and a regression in it would not
 *   throw or look wrong on screen: every season would just quietly play the same.
 *
 *   THE SEASON HAS TO BE AS WINNABLE. Same reason, other direction.
 *
 * The browser half is opt-in because it needs a server and takes a minute, and because the
 * first two halves are what catch a silent balance regression.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(`${ROOT}/football/engine.js`);
const HOST = process.env.HOST || 'http://localhost:8081';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 160) : '')); };

const rd = (f) => JSON.parse(fs.readFileSync(`${ROOT}/football/data/${f}`, 'utf8'));
const D = rd('defender_seasons.json');
const O = rd('player_seasons.json');
const TS = rd('team_seasons.json');
const LC = rd('league_context.json');
const CAL = rd('display_calibration.json');
/* The pool ships idp_ppg_*; the engine samples ppr_ppg_* because it is the same arithmetic
   on a different rating. The page normalises the same way on load. */
for (const p of D) { p.ppr_ppg_mean = p.idp_ppg_mean; p.ppr_ppg_sd = p.idp_ppg_sd; }

console.log('=== the pool ===');
{
  const slots = new Set(D.map((p) => p.position));
  ok('three slots, and only three', slots.size === 3 && ['DL', 'LB', 'DB'].every((s) => slots.has(s)),
    [...slots]);
  /* A wheel can stop on any team-season, and five of the six spots are position-locked, so
     a team-season that cannot fill one is a board the player cannot draft from. */
  const bySeason = new Map();
  for (const p of D) {
    if (!p.team_season_id) continue;
    if (!bySeason.has(p.team_season_id)) bySeason.set(p.team_season_id, new Set());
    bySeason.get(p.team_season_id).add(p.position);
  }
  const holes = [...bySeason.entries()].filter(([, s]) => s.size < 3).map(([k]) => k);
  ok('every team-season can fill every slot', holes.length === 0,
    { teamSeasons: bySeason.size, holes: holes.slice(0, 5) });

  /* The era has to be the offense pool's era, or the two modes are drafting from different
     games and the wheel would offer years one of them cannot honour. */
  const dY = D.map((p) => p.season), oY = O.map((p) => p.season);
  ok('the same era as the offense pool',
    Math.min(...dY) === Math.min(...oY) && Math.max(...dY) === Math.max(...oY),
    { defense: [Math.min(...dY), Math.max(...dY)], offense: [Math.min(...oY), Math.max(...oY)] });

  /* THE MONEY MEANS THE SAME THING. Same floor, same ceiling, and a comparable share of
     each pool at the ceiling: if one side could buy a maximum-price man far more easily
     than the other, the cap would be a different puzzle in the two modes. */
  const price = (rows) => rows.map((p) => p.price_musd).sort((a, b) => a - b);
  const dp = price(D), op = price(O);
  ok('the same price floor and ceiling as offense',
    dp[0] === op[0] && dp.at(-1) === op.at(-1), { defense: [dp[0], dp.at(-1)], offense: [op[0], op.at(-1)] });
  const atMax = (a) => a.filter((v) => v >= a.at(-1) - 0.05).length / a.length;
  ok('a comparable share of each pool costs the maximum',
    Math.abs(atMax(dp) - atMax(op)) < 0.02,
    { defense: (100 * atMax(dp)).toFixed(2) + '%', offense: (100 * atMax(op)).toFixed(2) + '%' });

  /* Every card has to be readable as a fact about a real season. */
  const noLine = D.filter((p) => !p.stat_line);
  ok('every defender has a stat line', noLine.length === 0, { without: noLine.length });
  const watt = D.find((p) => p.name === 'J.J. Watt' && p.season === 2012);
  ok('the best defensive season in the pool costs the ceiling',
    !!watt && watt.price_musd === dp.at(-1),
    watt && { price: watt.price_musd, line: watt.stat_line, badges: watt.badges });
}

console.log('\n=== the arithmetic ===');
{
  /* Better defense, fewer points. The direction is the whole mode, and it is one sign flip
     away from being exactly backwards. */
  const worse = E.defenseSuppression(40), mid = E.defenseSuppression(50), better = E.defenseSuppression(60);
  ok('a better defense suppresses harder', worse > mid && mid > better,
    { at40: worse.toFixed(3), at50: mid.toFixed(3), at60: better.toFixed(3) });
  ok('and the median drafted defense is close to neutral',
    Math.abs(E.defenseSuppression(50) - 0.81) < 0.05, E.defenseSuppression(50).toFixed(3));
  /* DEF_POWER is what carries the compressed defensive spread onto the scoreboard. Below
     about 2 the draft stops mattering; this is the guard on that. */
  const spread = E.defenseSuppression(47.4) / E.defenseSuppression(51.9);
  ok('the draft moves the scoreboard as much as it does on offense',
    spread > 1.18 && spread < 1.30, { spread: spread.toFixed(3), want: '~1.225' });
}

console.log('\n=== a season, both modes ===');
{
  const byTS = (rows) => { const m = new Map();
    for (const r of rows) { if (!r.team_season_id) continue;
      if (!m.has(r.team_season_id)) m.set(r.team_season_id, []); m.get(r.team_season_id).push(r); }
    return m; };
  const dTS = byTS(D), oTS = byTS(O);
  const teams = TS.filter((t) => t.pts_scored_mean && t.pts_allowed_mean);
  const avgAllowed = LC.league_avg_pts_allowed_by_season;
  let seed = 987654321;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const CAP = 140, FLOOR = 3;
  const draft = (slots, pool, elig) => {
    const ks = [...pool.keys()]; let spent = 0; const took = [];
    for (let i = 0; i < slots.length; i++) {
      const ts = ks[Math.floor(rnd() * ks.length)];
      const opts = (pool.get(ts) || []).filter((p) => elig[slots[i]].includes(p.position));
      if (!opts.length) { i--; continue; }
      const budget = CAP - spent - FLOOR * (slots.length - 1 - i);
      const can = opts.filter((p) => p.price_musd <= budget);
      const from = can.length ? can : opts.slice().sort((a, b) => a.price_musd - b.price_musd).slice(0, 1);
      from.sort((a, b) => b.ppr_ppg_mean - a.ppr_ppg_mean);
      took.push(from[0]); spent += from[0].price_musd;
    }
    return took;
  };
  const measure = (slots, pool, elig, defense, n) => {
    const wins = [], totals = [], allowed = [];
    for (let i = 0; i < n; i++) {
      const roster = draft(slots, pool, elig);
      totals.push(roster.reduce((t, p) => t + p.ppr_ppg_mean, 0));
      let w = 0;
      for (let g = 0; g < 17; g++) {
        const opp = teams[Math.floor(rnd() * teams.length)];
        const la = avgAllowed[opp.season] ?? 21.5;
        const r = defense
          ? E.resolveGameDefense(roster, 1, opp, la, rnd, E.CONSTANTS, 1)
          : E.resolveGame(roster, 1, opp, la, rnd, E.CONSTANTS, 1);
        if (r.won) w++;
        allowed.push(E.toFootballScore(r.yourScore, r.oppScore, r.won, rnd, CAL).them);
      }
      wins.push(w);
    }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const pairs = totals.map((t, i) => [t, wins[i]]).sort((a, b) => a[0] - b[0]);
    const tenth = Math.max(1, Math.floor(pairs.length * 0.1));
    const lo = mean(pairs.slice(0, tenth).map((x) => x[1]));
    const hi = mean(pairs.slice(-tenth).map((x) => x[1]));
    return { wins: mean(wins), gap: hi - lo, allowed: mean(allowed) };
  };
  const N = Number(process.env.SEASONS || 600);
  const o = measure(['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX'], oTS,
    { QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'] }, false, N);
  const d = measure(E.DEFENSE_SLOTS, dTS,
    { DL: ['DL'], LB: ['LB'], DB: ['DB'], FLEX: ['DL', 'LB', 'DB'] }, true, N);
  console.log(`  ${N} seasons each`);
  console.log(`  offense: ${o.wins.toFixed(2)} wins, draft gap ${o.gap.toFixed(2)}, allowed ${o.allowed.toFixed(1)}`);
  console.log(`  defense: ${d.wins.toFixed(2)} wins, draft gap ${d.gap.toFixed(2)}, allowed ${d.allowed.toFixed(1)}`);
  ok('a defensive season is about as winnable as an offensive one',
    Math.abs(o.wins - d.wins) < 1.5, { offense: o.wins.toFixed(2), defense: d.wins.toFixed(2) });
  ok('and the draft matters about as much',
    Math.abs(o.gap - d.gap) < 1.0, { offense: o.gap.toFixed(2), defense: d.gap.toFixed(2) });
  /* The mode's own identity: you are the side that stops people. */
  ok('a drafted defense allows fewer points than a drafted offense does',
    d.allowed < o.allowed, { defense: d.allowed.toFixed(1), offense: o.allowed.toFixed(1) });
}

if (process.env.BROWSER) {
  console.log('\n=== the mode, in a browser ===');
  const { chromium } = await import('playwright');
  const PROBE = `${ROOT}/football/__test_defense.html`;
  /* One anchor, the same insertion every harness for this page uses. */
  const HOOK = `
window.__DEF={
  menu:()=>modeMenu(),
  auth(st){ authState=st; },
  slots:()=>slotsNow(),
  tabs:()=>[...document.querySelectorAll('#tabs .tab')].map(t=>t.textContent),
  roster:()=>(run&&run.roster||[]).map(p=>({pos:p.position,price:p.price_musd})),
  state:()=>{ const s=run&&run.season||{}; const rs=s.results||[];
    return { defense:!!(run&&run.defense), mode:runMode(), label:runModeLabel(),
      wins:s.wins, losses:s.losses, games:rs.length,
      defMods:rs.slice(0,3).map(r=>r.defMod) }; },
};

boot();`;
  const src = fs.readFileSync(`${ROOT}/football/index.html`, 'utf8');
  if (src.split('\nboot();').length !== 2) throw new Error('the boot() anchor moved');
  fs.writeFileSync(PROBE, src.replace('\nboot();', HOOK));
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { try {
      localStorage.setItem('ps_seen_guide', '1'); localStorage.setItem('rtg_arcade_ad_off', '1');
    } catch (e) {} });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => { bad++; console.log('  FAIL  page error   ' + String(e.message).split('\n')[0]); });
    await p.goto(`${HOST}/football/__test_defense.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.__DEF && document.getElementById('s-intro'), null, { timeout: 60000 });
    await p.evaluate(() => window.__DEF.auth({ ready: true, signedIn: true, name: 'Tester', userId: 'u1' }));
    await p.evaluate(() => window.__DEF.menu());
    await p.waitForTimeout(400);
    ok('the menu offers the mode', await p.evaluate(() => {
      const b2 = document.getElementById('b-mc-def'); return !!b2 && !b2.disabled; }));
    await p.click('#b-mc-def');
    await p.waitForSelector('#opts .tile', { timeout: 60000 });
    await p.waitForTimeout(300);
    ok('the roster spots are a defense',
      JSON.stringify(await p.evaluate(() => window.__DEF.slots())) === '["DL","DL","LB","DB","DB","FLEX"]',
      await p.evaluate(() => window.__DEF.slots()));
    ok('the tabs are defensive', await p.evaluate(() => {
      const t = window.__DEF.tabs().join(' ');
      return /DL/.test(t) && /LB/.test(t) && /DB/.test(t) && !/QB|WR/.test(t); }),
      await p.evaluate(() => window.__DEF.tabs()));

    let spent = 0;
    for (let i = 0; i < 9; i++) {
      const done = await p.evaluate(() => ['s-squad', 's-season'].some((id) =>
        document.getElementById(id).classList.contains('on')));
      if (done) break;
      const ready = await p.waitForFunction(() => [...document.querySelectorAll('#opts .tile')]
        .some((x) => !x.disabled && !x.classList.contains('off') && !x.classList.contains('no')),
        null, { timeout: 30000 }).catch(() => null);
      if (!ready) break;
      const got = await p.evaluate(([sp, idx]) => {
        const live = [...document.querySelectorAll('#opts .tile')]
          .filter((x) => !x.disabled && !x.classList.contains('off') && !x.classList.contains('no'));
        const rows = live.map((t) => {
          const m = ((t.querySelector('.th') || {}).textContent || '').match(/\$([\d.]+)M/);
          return { t, cost: m ? parseFloat(m[1]) : 999,
            fppg: parseFloat((t.querySelector('.tf') || {}).textContent) || 0 };
        });
        const budget = 140 - sp - 3 * (5 - idx);
        const can = rows.filter((r) => r.cost <= budget);
        const from = can.length ? can : rows.slice().sort((a, b) => a.cost - b.cost).slice(0, 1);
        from.sort((a, b) => b.fppg - a.fppg);
        from[0].t.click();
        return { cost: from[0].cost };
      }, [spent, i]);
      if (!got) break;
      spent += got.cost;
      await p.waitForTimeout(450);
      if (await p.evaluate(() => document.getElementById('sheet').classList.contains('on'))) {
        await p.evaluate(() => { const x = document.querySelector('.slotopt'); if (x) x.click(); });
        await p.waitForTimeout(450);
      }
    }
    const roster = await p.evaluate(() => window.__DEF.roster());
    ok('six defenders signed, inside the cap',
      roster.length === 6 && roster.every((r) => ['DL', 'LB', 'DB'].includes(r.pos))
      && roster.reduce((t, r) => t + r.price, 0) <= 140.01,
      { n: roster.length, spend: roster.reduce((t, r) => t + r.price, 0).toFixed(1) });

    if (await p.evaluate(() => document.getElementById('s-squad').classList.contains('on'))) {
      await p.click('#b-play');
    }
    await p.waitForSelector('#s-season.on', { timeout: 30000 });
    await p.click('#b-sim');
    await p.waitForSelector('#s-seed.on,#s-over.on', { timeout: 120000 });
    const st = await p.evaluate(() => window.__DEF.state());
    ok('a full season plays', st.games === 17 && st.wins + st.losses === 17, st);
    ok('and every game was resolved as a defense',
      st.defense === true && st.mode === 'defense' && st.label === 'Defense Draft'
      && st.defMods.every((m) => m > 0 && m < 5), st);
    await ctx.close();
  } finally {
    await b.close();
    if (fs.existsSync(PROBE)) fs.unlinkSync(PROBE);
  }
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
