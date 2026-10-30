/* Commish Simulator (College Football's Commissioner Mode), one scene a take, picked with --arg:

     office    the office on the first day: the calendar, the meters, then to the desk
     desk      an item on the desk: read the options, pick one, set its dial, rule, and the room reacts
     press     media days at the lectern: pick an answer and say it
     removed   the end of a term cut short, the presidents' vote
     report    the end of a full term and its report card

   The account is a stand-in Pro account (the page's own test stub, cfb/build/test/commish/shots.mjs),
   so no wait and no sign-in show. Reaching a scene off camera uses the page's test hook
   (PS_CFB_COMMISH_TEST), the way the repo's own checks do; nothing on camera is a tester screen. */
export const page = '/cfb/commish/';
export const seconds = 40;
export const hide = [];
export const init = `window.supabase={createClient(){const session={access_token:'x',user:{id:'00000000-0000-4000-8000-00000000c0ff',email:'c@e.com'}};
  return {auth:{onAuthStateChange(){return{data:{}}},getSession:()=>Promise.resolve({data:{session}}),signOut:()=>Promise.resolve({})},
  from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve({data:{username:'coachcarter'}})}}}}}},
  rpc:(fn)=>Promise.resolve({data:fn==='premium_products'?['cfb_premium','ps_premium']:true,error:null})}}};
  try{localStorage.clear()}catch(e){}`;

const on = (id) => `document.querySelector('${id}.on')`;
const until = (t, id, ms = 15000) => t.until(new Function(`return !!${on(id)}`), ms);
// the opening wire story plays once per term; skip it so every take starts in the office
async function office(page, t) {
  await t.until(() => !!document.querySelector('#g-start') && document.querySelector('#g-start').offsetParent, 20000);
  await t.hold(2600);
  await page.click('#g-start');
  for (let i = 0; i < 6; i++) {
    await t.hold(700);
    if (await page.locator('#s-scene.on').count()) await page.click('#b-scene-skip').catch(() => {});
    if (await page.locator('#s-office.on').count()) break;
  }
  await until(t, '#s-office');
  await t.hold(800);
}
// past any scene to a screen
async function skipTo(page, t, id) {
  for (let i = 0; i < 20 && !(await page.locator(id + '.on').count()); i++) {
    if (await page.locator('#s-scene.on').count()) await page.click('#b-scene-skip').catch(() => {});
    await t.hold(400);
  }
}
// to the room screen with a ruling made, everything off camera
async function ruled(page, t) {
  await page.click('#b-desk');
  await until(t, '#s-desk');
  await t.hold(600);
  await page.locator('#d-options .opt').first().click();
  await t.hold(300);
  await page.click('#b-rule');
  await until(t, '#s-room');
  await t.hold(600);
}

export async function setup(page, t) {
  await office(page, t);
  if (t.arg === 'press') {
    await page.evaluate(() => window.PS_CFB_COMMISH_TEST.jump(3, 0));
    await t.hold(900);
    if (await page.locator('#s-scene.on').count()) await page.click('#b-scene-skip').catch(() => {});
    await until(t, '#s-office');
    await page.click('#b-desk');
    await until(t, '#s-press');
  }
  if (t.arg === 'removed') {
    await ruled(page, t);
    // the two big conferences walk out together: the rule in ledger.js, reached the way a bad term reaches it
    // the room turns: more than half the voting weight goes hostile, so the presidents call a vote
    // (removal() in ledger.js; the SEC stays above 25, so it is the vote and not the coalition)
    await page.evaluate(() => { const w = window.PS_CFB_COMMISH_TEST.world();
      for (const b of Object.keys(w.blocs)) w.blocs[b] = b === 'SEC' ? 31 : 12; });
    await t.hold(300);
  }
  if (t.arg === 'report') {
    await ruled(page, t);
    await page.click('#b-next');
    await until(t, '#s-office');
  }
  await page.evaluate(() => scrollTo(0, 0));
  await t.hold(500);
}

export async function play(page, t) {
  if (t.arg === 'office') {
    await t.hold(2200);
    await t.tap('#b-desk', { before: 500, after: 200 });
    await until(t, '#s-desk');
    await t.hold(1800);
  } else if (t.arg === 'desk') {
    await page.click('#b-desk');
    await until(t, '#s-desk');
    await t.hold(1600);
    await t.tap(page.locator('#d-options .opt').first(), { before: 400, after: 600 });
    const step = page.locator('#d-options .steps button');
    if (await step.count()) await t.tap(step.nth(Math.min(2, (await step.count()) - 1)), { before: 300, after: 600 });
    await t.tap('#b-rule', { before: 300, after: 300 });
    await until(t, '#s-room');
    await t.hold(3800);
  } else if (t.arg === 'press') {
    await t.hold(2400);
    await t.tap(page.locator('#p-answers > *').first(), { before: 300, after: 500 });
    await t.tap('#b-say', { before: 300, after: 300 });
    await t.hold(3200);
  } else if (t.arg === 'removed') {
    await t.hold(800);
    await t.tap('#b-next', { before: 200, after: 200 });
    // the wire files the story first, typed out line by line
    await until(t, '#s-scene');
    await t.hold(5200);
    await page.click('#b-scene-skip').catch(() => {});
    await skipTo(page, t, '#s-year');
    await t.hold(4000);
  } else if (t.arg === 'report') {
    await page.evaluate(() => window.PS_CFB_COMMISH_TEST.ending());
    await skipTo(page, t, '#s-year');
    await t.hold(2500);
    const rep = page.locator('#y-report');
    if (await rep.count()) await rep.scrollIntoViewIfNeeded().catch(() => {});
    await t.hold(3500);
  }
}
