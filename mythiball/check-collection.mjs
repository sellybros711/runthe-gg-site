/* THE COLLECTION, held to what it promises.

     node mythiball/check-collection.mjs
     MYTHIBALL_PAGE=path/to/copy.html node mythiball/check-collection.mjs

   Everybody starts with the same ten, the middle of the roster is pulled
   from packs, the best are earned on the field, and your own player drafts
   like anybody else and never turns up in the other dugout. Every one of
   those can break without throwing: a pack that hands out a ladder
   character is a legend for sale, a migration that forgets the old save
   deletes a tester's club, and a player who leaks into an opponent's lineup
   is you pitching to yourself. None of them draw anything wrong.

   Each claim here was proved by reintroducing its defect in a copy of the
   page: the veteran grant removed, the ladder put in the packs, a forfeit
   paid, your player let into the opponents' pool, and the first version's
   refunds (which made a pack a coin machine). Nothing here reaches a
   network: the page is static and the game has no server. */
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const PAGE = process.env.MYTHIBALL_PAGE
  ? path.resolve(process.env.MYTHIBALL_PAGE)
  : path.resolve(path.dirname(new globalThis.URL(import.meta.url).pathname), 'index.html');
const BASE = 'file://' + PAGE;
let fails = 0, passes = 0;
const ok = (cond, what, detail) => {
  if (cond) { passes++; console.log('  ok  ' + what); }
  else { fails++; console.log('  FAIL ' + what + (detail ? '  (' + detail + ')' : '')); }
};

const browser = await chromium.launch();
async function fresh(prefs, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 } });
  if (prefs) await ctx.addInitScript((p) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('allstars.prefs.v1', JSON.stringify(p));
      sessionStorage.setItem('seeded', '1');
    }
  }, prefs);
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  await pg.goto(BASE);
  await pg.waitForFunction(() => typeof PACK_POOL !== 'undefined' && typeof render === 'function');
  return { ctx, pg, errors };
}

/* ---- 1. the three groups are the whole roster, once each ---- */
console.log('the roster is split three ways, once each');
{
  const { ctx, pg, errors } = await fresh();
  const r = await pg.evaluate(() => {
    const keys = ROSTER.map(c => c.k);
    const ladder = Object.keys(UNLOCKS), pool = PACK_POOL.map(c => c.k);
    const all = STARTERS.concat(pool, ladder);
    const tiers = { common: 0, rare: 0, epic: 0 };
    pool.forEach(k => tiers[PACK_RARITY[k]]++);
    /* rarity follows value: every epic is worth more than every common */
    const val = (r) => pool.filter(k => PACK_RARITY[k] === r).map(k => charValue(ROSTER_BY_KEY[k]));
    return {
      n: keys.length, starters: STARTERS.length, startersReal: STARTERS.every(k => ROSTER_BY_KEY[k]),
      startersFree: STARTERS.every(k => !UNLOCKS[k]),
      covered: keys.every(k => all.includes(k)), dup: all.length - new Set(all).size,
      tiers, epicFloor: Math.min(...val('epic')), commonCeil: Math.max(...val('common')),
      poolTop: Math.max(...pool.map(k => charValue(ROSTER_BY_KEY[k]))),
      ladderBottom: Math.min(...ladder.map(k => charValue(ROSTER_BY_KEY[k]))),
      starterArms: STARTERS.filter(k => ROSTER_BY_KEY[k].pit >= 55).length,
    };
  });
  ok(r.starters === 10 && r.startersReal && r.startersFree, 'ten starters, all real, none on the ladder');
  ok(r.covered && r.dup === 0, 'starters, packs and ladder cover all ' + r.n + ' with nobody twice', 'dup ' + r.dup);
  ok(r.tiers.common && r.tiers.rare && r.tiers.epic, 'the pool has all three rarities', JSON.stringify(r.tiers));
  ok(r.epicFloor > r.commonCeil, 'rarity follows the game\'s own value', `${r.commonCeil.toFixed(1)} < ${r.epicFloor.toFixed(1)}`);
  ok(r.poolTop < r.ladderBottom, 'THE BEST ARE NEVER FOR SALE: every ladder character outranks every pack one',
     `pack best ${r.poolTop.toFixed(1)}, ladder worst ${r.ladderBottom.toFixed(1)}`);
  ok(r.starterArms >= 3, 'the starting ten can put a real arm on the mound', r.starterArms + ' arms at 55 PIT or better');
  ok(!errors.length, 'no page errors', errors.join(' | '));
  await ctx.close();
}

/* ---- 2. a new player, and a player who was here before packs ---- */
console.log('a new player gets ten, a veteran keeps everybody');
{
  const { ctx, pg, errors } = await fresh();
  const r = await pg.evaluate(() => ({
    open: DRAFTABLE().filter(c => isUnlocked(c.k)).map(c => c.k), starters: STARTERS,
    free: PROGRESS.freePacks, coins: PROGRESS.coins, me: !!ME,
    ladderShut: Object.keys(UNLOCKS).every(k => !isUnlocked(k)),
  }));
  ok(r.open.length === 10 && r.open.every(k => r.starters.includes(k)), 'a fresh save opens exactly the ten', r.open.join(','));
  ok(r.ladderShut && !r.me, 'with the ladder shut and no player of their own yet');
  ok(r.free === 1 && r.coins === 0, 'and one free pack to open on the way in');
  ok(!errors.length, 'no page errors', errors.join(' | '));
  await ctx.close();
}
{
  /* A save from before packs: games played, a ladder rung cleared, no
     collection fields at all. */
  const { ctx, pg, errors } = await fresh({ progress: { games: 12, wins: 2, unlocked: ['mrsclaus'], seasons: [] } });
  const r = await pg.evaluate(() => ({
    open: ROSTER.filter(c => isUnlocked(c.k)).length,
    nonLadder: ROSTER.filter(c => !UNLOCKS[c.k]).length,
    shutNonLadder: ROSTER.filter(c => !UNLOCKS[c.k] && !isUnlocked(c.k)).map(c => c.k),
    mrs: isUnlocked('mrsclaus'), vet: PROGRESS.veteran, games: PROGRESS.games,
    saved: JSON.parse(localStorage.getItem('allstars.prefs.v1')).progress.owned.length,
  }));
  ok(r.shutNonLadder.length === 0, 'A VETERAN KEEPS EVERYBODY THEY HAD: no pack character is taken away', r.shutNonLadder.join(','));
  ok(r.mrs && r.open === r.nonLadder + 1, 'and keeps the ladder rung they already cleared', `${r.open} open`);
  ok(r.vet && r.games === 12, 'the rest of the old progress is untouched');
  ok(r.saved === r.nonLadder - 10, 'and the grant is written to the save, so it survives a reload', 'owned ' + r.saved);
  await pg.reload();
  await pg.waitForFunction(() => typeof PACK_POOL !== 'undefined');
  const again = await pg.evaluate(() => ({ owned: PROGRESS.owned.length, free: PROGRESS.freePacks }));
  ok(again.owned === r.saved, 'the migration runs once: a reload neither adds nor removes');
  ok(!errors.length, 'no page errors', errors.join(' | '));
  await ctx.close();
}

/* ---- 3. what a pack can hold ---- */
console.log('a pack');
{
  const { ctx, pg, errors } = await fresh();
  const r = await pg.evaluate(() => {
    const poolKeys = new Set(PACK_POOL.map(c => c.k));
    const out = { bad: [], dupEarly: 0, broke: null, neg: false, packs: 0, noGain: 0 };
    /* too poor to buy costs nothing and returns nothing */
    PROGRESS.coins = 10;
    out.broke = openPack('sandlot', false) === null && PROGRESS.coins === 10;
    for (let run = 0; run < 6; run++) {
      PROGRESS.owned = []; PROGRESS.coins = 0;
      while (PROGRESS.owned.length < PACK_POOL.length) {
        /* A Gold Pack holds no commons, so a run of nothing but gold can
           never finish; alternate on the odd runs instead. */
        const id = run % 2 && out.packs % 2 ? 'gold' : 'sandlot';
        PROGRESS.coins += PACKS[id].price;
        const before = new Set(PROGRESS.owned);
        const cards = openPack(id, false);
        out.packs++;
        if (PROGRESS.coins < 0) out.neg = true;
        const back = cards.reduce((t, c) => t + (c.coins | 0), 0);
        if (back >= PACKS[id].price) out.profit = (out.profit || 0) + 1;
        /* walked in draw order, so two character cards in one pack are
           judged against what the first one had already handed out */
        for (const c of cards) {
          if ((c.type === 'char' || c.type === 'dup') && !poolKeys.has(c.k)) out.bad.push(c.k);
          if (c.type === 'char' && before.has(c.k)) out.bad.push('again:' + c.k);
          if (c.type === 'dup') {
            const tierLeft = PACK_POOL.filter(x => PACK_RARITY[x.k] === c.r && !before.has(x.k)).length;
            if (tierLeft) out.dupEarly++;
          }
          if (c.type === 'char') before.add(c.k);
        }
        if (out.packs > 4000) break;
      }
    }
    /* after the whole pool is owned a character slot still pays */
    out.ownedAtEnd = PROGRESS.owned.length + '/' + PACK_POOL.length + ' after ' + out.packs;
    PROGRESS.coins = 450;
    const late = openPack('gold', false);
    out.lateKinds = late.map(c => c.type);
    /* and with the point cap reached as well, which is where the first
       version turned into a coin machine */
    PROGRESS.bankPoints = ME_POINT_CAP; out.lateProfit = 0;
    PROGRESS.gear = ME_GEAR.filter(x => x.r).map(x => x.id);
    for (let i = 0; i < 400; i++) {
      PROGRESS.coins = 150;
      const cs = openPack('sandlot', false);
      if (cs.reduce((t, c) => t + (c.coins | 0), 0) >= 150) out.lateProfit++;
    }
    return out;
  });
  ok(r.broke, 'a pack you cannot afford costs nothing and opens nothing');
  ok(!r.bad.length, 'a pack only ever holds pack characters, and never one you already have as new', r.bad.slice(0, 5).join(','));
  ok(r.dupEarly === 0, 'a repeat only happens once that whole rarity is yours', r.dupEarly + ' early repeats');
  ok(!r.neg, 'the coin balance never goes negative');
  ok(!r.profit && !r.lateProfit, 'A PACK NEVER PAYS BACK ITS PRICE, even with the collection finished',
     (r.profit | 0) + ' early, ' + (r.lateProfit | 0) + ' late');
  ok(r.lateKinds.every(t => t !== 'char'), 'a full collection turns character slots into something else', r.lateKinds.join(',') + ' ' + r.ownedAtEnd);
  ok(!errors.length, 'no page errors', errors.join(' | '));
  await ctx.close();
}

/* ---- 4. your player ---- */
console.log('your player');
{
  const { ctx, pg, errors } = await fresh();
  const r = await pg.evaluate(() => {
    const out = {};
    /* points banked before the player exists carry in */
    meGrantPoint(); meGrantPoint();
    meCreate({ name: '<b>Ace</b> Jones the Third', build: 'ace', bats: 'L', look: { hat: 'crown' } });
    out.name = ME.n; out.banked = PROGRESS.me.points; out.bats = batsLeft('me');
    out.inTable = ROSTER_BY_KEY.me === ME; out.draftable = DRAFTABLE()[0] === ME && isUnlocked('me');
    out.notInRoster = !ROSTER.some(c => c.k === 'me');
    /* the drawing: every pose a whole 64 by 64 grid, standing on row 62 */
    const spr = V2_SPRITES.me, poses = Object.keys(spr.f);
    out.poseProblems = [];
    for (const p of poses) {
      const rows = v2Frame('me', p);
      if (rows.length !== 64 || rows.some(r => r.length !== 64)) out.poseProblems.push(p + ':size');
      const lit = rows.map((r, y) => /[^.]/.test(r) ? y : -1).filter(y => y >= 0);
      if (lit[lit.length - 1] !== 62) out.poseProblems.push(p + ':floor ' + lit[lit.length - 1]);
      for (const row of rows) for (const ch of row) if (ch !== '.' && !spr.p[ch]) { out.poseProblems.push(p + ':key ' + ch); break; }
    }
    const need = ['idle', 'ready', 'load', 'swing', 'swing1', 'follow', 'run1', 'run2', 'run3', 'run4', 'cheer', 'catch', 'throw', 'back', 'slump', 'windup', 'kick', 'release', 'backrun1', 'backrun2'];
    out.missing = need.filter(p => !spr.f[p]);
    const same = (a, b) => v2Frame('me', a).join('/') === v2Frame('me', b).join('/');
    out.actionAsIdle = ['ready', 'swing', 'run1', 'cheer'].filter(p => same(p, 'idle'));
    out.runCycle = new Set(['run1', 'run2', 'run3', 'run4'].map(p => v2Frame('me', p).join('/'))).size;
    out.batPoses = spr.b.every(p => spr.f[p]);
    /* a hat changes the drawing, and the cache lets go of the old one */
    const before = v2Frame('me', 'idle').join('/');
    spriteFor('me', 64, 'idle');
    PROGRESS.me.look.hat = 'helmet'; meSync();
    out.recached = v2Frame('me', 'idle').join('/') !== before && ![...spriteStore.keys()].some(k => k === 'me|64|idle' || k === 'me|64|idle|s');
    /* growth: levels pay points, points stop at the cap, stats stop at 95 */
    meXpGain(100000);
    out.level = PROGRESS.me.level; out.earned = PROGRESS.me.earned;
    PROGRESS.me.points = 500;
    for (let i = 0; i < 400; i++) meSpend('pit');
    out.pit = ME.pit;
    PROGRESS.me.earned = ME_POINT_CAP; PROGRESS.me.points = 0;
    out.overCap = meGrantPoint();
    return out;
  });
  ok(r.name === 'bAce/b Jones t', 'a name is cleaned and cut to fourteen', JSON.stringify(r.name));
  ok(r.banked === 2, 'training cards pulled before the player existed carry in');
  ok(r.bats, 'bats left when you say so');
  ok(r.inTable && r.draftable && r.notInRoster, 'drafts like anybody, first on the board, and is not in the pool opponents are built from');
  ok(!r.missing.length, 'every pose the game asks for is drawn', r.missing.join(','));
  ok(!r.poseProblems.length, 'every pose is a whole grid in its own palette, standing on the dirt', r.poseProblems.slice(0, 5).join(','));
  ok(!r.actionAsIdle.length && r.runCycle === 4, 'the stance, swing, run and cheer are their own drawings, and the run is four frames',
     r.actionAsIdle.join(',') + ' / run ' + r.runCycle);
  ok(r.batPoses, 'the poses that carry a bat exist, so the prop bat is not drawn twice');
  ok(r.recached, 'new gear redraws the player and drops the old picture from the cache');
  ok(r.level === 60, 'levels stop at the top level', 'level ' + r.level);
  ok(r.earned <= 120, 'points earned never pass the cap', 'earned ' + r.earned);
  ok(r.pit === 95, 'a stat stops at 95', 'pit ' + r.pit);
  ok(r.overCap === false, 'a point past the cap is refused');
  ok(!errors.length, 'no page errors', errors.join(' | '));
  await ctx.close();
}

/* ---- 5. your player never plays for the other side ---- */
console.log('nobody faces themselves');
{
  const { ctx, pg, errors } = await fresh();
  const r = await pg.evaluate(() => {
    meCreate({ name: 'Me', build: 'slugger' });
    const mine = ['me'].concat(STARTERS.slice(0, 8));
    const leaks = [];
    /* THE HARD CASE: your player is NOT in your lineup, so nothing reserves
       them, and they are rated exactly like the man a club has to replace,
       so a pool that held them would pick them first. Asked of every man on
       every club's card. */
    const keep = Object.assign({}, PROGRESS.me.add);
    for (const o of OPPONENTS) for (const k of o.roster) {
      const c = ROSTER_BY_KEY[k];
      for (const st of ME_STATS) PROGRESS.me.add[st] = c[st] - ME_BUILDS[PROGRESS.me.build][st];
      meSync();
      const nine = opposingNine([k], o.roster);
      if (nine.includes('me')) leaks.push(o.name + ':' + k);
    }
    PROGRESS.me.add = keep; meSync();
    State.mode = 'exhibition'; State.team = mine; State.teamName = 'Mine';
    State.opponent = OPPONENTS[0];
    startGame({});
    const g = State.game;
    const you = g.away.isYou ? g.away : g.home, foe = g.away.isYou ? g.home : g.away;
    const fielded = you.batters.some(b => b.k === 'me');
    const foeHas = foe.batters.some(b => b.k === 'me');
    const rating = (you.batters.find(b => b.k === 'me') || {}).pow;
    stopFieldLoop && stopFieldLoop();
    return { leaks, fielded, foeHas, rating };
  });
  ok(!r.leaks.length, 'no club ever fields your player', r.leaks.join(','));
  ok(r.fielded && !r.foeHas, 'a lineup with your player in it takes the field, on your side only');
  ok(r.rating === 62, 'at the ratings the player screen shows', 'pow ' + r.rating);
  ok(!errors.length, 'no page errors', errors.join(' | '));
  await ctx.close();
}

/* ---- 6. what a game pays ---- */
console.log('what a game pays');
{
  const { ctx, pg, errors } = await fresh();
  const r = await pg.evaluate(() => {
    meCreate({ name: 'Me', build: 'speed' });
    const mk = (inn, forfeit) => ({ innings: inn, forfeit, stats: { hits: { me: 2 }, hr: { me: 1 }, sb: {} }, kBy: {} });
    const you = { score: 6, batters: [{ k: 'me' }] }, foe = { score: 2, batters: [] };
    const sum = (l) => l.reduce((a, x) => a + x[1], 0);
    State.difficulty = 'medium';
    PROGRESS.dayWin = null;
    const first = gameCoins(mk(5), true, you, foe, false);
    const second = gameCoins(mk(5), true, you, foe, false);
    const nine = gameCoins(mk(9), true, you, foe, false);
    const forfeit = gameCoins(mk(5, true), false, you, foe, false);
    const loss = gameCoins(mk(5), false, you, foe, false);
    State.difficulty = 'hard';
    const hard = gameCoins(mk(5), true, you, foe, false);
    State.difficulty = 'medium';
    const title = gameCoins(mk(5), true, you, foe, true);
    const xpIn = gameXp(mk(5), true, you);
    const xpOut = gameXp(mk(5), true, { batters: [{ k: 'tom' }] });
    const before = PROGRESS.coins;
    const settled = settleCollection(mk(5), true, you, foe, false);
    return {
      bonusOnce: first.some(l => /today/.test(l[0])) && !second.some(l => /today/.test(l[0])),
      nineMore: sum(nine) > sum(second), forfeit: forfeit.length, lossPays: sum(loss) > 0 && sum(loss) < sum(second),
      hardMore: sum(hard) > sum(second), titlePays: sum(title) - sum(second), xpIn, xpOut,
      banked: PROGRESS.coins - before === settled.coins, saved: JSON.parse(localStorage.getItem('allstars.prefs.v1')).progress.coins === PROGRESS.coins,
    };
  });
  ok(r.bonusOnce, 'the first win of the day pays a bonus, once');
  ok(r.nineMore && r.hardMore, 'nine innings pay more than five, and a hard dugout more than a medium one');
  ok(r.forfeit === 0, 'LEAVING A GAME PAYS NOTHING, or quitting would be the quick way to a pack');
  ok(r.lossPays, 'a loss still pays, less than a win');
  ok(r.titlePays === 200, 'a title pays its bonus');
  ok(r.xpIn > 0 && r.xpOut === 0, 'XP goes to your player only when they played', `${r.xpIn} in, ${r.xpOut} out`);
  ok(r.banked && r.saved, 'the coins land in the bank and in the save');
  ok(!errors.length, 'no page errors', errors.join(' | '));
  await ctx.close();
}

/* ---- 7. the screens, measured ---- */
console.log('the screens');
for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  const { ctx, pg, errors } = await fresh(null, vp);
  await pg.waitForSelector('.locker .lk-packs');
  const menu = await pg.evaluate(() => {
    const l = document.querySelector('.locker').getBoundingClientRect();
    const off = [...document.querySelectorAll('.locker button')].filter(b => {
      const r = b.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 0.5;
    }).length;
    return { w: l.width, off, ping: document.querySelector('.lk-packs').classList.contains('ping'),
             modes: document.querySelectorAll('.hmode').length };
  });
  ok(menu.off === 0 && menu.w > 0, `${vp.width}: the locker is on the menu and inside the window`);
  ok(menu.ping, `${vp.width}: the free pack is signalled on the menu`);
  ok(menu.modes === 4, `${vp.width}: the four mode tiles are unchanged`, menu.modes + ' tiles');
  await pg.click('.lk-packs');
  await pg.waitForSelector('.pk-free .btn');
  await pg.click('.pk-free .btn');
  await pg.waitForFunction(() => document.querySelectorAll('.pk-flip.on').length === 3, null, { timeout: 8000 });
  await pg.waitForTimeout(700);
  const rv = await pg.evaluate(() => {
    const chips = [...document.querySelectorAll('.pk-front .rchip, .pk-front .pk-new')];
    const white = chips.every(c => getComputedStyle(c).color === 'rgb(255, 255, 255)');
    const again = [...document.querySelectorAll('.pk-box .btn')].find(b => /another/i.test(b.textContent));
    const box = document.querySelector('.pk-box').getBoundingClientRect();
    return { chips: chips.length, white, againShown: getComputedStyle(again).display !== 'none',
             coins: PROGRESS.coins, inside: box.top >= 0 && box.bottom <= innerHeight + 0.5 && box.left >= 0 && box.right <= innerWidth + 0.5 };
  });
  ok(rv.chips > 0 && rv.white, `${vp.width}: the rarity and NEW chips are readable on the card`, `${rv.chips} chips`);
  ok(rv.againShown === (rv.coins >= 150), `${vp.width}: "Open another" is offered only when there is a pack to open`, `coins ${rv.coins}`);
  ok(rv.inside, `${vp.width}: the reveal fits the window`);
  await pg.click('.pk-box .btn.ghost');
  await pg.evaluate(() => { State.screen = 'me'; render(); });
  await pg.fill('.me-input', 'Casey');
  await pg.click('text=Create player');
  const me = await pg.evaluate(() => {
    const plus = document.querySelectorAll('.me-plus').length;
    const over = document.documentElement.scrollWidth > innerWidth + 0.5;
    return { made: !!ME && ME.n === 'Casey', plus, over };
  });
  ok(me.made && me.plus === 5, `${vp.width}: a player is made from the screen, with a control per stat`);
  ok(!me.over, `${vp.width}: the player screen does not scroll sideways`);
  ok(!errors.length, `${vp.width}: no page errors`, errors.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
