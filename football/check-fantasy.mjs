/*
 * check-fantasy.mjs : Fantasy Challenge, in a real browser.
 *
 *   node football/check-fantasy.mjs
 *   node football/check-fantasy.mjs --quick   the engine half, no browser
 *
 * WHY THIS EXISTS, and it is the same sentence as every other checker in this directory:
 * nothing here throws when it is wrong.
 *
 *   A draft that strands renders an empty board and waits for ever.
 *   A projection that does not add up is six numbers and a seventh that is simply wrong.
 *   A door built for the public before the mode is finished looks exactly like a door.
 *   A wheel that re-rolls on reload is a wheel with unlimited spins, and the only symptom
 *     is that somebody's lineup is better than it should be.
 *
 * THE MODE IS NOT LAUNCHED. fantasy-access.js ships FANTASY_LIVE = false, so the door is
 * built for a tester and for nobody else, and the FIRST section asserts exactly that, in
 * both directions. It is the only one of the three access files still deciding anything,
 * so it is the only one whose gate can currently cost a reader a mode they should have.
 *
 * THE AUTH IS STUBBED AND THE ACCESS FILE IS NOT. The sandbox has no account, so a real
 * sign-in is not available, but the question here is what the PAGE does with an answer.
 * So auth.js is replaced with a stub that reports a chosen account and the real
 * fantasy-access.js is served untouched: the gate under test is the shipped one.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.PS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PW = process.env.PS_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.js';
const QUICK = process.argv.includes('--quick');

let fails = 0;
const ok = (label, cond, extra) => {
  if (!cond) fails++;
  console.log('  ' + (cond ? 'ok  ' : 'FAIL') + '  ' + label + (extra ? '   ' + extra : ''));
};

const D = (await import('./fantasy/draft.js')).default;
const ACCESS = (await import('./fantasy-access.js')).default;
const NOW = JSON.parse(fs.readFileSync(path.join(ROOT, 'football/data/fantasy_now.json'), 'utf8'));
const POOL = JSON.parse(fs.readFileSync(path.join(ROOT, 'football/data', NOW.file), 'utf8'));

/* ================================================================
   THE FLAG, AND THE LIST THAT GOES WITH IT
   ================================================================ */
console.log('THE MODE IS GATED, AND THE GATE IS READ OFF DISK');
{
  const src = fs.readFileSync(path.join(ROOT, 'football/fantasy-access.js'), 'utf8');
  /* Asserted in either position, the way Full Team's launch line is. Flipping it opens an
     unfinished mode to everybody, so it should be a decision rather than a merge. */
  ok('fantasy-access.js ships FANTASY_LIVE = false', /FANTASY_LIVE = false/.test(src));
  ok('  and no email address is in it, which is the file\'s own rule',
    !/@[a-z0-9.-]+\.[a-z]{2,}/i.test(src.replace(/runthe\.gg\/football\/fantasy-access\.js/g, '')));
  ok('  a tester is allowed', ACCESS.allowed({ name: ACCESS.TESTERS[0], userId: null }));
  ok('  and a stranger is not', !ACCESS.allowed({ name: 'nobody-at-all', userId: 'x' }));
  ok('  and so is nobody at all', !ACCESS.allowed(null));
}

/* ================================================================
   THE WEEK ON DISK IS A WEEK THAT CAN BE DRAFTED
   ================================================================ */
console.log('\nTHE POOL IS A BOARD, NOT A FILE THAT PARSES');
{
  ok('fantasy_now.json points at a pool that exists', !!POOL.pool && POOL.pool.length > 0,
    `${POOL.season} week ${POOL.week}, ${POOL.pool ? POOL.pool.length : 0} men`);
  ok('  it locks at a real instant', Number.isFinite(Date.parse(POOL.locks_at || '')),
    POOL.locks_at);
  /* EVERY SLOT HAS TO BE FILLABLE OR THE MODE CANNOT BE PLAYED AT ALL. A pool missing one
     position renders perfectly and strands every draft at the same spin. */
  for (const pos of [...new Set(D.SLOTS)]) {
    const n = POOL.pool.filter((p) => p.position === pos).length;
    ok(`  ${pos}: enough men to fill a board`, n >= D.DRAW, `${n} men`);
  }
  /* The cap has to cover the cheapest legal lineup with room to make a choice, or the
     reserve floor eats every board and the wheel picks the team. */
  const floor = D.reserveAfter(POOL.pool, -1);
  ok('  the cap clears the reserve floor with real room', D.CAP_MUSD > floor * 2,
    `floor $${floor.toFixed(1)}M against a $${D.CAP_MUSD}M cap`);
  /* NOBODY IS PRICED ABOVE THE CAP, which would be a man on the board who can never be
     signed: he would be offered, refused and there would be nothing on screen to say why. */
  const over = POOL.pool.filter((p) => p.price_musd > D.CAP_MUSD - floor);
  ok('  and nobody on the board is unsignable', !over.length,
    over.length ? over.slice(0, 3).map((p) => p.name).join(', ') : 'all reachable');

  /* THE WHEEL REACHES AS FAR AS THE LEAGUE STARTS, AND THE CLAIM IS THE RULE, NOT A NUMBER.
     A depth pinned at 40 would be the whole quarterback position and a quarter of the
     receivers, so two of five quarterback offers were men who will not play. Asserted as
     the property (never past what the league starts, never more than the ceiling) so the
     next pool shape is covered without anybody re-deriving it. */
  const clubs = D.clubsIn(POOL.pool);
  ok('  the wheel reads the week\'s own club count', clubs === POOL.clubs_playing,
    clubs + ' against ' + POOL.clubs_playing);
  for (const pos of [...new Set(D.SLOTS)]) {
    const starts = D.SLOTS.filter((s) => s === pos).length;
    const got = D.depthFor(POOL.pool, pos);
    ok(`  ${pos}: the wheel reaches ${got}`,
      got === Math.min(D.DEPTH, clubs * starts) && got >= D.DRAW,
      `${starts} a club x ${clubs} clubs, capped at ${D.DEPTH}`);
  }
}

/* ================================================================
   A DRAFT ALWAYS FINISHES, AND NEVER OVER THE CAP
   ================================================================ */
console.log('\nA DRAFT ALWAYS FINISHES');
{
  /* Three ways of drafting, because a strand is a property of how the money was spent and
     a bot that never spends cannot find one. GREEDY is the one that can: it is the way to
     run out of money, and it is also what a player who likes the best name does. */
  /*
   * EVERY BOT SIGNS FROM THE SIGNABLE MEN, which is the change the out of reach rows force
   * on this file. A board now holds men the cap cannot take, deliberately, so a bot that
   * took `board[0]` blind would sign over the cap and report the page's own new feature as
   * a defect. `canSign` is the one call the page, the click handler and these three all
   * ask, so what LOOKS signable and what IS are the same answer by construction.
   */
  const BOTS = {
    greedy: (b) => b[0],
    thrifty: (b) => b[b.length - 1],
    random: (b, rnd) => b[Math.floor(rnd() * b.length)],
  };
  let stranded = 0, over = 0, short = 0, runs = 0, worst = 0, noneCan = 0, shown = 0, grey = 0;
  for (const name of Object.keys(BOTS)) {
    for (let r = 0; r < 400; r++) {
      const c = { seed: (r * 2654435761 + name.length) >>> 0, men: [] };
      const rnd = D.rngOf(c.seed ^ 0x5bf03635);
      for (let i = 0; i < D.SLOTS.length; i++) {
        const board = D.boardFor(POOL.pool, c, i);
        if (!board.length) { stranded++; break; }
        const left = D.CAP_MUSD - D.spent(c);
        /* AT LEAST ONE MAN ON EVERY BOARD MUST BE SIGNABLE, which is what replaced "every
           man is". A board of five men the cap refuses is the empty screen with no way on
           that the reserve floor exists to prevent, and it renders perfectly. */
        const can = board.filter((m) => D.canSign(POOL.pool, i, left, m));
        shown += board.length; grey += board.length - can.length;
        if (!can.length) { noneCan++; break; }
        c.men.push(BOTS[name](can, rnd));
      }
      runs++;
      if (c.men.length < D.SLOTS.length) { short++; continue; }
      worst = Math.max(worst, D.spent(c));
      if (D.spent(c) > D.CAP_MUSD + 1e-9) over++;
      /* THE SIX ARE SIX DIFFERENT MEN. Both running back slots draw from the same pool, so
         without the exclusion the same man fills them both and the lineup is illegal in a
         way nothing on the screen would show. */
      const ids = new Set(c.men.map((m) => m.player_id));
      if (ids.size !== D.SLOTS.length) short++;
    }
  }
  ok(`${runs} drafts, three ways, none stranded`, !stranded, `${stranded} stranded`);
  ok('  every one finished with six different men', !short, `${short} did not`);
  ok('  every board had somebody on it the cap could take', !noneCan,
    `${noneCan} boards with nothing signable`);
  ok('  and nothing signed was ever over the cap', !over,
    `worst spend $${worst.toFixed(1)}M of $${D.CAP_MUSD}M`);
  /* AND THE CAP IS ACTUALLY SEEN, which is the whole reason the out of reach rows exist.
     A board that never shows one is the old board wearing new code: it would pass every
     assertion above and change nothing a player notices, which is exactly how this mode
     came to have an invisible budget in the first place. Measured on the live board it is
     about one row in eight; the floor is loose because it depends on the week's own price
     spread, and what it catches is the feature quietly reverting to nothing. */
  ok('  and the cap is visible on the board rather than only in the totals',
    grey / shown > 0.02, `${(grey / shown * 100).toFixed(1)}% of rows are out of reach`);
}

/* ================================================================
   THE ONE NUMBER HAS TO BE THE SIX ADDED UP
   ================================================================ */
console.log('\nTHE PROJECTION IS THE SIX, ADDED UP');
{
  /* This is the football game's box score rule in one line: the mode shows exactly one
     number about the future, so the only property it must have is that it is the parts.
     Asserted over real drafts rather than on a fixture, because rounding is where an
     identity like this comes apart. */
  let bad = 0, n = 0;
  for (let r = 0; r < 300; r++) {
    const c = { seed: (r * 40503 + 7) >>> 0, men: [] };
    const rnd = D.rngOf(c.seed);
    for (let i = 0; i < D.SLOTS.length; i++) {
      const board = D.boardFor(POOL.pool, c, i);
      if (!board.length) break;
      /* SIGNED FROM THE SIGNABLE MEN, the same as every other bot here. Picking blind out
         of the whole board signs men over the ceiling and strands about one draft in
         thirty, which reads as the page losing lineups and is the bot breaking the rule. */
      const left = D.CAP_MUSD - D.spent(c);
      const can = board.filter((m) => D.canSign(POOL.pool, i, left, m));
      if (!can.length) break;
      c.men.push(can[Math.floor(rnd() * can.length)]);
    }
    if (!D.full(c)) continue;
    n++;
    const sum = c.men.reduce((t, m) => t + m.proj, 0);
    if (Math.abs(D.projected(c) - sum) > 0.051) bad++;
  }
  ok(`${n} lineups: the projected total is the six projections`, !bad && n > 0, `${bad} off`);
  /* AND THE SLOTS ARE THE SLOTS. A lineup whose men do not match the shape is a lineup that
     would be scored against a different game. */
  ok('  the shape is QB, RB, RB, WR, WR, TE', D.SLOTS.join(',') === 'QB,RB,RB,WR,WR,TE',
    D.SLOTS.join(','));
}

/* ================================================================
   THE SAME SEED IS THE SAME BOARD
   ================================================================ */
console.log('\nA RELOAD CANNOT RE-ROLL THE WHEEL');
{
  /* THE WHOLE POINT OF STORING A SEED. If a board were drawn fresh on every paint, a player
     who did not like their five men would press reload until they did, and five chances
     would be as many as they had patience for. Nothing about that is visible: the board
     renders, the draft finishes, the lineup is legal. */
  const c = { seed: 123456789, men: [] };
  const a = D.boardFor(POOL.pool, c, 0).map((m) => m.player_id).join(',');
  const b = D.boardFor(POOL.pool, c, 0).map((m) => m.player_id).join(',');
  ok('the same chance, asked twice, offers the same men', a === b && a.length > 0);
  const other = D.boardFor(POOL.pool, { seed: 987654321, men: [] }, 0)
    .map((m) => m.player_id).join(',');
  ok('  and a different chance does not', a !== other);
  /* Proving the check has teeth: a board that ignored the seed would pass the first
     assertion by accident only if it were constant, which the second rules out. */
  const after = D.boardFor(POOL.pool, { seed: 123456789, men: [POOL.pool[0]] }, 0)
    .map((m) => m.player_id).join(',');
  ok('  and signing somebody changes what is left', after !== a);
}

/* ----------------------------------------------------------------
 * A MAN WHO IS NOT PLAYING IS NOT A PICK
 *
 * Reported by a player, with a screenshot: the wheel offered Nico Collins at $8.5M, and he
 * had been ruled out in week 2 with a hamstring. The pool is built from what a man has DONE
 * and from the schedule, and neither of those knows whether he is going to be on the field,
 * so nothing anywhere refused him. The board rendered, the price was right, the lineup was
 * legal, and it was worth nought.
 *
 * TWO SOURCES AND THEY ANSWER TWO QUESTIONS. Injured reserve is not a designation to read,
 * it is somebody who is not playing, so he is left out of the pool the way a man on a bye
 * is. An Out or Doubtful designation IS this week's news, so he is drawn, in red, and
 * cannot be picked. Questionable is a real decision and is left alone.
 * ---------------------------------------------------------------- */
console.log('\nA MAN WHO IS NOT PLAYING IS NOT A PICK');
{
  /* Built off the real board rather than a fixture, so the ranks, the depth and the
     reserve floor are the ones the mode actually runs on. */
  /* THE MAN HANDED BACK IS THE COPY THAT CARRIES THE REPORT, not the row it was made from.
     Returning the original passed `canSign` a man with no `inj` on him and reported the
     page refusing nobody: the fixture would have been asking about a different object from
     the one it had just put on the board. */
  const hurtOne = (pool, pos, st) => {
    const men = pool.filter((m) => m.position === pos)
      .sort((a, b) => b.price_musd - a.price_musd);
    const of = men[1];
    const man = Object.assign({}, of, { inj: { st, w: NOW.week, d: 'Hamstring' } });
    return { man, was: of,
      pool: pool.map((m) => (m.player_id === of.player_id ? man : m)) };
  };
  const { man, pool } = hurtOne(POOL.pool, 'WR', 'out');

  ok('a man ruled out is refused', !D.canSign(pool, 3, 90, man), man.name);
  ok('  and the same man is signable when he is not',
    D.canSign(POOL.pool, 3, 90, POOL.pool.find((m) => m.player_id === man.player_id)));
  /* HE IS STILL DRAWN, which is the half a filter would have thrown away. Out is the most
     useful thing the board can tell a drafter about a man they were going to take. */
  const seen = [];
  for (let seed = 1; seed <= 400; seed++) {
    const b = D.spin(pool, 3, 90, [], D.rngOf(seed));
    if (b.some((x) => x.player_id === man.player_id)) seen.push(seed);
  }
  ok('  but he is still put on the board', seen.length > 0, seen.length + ' of 400 boards');
  /* AND HE IS NEVER THE ANSWER TO A QUESTION ABOUT WHO CAN BE SIGNED. `eligible` is what
     fills the guaranteed signable seat, so an out man in it is a board whose one promised
     pick refuses the press. */
  ok('  and never in the eligible list',
    !D.eligible(pool, 3, 90, []).some((x) => x.player_id === man.player_id));

  /* THE RESERVE FLOOR IS A PROMISE THAT THE LAST SLOT CAN BE FILLED, so it may not be read
     off a man who cannot fill it. Written without this, a draft spends down to a floor set
     by an injured tight end and strands at the last slot with nothing legal on the board,
     which is the empty screen with no way on. */
  {
    const tes = POOL.pool.filter((m) => m.position === 'TE')
      .sort((a, b) => a.price_musd - b.price_musd);
    /* EVERY MAN AT THE FLOOR, not the first one. 48% of the board sits at the $3.0M
       minimum, so knocking one out leaves the floor exactly where it was and the assertion
       compares a number with itself. */
    const floor = tes[0].price_musd;
    const at = new Set(tes.filter((t) => t.price_musd === floor).map((t) => t.player_id));
    const hurtPool = POOL.pool.map((m) => (at.has(m.player_id)
      ? Object.assign({}, m, { inj: { st: 'out', w: NOW.week } }) : m));
    const was = D.cheapestAt(POOL.pool, 'TE'), now = D.cheapestAt(hurtPool, 'TE');
    ok('the reserve floor steps over the men who cannot be signed', now > was,
      `$${was}M -> $${now}M, ${at.size} at the floor`);
    ok('  and it lands on somebody who can be',
      D.canSign(hurtPool, 5, now, hurtPool.find((t) => t.position === 'TE'
        && t.price_musd === now)));
  }

  /* Questionable is a decision and the board must not take it away. */
  const q = hurtOne(POOL.pool, 'RB', 'questionable');
  ok('a questionable man is still a pick', D.canSign(q.pool, 1, 90, q.man), q.man.name);

  /* A WHOLE SEASON'S WORTH OF DRAFTS STILL FINISHES with the injured men in it, which is
     what says the floor and the guarantee survived the change. A stranded draft is an empty
     board and no way on, and it is silent. */
  {
    const inj = JSON.parse(fs.readFileSync(path.join(ROOT, 'football/data',
      `injuries_${NOW.season}_w${NOW.week}.json`), 'utf8'));
    const live = POOL.pool.map((m) => {
      const e = inj.men[m.player_id];
      return e ? Object.assign({}, m, { inj: e }) : m;
    }).filter((m) => !m.inj || m.inj.st !== 'off');
    ok('the live report takes men off the board', live.length < POOL.pool.length,
      `${POOL.pool.length} -> ${live.length}`);
    let stranded = 0, hurtSigned = 0, done = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const c = { seed, men: [] };
      for (let i = 0; i < D.SLOTS.length; i++) {
        const board = D.boardFor(live, c, i);
        const left = D.CAP_MUSD - D.spent(c);
        const take = board.find((m) => D.canSign(live, i, left, m));
        if (!take) { stranded++; break; }
        if (D.hurt(take)) hurtSigned++;
        c.men.push(take);
      }
      if (c.men.length === D.SLOTS.length) done++;
    }
    ok('  and 400 drafts still finish against it', stranded === 0 && done === 400,
      `${done} finished, ${stranded} stranded`);
    ok('  and not one of them signed a man who is out', hurtSigned === 0);
  }
}

/* ----------------------------------------------------------------
 * AND THE REPORT ITSELF IS READ RATHER THAN GUESSED
 * ---------------------------------------------------------------- */
console.log('\nTHE INJURY REPORT IS BUILT FROM TWO SOURCES');
{
  const { buildInjuries, latestReports } = await import('./build/injuries.mjs');
  const injuries = [
    { season: 2026, week: 1, gsis_id: 'a', report_status: 'Questionable',
      report_primary_injury: 'Knee', practice_status: 'Limited Participation In Practice' },
    { season: 2026, week: 2, gsis_id: 'a', report_status: 'Out',
      report_primary_injury: 'Hamstring', practice_status: 'Did Not Participate In Practice' },
    { season: 2026, week: 3, gsis_id: 'a', report_status: 'Questionable',
      report_primary_injury: 'Hamstring', practice_status: 'Full Participation In Practice' },
    { season: 2026, week: 2, gsis_id: 'b', report_status: '',
      report_primary_injury: 'Ankle', practice_status: 'Full Participation In Practice' },
    { season: 2026, week: 2, gsis_id: 'c', report_status: '',
      report_primary_injury: 'Ankle', practice_status: 'Did Not Participate In Practice' },
    { season: 2025, week: 9, gsis_id: 'd', report_status: 'Out',
      report_primary_injury: 'Knee', practice_status: '' },
  ];
  const players = [
    { gsis_id: 'a', status: 'ACT' }, { gsis_id: 'b', status: 'ACT' },
    { gsis_id: 'c', status: 'ACT' }, { gsis_id: 'd', status: 'ACT' },
    { gsis_id: 'e', status: 'RES' }, { gsis_id: 'f', status: 'DEV' },
  ];
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];

  /* NEVER READ AHEAD, which is the same rule the pool is built under. Asked for week 2, the
     week 3 row does not exist yet. */
  const w2 = buildInjuries({ season: 2026, week: 2, ids, injuries, players });
  ok('the report never reads ahead of the week it is asked for',
    w2.men.a.st === 'out' && w2.men.a.w === 2, JSON.stringify(w2.men.a));
  ok('  and says which week it got to', w2.report_week === 2);

  const w3 = buildInjuries({ season: 2026, week: 3, ids, injuries, players });
  ok('the latest report is the one that counts',
    w3.men.a.st === 'questionable' && w3.men.a.w === 3, JSON.stringify(w3.men.a));
  ok('a man on reserve is off the board whatever the report says', w3.men.e.st === 'off');
  ok('  and the practice squad is not', !w3.men.f);
  /* A CLEARED MAN IS NOT A WARNING. 45 of the 55 no-designation men on the live board
     practised in full, which is one board row in nine wearing a mark that means nothing. */
  ok('on the report, no designation, full practice: nothing is said', !w3.men.b);
  ok('  but not practising at all is', w3.men.c && w3.men.c.st === 'none');
  /* A season boundary is not a week boundary. */
  ok('last season is not this week\'s news', !w3.men.d);
  ok('and the count is what it shipped', w3.counts.off === 1, JSON.stringify(w3.counts));

  const only = latestReports(injuries, 2026, 3);
  ok('the report week is the latest it covers', only.reportWeek === 3);

  /*
   * A WRITER WHOSE OUTPUT MOVES WHEN ITS INPUT DID NOT CANNOT SAY WHETHER ANYTHING MOVED,
   * and this file's whole workflow rule is built on the answer.
   *
   * `fantasy-injuries.yml` commits only when the report has changed, which it asks by
   * staging the file and testing `git diff --cached --quiet`. A `built: new Date()` made
   * that test meaningless: the bytes differed on every run, so the job committed twice a
   * day for ever and each commit is a Cloudflare deploy. It shipped, and the first cron
   * run after it proved it: one commit, identical counts, a one line diff holding nothing
   * but the clock.
   *
   * THE CLOCK IS DRIVEN RATHER THAN RACED, AND THE FIRST DRAFT OF THIS GUARD RACED IT.
   * Written as two builds back to back it passed WITH THE DEFECT IN, because two
   * `new Date().toISOString()` calls in a tight loop land in the same millisecond and
   * produce the same string. It would have bitten on about one run in however many
   * milliseconds the two calls straddle, which is this repo's own rule arriving again: a
   * timing property cannot be checked by hoping to lose the race.
   *
   * So `Date` is moved an hour between the two builds. Deterministic, and it catches any
   * clock rather than one field: written as `!out.built` it would pass the day somebody
   * adds a different timestamp under a different name, which is exactly how this arrived.
   */
  const RealDate = Date;
  const at = (iso) => {
    const fixed = new RealDate(iso);
    globalThis.Date = class extends RealDate {
      constructor(...a) { return a.length ? new RealDate(...a) : fixed; }
      static now() { return fixed.getTime(); }
    };
  };
  let twice;
  try {
    at('2026-09-23T01:00:00.000Z');
    const a = JSON.stringify(buildInjuries({ season: 2026, week: 3, ids, injuries, players }));
    at('2026-09-23T02:00:00.000Z');
    const b = JSON.stringify(buildInjuries({ season: 2026, week: 3, ids, injuries, players }));
    twice = [a, b];
  } finally { globalThis.Date = RealDate; }
  ok('the report does not move when only the clock does', twice[0] === twice[1],
    twice[0] === twice[1] ? `${twice[0].length} bytes` : 'the output carries a clock');
}

if (QUICK) {
  console.log(fails ? `\n${fails} FAILED` : '\nall good (engine only)');
  process.exit(fails ? 1 : 0);
}

/* ================================================================
   THE BROWSER HALF
   ================================================================ */
let pw;
try { pw = (await import(PW)).default; } catch (e) {
  console.log('\nPlaywright is not available here, so the browser half cannot run.');
  console.log(fails ? `\n${fails} FAILED` : '\nall good (engine only)');
  process.exit(fails ? 1 : 0);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2' };

/* The auth stub. `who` is null for a signed out visitor. It fires a change the way the real
   one does, because the page waits for that rather than reading state() once: a gate that
   read immediately would flash the shut screen at every tester. */
const authStub = (who) => `
  (function(){
    var s = ${JSON.stringify(who)};
    var ls = [];
    window.PS_AUTH = {
      boot: function(){ setTimeout(function(){
        ls.forEach(function(f){ try{ f(state()); }catch(e){} }); }, 30); return true; },
      state: state,
      onChange: function(f){ ls.push(f); return function(){}; },
    };
    function state(){
      return { ready:true, signedIn:!!s, userId: s&&s.userId, name: s&&s.name };
    }
  })();`;

/* THE SERVER IS A STUB AND NOT ONE REQUEST REACHES THE REAL ONE.
 *
 * `entries.js` posts to the live Supabase project, and the live project holds the real
 * competition: a checker that let a request out would enter a lineup on somebody's account,
 * or fill a real week with rows from a bot. That is this file's version of the note
 * `check-premium.mjs` carries about Stripe being live with no test mode. The route below
 * answers every rpc itself, and the catch-all `r.abort()` under it is the second half of
 * that promise rather than tidiness: a call this stub has never heard of dies rather than
 * going out.
 *
 * `server` is what the fixture says the database would answer, and every field is optional
 * so a walk that does not care about the server writes nothing.
 */
const serverStub = (server) => {
  const s = server || {};
  /* IT REMEMBERS THE ENTRY, because the real one does. A stub that accepted a submit and
     then went on answering "you have not entered" is not a server having a bad day, it is
     a server that cannot exist, and a walk driven against it would be testing a state the
     page will never meet. `mine` is seeded from the fixture and written by the submit. */
  let entry = s.mine || null;
  /* Which state of `s.boards` the next poll gets. Per stub, so two pages in one run do not
     share a position in the sequence. */
  let boardAt = 0;
  return {
    /* An accepted call, or the shape PostgREST returns when a plpgsql function raises. */
    fantasy_submit: (body) => {
      /* THE TWO 5xx CASES ARE TESTED BEFORE THE REFUSAL, and the first draft of this stub
         had them after: `if (s.submit && s.submit !== 'ok')` catches the string 'lost'
         too, so the lost-answer arm was served a 400 and the branch it exists for was
         unreachable. It reported the page failing to reconcile something it had never been
         asked to. An unreachable arm in a fixture is the unearnable badge in a coat. */
      if (s.submit === 'down') {
        return { status: 503, body: JSON.stringify({ message: 'upstream' }) };
      }
      if (s.submit === 'lost') {
        /* The answer goes missing AFTER the row lands, which is the one case the page
           cannot tell from a failure and has to settle by asking. */
        entry = { picks: body.p_picks, spend: 0, projected: 0, score: 0, scored: false };
        return { status: 503, body: '' };
      }
      if (s.submit && s.submit !== 'ok') {
        return { status: 400, body: JSON.stringify({ message: s.submit }) };
      }
      entry = { picks: body.p_picks, spend: 0, projected: 0, score: 0, scored: false };
      return { status: 204, body: '' };
    },
    fantasy_my_entry: () => ({ status: 200, body: JSON.stringify(entry ? [entry] : []) }),
    fantasy_standings: () => ({ status: 200, body: JSON.stringify(s.standings || []) }),
    fantasy_my_place: () => ({ status: 200,
      body: JSON.stringify(s.place ? [s.place] : []) }),
    fantasy_entry_count: () => ({ status: 200,
      body: JSON.stringify(s.count == null ? 0 : s.count) }),
    /*
     * THE LIVE BOARD, AND IT ANSWERS A DIFFERENT THING EACH TIME IT IS ASKED.
     *
     * `s.boards` is a list of states and every poll takes the next one, holding on the
     * last. That is what makes this a fixture for a board that MOVES rather than one that
     * is drawn: a stub answering the same rows every time would let a painter that never
     * animates anything pass every assertion below.
     */
    fantasy_board: () => {
      const list = s.boards;
      if (!list || !list.length) {
        return { status: 200, body: JSON.stringify(s.board == null ? null : s.board) };
      }
      const at = Math.min(boardAt, list.length - 1);
      boardAt++;
      return { status: 200, body: JSON.stringify(list[at]) };
    },
  };
};

/*
 * SIGN ONE MAN AND WAIT FOR THE BOARD TO ACTUALLY MOVE.
 *
 * The draft screen acknowledges a press before it repaints: the row you took goes green,
 * the other four fall away, and 170ms later the next board deals in. A second press inside
 * that window is REFUSED, deliberately, because otherwise a double tap signs a second man
 * out of the previous slot's board into the next slot.
 *
 * So a walk that presses six times in a tight loop signs about three men and then waits for
 * a review screen that is never coming. Every version of this file before the reveal did
 * exactly that. Waiting on `.man` is not enough either: the old board's rows are still on
 * screen through the acknowledgement, so the selector resolves to the men that were already
 * there. What says a press LANDED is the slot strip, which is the page's own record of how
 * many men are signed. That is the hoops draft harness's lesson arriving here.
 */
async function signOne(page, nth = 0) {
  const before = await page.locator('#d-slots .slot.done').count();
  await page.locator('#d-men .man').first().waitFor({ timeout: 10000 });
  /* THE SIGNABLE ONES, because a board now holds men the cap cannot take and they are
     `disabled`. Pressing one does nothing at all, which is correct and which hangs any walk
     that presses blind: the slot never fills and the review screen never arrives. A thumb
     has the same constraint, and the guard on the grey rows is that there is always at
     least one of these. */
  const men = page.locator(/* NOT `[disabled]` AND NOT `.hurt`. An injured row is deliberately left pressable so its
     chip can be tapped, and a press on it opens the report rather than signing anybody, so
     a walk that took the first row it could click waited for a signing that never came. */
    '#d-men .man:not([disabled]):not(.hurt)');
  const n = await men.count();
  if (!n) throw new Error('every man on the board is out of reach');
  /* `force` because the rows are mid-transition for the length of the deal and Playwright
     waits for stability otherwise, which turns every press into a race with the stagger. A
     thumb has no such scruples. */
  await men.nth(nth % n).click({ force: true });
  await page.waitForFunction(
    (was) => document.querySelectorAll('#d-slots .slot.done').length > was
      || document.getElementById('s-review').classList.contains('on'),
    before, { timeout: 10000 });
}

async function openPage(browser, url, opts = {}) {
  const { who = null, viewport = { width: 390, height: 844 }, at = null,
    results = null, storage = null, server = null } = opts;
  const page = await browser.newPage({ viewport });
  const boom = [];
  const posted = [];
  page.on('pageerror', (e) => boom.push(String(e).slice(0, 200)));
  /* Pinning the clock is how the lock gets tested at all: the shipped week is in the future
     or it is not, and a checker that only works before Thursday is a checker that starts
     failing on Thursday for the wrong reason. */
  if (at != null) {
    await page.addInitScript(`(function(){
      var real = Date.now, off = ${at} - real();
      Date.now = function(){ return real() + off; };
    })();`);
  }
  /* EACH newPage() GETS ITS OWN CONTEXT AND THEREFORE ITS OWN localStorage, which is worth
     knowing before writing any walk here that spans two pages: a lineup submitted on one is
     simply not there on the next, and the symptom is the second page sitting on the home
     screen for ever waiting for an entry it never had. So an entry is carried across by
     hand, which is also the honest fixture: it is the same bytes the first page wrote. */
  if (storage) {
    await page.addInitScript(`(function(){
      try { localStorage.setItem(${JSON.stringify(storage.key)},
        ${JSON.stringify(storage.value)}); } catch(e){}
    })();`);
  }
  const RPC = serverStub(server);
  await page.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    const call = u.pathname.match(/\/rest\/v1\/rpc\/(\w+)$/);
    if (call && RPC[call[1]]) {
      let body = {};
      try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
      posted.push({ fn: call[1], body });
      const a = RPC[call[1]](body);
      return r.fulfill({ status: a.status, contentType: 'application/json', body: a.body });
    }
    if (u.hostname !== 'local.test') return r.abort();
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    /* auth.js is the ONE file swapped. fantasy-access.js is served exactly as it ships. */
    if (rel === '/football/auth.js') {
      return r.fulfill({ status: 200, contentType: 'text/javascript', body: authStub(who) });
    }
    /* THE RESULTS FILE IS FABRICATED AND NOT BUILT, for two reasons. The real build needs
       nflverse, so a checker that called it would need the network; and a week nobody
       drafted has no business sitting in the repo as 47KB of dead data just to be a
       fixture. What is under test here is what the PAGE does with an answer.
       A MISS IS SERVED AS A 404, deliberately: that is the state the page spends most of
       its life in, and a route that answered `{}` instead would never exercise it. */
    if (/^\/football\/data\/results_/.test(rel)) {
      if (!results) return r.fulfill({ status: 404, body: 'no' });
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(results) });
    }
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return r.abort();
    await r.fulfill({ status: 200,
      contentType: TYPES[path.extname(f)] || 'application/octet-stream',
      body: fs.readFileSync(f) });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { page, boom, posted };
}

/*
 * THE SHAPE `fantasy_board` ANSWERS, built in one place so every fixture below agrees with
 * the server. A week that is open and not scored is the live case, which is what most of
 * these are about.
 */
/*
 * EVERY TIMESTAMP IS RELATIVE TO THE PAGE'S CLOCK AND NOT TO THIS PROCESS'S.
 *
 * `openPage` pins `Date.now()` inside the browser, and for these sections it is pinned to a
 * point DURING the games, which is hours away from the real time this file is running at.
 * Built off `Date.now()` here, a `checked_at` meant to be "a moment ago" lands sixteen hours
 * in the page's past and the board correctly reports a feed that has stopped. The first
 * draft did exactly that and failed on the one assertion it was written to prove, which is
 * the right failure and cost a round of reading the page instead of the fixture.
 */
const boardOf = (o) => {
  const base = o.now == null ? LIVE_AT : o.now;
  const ago = (ms) => new Date(base - ms).toISOString();
  return {
    week: o.week === null ? null : {
      locks_at: ago(3 * 3600e3),
      scored_at: o.scored_at || null,
      checked_at: o.checked_at === undefined ? ago(30e3) : o.checked_at,
      results_at: o.results_at === undefined ? ago(90e3) : o.results_at,
      games_final: o.games_final == null ? 3 : o.games_final,
      games_total: o.games_total == null ? 16 : o.games_total,
      open: o.open === undefined ? true : o.open,
      entries: o.me ? o.me.entries : (o.rows || []).length,
    },
    rows: o.rows || [],
    me: o.me || null,
    /* THE GAMES RIDE IN THE SAME ANSWER, which is 111's whole argument: the scoreboard and
       the standings are about one instant, and asked separately they are two. A fixture
       that leaves them out is the state before the writer has ever run, where the page
       falls back to the schedule out of the pool. */
    games: o.games || [],
    /* 112'S KEY, AND `undefined` IS A STATE RATHER THAN A MISSING FIELD. SQL is deployed by
       hand and this page by a push, so a database still on 111 answers without it. A fixture
       passing `entrants: undefined` IS that database, which is why this is written to leave
       the key out entirely rather than defaulting it to an empty array. */
    ...(o.entrants === undefined ? {} : { entrants: o.entrants }),
  };
};

const TESTER = { name: ACCESS.TESTERS[0], userId: null };
const STRANGER = { name: 'somebody-else', userId: '00000000-0000-0000-0000-000000000000' };
const FANTASY = 'http://local.test/football/fantasy/';
const BEFORE = Date.parse(POOL.locks_at) - 36 * 3600 * 1000;
/* THREE HOURS PAST THE LOCK: the Thursday game is on, which is the only clock at which a
   live board is a real screen. Every section about movement runs at this one. */
const LIVE_AT = Date.parse(POOL.locks_at) + 3 * 3600 * 1000;
const AFTER = Date.parse(POOL.locks_at) + 60 * 1000;

const browser = await pw.chromium.launch({ executablePath: CHROME });
const screenOn = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.screen.on')].map((s) => s.id).join(','));

/* THE BOARD IS ITS OWN SCREEN NOW, so every section about it has to get there the way a
   reader does. Pressed rather than shown by script, which is the dynasty lock's rule: a
   door that is drawn and does not open is the thing worth catching, and a walk that set the
   class itself would never meet it. */
const openBoard = async (page, via = '#b-live') => {
  await page.waitForSelector('#s-in.on', { timeout: 15000 });
  await page.waitForSelector(via + ':not([hidden])', { timeout: 10000 });
  await page.click(via);
  await page.waitForSelector('#s-live.on', { timeout: 10000 });
  /* THE SCREEN HAS TWO PANELS AND THE PILL LANDS ON THE GAMES, which is what it says it
     does. Every section below is about the board, so it is asked for by name rather than
     assumed to be the one showing. */
  await page.click('#lv-tab-board');
  await page.waitForSelector('#lv-pane-board:not([hidden])', { timeout: 5000 });
};

/* ---------------------------------------------------------------- */
console.log('\nTHE GATE HAS THREE ANSWERS AND THEY ARE THREE DIFFERENT SENTENCES');
const said = {};
for (const [label, who, want] of [
  ['a tester gets the mode', TESTER, 's-home'],
  ['a signed in stranger does not', STRANGER, 's-shut'],
  ['a signed out visitor does not', null, 's-shut'],
]) {
  const { page, boom } = await openPage(browser, FANTASY, { who, at: BEFORE });
  await page.waitForFunction(() => !document.getElementById('s-load').classList.contains('on'),
    null, { timeout: 15000 }).catch(() => {});
  const on = await screenOn(page);
  ok(label, on === want, on + (boom.length ? ' | ' + boom.join(' | ') : ''));
  ok('  and nothing threw', !boom.length, boom.join(' | ') || 'clean');
  said[label] = await page.evaluate(() => document.getElementById('shut-say').textContent.trim());
  await page.close();
}
/* A blank box is how a feature teaches somebody it is broken, and one message for two
   different situations tells half the readers to go and do something that will not help.
   The commissioner standings' own lesson, arriving here. */
const shut = Object.values(said).filter(Boolean);
ok('  the two refusals say different things', new Set(shut).size === shut.length,
  shut.join(' || '));

/* ---------------------------------------------------------------- */
console.log('\nA WHOLE ENTRY, DRIVEN');
{
  /* A BOARD TO LAND ON, because a submit now ends on it. Before the lock that is the
     entrants list, so the fixture carries one: with `board: null` the walk would arrive at
     "the board could not be reached", which is a real state and is not the one this section
     is about. */
  const { page, boom, posted } = await openPage(browser, FANTASY, { who: TESTER, at: BEFORE,
    server: { board: boardOf({ rows: [], open: false,
      entrants: [{ entry_no: 1, display_name: 'Ada', is_me: false },
        { entry_no: 2, display_name: 'You', is_me: true }] }) } });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });

  /* One helper for one draft, pressing the page's own buttons throughout. Nothing here
     reaches into state: the claim is about what a player can do with a thumb. */
  const draftOne = async () => {
    for (let i = 0; i < D.SLOTS.length; i++) await signOne(page, i);
  };

  await page.click('#b-draft');
  await page.waitForSelector('#s-draft.on', { timeout: 10000 });
  await draftOne();
  await page.waitForSelector('#s-review.on', { timeout: 10000 });
  ok('six picks lands on the review screen', true);

  /* THE RELOAD TEST IS DRIVEN THROUGH THE PAGE, not through draft.js, because the property
     that matters is that what is STORED is enough to rebuild the board. A seed kept only in
     a variable passes every engine assertion above and re-rolls on the next visit. */
  await page.click('#b-more');
  await page.waitForSelector('#s-draft.on', { timeout: 10000 });
  const before = await page.locator('#d-men .man .who b').allTextContents();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });
  await page.click('#b-draft');
  await page.waitForSelector('#s-draft.on', { timeout: 10000 });
  const after = await page.locator('#d-men .man .who b').allTextContents();
  ok('  a reload mid draft comes back to the same board',
    before.length > 0 && before.join('|') === after.join('|'),
    before.join(', ') + '  ->  ' + after.join(', '));

  /* Fill the rest of the five. */
  for (let c = 1; c < D.CHANCES; c++) {
    await page.waitForSelector('#s-draft.on', { timeout: 10000 });
    await draftOne();
    await page.waitForSelector('#s-review.on', { timeout: 10000 });
    if (c < D.CHANCES - 1) await page.click('#b-more');
  }
  const five = await page.locator('#r-five .lineup').count();
  ok(`  all ${D.CHANCES} chances are drafted and shown together`, five === D.CHANCES, five + '');
  ok('  and there is no sixth', await page.locator('#b-more').isHidden());

  /*
   * THE TOTAL HAS TO BE CHECKABLE AGAINST THE SIX FIGURES PRINTED UNDER IT, which is the
   * whole reason the per man projection is on this screen: a reader choosing between 63.0
   * and 77.0 cannot otherwise tell a total carried by one man from six solid ones.
   *
   * THE CLAIM IS ARITHMETIC ON THE RENDERED PAGE, never on `draft.js`. Asking the engine
   * whether its own sum adds up is asking a function whether it agrees with itself; what
   * can actually break here is a painter printing a figure to a different precision from
   * the one the total was summed at, and only the glass can see that. Every `proj` in the
   * pool is one decimal, so the printed parts add up EXACTLY and the assertion needs no
   * tolerance. Measured over 20,000 random lineups: no rounding seam.
   */
  const cards = await page.locator('#r-five .lineup').evaluateAll((els) => els.map((el) => ({
    total: el.querySelector('.pj') ? parseFloat(el.querySelector('.pj').textContent) : null,
    parts: [...el.querySelectorAll('.rrow .rs')].map((s) => parseFloat(s.textContent)),
    heights: [...el.querySelectorAll('.rrow')].map((r) =>
      Math.round(r.getBoundingClientRect().height)),
    cut: [...el.querySelectorAll('.rrow .rn')]
      .filter((n) => n.scrollWidth > n.clientWidth + 0.5).length,
  })));
  const summed = cards.every((c) => c.parts.length === D.SLOTS.length
    && Math.abs(c.parts.reduce((a, b) => a + b, 0) - c.total) < 1e-9);
  ok('  every man carries his own projection, and the six add up to the total', summed,
    cards.map((c) => c.parts.join('+') + '=' + c.total).join('  '));
  /* ONE HEIGHT ACROSS THE SIX, which is the run detail sheet's rule at a shorter list: the
     figure is a taller face than the name beside it, so a row that lost it would be shorter
     than the other five and the card would read as ragged. */
  ok('  and the rows stay one height',
    cards.every((c) => new Set(c.heights).size === 1 && c.cut === 0),
    cards.map((c) => c.heights.join('/') + (c.cut ? ` ${c.cut} cut` : '')).join('  '));

  /* SUBMIT IS REFUSED UNTIL A LINEUP IS CHOSEN. Submitting nothing is not a state this mode
     has, and a live button that does nothing is the worst version of that. */
  ok('  submit is refused until one is picked', await page.locator('#b-submit').isDisabled());
  const proj = await page.locator('#r-five .lineup').nth(2).locator('.pj').innerText();
  await page.locator('#r-five .lineup').nth(2).click();
  ok('  and live once one is', !(await page.locator('#b-submit').isDisabled()));
  await page.click('#b-submit');
  /*
   * A SUBMIT LANDS ON THE BOARD, which is what a player asked for in as many words, and it
   * is a claim about the DESTINATION rather than about the board: the entry screen is a
   * correct receipt and answers the wrong question, because what somebody wants at the
   * moment they enter is whether anybody else has.
   */
  /* CAUGHT, so this reports as a sentence rather than as a Playwright timeout. The way it
     fails is a submit that goes back to the entry screen, which is where it used to go, and
     a suite that dies on machinery makes the next person read the wrong file first. */
  await page.waitForSelector('#s-live.on', { timeout: 10000 }).catch(() => {});
  ok('  a submit lands on the board', await page.evaluate(() =>
    document.getElementById('s-live').classList.contains('on')
      && !document.getElementById('lv-pane-board').hidden), await screenOn(page));
  ok('    with the reader\'s own row on it',
    await page.locator('#lv-board .erow.me').count() === 1);
  /* AND THE RECEIPT IS ONE PRESS AWAY. Moving the destination must not take the entry
     screen away, which is the half a redirect most easily costs. */
  await page.click('#b-live-back');
  await page.waitForSelector('#s-in.on', { timeout: 10000 });
  const shown = await page.locator('#in-proj').innerText();
  /* THE NUMBER ON THE RECEIPT IS THE NUMBER ON THE LINEUP THAT WAS CHOSEN. Two screens
     computing one figure is exactly where a mode ends up disagreeing with itself. */
  ok('  the submitted screen shows the chosen lineup\'s own projection',
    shown.trim() === proj.split('\n')[0].trim(), shown.trim() + ' against ' + proj.trim());
  ok('  and it names six men', await page.locator('#in-roster .rrow').count() === 6);
  /* THE SIX THAT WENT UP ARE THE SIX THAT WERE CHOSEN. The page sends ids and the screen
     draws rows, and nothing else on this page compares the two. */
  const sent = posted.filter((p) => p.fn === 'fantasy_submit');
  ok('  one submit went out, and only one', sent.length === 1, sent.length + '');
  ok('    carrying six ids for this week',
    sent.length === 1 && (sent[0].body.p_picks || []).length === D.SLOTS.length
      && sent[0].body.p_season === POOL.season && sent[0].body.p_week === POOL.week,
    JSON.stringify(sent[0] && sent[0].body).slice(0, 120));
  /* SAID PLAINLY, and this is the sentence that changed the day the entry became a row.
     It read "saved in this browser only" for as long as that was true. */
  const note = await page.locator('#in-note').innerText();
  ok('  and it says the entry is on the account', /account/i.test(note)
    && !/this browser/i.test(note), note.trim());

  /* A RETURN VISIT SHOWS THE ENTRY RATHER THAN OFFERING ANOTHER. */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#s-in.on', { timeout: 15000 });
  ok('  and coming back lands on the entry, not on a fresh draft', true);
  ok('  nothing threw through any of it', !boom.length, boom.join(' | ') || 'clean');
  await page.close();
}

/* ================================================================
   A SUBMIT HAS THREE ANSWERS AND THE PAGE HAS TO DRAW ALL THREE
   ================================================================
 *
 * In, refused, and nobody knows. Every board on this site FAILS SOFT and resolves to null,
 * and `board.js` argues for that at length: a leaderboard that will not draw costs nothing,
 * because the season it is reading was already recorded. Nothing else records a fantasy
 * lineup, so the same treatment here is a player who believes they are in a competition
 * they are not in.
 *
 * THE THIRD ONE IS THE HALF THAT CANNOT BE REASONED ABOUT FROM THE SOURCE. A request can
 * land, write the row and lose its answer on the way back, and the only thing that can tell
 * the two apart is asking. Driven here rather than argued, because both arms look identical
 * from inside the click handler.
 */
console.log('\nA SUBMIT HAS THREE ANSWERS');
for (const [label, server, want] of [
  ['refused, and the server\'s own sentence is what the reader gets',
    { submit: 'that lineup is over the cap' }, { screen: 's-review', say: /over the cap/i }],
  ['refused for a reason the page never heard of, and it still says something',
    { submit: 'some new rule nobody has written yet' },
    { screen: 's-review', say: /some new rule/i }],
  /* A RECONCILED LOST ANSWER IS AN ENTRY, so it ends where every other entry ends, which is
     the board. It used to end on `s-in` because that is where every entry used to end; the
     claim was never about which screen, it is that the page ASKED rather than guessing. */
  ['the answer is lost after the row lands, so asking settles it',
    { submit: 'lost' }, { screen: 's-live', asked: true }],
  ['the server is down and nothing landed',
    { submit: 'down' }, { screen: 's-review', say: /nothing was entered/i }],
]) {
  const { page, boom, posted } = await openPage(browser, FANTASY,
    { who: TESTER, at: BEFORE, server });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });
  await page.click('#b-draft');
  for (let i = 0; i < D.SLOTS.length; i++) await signOne(page);
  await page.waitForSelector('#s-review.on', { timeout: 10000 });
  await page.locator('#r-five .lineup').first().click();
  await page.click('#b-submit');
  /* WAITED ON THE BUTTON AND NOT ON THE SCREEN, which cost a round of reading failures
     that were not there. Three of these four arms end on `s-review`, which is the screen
     they START on, so `waitForSelector('#s-review.on')` returns in the same tick and every
     assertion after it reads the page before the answer has landed. The label is the one
     thing that is different while a submit is in flight. */
  await page.waitForFunction(
    () => !/Sending/i.test(document.getElementById('b-submit').textContent)
      || document.getElementById('s-live').classList.contains('on'),
    null, { timeout: 15000 }).catch(() => {});
  const on = await screenOn(page);
  ok(label, on === want.screen, on);
  if (want.say) {
    const say = await page.locator('#r-refuse').innerText();
    ok('  and it says why', want.say.test(say), say.trim());
    /* THE LEDE AT THE TOP OF THE SCREEN IS NOT WHERE IT GOES, which is where it used to go
       and is what made a refusal invisible. WHERE the box lands is measured on its own, one
       block down, because the fault grows with the length of the page and this loop drafts
       one lineup. */
    ok('  and the lede at the top of the screen is not carrying it',
      !want.say.test(await page.locator('#r-say').innerText()));
    /* AND THE BUTTON COMES BACK. A submit that refused and left the control reading
       "Sending..." for ever is a mode that ended on its own. */
    ok('  and the button is pressable again',
      !(await page.locator('#b-submit').isDisabled())
        && /submit/i.test(await page.locator('#b-submit').innerText()));
  }
  if (want.asked) {
    ok('  and it asked rather than guessing',
      posted.filter((p) => p.fn === 'fantasy_my_entry').length >= 1,
      posted.map((p) => p.fn).join(', '));
  }
  ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
  await page.close();
}

/* ================================================================
   A REFUSAL SAID INTO AN EMPTY ROOM IS A BUTTON THAT DOES NOTHING
   ================================================================
 *
 * Reported as "nothing happens when I press submit". Something did: the server refused it,
 * in one of its nine sentences, and the page wrote that sentence into `#r-say`, the lede at
 * the TOP of the review screen. Measured through the real page at 390x844: the page is
 * 1691px, the reader has scrolled to the Submit button at y=673, and the refusal landed at
 * y=-715, which is 694px above the top of the window.
 *
 * THE FAULT GROWS WITH THE LENGTH OF THE PAGE, so it is measured on the LONGEST review
 * screen this mode has: all five lineups drafted, which is the screen every reader who uses
 * their five chances submits from. The section above drafts one, where the whole screen fits
 * in 844px and the box is on screen wherever it is put. Written there it passed with the box
 * moved back to the top of the screen, which is exactly the defect it exists for.
 *
 * That is the boss battle's call box arriving at a different screen, and the same rule:
 * measure the deepest real case, against a PHONE rather than against the harness's window.
 */
console.log('\nA REFUSAL IS ON THE SCREEN AT THE MOMENT IT IS SAID');
{
  const { page, boom } = await openPage(browser, FANTASY,
    { who: TESTER, at: BEFORE, server: { submit: 'that lineup is over the cap' } });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });
  await page.click('#b-draft');
  for (let c = 0; c < D.CHANCES; c++) {
    await page.waitForSelector('#s-draft.on', { timeout: 10000 });
    for (let i = 0; i < D.SLOTS.length; i++) await signOne(page, i);
    await page.waitForSelector('#s-review.on', { timeout: 10000 });
    if (c < D.CHANCES - 1) await page.click('#b-more');
  }
  await page.locator('#r-five .lineup').first().click();
  await page.click('#b-submit');
  await page.waitForFunction(
    () => !document.getElementById('r-refuse').hidden, null, { timeout: 15000 });
  const seen = await page.evaluate(() => {
    const r = document.getElementById('r-refuse').getBoundingClientRect();
    const b = document.getElementById('b-submit').getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
      btn: Math.round(b.top), page: Math.round(document.body.scrollHeight),
      vh: window.innerHeight };
  });
  ok('the review screen is longer than the window with five drafted',
    seen.page > seen.vh, `${seen.page}px page, ${seen.vh}px window`);
  ok('  and the refusal is on the screen', seen.top >= 0 && seen.bottom <= seen.vh
    && seen.h > 0, `top ${seen.top}, bottom ${seen.bottom}, in a ${seen.vh}px phone`);
  /* AND ABOVE THE BUTTON THAT CAUSED IT, so a reader's eye goes from the control they just
     pressed to the answer without leaving the thumb. */
  ok('  directly above the button that was pressed', seen.bottom <= seen.btn + 1,
    `box ends ${seen.bottom}, button starts ${seen.btn}`);
  ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
  await page.close();
}

/* ================================================================
   THE BOARD OPENS AT THE LOCK
   ================================================================
 *
 * Which is a rule about the competition rather than about privacy: every entrant meets
 * their own wheel, so before kickoff a list of everybody's lineups and their projections is
 * the answer key handed to whoever enters last. The server is what enforces it, by
 * answering no rows, and what is checked here is that the page draws the empty answer as
 * NOTHING rather than as a heading over a blank box.
 */
console.log('\nTHE BOARD OPENS AT THE LOCK, AND IT IS ITS OWN SCREEN');
{
  const ENTRY = { picks: POOL.pool.slice(0, 6).map((m) => m.player_id),
    spend: 80, projected: 50, score: 0, scored: false };
  /* `entry_no` IS THE KEY THE BOARD ANIMATES ON, so a fixture without one would drive a
     painter that has nothing to match rows by. Derived from the NAME rather than the place,
     which is the whole point of it: the same person keeps the same key as they move. */
  const row = (place, name, score, me) => ({ place, display_name: name, score,
    projected: 58, spend: 88, picks: [], is_me: !!me,
    entry_no: name.length * 7 + name.charCodeAt(0), played: 6 });
  const IN_IT = [row(1, 'Somebody', 91.2), row(2, 'You', 77.5, true)];
  const ABOVE = [row(1, 'Somebody', 91.2), row(2, 'Another', 77.5)];

  /* BEFORE THE LOCK THERE IS NO DOOR, which is the same rule stated where a reader meets
     it. The server answers no rows, and a screen carrying a button to an empty board is a
     control that takes somebody somewhere to be told nothing. */
  {
    const { page, boom } = await openPage(browser, FANTASY,
      { who: TESTER, at: BEFORE,
        server: { mine: ENTRY, board: boardOf({ rows: [], open: false }) } });
    await page.waitForSelector('#s-in.on', { timeout: 15000 });
    await page.waitForTimeout(400);
    const seen = await page.evaluate(() => ({
      door: document.getElementById('b-in-board').hidden,
      pill: document.getElementById('b-live').hidden,
      rows: document.querySelectorAll('.brow').length,
    }));
    ok('before the lock there is no way to a board', seen.door && seen.pill,
      `door ${seen.door ? 'hidden' : 'shown'}, pill ${seen.pill ? 'hidden' : 'shown'}`);
    ok('  and no board anywhere on the page', seen.rows === 0, seen.rows + ' rows');
    /* THE ENTRY SCREEN NO LONGER CARRIES ONE AT ALL, which is the structural half of
       moving it: a leftover copy would be a second place describing one competition, and
       the two would disagree the first time either was edited. */
    ok('  and the entry screen has no board in it',
      await page.evaluate(() => !document.querySelector('#s-in .board')));
    ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
    await page.close();
  }

  for (const [label, server, want] of [
    ['a board that cannot be reached says so rather than going blank',
      { mine: ENTRY, board: null }, { rows: 0, say: /could not be reached/i }],
    ['a locked week nobody entered says being first is the prize',
      { mine: ENTRY, board: boardOf({ rows: [] }) },
      { rows: 0, say: /nobody has entered/i }],
    ['once it is open it ranks the entries',
      { mine: ENTRY, board: boardOf({ rows: IN_IT, me: { place: 2, entries: 2, score: 77.5 } }) },
      { rows: 2, mine: 1, say: '' }],
    ['a reader off the bottom of the fifty is still shown their own place',
      { mine: ENTRY,
        board: boardOf({ rows: ABOVE, me: { place: 112, entries: 400, score: 31.0 } }) },
      { rows: 4, mine: 1, tail: /112/, say: '' }],
  ]) {
    const { page, boom } = await openPage(browser, FANTASY,
      { who: TESTER, at: LIVE_AT, server });
    await openBoard(page);
    await page.waitForTimeout(400);
    const seen = await page.evaluate(() => ({
      rows: document.querySelectorAll('#lv-board .brow').length,
      mine: document.querySelectorAll('#lv-board .brow.me').length,
      text: document.getElementById('lv-board').textContent,
      lab: document.getElementById('lv-boardlab').textContent,
      say: document.getElementById('lv-boardsay').textContent.trim(),
    }));
    ok(label, seen.rows === want.rows, seen.rows + ' rows, "' + seen.say + '"');
    /* EACH OF THE FOUR STATES IS A DIFFERENT SENTENCE, which is the whole reason this
       screen can reach states the entry screen could not: there, the reader had entered by
       definition, so "nobody yet" could not be true. */
    if (want.say instanceof RegExp) {
      ok('  and says which kind of nothing it is', want.say.test(seen.say), seen.say);
    } else if (want.say === '') {
      ok('  with no apology over it', seen.say === '', seen.say || 'nothing said');
      ok('  and a count of the entries', /entr/i.test(seen.lab), seen.lab);
      ok('  and the reader\'s own row picked out', seen.mine === want.mine, seen.mine + '');
    }
    if (want.tail) ok('  and their place is the one counted against everybody',
      want.tail.test(seen.text), seen.text.trim().slice(-40));
    ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
    await page.close();
  }
}

/* ================================================================
   WHO IS IN, BEFORE ANYBODY CAN SEE A LINEUP
   ================================================================
 *
 * "No lineups before the lock" was implemented as "no rows", and those are two different
 * claims. What a reader wants at the moment they enter is whether anybody else has, and the
 * only answer this screen could give was a count on a label.
 *
 * `supabase/112_fantasy_entrants.sql` answers it with names and nothing else, and the claim
 * that the PAYLOAD cannot carry a lineup is proved where it lives, in
 * `supabase/test/fantasy_entrants_test.sql`, which asserts the key set of an entrant as a
 * SET. What is asked here is the half only the glass can answer: that the list is drawn, that
 * it carries no place and no score, and that a database still on 111 falls back to the
 * sentence this screen has always had rather than claiming nobody is there.
 */
console.log('\nWHO IS IN, BEFORE ANYBODY CAN SEE A LINEUP');
{
  const ENTRY = { picks: POOL.pool.slice(0, 6).map((m) => m.player_id),
    spend: 80, projected: 50, score: 0, scored: false };
  const ENTS = [
    { entry_no: 1, display_name: 'Ada', is_me: false },
    { entry_no: 2, display_name: 'You', is_me: true },
    { entry_no: 3, display_name: 'Cy', is_me: false },
  ];
  const shut = (o) => boardOf(Object.assign({ rows: [], open: false, now: BEFORE }, o));

  for (const [label, board, want] of [
    /* ABSENT IS NOT EMPTY, and the entry count is what tells them apart. SQL is deployed by
       hand and this page by a push, so a database one migration behind answers with no
       `entrants` key at all while the week genuinely has entries in it. Read as "nobody",
       that is the page telling a reader the competition is empty on the evening it fills up.
       This arm IS that database: `boardOf` leaves the key out entirely. */
    ['a database without the migration keeps the sentence it always had',
      shut({ me: { place: 0, entries: 3, score: 0 } }),
      { erows: 0, door: false, say: /opens at the first kickoff/i }],
    ['and with it, the board says who is in',
      shut({ entrants: ENTS, me: { place: 0, entries: 3, score: 0 } }),
      { erows: 3, door: true, say: /lineups open at the first kickoff/i }],
    ['a week nobody has entered still says being first is the prize',
      shut({ entrants: [] }),
      { erows: 0, door: false, say: /being first is the prize/i }],
  ]) {
    const { page, boom } = await openPage(browser, FANTASY,
      { who: TESTER, at: BEFORE, server: { mine: ENTRY, board } });
    await page.waitForSelector('#s-in.on', { timeout: 15000 });
    await page.waitForTimeout(400);
    const seen = await page.evaluate(() => ({
      door: !document.getElementById('b-in-board').hidden,
      say: document.getElementById('lv-boardsay').textContent.trim(),
      erows: document.querySelectorAll('#lv-board .erow').length,
      mine: document.querySelectorAll('#lv-board .erow.me').length,
      brows: document.querySelectorAll('#lv-board .brow').length,
      text: document.getElementById('lv-board').textContent,
      lab: document.getElementById('lv-boardlab').textContent,
    }));
    ok(label, seen.erows === want.erows && seen.say && want.say.test(seen.say),
      `${seen.erows} names, "${seen.say}"`);
    /* THE DOOR IS DRAWN WHEN THE BOARD HAS SOMETHING TO SAY, which used to be the lock and
       nothing else. A button that opens a screen carrying one sentence is a control that
       takes somebody somewhere to be told nothing, so it stays hidden on both of the other
       two arms. */
    ok('  and the door matches what is behind it', seen.door === want.door,
      seen.door ? 'shown' : 'hidden');
    if (want.erows) {
      ok('  the reader finds themselves in it', seen.mine === 1, seen.mine + ' marked');
      /* NO PLACE AND NO SCORE, because a place implies a score and there is no score yet:
         a numbered list before the games would invent a standing out of who pressed first.
         Asked as "no digit anywhere in the list", which is a property of the drawn list
         rather than a count of the elements somebody happened to name. THE THREE FIXTURE
         NAMES CARRY NO DIGIT ON PURPOSE, so the only thing that can put one there is the
         page: a real display name is allowed all the digits it likes, because that is the
         reader's own name rather than something this screen invented. */
      ok('  and it ranks nobody', !/\d/.test(seen.text) && seen.brows === 0,
        JSON.stringify(seen.text));
      ok('  and the label counts them', /3 entries/.test(seen.lab), seen.lab);
    }
    ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
    await page.close();
  }

  /* AND ONCE IT LOCKS, THE LIST IS THE BOARD. The server sends one or the other and never
     both, so the page must not be able to draw two lists of names at once. */
  {
    const row = (place, name, score, me) => ({ place, display_name: name, score,
      projected: 58, spend: 88, picks: [], is_me: !!me, entry_no: place, played: 6 });
    const { page, boom } = await openPage(browser, FANTASY, { who: TESTER, at: LIVE_AT,
      server: { mine: ENTRY,
        board: boardOf({ rows: [row(1, 'Ada', 72.3), row(2, 'You', 41.0, true)],
          entrants: [], me: { place: 2, entries: 2, score: 41.0 } }) } });
    await openBoard(page, '#b-in-board');
    await page.waitForTimeout(400);
    const seen = await page.evaluate(() => ({
      brows: document.querySelectorAll('#lv-board .brow').length,
      erows: document.querySelectorAll('#lv-board .erow').length,
    }));
    ok('once it locks the names are the board and the list is gone',
      seen.brows === 2 && seen.erows === 0, `${seen.brows} rows, ${seen.erows} names`);
    ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
    await page.close();
  }
}

/* ----------------------------------------------------------------
 * EACH DOOR LANDS ON WHAT IT PROMISED
 *
 * Sixteen games is about 980px at a phone width and a full board is fifty rows, so stacked,
 * whichever of the two was drawn second sat behind a scroll of the other all afternoon. They
 * are two panels now, which makes WHICH ONE a control opens a thing that can be wrong: a
 * button reading Live scores that opens a leaderboard is the premium card's own lesson,
 * where the card said one thing and the sheet it opened said another.
 * ---------------------------------------------------------------- */
console.log('\nTHE PILL OPENS THE SCORES AND THE OTHER DOOR OPENS THE BOARD');
{
  const ENTRY = { picks: POOL.pool.slice(0, 6).map((m) => m.player_id),
    spend: 80, projected: 50, score: 0, scored: false };
  const row = (place, name, score, me) => ({ place, display_name: name, score,
    projected: 58, spend: 88, picks: [], is_me: !!me, entry_no: name.charCodeAt(0), played: 6 });
  const board = boardOf({ rows: [row(1, 'Ada', 72.3), row(2, 'You', 41.0, true)],
    me: { place: 2, entries: 2, score: 41.0 } });
  const pane = (page) => page.evaluate(() => ({
    games: !document.getElementById('lv-pane-games').hidden,
    board: !document.getElementById('lv-pane-board').hidden,
    tab: document.getElementById('lv-tab-board').className,
  }));
  for (const [label, door, want] of [
    ['the pill says Live scores and opens the games', '#b-live', 'games'],
    ['and the entry screen\'s own door opens the board', '#b-in-board', 'board'],
  ]) {
    const { page, boom } = await openPage(browser, FANTASY,
      { who: TESTER, at: LIVE_AT, server: { mine: ENTRY, board } });
    await page.waitForSelector('#s-in.on', { timeout: 15000 });
    await page.waitForSelector(door + ':not([hidden])', { timeout: 10000 });
    await page.click(door);
    await page.waitForSelector('#s-live.on', { timeout: 10000 });
    const seen = await pane(page);
    ok(label, seen[want] && !seen[want === 'games' ? 'board' : 'games'],
      `games ${seen.games}, board ${seen.board}`);
    /* AND THE OTHER ONE IS ONE PRESS AWAY, which is the whole reason they are tabs rather
       than two screens. */
    await page.click('#lv-tab-' + (want === 'games' ? 'board' : 'games'));
    const then = await pane(page);
    ok('  and the other panel is one press away',
      then[want === 'games' ? 'board' : 'games'], `games ${then.games}, board ${then.board}`);
    ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
    await page.close();
  }
}

/* ----------------------------------------------------------------
 * A READER WHO NEVER DRAFTED IS WHO THIS SCREEN IS FOR
 *
 * While the board lived under the entry screen, the only way to it was to have an entry.
 * So on the one afternoon it is worth looking at, somebody who missed the lock had no way
 * to see the competition at all, and no error anywhere said so. That is the dynasty
 * leaderboard that rendered perfectly and had no door, arriving here.
 * ---------------------------------------------------------------- */
console.log('\nAND SOMEBODY WHO NEVER ENTERED CAN STILL WATCH');
{
  const row = (place, name, score) => ({ place, display_name: name, score,
    projected: 58, spend: 88, picks: [], is_me: false,
    entry_no: name.charCodeAt(0), played: 6 });
  const { page, boom } = await openPage(browser, FANTASY,
    { who: TESTER, at: LIVE_AT,
      /* `mine` false is the server saying "you have not entered", which is different from
         null. The page must land on the home screen and still offer the scoreboard. */
      server: { mine: false, board: boardOf({ rows: [row(1, 'Ada', 72.3), row(2, 'Bo', 40.1)],
        me: null }) } });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });
  ok('the pill is there for somebody with no entry',
    await page.evaluate(() => !document.getElementById('b-live').hidden));
  await page.click('#b-live');
  await page.waitForSelector('#s-live.on', { timeout: 10000 });
  await page.waitForTimeout(350);
  const seen = await page.evaluate(() => ({
    rows: document.querySelectorAll('#lv-board .brow').length,
    mine: document.querySelectorAll('#lv-board .brow.me').length,
    games: document.querySelectorAll('#lv-games .gm').length,
  }));
  ok('  and they get the whole board', seen.rows === 2, seen.rows + '');
  ok('  with nobody picked out as them', seen.mine === 0, seen.mine + '');
  ok('  and the games beside it', seen.games === 16, seen.games + '');
  /* BACK GOES SOMEWHERE THAT EXISTS. A single destination would send a reader with no
     lineup to a screen about one. */
  await page.click('#b-live-back');
  ok('  and Back goes to the home screen rather than an entry they do not have',
    await screenOn(page) === 's-home', await screenOn(page));
  ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
  await page.close();
}

/* ----------------------------------------------------------------
 * THE PILL IS ASKED OF THE SCHEDULE, NEVER OF THE DAY OF THE WEEK
 *
 * "Thursday to Monday" is what a normal week works out to and is not what it means. A rule
 * written in weekday names is wrong about a Saturday slate, a London kickoff and the Friday
 * after Thanksgiving, and is wrong silently: the button renders perfectly at every hour of
 * every day, and the only symptom is that it is there when there is nothing to watch or
 * missing when there is.
 * ---------------------------------------------------------------- */
console.log('\nTHE LIVE BUTTON KNOWS WHEN THE WEEK IS BEING PLAYED');
{
  const first = Math.min(...POOL.pool.filter((m) => m.kick).map((m) => Date.parse(m.kick)));
  const last = Math.max(...POOL.pool.filter((m) => m.kick).map((m) => Date.parse(m.kick)));
  for (const [label, at, want] of [
    ['a minute before the first kickoff there is nothing to watch', first - 60e3, false],
    ['a minute after it there is', first + 60e3, true],
    ['and through to well after the last game', last + 60e3, true],
    ['and it is gone once that one is long over', last + 7 * 3600e3, false],
  ]) {
    const { page, boom } = await openPage(browser, FANTASY, { who: TESTER, at });
    await page.waitForSelector('#s-home.on', { timeout: 15000 });
    await page.waitForTimeout(150);
    const shown = await page.evaluate(() => !document.getElementById('b-live').hidden);
    ok(label, shown === want, shown ? 'shown' : 'hidden');
    /* AND THE COLUMN GETS A FLOOR TO SIT ABOVE. A fixed pill over the last control is a
       button covering the way out, which is the boss battle's Continue arriving at a
       different screen. */
    ok('  and the column makes room for it exactly when it is there',
      await page.evaluate(() => document.body.classList.contains('haslive')) === want);
    ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
    await page.close();
  }

  /* NOT ON THE SCREEN IT OPENS, and not over a draft board. */
  const { page, boom } = await openPage(browser, FANTASY, { who: TESTER, at: first + 60e3 });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });
  await page.click('#b-live');
  await page.waitForSelector('#s-live.on', { timeout: 10000 });
  ok('it is not a door to the room it is standing in',
    await page.evaluate(() => document.getElementById('b-live').hidden));
  ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
  await page.close();
}

/* ----------------------------------------------------------------
 * THE GAMES, WHICH THE PAGE CAN DRAW BEFORE ANYTHING HAS WRITTEN ONE
 *
 * The slate comes out of the pool every visitor already downloads, so sixteen games with
 * their kickoffs are on screen with no request and no migration. What the server adds is
 * what has happened since. Both halves are asserted, because a screen that could only draw
 * one of them is blank on exactly one of the two afternoons it is for.
 * ---------------------------------------------------------------- */
console.log('\nTHE SCOREBOARD IS THE SCHEDULE UNTIL SOMETHING HAS HAPPENED');
{
  const ENTRY = { picks: POOL.pool.slice(0, 6).map((m) => m.player_id),
    spend: 80, projected: 50, score: 0, scored: false };
  const row = (place, name, score, me) => ({ place, display_name: name, score,
    projected: 58, spend: 88, picks: [], is_me: !!me, entry_no: name.charCodeAt(0), played: 6 });
  const ROWS = [row(1, 'Ada', 72.3), row(2, 'You', 41.0, true)];
  const ME = { place: 2, entries: 2, score: 41.0 };

  /* A pair of real week 3 clubs, so the merge is driven on the key the page actually uses
     rather than on made up codes. */
  const one = POOL.pool.find((m) => m.home);
  const AWAY = one.opp, HOME = one.team;

  /* NOTHING WRITTEN AT ALL. This is the state between publishing a week and the first run
     of the live writer, and it is also every state if the migration is never applied. */
  {
    const { page, boom } = await openPage(browser, FANTASY,
      { who: TESTER, at: LIVE_AT,
        server: { mine: ENTRY, board: boardOf({ rows: ROWS, me: ME, games: [] }) } });
    await openBoard(page);
    await page.waitForTimeout(350);
    const seen = await page.evaluate(() => ({
      games: document.querySelectorAll('#lv-games .gm').length,
      live: document.querySelectorAll('#lv-games .gm.live').length,
      scores: [...document.querySelectorAll('#lv-games .gt i')]
        .filter((e) => e.textContent.trim()).length,
      text: document.getElementById('lv-games').textContent,
    }));
    ok('with nothing written the whole slate is still drawn', seen.games === 16,
      seen.games + ' games');
    ok('  and not one of them claims a score', seen.scores === 0, seen.scores + ' numbers');
    ok('  and none of them claims to be live', seen.live === 0, seen.live + '');
    ok('  the clubs are named', seen.text.includes(AWAY) && seen.text.includes(HOME));
    ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
    await page.close();
  }

  /* AND THEN THE GAMES START. Three states on one board, because the three want three
     different right hand cells and a page that drew them the same way would be a
     scoreboard on which a final and a kickoff time look alike. */
  {
    const games = [
      { game_id: 'g1', away: AWAY, home: HOME, kick: one.kick, state: 'in',
        away_score: 7, home_score: 21, period: 3, clock: '4:12', overtime: null },
    ];
    /* Every other game of the week is left to the schedule, which is what a Thursday night
       looks like. */
    const { page, boom } = await openPage(browser, FANTASY,
      { who: TESTER, at: LIVE_AT,
        server: { mine: ENTRY, board: boardOf({ rows: ROWS, me: ME, games }) } });
    await openBoard(page);
    await page.waitForTimeout(350);
    const seen = await page.evaluate((k) => {
      const gm = [...document.querySelectorAll('#lv-games .gm')]
        .find((e) => e.textContent.includes(k.away) && e.textContent.includes(k.home));
      return {
        total: document.querySelectorAll('#lv-games .gm').length,
        live: !!gm && gm.classList.contains('live'),
        text: gm ? gm.textContent.replace(/\s+/g, ' ').trim() : '',
        leads: gm ? [...gm.querySelectorAll('.gt')]
          .map((e) => (e.classList.contains('lead') ? '*' : '') + e.textContent.trim()) : [],
      };
    }, { away: AWAY, home: HOME });
    ok('a game in progress is drawn as one', seen.live, seen.text);
    ok('  with the quarter and the clock', /3rd/.test(seen.text) && /4:12/.test(seen.text),
      seen.text);
    /* WHO IS WINNING IS WHAT A SCOREBOARD IS FOR, and it is the one thing on the row that
       no amount of reading the numbers at a glance gives you if both sides look the same. */
    ok('  and the club that is ahead is the loud one',
      seen.leads.filter((x) => x[0] === '*').length === 1
      && seen.leads.find((x) => x[0] === '*').includes(HOME),
      seen.leads.join(' | '));
    ok('  and it did not replace the rest of the slate', seen.total === 16, seen.total + '');
    ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
    await page.close();
  }

  /* A FINISHED GAME HAS NO CLOCK AND A KICKOFF THAT HAS PASSED IS NOT A KICKOFF TIME.
     The second is the shape of a feed outage from the reader's side: the server refuses to
     move a game forwards on a source that knows less, so a game really under way can sit at
     `pre`, and printing "8:15" beside it would be the page inventing the one thing nobody
     knows. */
  {
    const games = [
      { game_id: 'g1', away: AWAY, home: HOME, kick: one.kick, state: 'post',
        away_score: 17, home_score: 34, period: null, clock: null, overtime: false },
    ];
    const { page, boom } = await openPage(browser, FANTASY,
      { who: TESTER, at: LIVE_AT,
        server: { mine: ENTRY, board: boardOf({ rows: ROWS, me: ME, games }) } });
    await openBoard(page);
    await page.waitForTimeout(350);
    const seen = await page.evaluate((k) => {
      const all = [...document.querySelectorAll('#lv-games .gm')];
      const done = all.find((e) => e.textContent.includes(k.away)
        && e.textContent.includes(k.home));
      return {
        done: done ? done.textContent.replace(/\s+/g, ' ').trim() : '',
        /* Every other game of this week kicks off after the instant the page is pinned to,
           except the Thursday one that is already final, so the rest still show a time. */
        others: all.filter((e) => e !== done)
          .map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
      };
    }, { away: AWAY, home: HOME });
    ok('a finished game says Final', /final/i.test(seen.done), seen.done);
    ok('  and carries no clock', !/\d:\d\d/.test(seen.done.replace(/\d\d?:\d\d [AP]M/i, '')),
      seen.done);
    /* AND NOBODY ELSE IS TOUCHED BY IT. The rest of the slate is on the schedule's own
       answer: a time if it has not started, and "Under way" if it has and nothing has been
       written about it. What none of them may have is a score. */
    ok('  and every other game is still on the schedule\'s answer',
      seen.others.every((t) => /\d\d?:\d\d/.test(t) || /under way/i.test(t)),
      seen.others.join(' | ').slice(0, 90));
    ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
    await page.close();
  }

  /* KICKED OFF AND NOTHING KNOWN. Driven at an instant past the Thursday kickoff with the
     server still saying `pre`, which is exactly what a blind feed writes. */
  {
    const firstKick = Math.min(...POOL.pool.filter((m) => m.kick).map((m) => Date.parse(m.kick)));
    const { page, boom } = await openPage(browser, FANTASY,
      { who: TESTER, at: firstKick + 45 * 60e3,
        server: { mine: ENTRY, board: boardOf({ now: firstKick + 45 * 60e3,
          rows: ROWS, me: ME, games: [] }) } });
    await openBoard(page);
    await page.waitForTimeout(350);
    const under = await page.evaluate(() => [...document.querySelectorAll('#lv-games .gm')]
      .filter((e) => /under way/i.test(e.textContent)).length);
    ok('a game that has kicked off and said nothing does not print a kickoff time',
      under === 1, under + ' under way');
    ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
    await page.close();
  }
}

/* ---------------------------------------------------------------- */
console.log('\nAND THEN THE WEEK IS SCORED');
{
  /* One entry, drafted and submitted, then the same page reopened with a results file in
     place. The claim is that the six men are described the same way either side of the
     games and that the total is the parts. */
  const { page, boom } = await openPage(browser, FANTASY, { who: TESTER, at: BEFORE });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });
  await page.click('#b-draft');
  for (let i = 0; i < D.SLOTS.length; i++) await signOne(page);
  await page.waitForSelector('#s-review.on', { timeout: 10000 });
  await page.locator('#r-five .lineup').first().click();
  await page.click('#b-submit');
  /* A SUBMIT LANDS ON THE BOARD NOW, and the entry screen is one press back. This section is
     about what the entry screen says either side of the games, so it goes there the way a
     reader does rather than by setting a class. */
  await page.waitForSelector('#s-live.on', { timeout: 10000 });
  await page.click('#b-live-back');
  await page.waitForSelector('#s-in.on', { timeout: 10000 });
  const entry = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /^ps_fantasy_/.test(k));
    return { key, value: localStorage.getItem(key) };
  });
  const mine = JSON.parse(entry.value).chances[JSON.parse(entry.value).submitted].ids;
  ok('a lineup was submitted', mine.length === D.SLOTS.length, mine.length + ' men');
  const projected = Number((await page.locator('#in-proj').innerText()).trim());
  await page.close();

  /* FIVE OF THE SIX SCORE AND ONE DOES NOT, which is the case the screen has to get right:
     a man who never took the field is a zero AND a sentence, not a blank. */
  const scores = {};
  const want = [22.4, 17.1, 9.9, 4.3, 0.5];
  mine.slice(0, 5).forEach((id, i) => { scores[id] = [want[i], '100 yds, 1 TD']; });
  const total = Math.round(want.reduce((t, x) => t + x, 0) * 10) / 10;
  const RES = { season: POOL.season, week: POOL.week, final: true, games: 16, played: 16,
    scores };

  const back = await openPage(browser, FANTASY,
    { who: TESTER, at: Date.parse(POOL.locks_at) + 4 * 86400000, results: RES,
      storage: entry });
  await back.page.waitForSelector('#s-in.on', { timeout: 15000 });
  await back.page.waitForFunction(() =>
    document.getElementById('in-head').textContent.trim() === 'How it went',
  null, { timeout: 10000 }).catch(() => {});
  const got = await back.page.evaluate(() => ({
    head: document.getElementById('in-head').textContent.trim(),
    lab: document.getElementById('in-lab').textContent.trim(),
    big: document.getElementById('in-proj').textContent.trim(),
    vs: document.getElementById('in-vs').textContent.trim(),
    vsShown: !document.getElementById('in-vs').hidden,
    rows: [...document.querySelectorAll('#in-roster .rrow')].map((r) => ({
      name: r.querySelector('.rn').textContent,
      pts: r.querySelector('.rs') ? r.querySelector('.rs').textContent.trim() : null,
    })),
  }));
  ok('coming back to a scored week shows the result', got.head === 'How it went'
    && got.lab === 'Half PPR', got.head + ' / ' + got.lab);
  /* THE TOTAL IS THE PARTS, which is the one property this screen must have. The football
     box score's rule, arriving at a lineup. */
  ok('  the big number is the six added up', Number(got.big) === total,
    got.big + ' against ' + total);
  ok('  and it names all six', got.rows.length === D.SLOTS.length, got.rows.length + '');
  ok('  every row carries what he scored', got.rows.every((r) => r.pts !== null),
    got.rows.map((r) => r.pts).join(', '));
  /* A MAN WITH NO ROW IN THE RESULTS SCORED ZERO AND IS SAID TO HAVE NOT PLAYED. Read as
     unknown he would be left out, and the lineup would quietly total five men. */
  const missing = got.rows.filter((r) => r.pts === '0.0');
  ok('  the man who did not play is 0.0 and says so', missing.length === 1
    && /did not play/i.test(missing[0].name),
    missing.length + ' at zero: ' + missing.map((r) => r.name).join(' | '));
  /* THE PROJECTION STAYS ON SCREEN. A score with nothing to measure it against says
     nothing about whether the draft was any good. */
  ok('  the projection is still shown beside it', got.vsShown
    && got.vs.indexOf(projected.toFixed(1)) >= 0, got.vs);
  ok('  nothing threw', !back.boom.length, back.boom.join(' | ') || 'clean');
  await back.page.close();

  /* AND AN UNSCORED WEEK IS UNCHANGED. The fetch misses most of the time, so the state the
     page is in for four days of every week is the one worth asserting did not move. */
  const pre = await openPage(browser, FANTASY,
    { who: TESTER, at: BEFORE, storage: entry });
  await pre.page.waitForSelector('#s-in.on', { timeout: 15000 });
  await pre.page.waitForTimeout(1500);
  const before = await pre.page.evaluate(() => ({
    head: document.getElementById('in-head').textContent.trim(),
    big: document.getElementById('in-proj').textContent.trim(),
    vsShown: !document.getElementById('in-vs').hidden,
  }));
  ok('a week with no results file still reads as an entry', before.head === 'You are in'
    && !before.vsShown && Number(before.big) === projected,
    before.head + ' / ' + before.big);
  ok('  nothing threw', !pre.boom.length, pre.boom.join(' | ') || 'clean');
  await pre.page.close();
}

/* ---------------------------------------------------------------- */
console.log('\nTHE WEEK LOCKS AT THE FIRST KICKOFF');
{
  const { page, boom } = await openPage(browser, FANTASY, { who: TESTER, at: AFTER });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });
  ok('after kickoff the draft button is gone', await page.locator('#b-draft').isHidden());
  const lock = await page.locator('#home-lock').innerText();
  ok('  and the rail says so rather than counting down', /lock/i.test(lock), lock.trim());
  ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
  await page.close();
}

/* ---------------------------------------------------------------- */
console.log('\nTHE BOARD FITS A PHONE');
{
  /* MEASURED AGAINST A PHONE AND NOT AGAINST THE HARNESS WINDOW, which is the trap the live
     board's call box fell into: 390x900 is not a handset, and 740 is the short one worth
     supporting. The deepest thing a thumb has to reach is the fifth man on the board. */
  const { page } = await openPage(browser, FANTASY,
    { who: TESTER, at: BEFORE, viewport: { width: 360, height: 740 } });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });
  await page.click('#b-draft');
  await page.waitForSelector('#d-men .man', { timeout: 10000 });
  const box = await page.locator('#d-men .man').last().boundingBox();
  ok('the fifth man on the board is on screen at 360x740', box && box.y + box.height <= 740,
    box ? `bottom ${Math.round(box.y + box.height)}` : 'no box');
  /* A row whose name pushed the price off the end would still measure fine vertically. */
  const wide = await page.evaluate(() => {
    const el = document.querySelector('#d-men');
    return el.scrollWidth - el.clientWidth;
  });
  ok('  and no row overflows sideways', wide <= 1, wide + 'px over');
  await page.close();
}

/* ----------------------------------------------------------------
 * THE BOARD MOVES WHILE THE GAMES ARE ON, AND EVERY WAY IT FAILS RENDERS PERFECTLY
 *
 * A board that never polls, a board that polls and repaints with no animation, and a board
 * that animates the wrong rows all draw a correct leaderboard. The only difference is
 * whether a reader can see what happened, and no other assertion in this file can tell them
 * apart. So this drives two real states through the page's own poll and measures the glass:
 * does a row that changed place actually TRAVEL, and does it end where it should.
 *
 * THE STUB ANSWERS A DIFFERENT BOARD EACH TIME IT IS ASKED, which is what makes this a
 * fixture for movement rather than for drawing. A stub that repeated itself would let a
 * painter that animates nothing pass.
 * ---------------------------------------------------------------- */
console.log('\nTHE BOARD MOVES, AND YOU CAN SEE WHO MOVED');
{
  const ENTRY = { picks: POOL.pool.slice(0, 6).map((m) => m.player_id),
    spend: 80, projected: 50, score: 0, scored: false };
  const r = (place, name, score, me) => ({ place, display_name: name, score,
    projected: 58, spend: 88, picks: [], is_me: !!me, entry_no: name.charCodeAt(0), played: 3 });

  /* Four entrants, and between the two states the top two swap and the reader climbs one.
     Ada falls from first to third, which is a two row move: enough to be unambiguous when
     it is measured, and exactly the shape a finished game produces. */
  /* THE READER'S OWN SIX RIDE ON `me`, because the live screen draws them off the same
     answer: without lines the six sit blank under a total that is climbing, which is the
     screen arguing with itself. Three of the six have played at T1 and five at T2. */
  const lines = (n) => POOL.pool.slice(0, 6).map((m, i) => ({
    player_id: m.player_id, half_ppr: i < n ? 8.2 + i : 0, played: i < n }));
  const T1 = boardOf({
    rows: [r(1, 'Ada', 72.3), r(2, 'Bo', 67.5), r(3, 'You', 41.0, true), r(4, 'Cy', 24.1)],
    me: { place: 3, entries: 4, score: 41.0, lines: lines(3) },
    games_final: 3,
  });
  const T2 = boardOf({
    rows: [r(1, 'Bo', 88.2), r(2, 'You', 80.4, true), r(3, 'Ada', 72.3), r(4, 'Cy', 45.6)],
    me: { place: 2, entries: 4, score: 80.4, lines: lines(5) },
    games_final: 7,
  });

  const { page, posted, boom } = await openPage(browser, FANTASY,
    /* T1 TWICE, BECAUSE THE ENTRY SCREEN ASKS BEFORE THE BOARD DOES. Boot lands on the
       reader's own lineup and starts watching there, so the first answer is spent before
       anybody presses anything. Listed once, the board's own first paint is already the
       second state, and the move this section exists for has happened off screen: the first
       run of it reported exactly that, as four rows arriving mid flight. */
    { who: TESTER, at: LIVE_AT,
      server: { mine: ENTRY, boards: [T1, T1, T2, T2, T2, T2, T2] } });
  await openBoard(page);
  await page.waitForSelector('#lv-board .brow', { timeout: 15000 });
  await page.waitForTimeout(300);

  const read = () => page.evaluate(() => [...document.querySelectorAll('#lv-board .brow')]
    .map((e) => ({
      k: e.getAttribute('data-k'),
      name: (e.querySelector('.bn') || {}).textContent,
      top: Math.round(e.getBoundingClientRect().top),
      cls: e.className,
    })));

  const before = await read();
  ok('the board draws without being reloaded', before.length === 4,
    before.map((x) => x.name).join(' '));
  ok('  and it says it is live', await page.evaluate(() => {
    const el = document.getElementById('lv-live');
    return !el.hidden && /LIVE/.test(document.getElementById('lv-livelab').textContent);
  }));
  ok('  with how much of the week is in',
    /3 of 16 games/.test(await page.evaluate(() =>
      document.getElementById('lv-livesay').textContent)));

  /* THE FIRST PAINT MUST NOT ANIMATE. There is nothing to move from, and four rows flying
     in from wherever they were measured is a screen announcing itself. */
  ok('  and the first paint moves nothing',
    before.every((x) => !/\bmoving\b|\bup\b|\bdown\b/.test(x.cls)),
    before.map((x) => x.cls).join(' | '));

  /* Drive the page's OWN poll rather than waiting twenty seconds for it: the claim is about
     what the painter does with a second answer, and sitting out the real interval would put
     a twenty second wait in the suite for every assertion below. */
  await page.evaluate(() => window.__rtgPoll());
  await page.waitForTimeout(90);

  /* MID FLIGHT. The transform is the inverse of the distance travelled, so a row that has
     really moved is, for this instant, still drawn where it WAS. That is the whole of FLIP,
     and it is the one moment at which a board that reorders with no animation and a board
     that animates are distinguishable. */
  const flying = await page.evaluate(() => [...document.querySelectorAll('#lv-board .brow')]
    .map((e) => ({
      k: e.getAttribute('data-k'),
      name: (e.querySelector('.bn') || {}).textContent,
      t: getComputedStyle(e).transform,
      cls: e.className,
    })));
  const moved = flying.filter((x) => x.t && x.t !== 'none' && !/matrix\(1, 0, 0, 1, 0, 0\)/.test(x.t));
  ok('a row that changed place is caught mid flight', moved.length >= 2,
    moved.map((x) => x.name + ' ' + x.t).join(' | ') || 'nothing was moving');
  ok('  and it is marked with the way it went',
    flying.some((x) => / up\b/.test(x.cls)) && flying.some((x) => / down\b/.test(x.cls)),
    flying.map((x) => x.name + ':' + x.cls.replace('brow', '').trim()).join(' | '));

  /* AND IT ARRIVES. A move that never finishes leaves the board permanently offset, which
     is a leaderboard whose rows do not line up with their own places. */
  /* WAITED FOR RATHER THAN SAMPLED AT AN INSTANT. The claim is that a mark never sticks,
     and the first draft asserted instead that the marks were off at one arbitrary moment
     after the move. That is a claim about the suite's own arithmetic: measured, they come
     off at about 620ms, and the version that failed was reading before that for reasons
     that had nothing to do with the page. A bound is the honest shape, and it still catches
     a mark that is never removed at all, which is the defect worth catching. */
  const clean = await page.waitForFunction(() =>
    [...document.querySelectorAll('#lv-board .brow')]
      .every((e) => !/\bmoving\b|\bup\b|\bdown\b/.test(e.className)),
    null, { timeout: 3000 }).then(() => true).catch(() => false);
  const after = await read();
  ok('  the board settles in the new order',
    after.map((x) => x.name).join(' ') === 'Bo You Ada Cy',
    after.map((x) => x.name).join(' '));
  ok('  with every transform cleared',
    await page.evaluate(() => [...document.querySelectorAll('#lv-board .brow')]
      .every((e) => !e.style.transform)));
  ok('  and every mark comes off when it settles', clean,
    after.map((x) => x.cls).join(' | '));

  /* THE KEYS FOLLOW THE PEOPLE. Keyed on place instead, row one is always row one and
     nothing ever moves: the scores would change under a board that never animates. */
  const key = (list, name) => (list.find((x) => x.name === name) || {}).k;
  ok('  and a row kept its key across the move',
    key(before, 'Ada') === key(after, 'Ada') && key(before, 'Bo') === key(after, 'Bo'),
    `Ada ${key(before, 'Ada')} -> ${key(after, 'Ada')}`);

  /* THE READER'S OWN SIX, off the live answer rather than off a results file that does not
     exist yet. Without it a total that is climbing sits over six blank men.
     THEY ARE ON THE ENTRY SCREEN AND THE BOARD IS NOT, which is the split this pass made:
     one poll, two screens, and each takes the half of the answer it is about. So the walk
     goes back the way a reader does and asks there. */
  await page.click('#b-live-back');
  await page.waitForSelector('#s-in.on', { timeout: 10000 });
  await page.evaluate(() => window.__rtgPoll());
  await page.waitForTimeout(120);
  ok('  and the reader\'s own six carry live points',
    await page.evaluate(() => {
      const got = [...document.querySelectorAll('#in-roster .rrow.got')];
      return got.length >= 1;
    }), 'live lines drawn');
  /*
   * AND NOTHING ON THE SCREEN SAYS `undefined`.
   *
   * It did. The live path handed `paintIn` the six scores and nothing else, and that
   * function prints "3 of 16 games are in" off two fields the payload did not carry, so
   * the entry screen read "undefined of undefined games are in" for the whole afternoon.
   * Nothing threw, because it is a string built out of two missing numbers, and no
   * assertion in this file was looking at that sentence. Found by taking a screenshot of
   * the real page and looking at it.
   *
   * SO THE CLAIM IS ABOUT THE WHOLE SCREEN rather than about that one line. `undefined`,
   * `NaN` and `null` are what a missing field prints, none of them is a word any copy here
   * would ever use, and any of the three reaching a reader is the same bug wherever it
   * lands.
   */
  {
    const junk = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('#s-in *')) {
        if (el.children.length) continue;
        const t = (el.textContent || '').trim();
        if (/\b(undefined|NaN|null)\b/.test(t)) bad.push(t.slice(0, 60));
      }
      return bad;
    });
    ok('  and nothing on it prints undefined at a reader', junk.length === 0,
      junk.join(' | ') || 'clean');
    /* AND THE COUNT IT REPLACED IS THE REAL ONE, off the week rather than invented. */
    ok('  it says how much of the week is in',
      /7 of 16 games/.test(await page.evaluate(() =>
        document.getElementById('in-say').textContent)),
      await page.evaluate(() => document.getElementById('in-say').textContent));
    /* A MAN WHO SCORED NEEDS NO SENTENCE UNDER HIM. "played, nothing to show" beside 8.2 is
       a row arguing with itself, and it is what a live row (which carries no stat line)
       used to print for every man who had done anything. */
    ok('  and a man who scored is not described as having done nothing',
      await page.evaluate(() => ![...document.querySelectorAll('#in-roster .rrow.got')]
        .some((e) => /nothing to show/.test(e.textContent)
          && parseFloat((e.querySelector('.rs') || {}).textContent) > 0)));
  }

  /* AND THE POLL SURVIVED THE MOVE. `show` cancels every timer on this page, so a screen
     change that did not start watching again would leave the entry screen frozen: the
     total stops climbing and nothing anywhere says why. */
  {
    const was = posted.filter((x) => x.fn === 'fantasy_board').length;
    await page.evaluate(() => { window.__pollMs(60); });
    await page.waitForTimeout(400);
    const now = posted.filter((x) => x.fn === 'fantasy_board').length;
    ok('  and coming back off the board keeps the entry screen live', now > was,
      `${was} -> ${now}`);
  }

  ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
  await page.close();
}

/* ----------------------------------------------------------------
 * A FEED THAT HAS STOPPED LOOKS EXACTLY LIKE A QUIET AFTERNOON
 * ---------------------------------------------------------------- */
console.log('\nA BOARD THAT IS NOT MOVING SAYS WHICH KIND OF NOT MOVING IT IS');
{
  const ENTRY = { picks: POOL.pool.slice(0, 6).map((m) => m.player_id),
    spend: 80, projected: 50, score: 0, scored: false };
  const r = (place, name, score, me) => ({ place, display_name: name, score,
    projected: 58, spend: 88, picks: [], is_me: !!me, entry_no: name.charCodeAt(0), played: 6 });
  const ROWS = [r(1, 'Ada', 72.3), r(2, 'You', 41.0, true)];
  const ME = { place: 2, entries: 2, score: 41.0 };
  const hoursAgo = (h) => new Date(LIVE_AT - h * 3600e3).toISOString();

  for (const [label, board, want] of [
    ['a live week says LIVE',
      boardOf({ rows: ROWS, me: ME }), { lab: 'LIVE', cls: /\bon\b/ }],
    /* CHECKED LONG AGO IS THE ONE THAT MATTERS. The scores are perfectly good and the
       writer has stopped: without this the screen goes on breathing a red dot over a board
       that has not been looked at in an hour. */
    ['a writer that has stopped says so',
      boardOf({ rows: ROWS, me: ME, checked_at: hoursAgo(1), results_at: hoursAgo(1) }),
      { lab: 'NOT UPDATING', cls: /\bcold\b/ }],
    /* Locked, and nothing has looked yet: the gap between the Thursday kickoff and the
       first run of the writer. */
    ['a week nothing has scored yet says that instead',
      boardOf({ rows: ROWS, me: ME, checked_at: null, results_at: null, games_final: 0 }),
      { lab: 'NOT SCORED YET', cls: /\bcold\b/ }],
    ['and a finished week says FINAL',
      boardOf({ rows: ROWS, me: ME, scored_at: hoursAgo(2), games_final: 16 }),
      { lab: 'FINAL', cls: /\bdone\b/ }],
  ]) {
    const { page, boom } = await openPage(browser, FANTASY,
      { who: TESTER, at: LIVE_AT, server: { mine: ENTRY, board } });
    await openBoard(page);
    await page.waitForTimeout(250);
    const seen = await page.evaluate(() => ({
      lab: document.getElementById('lv-livelab').textContent,
      cls: document.getElementById('lv-live').className,
      hidden: document.getElementById('lv-live').hidden,
      /* The entry screen carries the same chip, because a total that climbs with nothing
         saying when it last moved is a total nobody can read. */
      inLab: document.getElementById('in-livelab').textContent,
      inCls: document.getElementById('in-live').className,
      inHidden: document.getElementById('in-live').hidden,
    }));
    ok(label, !seen.hidden && seen.lab === want.lab && want.cls.test(seen.cls),
      seen.lab + ' / ' + seen.cls);
    /* ONE PAINTER, TWO CHIPS. Written as two painters they would be two sets of words about
       one fact and would disagree the first time either was edited, which is the four
       premium cards' own lesson. */
    ok('  and the entry screen says exactly the same thing',
      !seen.inHidden && seen.inLab === seen.lab && seen.inCls === seen.cls,
      seen.inLab + ' / ' + seen.inCls);
    ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
    await page.close();
  }
}

/* ----------------------------------------------------------------
 * THE POLL STOPS WHEN IT SHOULD, WHICH IS THE HALF NOBODY WOULD NOTICE
 * ---------------------------------------------------------------- */
console.log('\nTHE POLL KNOWS WHEN TO STOP');
{
  const ENTRY = { picks: POOL.pool.slice(0, 6).map((m) => m.player_id),
    spend: 80, projected: 50, score: 0, scored: false };
  const r = (place, name, score, me) => ({ place, display_name: name, score,
    projected: 58, spend: 88, picks: [], is_me: !!me, entry_no: name.charCodeAt(0), played: 6 });
  const ROWS = [r(1, 'Ada', 72.3), r(2, 'You', 41.0, true)];
  const ME = { place: 2, entries: 2, score: 41.0 };

  /* A FINISHED WEEK IS ASKED ONCE AND NEVER AGAIN. Polling it is a request every twenty
     seconds, per reader, for an answer that cannot change, and nothing on screen would
     ever show it happening. */
  {
    const { page, posted, boom } = await openPage(browser, FANTASY,
      { who: TESTER, at: LIVE_AT,
        server: { mine: ENTRY,
          board: boardOf({ rows: ROWS, me: ME,
            scored_at: new Date(LIVE_AT - 60e3).toISOString() }) } });
    await page.waitForSelector('#s-in.on', { timeout: 15000 });
    await page.waitForTimeout(250);
    await page.evaluate(() => { window.__pollMs(60); });
    await page.waitForTimeout(700);
    const asks = posted.filter((p) => p.fn === 'fantasy_board').length;
    ok('a finished week is asked once and left alone', asks === 1, asks + ' asks');
    ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
    await page.close();
  }

  /* A LIVE WEEK KEEPS ASKING. The mirror claim, and without it the one above passes on a
     page that never polls at all. */
  {
    const { page, posted, boom } = await openPage(browser, FANTASY,
      { who: TESTER, at: LIVE_AT,
        server: { mine: ENTRY, board: boardOf({ rows: ROWS, me: ME }) } });
    await page.waitForSelector('#s-in.on', { timeout: 15000 });
    await page.waitForTimeout(250);
    await page.evaluate(() => { window.__pollMs(60); });
    await page.waitForTimeout(700);
    const asks = posted.filter((p) => p.fn === 'fantasy_board').length;
    ok('a live week goes on asking', asks >= 3, asks + ' asks');

    /* AND IT STOPS WHEN THE SCREEN IS LEFT. A leaderboard ticking behind another screen is
       a request every twenty seconds for a screen nobody is looking at.
       THE HOME SCREEN, NOT THE LIVE ONE. The poll serves the entry screen and the board
       both, so moving between those two is not leaving: a claim about stopping has to go
       somewhere that is neither, or it passes on a page that never stops at all. */
    await page.evaluate(() => { document.getElementById('b-in-back').hidden = false; });
    await page.click('#b-in-back');
    await page.waitForTimeout(120);
    const at = posted.filter((p) => p.fn === 'fantasy_board').length;
    await page.waitForTimeout(500);
    const now = posted.filter((p) => p.fn === 'fantasy_board').length;
    ok('  and stops the moment the screen is left', now === at, `${at} -> ${now}`);
    ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
    await page.close();
  }
}

/* ----------------------------------------------------------------
 * THE REVEAL, WHICH FAILS SILENTLY IN BOTH DIRECTIONS
 *
 * A stagger that never finishes leaves rows at opacity 0: a board with men on it that
 * nobody can read, no error, and a screen with no way on. A board that steps moves
 * everything under it when you sign somebody, which is what "jumpy" means and is invisible
 * to every other assertion in this file, because the men, the prices and the totals are all
 * correct while it happens.
 *
 * SO IT IS MEASURED ON THE GLASS, over a whole draft, at a real phone. Nothing here reads
 * a duration or a class name out of the source: what is asserted is that every row ends up
 * readable, that it happens within a bound, and that the thing under the board does not
 * move while it does. All three survive a redesign of how the reveal is written.
 * ---------------------------------------------------------------- */
console.log('\nTHE BOARD REVEALS, AND THE PAGE UNDER IT HOLDS STILL');
{
  const { page, boom } = await openPage(browser, FANTASY, { who: TESTER, at: BEFORE });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });
  await page.click('#b-draft');
  await page.waitForSelector('#d-men .man', { timeout: 10000 });

  const readable = () => page.evaluate(() => [...document.querySelectorAll('#d-men .man')]
    .every((e) => Number(getComputedStyle(e).opacity) > 0.99));
  const noteTop = () => page.evaluate(() => {
    const e = document.getElementById('d-note');
    return e ? Math.round(e.getBoundingClientRect().top) : null;
  });

  /* The FIRST board is dealt too, so a reveal that only ran on later presses would be
     caught. It is read before anything is pressed. */
  let dealt = false;
  for (let f = 0; f < 60 && !dealt; f++) {
    await page.waitForTimeout(25);
    dealt = await readable();
  }
  ok('the first board comes up readable', dealt);

  let worstSettle = 0, worstMove = 0, signed = 0;
  for (let i = 1; i < D.SLOTS.length; i++) {
    const before = await page.locator('#d-slots .slot.done').count();
    const t0 = Date.now();
    /* `:not([disabled])` for the reason signOne carries: the first row is the DEAREST, so
       it is the likeliest one to be out of reach late in a draft, and pressing it does
       nothing at all. Without this the section passes or hangs depending on the week's
       prices, which is a coin toss rather than a check. */
    await page.locator(/* NOT `[disabled]` AND NOT `.hurt`. An injured row is deliberately left pressable so its
     chip can be tapped, and a press on it opens the report rather than signing anybody, so
     a walk that took the first row it could click waited for a signing that never came. */
    '#d-men .man:not([disabled]):not(.hurt)').first().click({ force: true });
    /* Sampled while it runs rather than after, because the claim is about what happens
       DURING the reveal and a reading taken at the end cannot see a step that healed. */
    const tops = [];
    let done = false;
    for (let f = 0; f < 80 && !done; f++) {
      await page.waitForTimeout(25);
      const t = await noteTop();
      if (t != null) tops.push(t);
      const moved = await page.locator('#d-slots .slot.done').count();
      done = moved > before && await readable();
    }
    if (!done) break;
    signed++;
    worstSettle = Math.max(worstSettle, Date.now() - t0);
    worstMove = Math.max(worstMove, Math.max(...tops) - Math.min(...tops));
  }
  ok('  every press lands and every board ends up readable',
    signed === D.SLOTS.length - 1, `${signed} of ${D.SLOTS.length - 1}`);
  /* A BOUND AND NOT A DURATION. The reveal is an acknowledgement plus a five row stagger
     plus a fade, and any of the three is allowed to be retuned. What is not allowed is for
     it to stop ending, which is the failure that leaves a board unreadable for ever, so the
     ceiling is generous and the floor is that it finishes at all. */
  /* SCOPED TO THE PRESSES THAT LANDED, or it passes on zero of them. Driven with the
     stagger deliberately stopped part way, `signed` is 0 and `worstSettle` is 0, so a bare
     `< 1500` reports green on a board that never became readable at all: the vacuous pass
     this repo has caught itself at three times. */
  ok('  and it is over inside a second and a half',
    signed === D.SLOTS.length - 1 && worstSettle > 0 && worstSettle < 1500,
    `worst ${worstSettle}ms`);
  /* THE STEP. Reintroduced by taking the two line floor off the stat line, this reads 31px
     at 390x844: a board of one line stat lines is 63px a row and the next one is 74, so
     signing somebody moves everything under the board by half a row. One pixel of slack for
     sub-pixel layout and nothing else. */
  ok('  and nothing under the board moves while it happens', worstMove <= 1,
    `worst ${worstMove}px`);
  ok('  nothing threw', boom.length === 0, boom[0] || 'clean');
  await page.close();
}

/* ----------------------------------------------------------------
 * THE CAP IS ON THE SCREEN, AND THE GUARD PRESSES IT
 *
 * The engine section above asserts the boards CONTAIN men the cap cannot take. That says
 * nothing about whether the page draws them differently or refuses the press, and a row
 * that looks signable and then does nothing is the worst of the three states: the reader
 * presses it twice and concludes the mode is broken.
 *
 * So this drives a real draft until a grey row turns up and then PRESSES it. That is the
 * dynasty lock's rule arriving here: a lock on a door that opens anyway is decoration, and
 * a door that refuses with nothing to say is the wall it replaced.
 * ---------------------------------------------------------------- */
console.log('\nA MAN YOU CANNOT AFFORD IS SHOWN, AND THE PRESS IS REFUSED');
{
  const { page, boom } = await openPage(browser, FANTASY, { who: TESTER, at: BEFORE });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });
  await page.click('#b-draft');

  /*
   * GREEDY, AND OVER SEVERAL DRAFTS, because spending is what makes the cap bite and one
   * draft is a coin toss on whether it does. Measured in the engine, greedy meets an out of
   * reach man on about a quarter of boards, so a six pick draft misses entirely about one
   * time in five. The first version of this walked ONE draft, came back "never once refused
   * anything" and was reporting its own seed. Same lesson as sampling six seeds for the
   * boss battle's drive log.
   */
  const look = () => page.evaluate(() => {
    const rows = [...document.querySelectorAll('#d-men .man')];
    const poor = rows.find((e) => e.classList.contains('poor'));
    /* AND THE ROW IT IS COMPARED AGAINST IS A PLAIN ONE. An injured row is dimmed too, for
       a different reason, so picking one as the control compares two greys and reports a
       correct page as flat. */
    const rich = rows.find((e) => !e.classList.contains('poor')
      && !e.classList.contains('hurt'));
    if (!poor || !rich) return null;
    const dim = (e) => Number(getComputedStyle(e.querySelector('.who')).opacity);
    return {
      id: poor.dataset.id,
      disabled: poor.disabled,
      says: poor.querySelector('.cost s').textContent.trim(),
      dimmer: dim(poor) < dim(rich) - 0.1,
      priceLit: getComputedStyle(poor.querySelector('.cost b')).color
        !== getComputedStyle(poor.querySelector('.who')).color,
    };
  });
  /*
   * DRAFT AGAIN THROUGH THE REAL CONTROL, and that is a fix rather than a tidy-up. The loop
   * pressed `#b-abandon` between attempts, which only exists ON the draft screen: a walk
   * that got all the way through six picks without meeting a grey row was on the REVIEW
   * screen by then, and the next attempt waited thirty seconds for a button that was not
   * there. It survived for as long as the first draft happened to find one.
   */
  let sawGrey = null, drafts = 0;
  for (; drafts < D.CHANCES && !sawGrey; drafts++) {
    if (drafts) {
      await page.waitForSelector('#s-review.on', { timeout: 10000 });
      await page.click('#b-more');
      await page.waitForSelector('#s-draft.on', { timeout: 10000 });
      await page.waitForTimeout(200);
    }
    for (let i = 0; i < D.SLOTS.length && !sawGrey; i++) {
      await page.locator('#d-men .man').first().waitFor({ timeout: 10000 });
      sawGrey = await look();
      if (!sawGrey) await signOne(page);
    }
  }

  ok(`a greedy draft is shown a man it cannot sign, within ${drafts} drafts`, !!sawGrey,
    sawGrey ? sawGrey.says : 'never once refused anything over every draft');
  if (sawGrey) {
    ok('  it says why rather than just looking odd', /over budget/i.test(sawGrey.says),
      sawGrey.says);
    ok('  it is visibly quieter than a row you can take', sawGrey.dimmer);
    /* THE PRICE IS THE REASON THE ROW IS GREY, so it must not be greyed with it. Written as
       one opacity on the row this is impossible, because a child cannot opt out of a
       parent's opacity, and the rule that tried to say otherwise was a line that did
       nothing. Asserted as a colour rather than as a hex. */
    ok('  and the price is not dimmed with the rest of him', sawGrey.priceLit);
    /* PRESSED, NOT LOOKED AT. */
    const before = await page.locator('#d-slots .slot.done').count();
    await page.evaluate((id) => {
      const el = document.querySelector('#d-men .man[data-id="' + id + '"]');
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, sawGrey.id);
    await page.waitForTimeout(400);
    const after = await page.locator('#d-slots .slot.done').count();
    ok('  and pressing him signs nobody', after === before, `${before} -> ${after}`);
    /* And the board is not left mid acknowledgement by a press that did nothing. */
    const stuck = await page.evaluate(() =>
      document.getElementById('d-men').className.indexOf('clearing') >= 0);
    ok('  and the board is not left half cleared by it', !stuck);
  }
  ok('  nothing threw', boom.length === 0, boom[0] || 'clean');
  await page.close();
}

/* ---------------------------------------------------------------- */
/* ----------------------------------------------------------------
 * THE RED CHIP, AND THE PRESS IT TAKES
 *
 * Every way this breaks renders perfectly. A chip that is drawn and cannot be tapped, a row
 * that refuses a press and says nothing, a board that steps because one row grew a chip:
 * all three are a screen that looks right in a screenshot. So this drives a real board, at
 * a phone, and presses what it finds.
 * ---------------------------------------------------------------- */
console.log('\nA MAN WHO CANNOT PLAY IS RED, AND THE CHIP OPENS THE REPORT');
{
  const INJ = JSON.parse(fs.readFileSync(path.join(ROOT, 'football/data',
    `injuries_${NOW.season}_w${NOW.week}.json`), 'utf8'));
  const off = Object.values(INJ.men).filter((e) => e.st === 'off').length;

  const { page, boom } = await openPage(browser, FANTASY,
    { who: TESTER, at: BEFORE, viewport: { width: 390, height: 844 } });
  await page.waitForSelector('#s-home.on', { timeout: 15000 });

  /* A MAN ON INJURED RESERVE IS NOT ON THE BOARD AT ALL, and the front page counts what is
     left. Read off the page's own sentence rather than out of a variable, because the
     count a reader is given is the claim. */
  const said = await page.evaluate(() =>
    document.getElementById('home-week').textContent);
  ok('the men who cannot play are off the board',
    said.includes(`${POOL.pool.length - off} men`),
    said + ` (${off} on reserve)`);

  /* Walk to a board with an injured man on it. Three picks reaches the first WR slot, which
     is where the live report's two designated men in the wheel's reach are; a board that
     does not have one is abandoned and the next is drawn. Searched rather than seeded,
     because what is under test is the board a reader is actually handed. */
  await page.click('#b-draft');
  let found = false;
  for (let attempt = 0; attempt < 25 && !found; attempt++) {
    for (let i = 0; i < 3; i++) {
      await page.waitForSelector('#d-men .man', { timeout: 10000 });
      await page.waitForTimeout(400);
      await signOne(page);
    }
    await page.waitForSelector('#d-men .man', { timeout: 10000 });
    await page.waitForTimeout(430);
    if (await page.locator('#d-men .man.hurt').count()) { found = true; break; }
    await page.click('#b-abandon');
  }
  ok('a board offers a man the report has ruled out', found, 'within 25 draws');

  if (found) {
    const row = await page.evaluate(() => {
      const r = document.querySelector('#d-men .man.hurt');
      const chip = r.querySelector('.inj');
      const cs = getComputedStyle(chip);
      return {
        id: r.dataset.id,
        disabled: r.disabled,
        chip: chip ? chip.textContent.trim() : null,
        colour: cs.color,
        /* ONE HEIGHT ACROSS THE FIVE. A chip that wrapped onto a second line would make its
           row taller than the other four, which is the board stepping: the same defect the
           stat line's two line floor was written for. */
        heights: [...document.querySelectorAll('#d-men .man')]
          .map((e) => Math.round(e.getBoundingClientRect().height)),
        /* And the NAME survived it. The chip is small and the price column is what had to
           give: at sixteen characters the refusal truncated "Zay Flowers" to "Zay Flow...",
           on the one row where knowing who it is matters most. */
        name: r.querySelector('.who b i').textContent,
        clipped: (() => { const i = r.querySelector('.who b i');
          return i.scrollWidth > i.clientWidth + 1; })(),
      };
    });
    ok('  it carries a chip', !!row.chip, row.chip || 'none');
    /* REDDISH, ASKED AS A PROPERTY RATHER THAN AS A HEX, so a palette change does not fail
       a correct page. */
    const rgb = (row.colour.match(/\d+/g) || []).map(Number);
    ok('  and the chip is red', rgb[0] > 180 && rgb[0] > rgb[1] + 60 && rgb[0] > rgb[2] + 60,
      row.colour);
    /* NOT `disabled`, AND THAT IS LOAD BEARING RATHER THAN AN OVERSIGHT. A disabled button
       swallows every pointer event in its subtree, so the chip on it could be read and
       never tapped, and the report is the whole reason the row is drawn. */
    ok('  and the row is pressable, so the chip can be', !row.disabled);
    ok('  the board does not step for it',
      new Set(row.heights).size === 1, row.heights.join(','));
    ok('  and the name is not truncated to make room', !row.clipped, row.name);

    /* PRESSING IT SIGNS NOBODY AND SAYS WHY. A row that refuses and does nothing is a wall,
       which is this repo's own rule about a locked door arriving at a list. */
    const before = await page.evaluate(() =>
      document.querySelectorAll('#d-slots .slot .p').length);
    const filled = () => page.evaluate(() =>
      [...document.querySelectorAll('#d-slots .slot')]
        .filter((e) => e.classList.contains('done')).length);
    const was = await filled();
    await page.click('#d-men .man.hurt');
    await page.waitForSelector('#inj-sheet:not([hidden])', { timeout: 5000 });
    ok('  pressing it opens the report', true);
    ok('  and signs nobody', (await filled()) === was, `${was} slots filled`);
    ok('  and the slot strip is untouched',
      (await page.evaluate(() => document.querySelectorAll('#d-slots .slot .p').length))
        === before);

    const sheet = await page.evaluate(() => ({
      name: document.getElementById('inj-name').textContent,
      line: document.getElementById('inj-line').textContent,
      when: document.getElementById('inj-when').textContent,
    }));
    ok('  the sheet names him', sheet.name === row.name, sheet.name);
    /* THE DESIGNATION AND THE BODY PART, which is what the report actually says. */
    ok('  says the designation and the injury',
      /out|doubtful|questionable/i.test(sheet.line) && /[a-z]{4}/i.test(sheet.line),
      sheet.line);
    /* AND WHICH WEEK IT IS FROM. On a Tuesday the coming week has not been filed, so the
       freshest answer is last week's, and a sheet that printed it as this week's would be
       inventing a certainty nobody has. */
    ok('  and which week it is from', /week \d/i.test(sheet.when) || /this week/i.test(sheet.when),
      sheet.when);
    ok('  and where it came from', /report/i.test(sheet.when), sheet.when);

    /* The scrim closes it. A sheet with one way out is one somebody taps around and gets
       nothing from. */
    await page.evaluate(() => {
      const el = document.getElementById('inj-sheet');
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.width / 2,
        clientY: 8 }));
    });
    ok('  and the scrim closes it',
      await page.evaluate(() => document.getElementById('inj-sheet').hidden));
  }
  ok('  nothing threw', !boom.length, boom.join(' | ') || 'clean');
  await page.close();
}

/* ---------------------------------------------------------------- */
console.log('\nTHE DOOR IS BUILT FOR A TESTER AND FOR NOBODY ELSE');
for (const [label, who, want] of [
  ['a tester gets the door', TESTER, true],
  ['a signed in stranger does not', STRANGER, false],
  ['a signed out visitor does not', null, false],
]) {
  const { page, boom } = await openPage(browser, 'http://local.test/football/',
    { who, at: BEFORE });
  await page.waitForTimeout(5000);
  const got = await page.evaluate(() => {
    const el = document.getElementById('b-fantasy');
    if (!el) return { there: false };
    /* WHERE IT SITS, not just that it exists. Appended to the group it landed UNDER the
       "Unlock everything" card, because that card is inserted into the same container by a
       builder that runs afterwards, so the offer ended up in the middle of the list of
       modes with one door stranded below it. Compared by document position rather than by
       index, because the group's contents depend on who is looking. */
    const card = document.getElementById('b-premium');
    const after = card
      ? !!(el.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
    return { there: true, tag: el.tagName, href: el.getAttribute('href'),
      shown: !!(el.offsetWidth || el.offsetHeight),
      aboveStore: after,
      underlined: getComputedStyle(el).textDecorationLine };
  });
  ok(label, got.there === want, JSON.stringify(got));
  if (want) {
    /* AN ANCHOR, because it goes to another page and middle click has to work. */
    ok('  it is a link and it points at the mode', got.tag === 'A' && got.href === '/football/fantasy/',
      got.tag + ' ' + got.href);
    ok('  it is visible', got.shown);
    /* null means this reader is not shown the store at all, which is a fine answer and not
       a pass by default: the claim is only about a page that has both. */
    ok('  and it is with the other mode doors, above the store card',
      got.aboveStore !== false, 'store card ' + (got.aboveStore === null ? 'not drawn'
        : (got.aboveStore ? 'below it' : 'ABOVE it')));
    /* .btn and .hp-full were both written for <button>, so neither turns the browser's own
       underline off, and the underline is the only thing that gives an anchor away here. */
    ok('  and it does not wear the browser\'s underline', got.underlined === 'none',
      got.underlined);
  }
  ok('  the game still boots', !boom.length, boom.join(' | ') || 'clean');
  await page.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
