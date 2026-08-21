/* THE ONE GATE IN THE GAME, AND THE SEASON HELD BEHIND IT.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/test_playoff_gate.mjs
 *
 * A guest who makes the College Football Playoff is stopped on the seeding screen and
 * asked for a free account before playing it out. A bowl is not gated and a season that
 * ended in week twelve is not gated: only the playoff, and only when the field has them
 * in it.
 *
 * THE HALF THAT WOULD MAKE THE GATE WORSE THAN NOTHING is the sign-in leaving the page.
 * Google is a full redirect and a new account is an email confirmation, and the run
 * lives in one variable. So the run is written to localStorage when the wall goes up and
 * read back on the next load, which is the difference between "sign in to finish this
 * season" being an offer and being a way to lose one. test_hold_season.mjs pins that the
 * playoffs come out of the round trip identical; this pins that the page does the round
 * trip at all, and refuses the blobs it should refuse.
 *
 * THE HELD SEASON IS BUILT HERE RATHER THAN PLAYED. A drafted season reaches the playoff
 * about one time in seven, so playing one in a browser would be a test that fails six
 * times out of seven for the right reason. The engine builds one, storage is primed with
 * it, and the page is asked to open on it, which is exactly the path a returning player
 * takes anyway.
 */
import { chromium } from 'playwright';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const E = require(ROOT + '/cfb/engine.js');
const R = require(ROOT + '/cfb/run.js');
const rd = (f) => JSON.parse(fs.readFileSync(ROOT + '/cfb/data/cfb_' + f, 'utf8'));
const data = R.indexData(rd('player_seasons.json'), rd('team_seasons.json'));
const LEAGUE = rd('league_context.json').league_avg_pts_allowed_by_season;
const CAL = rd('display_calibration.json');
const CTX = { battery: rd('battery.json'), coaches: rd('coaches.json'), curated: rd('curated.json') };

const SS = '/tmp/claude-0/-home-user-runthe-gg-site/3b48ad95-6870-50f0-afce-ff2b1ab755e2/scratchpad/';
const UID = '11111111-1111-1111-1111-111111111111';
let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

/* ── a season, drafted best-first and played to Selection Sunday ─────────────── */
function seasonTo(seed) {
  const run = R.createRun({ seed });
  for (let i = 0; i < 12 && run.roster.length < E.SLOTS.length; i++) {
    let draw;
    try { draw = R.spin(run, data); } catch (e) { return null; }
    const list = data.playersByTeamSeason[draw.team_season_id] || [];
    const opts = draw.options
      .map((k) => {
        const [id, s] = k.split('|');
        return list.find((p) => String(p.player_id) === id && String(p.season) === s);
      })
      .filter(Boolean).filter((p) => R.slotForPlayer(run, p) !== null);
    if (!opts.length) return null;
    R.sign(run, opts.reduce((b, p) => (p.ppr_ppg_mean > b.ppr_ppg_mean ? p : b)));
  }
  if (run.roster.length !== E.SLOTS.length) return null;
  R.startSeason(run, data, CTX);
  while (run.phase === R.PHASES.SEASON) R.advanceWeek(run, data, LEAGUE, CAL);
  return run;
}
function find(pick) {
  for (let i = 0; i < 600; i++) {
    const run = seasonTo(E.hashSeed('gate|' + i));
    if (run && run.phase === R.PHASES.SEEDING && pick(run)) return run;
  }
  return null;
}
const PLAYOFF = find((r) => r.playoffSeed.made);
const BOWL = find((r) => !r.playoffSeed.made && r.playoffSeed.bowl);
if (!PLAYOFF) { console.log('could not build a playoff season'); process.exit(1); }
console.log('a held season: ' + PLAYOFF.playoffSeed.regularRecord + ', No. '
  + PLAYOFF.playoffSeed.seed + ' seed, ' + PLAYOFF.playoffSeed.rounds + ' to win');

const hold = (run, ageMs) => 'localStorage.setItem("cfb_held_season",'
  + JSON.stringify(JSON.stringify({ v: 1, at: Date.now() - (ageMs || 0), run })) + ');';

/* ── the sign-in library, with a way to sign in halfway through ──────────────── */
/* The one thing the shared stub in test_gates.mjs cannot do: it throws the auth callback
   away, and the whole question here is what the seeding screen does the moment somebody
   signs in while looking at it. */
const stub = (signedIn) => `
window.supabase={createClient(){
  const S={access_token:'${UID}',user:{id:'${UID}',email:'coach@example.com'}};
  let session=${signedIn}?S:null, cb=null;
  window.__signIn=()=>{ session=S; if(cb) cb('SIGNED_IN',session); };
  return {auth:{
    onAuthStateChange(f){cb=f;return{data:{}}},
    getSession:()=>Promise.resolve({data:{session}}),
    signInWithPassword:()=>{window.__signIn();return Promise.resolve({error:null})},
    signUp:()=>Promise.resolve({error:null}),
    signInWithOAuth:()=>Promise.resolve({error:null}),
    signOut:()=>Promise.resolve({})},
    from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve(
      {data:{username:'coachprime'}})}}}}}},
    rpc:()=>Promise.resolve({data:true,error:null})}}};
window.PS_CFB_BOARD_URL='http://localhost:5555';`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const open = async (init) => {
  const p = await b.newPage({ viewport: { width: 600, height: 1100 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(init);
  await p.goto('http://localhost:8080/cfb/index.html', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await p.waitForTimeout(3000);
  return { p, errs };
};
const txt = (p, id) => p.$eval(id, (e) => (e.textContent || '').trim());
const shown = (p, id) => p.$eval(id, (e) => !e.hidden && e.offsetParent !== null);
const held = (p) => p.evaluate(() => localStorage.getItem('cfb_held_season'));

console.log('\n=== a guest comes back to a season that made the playoff ===');
{
  const { p, errs } = await open(stub(false) + hold(PLAYOFF));
  ok('the page opens on the seeding screen, not the intro', !!(await p.$('#s-seed.on')));
  ok('with the record it was left at', (await txt(p, '#sd-rec')) === PLAYOFF.playoffSeed.regularRecord,
    await txt(p, '#sd-rec'));
  /* THE SEED STAYS ON SCREEN. It is the thing being offered, and an ask over a blank
     card is an ask for nothing. */
  ok('the seed they earned is still on the card',
    /No\. \d+ seed/.test(await txt(p, '#sd-badges')), await txt(p, '#sd-badges'));
  ok('and the wall is up', await shown(p, '#sd-gate'));
  ok('it says what an account is for', /free account/.test(await txt(p, '#sd-gate-lead')),
    await txt(p, '#sd-gate-lead'));
  ok('the button asks for one', /Sign in or sign up/.test(await txt(p, '#b-po')),
    await txt(p, '#b-po'));
  /* Simming to the end IS the playoffs, so it cannot be the way around the ask. */
  ok('and simming to the end is not a way past it', !(await shown(p, '#b-po-skip')));
  ok('there is a way to say not now', await shown(p, '#b-po-hold'));
  await p.screenshot({ path: SS + 'playoff_gate.png' });

  await p.click('#b-po'); await p.waitForTimeout(700);
  ok('pressing it opens the sign-in form', !!(await p.$('#ac-email')));

  /* Password sign-in never leaves the page, so nothing else would repaint this. */
  await p.evaluate(() => window.__signIn()); await p.waitForTimeout(900);
  ok('signing in takes the wall down where it stands', !(await shown(p, '#sd-gate')));
  ok('and closes the sheet behind it', !(await p.$('#sheet.on')));
  ok('the button is the kickoff again', /Play the/.test(await txt(p, '#b-po')),
    await txt(p, '#b-po'));
  ok('and the season is still the one they left',
    (await txt(p, '#sd-rec')) === PLAYOFF.playoffSeed.regularRecord);

  await p.click('#b-po'); await p.waitForTimeout(2500);
  ok('and it plays', !(await p.$('#s-seed.on')));
  ok('the held copy is dropped once it is being played', !(await held(p)));
  console.log('  errors:', errs.length ? errs : 'none');
  if (errs.length) bad++;
  await p.close();
}

console.log('\n=== not now ===');
{
  const { p, errs } = await open(stub(false) + hold(PLAYOFF));
  await p.click('#b-po-hold'); await p.waitForTimeout(700);
  ok('it goes home', !!(await p.$('#s-intro.on')));
  ok('and the season is still held', !!(await held(p)));
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3000);
  ok('so the next visit opens on it again', !!(await p.$('#s-seed.on')));
  ok('with the wall still up', await shown(p, '#sd-gate'));
  /* The way out of the loop, and the only one that throws the season away. */
  await p.click('#b-po-hold'); await p.waitForTimeout(600);
  await p.evaluate(() => document.getElementById('b-play-intro').click());
  await p.waitForTimeout(1600);
  ok('starting a new draft is what ends it', !(await held(p)));
  console.log('  errors:', errs.length ? errs : 'none');
  if (errs.length) bad++;
  await p.close();
}

console.log('\n=== a member ===');
{
  const { p, errs } = await open(stub(true) + hold(PLAYOFF));
  ok('opens on the same season', !!(await p.$('#s-seed.on')));
  ok('with no wall', !(await shown(p, '#sd-gate')));
  ok('the kickoff button', /Play the/.test(await txt(p, '#b-po')), await txt(p, '#b-po'));
  ok('and simming to the end is offered', await shown(p, '#b-po-skip'));
  console.log('  errors:', errs.length ? errs : 'none');
  if (errs.length) bad++;
  await p.close();
}

console.log('\n=== accounts are offline ===');
{
  /* No supabase at all, which in the wild is an ad blocker. A wall in front of something
     the browser is refusing to let them do would be an unplayable game, so there is no
     wall: the playoffs are played exactly as they were before any of this. */
  const { p, errs } = await open('window.PS_CFB_BOARD_URL="http://localhost:5555";' + hold(PLAYOFF));
  ok('the season still opens', !!(await p.$('#s-seed.on')));
  ok('and there is no wall', !(await shown(p, '#sd-gate')));
  ok('the playoffs are playable', /Play the/.test(await txt(p, '#b-po')), await txt(p, '#b-po'));
  console.log('  errors:', errs.length ? errs : 'none');
  if (errs.length) bad++;
  await p.close();
}

console.log('\n=== what is NOT held ===');
{
  /* Only a season stopped at the wall. Everything else in storage under that key is
     dropped rather than repaired, because the only thing that can put one there is the
     gate, and anything else is a stale build or a hand-edited blob. */
  const cases = [
    ['a bowl season, which was never gated', BOWL ? hold(BOWL) : null],
    ['a season a fortnight old', hold(PLAYOFF, 15 * 24 * 60 * 60 * 1000)],
    ['a run from a version that has moved on',
      'localStorage.setItem("cfb_held_season",' + JSON.stringify(JSON.stringify(
        { v: 2, at: Date.now(), run: PLAYOFF })) + ');'],
    ['nonsense', 'localStorage.setItem("cfb_held_season","{not json");'],
  ];
  for (const [name, init] of cases) {
    if (!init) { console.log('  skip  ' + name + '   (no bowl season built)'); continue; }
    const { p, errs } = await open(stub(false) + init);
    ok(name + ' opens the intro instead', !!(await p.$('#s-intro.on')));
    if (errs.length) { bad++; console.log('  errors:', errs); }
    await p.close();
  }
}

await b.close();
console.log(bad ? '\nFAILURES: ' + bad : '\nall clear');
process.exit(bad ? 1 : 0);
