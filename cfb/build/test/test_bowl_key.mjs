/* The bowl a season played, as the row records it.
 *
 *   node cfb/build/test/test_bowl_key.mjs [dbname]
 *
 * DBNAME MUST BE THE DATABASE THE POSTGREST STUB IS SERVING. The browser half
 * seeds rows with psql and then reads them back through board.js, so if psql and
 * the stub point at different databases every seeded assertion still passes and
 * only the ones that cross the seam fail, which reads like a code regression and
 * is not one. Start the stub and run this with the same name.
 *
 * Two things, and the second is why this file exists.
 *
 * WHICH BOWL. cfb_runs stores a slug and the client resolves it to a name against
 * its own table, so the leaderboard can say which trophy rather than "Bowl
 * champions", and so the nine badges that key off a specific bowl are reachable
 * for a signed-in player whose trophy case is rebuilt from these rows. Before
 * 64_cfb_bowl_key.sql those nine were not hard, they were impossible.
 *
 * WHICH TIER, AGAINST THE ENGINE. 62 and 63 derived the tier from the LOSS COUNT
 * while engine.js derives it from the RANKING, and the two disagree on a large
 * slice of the reachable space: a 9-3 team ranked 44th played a small bowl on
 * screen and recorded as a New Year's Six. That was survivable while the tier
 * only chose a word; it stops being survivable once the row also carries which
 * bowl, because then the tier and the slug contradict each other on the same row
 * and "win all six New Year's Six bowls" can be completed with six small-bowl
 * trophies. So this sweeps EVERY (wins, rank) a season can have and demands the
 * database and the engine agree on every one of them.
 */
import { createRequire } from 'module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const E = require(process.cwd() + '/cfb/engine.js');

const DB = process.argv[2] || 'cfbtest';
let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };
const psql = (sql) => execFileSync('psql', ['-X', '-A', '-t', '-d', DB, '-c', sql],
  { encoding: 'utf8', env: { ...process.env, PGHOST: process.env.PGHOST || '/tmp',
    PGPORT: process.env.PGPORT || '5433', PGUSER: process.env.PGUSER || 'postgres' } }).trim();

/* The stored tier for a season, read back out of a real insert. Six distinct
   picks per call, because the function refuses a repeated player. */
let seq = 100;
function submit(wins, rank, key) {
  const picks = Array.from({ length: 6 }, () => `${seq++}:2019`);
  const arr = '{' + picks.join(',') + '}';
  const k = key === null ? 'null' : `'${key}'`;
  const id = psql(`select cfb_submit_run(${wins}, ${rank}, 0, false, 0.0, 1.0, 9.0, 0, 0, null,
    '${arr}'::text[], null, null, null, null, null, null, 80.0, null, 'free', ${k})`);
  const row = psql(`select coalesce(bowl,'-') || '|' || coalesce(bowl_key,'-') from cfb_runs where id = ${id}`);
  const [bowl, bowlKey] = row.split('|');
  return { bowl: bowl === '-' ? null : bowl, bowlKey: bowlKey === '-' ? null : bowlKey };
}
/* The stored tier name for the tier the engine calls 'major'. */
const stored = (t) => (t === 'major' ? 'bowl' : t);

console.log('\n=== the tier the database records is the tier the engine played ===');
{
  /* Every reachable non-playoff season: 0..12 regular wins against a spread of
     rankings that straddles both engine thresholds and the field itself. */
  const RANKS = [1, 4, 12, 13, 17, 18, 19, 25, 39, 40, 41, 60, 100, 134];
  let checked = 0;
  const wrong = [];
  for (let w = 0; w <= 12; w++) {
    for (const rank of RANKS) {
      /* The playoff is a different branch with its own test; the field also
         refuses a team with more than four losses, so skip what cannot exist. */
      if (rank <= 12) continue;
      const want = E.seedFromRanking(rank, w);
      const got = submit(w, rank, null);
      checked++;
      if (got.bowl !== stored(want.bowl || null)) {
        wrong.push(`${w}-${12 - w} rank ${rank}: engine ${want.bowl || 'none'}, db ${got.bowl || 'none'}`);
      }
    }
  }
  ok('every reachable season agrees', wrong.length === 0, checked + ' checked' +
    (wrong.length ? '\n         ' + wrong.slice(0, 6).join('\n         ') : ''));
}

console.log('\n=== which bowl, and when it is refused ===');
{
  /* A real bowl team keeps its slug. 8-4 at rank 30 is a major by the engine. */
  const a = submit(8, 30, 'garland_bowl');
  ok('a bowl team records which bowl', a.bowlKey === 'garland_bowl', a.bowl + ' / ' + a.bowlKey);

  /* A team that reached no bowl cannot carry one, however insistent the client. */
  const b = submit(3, 118, 'garland_bowl');
  ok('a 3-9 team reaches no bowl and carries no slug', b.bowl === null && b.bowlKey === null,
    b.bowl + ' / ' + b.bowlKey);

  /* Nor can a playoff team, which plays no bowl at all. */
  const picks = '{' + Array.from({ length: 6 }, () => `${seq++}:2019`).join(',') + '}';
  const id = psql(`select cfb_submit_run(11, 3, 2, false, 14.0, 2.0, 10.9, 0, 0, null,
    '${picks}'::text[], null, null, null, null, null, null, 96.0, null, 'free', 'garland_bowl')`);
  const pk = psql(`select coalesce(bowl_key,'-') from cfb_runs where id = ${id}`);
  ok('a playoff team cannot carry a bowl', pk === '-', pk);

  /* Anything that is not a slug is refused with a sentence, not a constraint name. */
  let msg = '';
  try { submit(8, 30, 'Garland Bowl; drop table'); } catch (e) { msg = String(e.stderr || e.message); }
  ok('an illegal slug is refused', /bowl key is not a slug/.test(msg), msg.split('\n')[0].slice(0, 80));

  /* A client that has not been updated still records, it just says less. */
  const c = submit(8, 30, null);
  ok('a client sending no slug still records the tier', c.bowl === 'bowl' && c.bowlKey === null,
    c.bowl + ' / ' + c.bowlKey);
}

console.log('\n=== every bowl the game can draw survives the round trip ===');
{
  /* The slug is written by selectBowl() and read by bowlName(). If either side
     drifts the leaderboard silently falls back to "Bowl champions", which looks
     like nothing being wrong. */
  let n = 0; const broken = [];
  for (const tier of Object.keys(E.BOWLS)) {
    for (const b of E.BOWLS[tier]) {
      n++;
      const key = E.bowlKey(b.name);
      if (!/^[a-z0-9_]{1,40}$/.test(key)) broken.push(b.name + ' -> illegal slug ' + key);
      else if (E.bowlName(key) !== b.name) broken.push(b.name + ' -> ' + E.bowlName(key));
    }
  }
  ok('every bowl name survives key and back', broken.length === 0,
    n + ' bowls' + (broken.length ? ': ' + broken.slice(0, 4).join(', ') : ''));
  ok('the house bowl too', E.bowlName('runthegg') === 'RunThe.GG Bowl', E.bowlName('runthegg'));
  /* An unknown slug must resolve to nothing rather than to text of its own,
     because that is what keeps a crafted client off the board. */
  ok('an unknown slug resolves to nothing', E.bowlName('anything_at_all') === null);
  ok('and the database accepts it as shape-legal but inert',
    submit(8, 30, 'anything_at_all').bowlKey === 'anything_at_all');
}

/* ── the browser half ────────────────────────────────────────────────────────
   Needs the static server and the PostgREST stand-in:

     (nohup python3 -m http.server 8080 &)
     (nohup node cfb/build/test/postgrest_stub.mjs 5555 <db> &)

   Skipped, loudly, when they are not there: this file is still worth running for
   the database half alone. */
const UID = '11111111-1111-1111-1111-111111111111';
const NAME = 'coachprime';
const up = await fetch('http://localhost:8080/cfb/index.html').then((r) => r.ok).catch(() => false);
if (!up) {
  console.log('\n=== the browser half: SKIPPED, no server on 8080 ===');
} else {
  const { chromium } = await import('playwright');
  const SS = '/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/';
  psql('truncate cfb_runs');

  /* Three seasons, chosen so the tier is unambiguous under the ranking rule:
     15th is a New Year's Six, 22nd and 30th are majors. The third carries NO
     slug, standing in for every row written before the migration. */
  let n = 500;
  const P = () => "'{" + Array.from({ length: 6 }, () => `${n++}:2019`).join(',') + "}'::text[]";
  /* SET IN THE SAME SESSION AS THE INSERT. The stub's auth.uid() reads a session
     setting, and cfb_submit_run() stamps the owner from it, so a separate
     statement would leave these unowned. Unowned rows are guest rows: the case
     reads mine(), which filters on the signed-in user, and the whole thing would
     come back empty while every assertion about the leaderboard still passed. */
  const seed = (wins, rank, won, key) => psql(
    `set test.uid = '${UID}';
     select cfb_submit_run(${wins}, ${rank}, 0, ${won}, 7.0, 2.0, 10.2, 0, 0, null, ${P()},
      null, null, null, null, null, null, 88.0, null, 'free', ${key ? `'${key}'` : 'null'})`);
  seed(11, 15, 'true', 'garland_bowl');
  seed(9, 22, 'false', 'neon_bowl');
  seed(8, 30, 'true', null);

  const stub = `
window.__authListeners = [];
window.supabase = { createClient() { return {
  auth: {
    onAuthStateChange(f) { window.__authListeners.push(f); return { data: {} }; },
    getSession: () => Promise.resolve({ data: { session: {
      access_token: '${UID}', user: { id: '${UID}', email: 'coach@example.com' } } } }),
    signOut: () => Promise.resolve({}),
  },
  from() { return { select() { return { eq() { return {
    maybeSingle: () => Promise.resolve({ data: { username: '${NAME}' } }),
  }; } }; } }; },
  rpc: () => Promise.resolve({ data: null, error: null }),
}; } };
window.PS_CFB_BOARD_URL = 'http://localhost:5555';`;

  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(stub);
  await p.goto('http://localhost:8080/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForSelector('#s-intro.on', { timeout: 20000 });
  await p.waitForTimeout(1800);

  console.log('\n=== board.js actually sends the slug ===');
  /* THE SEAM THAT BREAKS QUIETLY. Everything above seeds rows with psql, which
     proves the database but skips board.js entirely. The stand-in passes RPC
     arguments POSITIONALLY, so a parameter added to cfb_submit_run() has to be
     added there too, and a missing one silently takes its default: that is
     exactly how a conference run once recorded itself as free play. This drives
     the real submit() and then reads what landed. */
  const sent = await p.evaluate(() => window.PS_CFB_BOARD.submit({
    regularWins: 10, nationalRank: 16, playoffWins: 0, bowlWon: true,
    pointDiff: 9.5, chemistryPct: 2.2, spendMusd: 10.5, respins: 0,
    sigWins: 0, bestWinRank: null,
    picks: ['901:2019', '902:2014', '903:2021', '904:2011', '905:2016', '906:2008'],
    slots: ['QB', 'RB', 'WR', 'WR', 'FLEX', 'FLEX'],
    squadFppg: 80, structureMult: 1.02, teamRating: 84, overall: 90.5,
    perfectPct: null, runMode: 'free', bowlKey: 'mesa_bowl',
  }));
  ok('the submit returned a row id', typeof sent === 'number', String(sent));
  const landed = psql(`select coalesce(bowl_key,'-') from cfb_runs where id = ${Number(sent)}`);
  ok('and the slug survived board.js and the RPC', landed === 'mesa_bowl', landed);

  console.log('\n=== the leaderboard says which bowl ===');
  await p.click('#b-lb-intro');
  await p.waitForTimeout(3000);
  /* PODIUM AND LIST TOGETHER. The top three are now steps above the list rather than
     the first three rows of it, so counting only #lb-rows counts everything except the
     seasons this suite most wants to read. Both carry the fate, which is the text under
     test here. */
  const rows = await p.$$eval('#lb-podium .pod, #lb-rows .lbr', (els) => els.map((e) => e.textContent));
  /* At least four: the three seeded above plus the one board.js just submitted. More if
     this database has been used before, which it is allowed to have been. */
  ok('the board lists every season', rows.length >= 4, rows.length + '');
  ok('a named win says which bowl', rows.some((r) => /Garland Bowl champions/.test(r)),
    rows.join(' | ').slice(0, 110));
  ok('including the one board.js sent', rows.some((r) => /Mesa Bowl champions/.test(r)));
  ok('a named loss says which bowl too', rows.some((r) => /Lost the Neon Bowl/.test(r)));
  /* The fallback is the point of keeping both wordings: a row from before the
     migration cannot be given a bowl it never recorded, and must not look broken. */
  ok('a row with no slug keeps the wording it always had',
    rows.some((r) => /Bowl champions/.test(r) && !/Garland/.test(r)));
  await p.screenshot({ path: SS + 'bowl_board.png' });

  console.log('\n=== and the named-bowl badges are reachable signed in ===');
  /* THIS IS THE HALF THAT WAS BROKEN. A signed-in player's trophy case is rebuilt
     from board rows, and board rows carried no slug, so the six New Year's Six
     badges, the sweep and both house-bowl badges could never fire for anybody
     with an account. A guest playing the same seasons earned them from local
     history, which is what made it invisible. */
  await p.evaluate(() => { const x = document.getElementById('lb-x'); if (x) x.click(); });
  await p.waitForTimeout(700);
  /* THE PROFILE IS A HUB AND FIVE PAGES NOW, not one sheet with a tab strip. The
     route a player takes is the avatar, then the Trophy case row on the hub, and
     that is what this drives. Not openProfile('case') from evaluate(): the whole
     game is inside an IIFE, so none of its functions are reachable from the page
     context and a test that reaches for one gets a ReferenceError rather than a
     failed assertion. */
  await p.click('#b-profile'); await p.waitForTimeout(900);
  await p.click('#pf-go-case'); await p.waitForTimeout(3000);
  const caseText = (await p.textContent('#sheet-in')).replace(/\s+/g, ' ');
  const tally = (caseText.match(/Achievements (\d+) of (\d+)/) || [])[1];
  ok('the case is built from the board', Number(tally) > 0,
    (caseText.match(/Achievements \d+ of \d+/) || [''])[0]);
  /* EARNED, not merely listed. A locked badge is drawn with the same name and
     description and only an `off` class between them, so matching the name in the
     page text passes whether or not it was ever won, which is the assertion this
     replaced. */
  const earned = await p.$$eval('#sheet-in .ach:not(.off)', (els) =>
    els.map((e) => (e.querySelector('.ach-n') || {}).textContent || ''));
  ok('The Granddaddy is EARNED from a board row', earned.includes('The Granddaddy'),
    earned.slice(0, 6).join(', '));
  ok('and so is the tier badge beside it', earned.includes('New Year\'s kings'),
    earned.length + ' earned');
  ok('nothing logged', errs.length === 0, errs.slice(0, 3).join(' | '));
  await p.screenshot({ path: SS + 'bowl_case.png' });
  await p.close();
  await b.close();
}

console.log(bad ? ('\n' + bad + ' FAILURES') : '\nall clear');
process.exit(bad ? 1 : 0);
