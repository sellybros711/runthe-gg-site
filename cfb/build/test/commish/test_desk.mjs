/* THE PREVIEW ON THE DESK CANNOT DISAGREE WITH THE RULING.
 *
 *   (nohup python3 -m http.server 8080 &)
 *   node cfb/build/test/commish/test_desk.mjs
 *
 * The desk now shows what a ruling would leave behind: the four headline numbers recomputed,
 * plus every other ledger field the ruling writes. It is drawn from applyEdit on a world
 * that is thrown away, which is what makes it incapable of lying, and it is exactly that
 * "incapable" that wants a check on it. A preview that quietly diverges from the ruling is
 * the worst thing this mode could ship: the player chooses on the strength of it.
 *
 * So this rules for real, on the same seed, and compares the four numbers the desk promised
 * against the four the office ends up with.
 *
 * It also checks the reading. The screen was a hundred and ten words of prose before the
 * first decision, and the three things that fixed it all have the same failure mode: they
 * fold something away and forget to give it back. The setup clamps to three lines and has to
 * open. An option's paragraph is one line and has to open when it is the one being
 * considered. Neither can be a trapdoor.
 */
import { chromium } from 'playwright';
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
/* `import.meta.dirname` rather than `new URL(...)`: this file declares its own `const URL`
   for the page under test, which shadows the global constructor and puts it in the temporal
   dead zone above that line. */
const ROOT = path.resolve(import.meta.dirname, '../../../..');
/* HOW BIG THE DOCKET IS, read rather than assumed, so a walk budget cannot silently become
   too small the next time somebody adds thirty items. */
const DOCKET_ITEMS = require(ROOT + '/cfb/commish/docket.js').ITEMS.length;
const URL = 'http://localhost:8080/cfb/commish/index.html';
const UID = '11111111-1111-1111-1111-111111111111';
const TESTER = 'commish-test-account';

const stub = `
window.supabase={createClient(){
  const session={access_token:'x',user:{id:'${UID}',email:'c@e.com'}};
  return {auth:{onAuthStateChange(){return{data:{}}},
    getSession:()=>Promise.resolve({data:{session}}),
    signOut:()=>Promise.resolve({})},
    from(){return{select(){return{eq(){return{maybeSingle:()=>Promise.resolve(
      {data:{username:'${TESTER}'}})}}}}}},
    rpc:()=>Promise.resolve({data:true,error:null})}}};`;
const arm = `
(function(){ var v;
  Object.defineProperty(window,'PS_CFB_COMMISH_ACCESS',{configurable:true,
    get:function(){ return v; },
    set:function(a){ v=a; try{ a.TESTERS.push(${JSON.stringify(TESTER)}); }catch(e){} }});
})();`;


/* THE SIMULATION SITS BETWEEN THE OFFICE AND THE DESK NOW. Pressing on walks the days of the
   beat before anything lands, which is the point of it and which every walker in these tests
   would otherwise sit through or, worse, time out on. Tapping it skips to the end. */
async function skipSim(pg) {
  for (let i = 0; i < 60; i++) {
    const up = await pg.$eval('#off-monthcard', (e) => e.classList.contains('running')).catch(() => false);
    if (!up) return;
    await pg.click('#off-monthcard', { timeout: 1500 }).catch(() => {});
    await pg.waitForTimeout(110);
  }
}

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript(arm + stub);
await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
await p.waitForTimeout(2400);
await p.click('#g-start').catch(() => {});
await p.waitForTimeout(900);

const on = (id) => p.$eval('#' + id, (e) => e.classList.contains('on')).catch(() => false);
const tap = async (s) => { try { await p.click(s, { timeout: 2000 }); return true; } catch (e) { return false; } };
/* The four headline numbers as the page draws them, wherever they are drawn. */
const facts = (sel) => p.$$eval(sel + ' .fact b', (e) => e.map((x) => x.textContent.trim()));

/* Walk to a desk. */
for (let i = 0; i < 12; i++) {
  if (await on('s-desk')) break;
  if (await on('s-office')) { await tap('#b-desk'); await skipSim(p); await p.waitForTimeout(400); continue; }
  if (await on('s-room')) { await tap('#b-next'); await p.waitForTimeout(500); continue; }
  if (await on('s-year')) { await tap('#b-year-next'); await p.waitForTimeout(500); continue; }
  break;
}

console.log('\n=== the desk is shorter than it was ===');
{
  ok('an item is on the desk', await on('s-desk'));

  /* THE SETUP IS FOLDED, NOT GONE, and the check for that cannot depend on which item the
     seed happened to deal. Plenty of briefs are three lines and are correctly left whole, so
     asserting on whichever one turned up first would pass without opening anything. This
     rules through beats until a clamped one appears and tests THAT.

     The two states are one invariant: the class is on exactly when the button is there. A
     clamp with no way past it is text nobody can read, and a button over a whole paragraph
     promises something that is not behind it. */
  let opened = null, looked = 0;
  for (let i = 0; i < 14 && opened === null; i++) {
    if (await on('s-office')) { await tap('#b-desk'); await skipSim(p); await p.waitForTimeout(380); continue; }
    if (await on('s-room')) { await tap('#b-next'); await p.waitForTimeout(450); continue; }
    if (await on('s-year')) { await tap('#b-year-next'); await p.waitForTimeout(450); continue; }
    if (!(await on('s-desk'))) break;
    looked++;
    const clamped = await p.$eval('#d-brief', (e) => e.classList.contains('clamp'));
    const more = await p.$('#d-brief button');
    if (clamped !== !!more) { opened = { agree: false }; break; }
    if (more) {
      const before = await p.$eval('#d-brief p', (e) => e.clientHeight);
      await more.click(); await p.waitForTimeout(250);
      opened = { agree: true,
        before, after: await p.$eval('#d-brief p', (e) => e.clientHeight),
        gone: !(await p.$('#d-brief button')) };
      break;
    }
    /* Short brief, nothing folded. Rule on anything and look at the next item. */
    const o = await p.$('#d-options .opt'); if (o) { await o.click(); await p.waitForTimeout(250); }
    if (!(await tap('#b-rule'))) break;
    await p.waitForTimeout(700);
  }
  ok('a setup long enough to be folded turns up', !!opened && opened.agree !== false,
    opened ? 'after ' + looked + ' items' : 'none in ' + looked + ' items');
  if (opened && opened.agree) {
    ok('  and opening it really shows more', opened.after > opened.before,
      opened.before + 'px to ' + opened.after + 'px');
    ok('  with nothing left to press', opened.gone);
  }
  /* Back to a desk for the rest of this block, wherever ruling left us. */
  for (let i = 0; i < 8 && !(await on('s-desk')); i++) {
    if (await on('s-office')) { await tap('#b-desk'); await skipSim(p); await p.waitForTimeout(380); continue; }
    if (await on('s-room')) { await tap('#b-next'); await p.waitForTimeout(450); continue; }
    if (await on('s-year')) { await tap('#b-year-next'); await p.waitForTimeout(450); continue; }
    break;
  }
  ok('  and there is still an item on the desk after all that', await on('s-desk'));

  /* THREE LINES A SPEAKER, NOT FOUR, and that budget was two until the room got people in
     it. Worth writing down rather than quietly editing, because the number moved for a
     reason and the reason is not "the check was annoying".

     The original rule was one line per speaker of chrome and one of quote: the header row
     above each quote was a third of the room's height and said what the chip beside it
     already says. That held while the name was an institution. "The SEC" is seven
     characters and disappears into the front of a sentence.

     A PERSON'S ROLE IS NOT SEVEN CHARACTERS. "a school president" is eighteen, "an
     assistant at Alabama" twenty-one, and the room went from nine institutions taking turns
     at a microphone to people saying things, which is most of what makes the writing worth
     reading. Measured properly, 127 of 273 lines needed a third row. The two ways to get
     back under two lines were cutting every quote to sixty-nine characters, which is the
     shape of a caption rather than of somebody talking, or giving the box the row. The row
     costs about forty pixels on a desk with whitespace to spare.

     FOUR IS STILL THE CLIFF and this still guards it, because four is where a quote stops
     being a remark and the room stops being scannable. Nothing in the docket reaches it
     today: every one of the 273 measures at either two rows or three. */
  const voices = await p.$$eval('#d-voices .voice', (e) => e.map((v) => ({
    lines: Math.round(v.clientHeight / 20), chip: !!v.querySelector('.chip'),
  })));
  ok('the room argues in three lines a speaker, not four',
    voices.length > 0 && voices.every((v) => v.lines <= 3),
    voices.map((v) => v.lines).join(', ') + ' lines');

  /* AND SO DOES EVERY OTHER VOICE IN THE DOCKET, not merely the three this walk happened to
     land on. Two hundred and seventy-three lines are written and a walk sees three of them,
     so a line that wraps can sit there for weeks and then fail somebody else's afternoon at
     random. Every one of them is drawn into the real container at phone width and measured.

     THIS REPLACES A CHARACTER COUNT THAT COULD NOT HAVE CAUGHT IT. test_docket used to assert
     the quote was under eighty-five characters, which missed two things. The desk renders the
     SPEAKER'S NAME in the same flow, so the line that overflowed was eighty-three characters
     of quote behind a twelve character name. And length is the wrong unit anyway: the name is
     bold and the font is proportional, so one name plus eighty-one characters fits in two
     lines while a shorter name plus eighty-three does not, at the same ninety-five. Only the
     browser knows, so ask the browser.

     AND IT MEASURES EVERY NAME THE VOICE COULD DRAW, not one of them, which is the part this
     guard got wrong and went on passing about. When the room stopped saying "The SEC" and
     started saying "an SEC AD", this block carried on rendering the bloc name: seven
     characters where the page draws twenty-two, so it reported all 273 fitting while the
     live desk in the assertion above it wrapped to three lines at random. The name a voice
     gets depends on a hash of the item id AND on whether the item carries a school, so the
     only safe reading is the worst of everything speaker() can return for that bloc.

     IT ALSO CLONES A REAL VOICE ROW rather than building one out of a string. The row carries
     a color chip that takes width, and a hand-built copy leaves it out and under-measures
     every line in the docket by the width of the chip and its gap. */
  const wide = await p.evaluate(() => {
    const D = window.PS_CFB_DOCKET, B = window.PS_CFB_BLOCS;
    const box = document.getElementById('d-voices');
    if (!D || !B || !box) return { err: 'a module or the container is missing' };
    const proto = box.querySelector('.voice');
    if (!proto) return { err: 'nothing is on the desk to copy' };
    const held = box.innerHTML;

    /* EVERY NAME A BLOC CAN SPEAK UNDER. The plain roles, plus the with-a-school forms built
       against real school names, since speaker() refuses a built name over its own cap and a
       made-up long one would test a string the page can never draw. */
    const SCHOOLS = ['Alabama', 'Northwestern', 'Washington State', 'Mississippi State',
      'Southern California', 'UTEP'];
    const namesFor = (id) => {
      const out = [].concat((B.SPEAKERS && B.SPEAKERS[id]) || []);
      const at = (B.AT_SCHOOL && B.AT_SCHOOL[id]) || [];
      at.forEach((pre) => SCHOOLS.forEach((s) => {
        /* The same cap speaker() applies, so this measures what could be drawn. */
        if ((pre + s).length <= 26) out.push(pre + s);
      }));
      if (!out.length) out.push(B.BY_ID[id] ? B.BY_ID[id].name : id);
      return out;
    };

    box.innerHTML = '';
    const node = proto.cloneNode(true);
    box.appendChild(node);
    const vs = node.querySelector('.vs');
    if (!vs) { box.innerHTML = held; return { err: 'the voice row has no text span' }; }

    const out = [], tall = [];
    let seen = 0, names = 0;
    D.ITEMS.forEach((it) => {
      (it.voices || []).forEach((v) => {
        /* EVERY VARIANT, not just the default one. A quote that changes with what is on the
           desk declares its alternatives as a map precisely so this loop can reach them: a
           variant nothing measures is a wrapped line waiting to happen. */
        D.voiceSays(v).forEach((raw) => {
          const say = raw.replace(/[&<>]/g, '');
          let worst = 0, worstName = '';
          namesFor(v.id).forEach((nm) => {
            vs.innerHTML = '<b>' + nm.replace(/[&<>]/g, '') + '</b>' + say;
            names++;
            if (node.clientHeight > worst) { worst = node.clientHeight; worstName = nm; }
          });
          /* Three rows is 63px at this line height, four is 83. The bar is between them. */
          if (worst > 70) out.push(it.id + '/' + v.id + ' "' + worstName + '" ' + worst + 'px');
          tall.push(worst);
          seen++;
        });
      });
    });
    box.innerHTML = held;
    return { out, seen, names, three: tall.filter((h) => h > 46).length };
  });
  ok('  and so does every other line in the docket, under every name it could carry',
    !wide.err && !wide.out.length,
    wide.err || wide.out.slice(0, 4).join(' | ')
      || 'all ' + wide.seen + ' fit, measured under ' + wide.names + ' names');
  /* REPORTED, NOT ASSERTED. How many lines need the third row is a fact about the writing
     rather than a fault in it, and it is the number that says whether the budget is still
     the right budget: if it ever reads 273 of 273 the third row has stopped being headroom
     and become the layout, and the room should be designed for three from the start. */
  ok('  and the third row is headroom rather than the norm',
    !wide.err && wide.three < wide.seen,
    wide.err || wide.three + ' of ' + wide.seen + ' need a third row');
  ok('  and every quote still names who said it',
    voices.every((v) => v.chip)
    && (await p.$$eval('#d-voices .voice b', (e) => e.length)) === voices.length);

  /* THE CHIP ROW IS THE COMPARISON and it only works on one line. */
  const rows = await p.$$eval('#d-options .sig', (e) => e.map((s) => {
    const t = s.getBoundingClientRect().top;
    return s.querySelectorAll('i').length && [...s.querySelectorAll('i')]
      .every((i) => Math.abs(i.getBoundingClientRect().top - t) < 6);
  }));
  ok('every option signature fits on one row', rows.length > 0 && rows.every(Boolean),
    rows.length + ' options');
  ok('  and each chip still says the whole phrase somewhere',
    (await p.$$eval('#d-options .sig i', (e) => e.every((i) => (i.title || '').length > 4))));
}

console.log('\n=== the preview is the ruling ===');
{
  const opts = await p.$$('#d-options .opt');
  ok('there is more than one way to rule', opts.length >= 2, opts.length + ' options');

  /* NOTHING IS SHOWN BEFORE A CHOICE IS MADE, because there is nothing to show: the panel
     is about a ruling and there is not one yet. */
  ok('nothing is previewed until something is picked',
    (await p.$eval('#d-effect', (e) => e.textContent.trim())) === '');

  await opts[opts.length - 1].click();
  await p.waitForTimeout(400);
  ok('picking an option opens its reasoning',
    (await p.$eval('#d-options .opt.on .why', (e) => getComputedStyle(e).webkitLineClamp)) !== '1');
  ok('  and the two you did not pick stay a line',
    (await p.$$eval('#d-options .opt:not(.on) .why',
      (e) => e.every((x) => getComputedStyle(x).webkitLineClamp === '1'))));

  const shown = await p.$eval('#d-effect', (e) => e.textContent.length > 0);
  ok('  and says what the ruling would do', shown);
}

console.log('\n=== reading an option is not choosing it, and the note survives either ===');
{
  /* THE CARD DID TWO THINGS AND SAID NEITHER, and a player found all of it in one sitting:
     tapping a card to read the rest of its paragraph cast the ruling, choosing a card wiped
     two paragraphs they had typed into the box below, and the box's own heading said "or rule
     in your own words" while b-rule's first line is `if(!choice) return`. Four separate ways
     for the screen to do something other than what it said. */
  const state = () => p.evaluate(() => ({
    /* `more` MEANS THERE IS ONE TO PRESS, not that the node exists. The button is emitted for
       every option and hidden on the ones whose paragraph is already whole, so `!!node` picked
       a hidden control and the click sat there for thirty seconds. */
    opts: [...document.querySelectorAll('#d-options .opt')].map((o) => {
      const m = o.querySelector('.omore');
      return {
        on: o.classList.contains('on'),
        open: getComputedStyle(o.querySelector('.why')).webkitLineClamp !== '1',
        more: !!m && !m.hidden && m.offsetParent !== null,
        pick: !!o.querySelector('.opick'),
      };
    }),
    rule: document.getElementById('b-rule').disabled,
    test: { hidden: document.getElementById('b-test').hidden,
      txt: document.getElementById('b-test').textContent.trim(),
      dis: document.getElementById('b-test').disabled },
  }));

  /* A FRESH DESK. The block above left an option selected. */
  for (let i = 0; i < 8 && !(await on('s-desk')); i++) {
    if (await on('s-office')) { await tap('#b-desk'); await skipSim(p); await p.waitForTimeout(380); continue; }
    if (await on('s-room')) { await tap('#b-next'); await p.waitForTimeout(450); continue; }
    if (await on('s-year')) { await tap('#b-year-next'); await p.waitForTimeout(450); continue; }
    break;
  }
  /* ANY option, not the first one: the block above selected the LAST, so checking only
     `.opt:first-child` reported a clean desk and every assertion below ran against a desk
     that already had a ruling on it. */
  for (let i = 0; i < 6; i++) {
    if (!(await on('s-desk'))) {
      if (await on('s-office')) { await tap('#b-desk'); await skipSim(p); await p.waitForTimeout(400); continue; }
      if (await on('s-room')) { await tap('#b-next'); await p.waitForTimeout(450); continue; }
      if (await on('s-year')) { await tap('#b-year-next'); await p.waitForTimeout(450); continue; }
      break;
    }
    const dirty = await p.$$eval('#d-options .opt', (e) => e.some((x) => x.classList.contains('on')));
    if (!dirty) break;
    await tap('#b-rule'); await p.waitForTimeout(750);
  }

  const a = await state();
  ok('every option offers both actions by name',
    a.opts.length >= 2 && a.opts.every((o) => o.pick), a.opts.length + ' options');
  ok('  and none of them is chosen on arrival', a.opts.every((o) => !o.on));
  ok('  so there is nothing to rule on yet', a.rule === true);
  /* WORDS ALONE CANNOT RULE and the button used to say they could. */
  ok('  and nothing to test either', a.test.hidden || a.test.dis === true,
    a.test.hidden ? 'not a tester' : a.test.txt);

  /* READ MORE OPENS AND DOES NOT CHOOSE. This is the whole complaint. */
  const which = a.opts.findIndex((o) => o.more);
  if (which >= 0) {
    await p.click('#d-options .opt:nth-child(' + (which + 1) + ') .omore');
    await p.waitForTimeout(300);
    const b2 = await state();
    ok('reading an option opens it', b2.opts[which].open);
    ok('  without choosing it', b2.opts.every((o) => !o.on) && b2.rule === true);
    await p.click('#d-options .opt:nth-child(' + (which + 1) + ') .omore');
    await p.waitForTimeout(300);
    ok('  and folds back up', !(await state()).opts[which].open);
  } else {
    ok('reading an option opens it', false, 'no option had anything folded away');
  }

  /* THE NOTE SURVIVES BEING GIVEN A RULING TO RIDE WITH. It used to be deleted. */
  const NOTE = 'The bowl is named for a ballclub and has no tie to that city at all.';
  const box = await p.$('#d-text');
  if (box) {
    await p.fill('#d-text', NOTE);
    await p.waitForTimeout(200);
    ok('typing a note does not rule by itself', (await state()).rule === true);
    await p.click('#d-options .opt:last-child .opick');
    await p.waitForTimeout(400);
    const after = await state();
    ok('choosing a ruling keeps what you wrote',
      (await p.$eval('#d-text', (e) => e.value)) === NOTE);
    ok('  and marks that option as the ruling', after.opts[after.opts.length - 1].on);
    ok('  and lets you rule', after.rule === false);
    /* THE BUTTON NAMES WHICH OF THE TWO THINGS IT IS ABOUT TO FORECAST. */
    ok('  with the test button saying what it will test',
      /selected ruling/i.test(after.test.txt), after.test.txt);
    await tap('#b-test');
    await p.waitForTimeout(900);
    const fc = await p.evaluate(() => ({
      title: document.getElementById('r-title').textContent,
      hidden: document.getElementById('r-note').hidden,
    }));
    ok('  and the forecast names the ruling it forecast', /^If you ruled: /.test(fc.title), fc.title);
    ok('  and says the note is not what the room answered', fc.hidden === false);
    await tap('#b-next');
    await p.waitForTimeout(500);
  } else {
    ok('typing a note does not rule by itself', false, 'no writing box on this desk');
  }
}

console.log('\n=== what the desk promised is what the office got ===');
{
  /* THE ASSERTION THIS FILE EXISTS FOR, AND IT MUST NOT SKIP ITSELF. Plenty of rulings move
     none of the four headline numbers, and the first item drawn was one of them: every check
     below passed by having nothing to check, which is the same as not running. So this rules
     through beats until it finds an option that genuinely moves a tile, and says at the end
     how long that took, so a run where it never found one reads as a failure rather than as
     a pass. */
  /* AND THE BUDGET IS SIZED AGAINST THE DOCKET, not against the docket as it was. Thirty
     turns reached about ten items, which was most of a twenty-four item docket and is a fifth
     of a fifty-five item one, so this started failing outright on a sport that had simply got
     bigger. Scaled off ITEMS so it cannot rot the same way twice. */
  let promised = null, dialMoved = null, beats = 0;
  const budget = Math.max(30, DOCKET_ITEMS * 2);
  for (let i = 0; i < budget && !promised; i++) {
    if (await on('s-office')) { await tap('#b-desk'); await skipSim(p); await p.waitForTimeout(380); continue; }
    if (await on('s-room')) { await tap('#b-next'); await p.waitForTimeout(450); continue; }
    if (await on('s-year')) { await tap('#b-year-next'); await p.waitForTimeout(450); continue; }
    if (!(await on('s-desk'))) break;
    beats++;
    const n = (await p.$$('#d-options .opt')).length;
    for (let k = 0; k < n; k++) {
      /* RE-QUERIED EVERY TIME, because choosing an option repaints all three of them and a
         handle taken before the repaint points at a button that is no longer in the page. */
      await (await p.$$('#d-options .opt'))[k].click();
      await p.waitForTimeout(300);

      /* THE DIAL MOVES THE PREVIEW. A control whose effect you cannot see until two screens
         later is a control nobody uses. Checked on the first dial this walk finds. */
      if (dialMoved === null) {
        const steps = await p.$$('#d-dials .steps button:not([disabled])');
        if (steps.length > 1) {
          const was = await p.$eval('#d-effect', (e) => e.textContent);
          await steps[steps.length - 1].click();
          await p.waitForTimeout(300);
          dialMoved = was !== (await p.$eval('#d-effect', (e) => e.textContent));
        }
      }
      const f = await facts('#d-effect');
      if (f.length) { promised = f; break; }
    }
    if (promised) break;
    if (!(await tap('#b-rule'))) break;
    await p.waitForTimeout(700);
  }

  ok('a ruling that moves the headline numbers turns up', !!promised,
    promised ? 'after ' + beats + ' beats: ' + promised.join(' / ') : 'none in ' + beats + ' beats');
  ok('  and the dial moved the preview when there was one to move',
    dialMoved !== false, dialMoved === null ? 'no dial appeared on this walk' : 'yes');

  if (promised) {
    await tap('#b-rule');
    await p.waitForTimeout(900);
    ok('  the ruling lands on the reaction screen', await on('s-room'));
    await tap('#b-next');
    await p.waitForTimeout(900);
    /* Carrying on can roll into a year in review; either screen draws the same four facts. */
    const where = (await on('s-office')) ? '#off-sport' : (await on('s-year')) ? '#y-sport' : null;
    ok('  and the sport is on screen afterwards', !!where, where || 'neither screen');
    if (where) {
      const real = await facts(where);
      ok('  the four numbers are what the desk promised',
        JSON.stringify(promised) === JSON.stringify(real),
        'promised ' + promised.join(' / ') + '   got ' + real.join(' / '));
    }
  }
}

ok('no page errors', !errs.length, errs.join(' | ') || 'none');
await p.close();

console.log('\n=== the forecast is only as good as your council ===');
{
  /* THE PREVIEW WITHHOLDS, AND WITHHOLDING IS EASY TO DO BADLY. Three ways to leak the six
     blocs a small council cannot read, none of which throws:

       the quote          the line a bloc says is generated from its own delta
       the move bar       its width IS the delta
       the standing meter standing is the vote-weighted average of the room, and every bloc
                          that holds a vote is dark at a small council, so one number hands
                          back the exact aggregate of everything being hidden

     The last one shipped for about an hour and was invisible: six padlocks and, above them,
     "your standing, minus 7.9".

     `?rulings=N` is the tester switch that makes this checkable without playing two terms. */
  const look = async (rulings) => {
    const q = await b.newPage({ viewport: { width: 390, height: 900 } });
    const e2 = []; q.on('pageerror', (x) => e2.push(x.message));
    await q.addInitScript(arm + stub);
    await q.goto(URL + '?rulings=' + rulings, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await q.waitForTimeout(2400);
    await q.click('#g-start').catch(() => {});
    await q.waitForTimeout(900);
    const at = (id) => q.$eval('#' + id, (x) => x.classList.contains('on')).catch(() => false);
    for (let i = 0; i < 10 && !(await at('s-desk')); i++) {
      if (await at('s-office')) { await q.click('#b-desk', { timeout: 2000 }).catch(() => {}); await skipSim(q); await q.waitForTimeout(380); continue; }
      if (await at('s-room')) { await q.click('#b-next', { timeout: 2000 }).catch(() => {}); await q.waitForTimeout(450); continue; }
      break;
    }
    const o = await q.$('#d-options .opt'); if (o) { await o.click(); await q.waitForTimeout(300); }
    const note = await q.$eval('#d-council', (x) => x.textContent.trim()).catch(() => '');
    await q.click('#b-test', { timeout: 2000 }).catch(() => {});
    await q.waitForTimeout(900);
    const rows = await q.$$eval('#r-room .bl', (els) => els.map((x) => ({
      who: x.querySelector('.nm').textContent,
      dark: x.classList.contains('blind'),
      say: !!x.querySelector('.say'),
      bar: !!x.querySelector('.mv'),
      delta: (x.querySelector('.dl') || {}).textContent || '',
      level: (x.querySelector('.lv') || {}).textContent || '',
    })));
    const standing = await q.$$eval('#r-meters .meter', (els) => {
      const m = els[els.length - 1];
      return { dark: m.classList.contains('blind'), d: (m.querySelector('.d') || {}).textContent || '' };
    });
    await q.close();
    return { rows, standing, note, errs: e2 };
  };

  const nw = await look(0);
  ok('a new commissioner reads three of the nine',
    nw.rows.length === 9 && nw.rows.filter((r) => !r.dark).length === 3,
    nw.rows.filter((r) => !r.dark).map((r) => r.who).join(', '));
  /* THE ROW STAYS. Dropping it would show three rows and let the player think that is the
     room; the padlock is what says there are six more and you are blind to them. */
  ok('  the six they cannot read are still in the room', nw.rows.filter((r) => r.dark).length === 6);
  ok('  and none of them leaks a quote or a move bar',
    nw.rows.filter((r) => r.dark).every((r) => !r.say && !r.bar));
  ok('  nor a number where the read would be',
    nw.rows.filter((r) => r.dark).every((r) => !/[0-9]/.test(r.delta)),
    'deltas: ' + JSON.stringify(nw.rows.filter((r) => r.dark).map((r) => r.delta)));
  /* WHERE THEY STAND IS PUBLIC and the office prints it, so it stays. */
  ok('  but where they stand is still shown, because that is public',
    nw.rows.filter((r) => r.dark).every((r) => /^[0-9]+$/.test(r.level)));
  ok('  and standing is locked, because it IS the room', nw.standing.dark === true
    && !/[0-9]/.test(nw.standing.d), JSON.stringify(nw.standing));
  ok('  with the desk having said so before they pressed it',
    /council/i.test(nw.note) && /3 of 9/.test(nw.note), nw.note.slice(0, 60));

  const old = await look(60);
  ok('a commissioner of sixty rulings reads the whole room',
    old.rows.length === 9 && old.rows.every((r) => !r.dark));
  ok('  and gets their standing back', old.standing.dark === false
    && /[0-9]/.test(old.standing.d), JSON.stringify(old.standing));

  ok('no page errors in either', !nw.errs.length && !old.errs.length,
    nw.errs.concat(old.errs).join(' | ') || 'none');
}

console.log('\n=== what every other commissioner did ===');
{
  /* THE SPLIT IS THE ONE THING ON THE REACTION SCREEN THAT COMES FROM OUTSIDE THE GAME, so
     it is the one thing that can be absent, late, or wrong about somebody real. Three
     separate failures worth a check, and only the first is about a number:

       it draws         a percentage, its bars, and the option the player took marked as
                        theirs, off an answer the server gave
       it survives      supabase/95_commish_choices.sql not being applied yet, which is the
                        state the live project is in as this ships: no box, no error, and a
                        reaction screen that is otherwise finished
       it does not vote a forecast on the desk must not record a ruling nobody has made

     PS_CFB_SPLITS.rule is stubbed rather than reaching the network, because a test that
     depends on a live database tests the database. What is being checked here is the page.  */
  const canned = {
    item: 'x', recorded: true, total: 40,
    counts: { A: 25, B: 11, C: 4 },
  };
  const look = async (mode) => {
    const q = await b.newPage({ viewport: { width: 390, height: 900 } });
    const qe = []; q.on('pageerror', (e) => qe.push(e.message));
    await q.addInitScript(arm + stub);
    /* Replace the transport and keep the wording, which is the half worth exercising here.
       The option ids are not known until an item is drawn, so the stub answers with the
       ids it was asked about rather than with fixed ones. */
    await q.addInitScript(`window.__SPLIT_MODE=${JSON.stringify(mode)};
      window.__SPLIT_CALLS=[];
      document.addEventListener('DOMContentLoaded',function(){
        var S=window.PS_CFB_SPLITS; if(!S) return;
        S.rule=function(item,opt){
          window.__SPLIT_CALLS.push(item+'/'+opt);
          if(window.__SPLIT_MODE==='down') return Promise.resolve(null);
          var c={}; c[opt]=11; c[opt+'-x']=25; c[opt+'-y']=4;
          return Promise.resolve({item:item,recorded:true,total:40,counts:c});
        };
      });`);
    await q.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await q.waitForTimeout(2400);
    await q.click('#g-start').catch(() => {});
    await q.waitForTimeout(900);
    const qon = (id) => q.$eval('#' + id, (e) => e.classList.contains('on')).catch(() => false);
    for (let i = 0; i < 14; i++) {
      if (await qon('s-desk')) break;
      if (await qon('s-office')) { await q.click('#b-desk').catch(() => {}); await skipSim(q); await q.waitForTimeout(400); continue; }
      if (await qon('s-room')) { await q.click('#b-next').catch(() => {}); await q.waitForTimeout(500); continue; }
      if (await qon('s-year')) { await q.click('#b-year-next').catch(() => {}); await q.waitForTimeout(500); continue; }
      break;
    }
    const o = await q.$('#d-options .opt');
    if (o) { await o.click(); await q.waitForTimeout(300); }
    /* THE FORECAST FIRST, and it must not have voted. */
    await q.click('#b-test').catch(() => {});
    await q.waitForTimeout(600);
    const afterTest = {
      calls: await q.evaluate(() => window.__SPLIT_CALLS.length),
      shown: await q.$eval('#r-split', (e) => !e.hidden).catch(() => null),
    };
    await q.click('#b-next').catch(() => {});
    await q.waitForTimeout(500);
    const o2 = await q.$('#d-options .opt');
    if (o2) { await o2.click(); await q.waitForTimeout(300); }
    await q.click('#b-rule').catch(() => {});
    await q.waitForTimeout(1200);
    const box = await q.evaluate(() => {
      const e = document.getElementById('r-split');
      if (!e) return { missing: true };
      return {
        hidden: e.hidden,
        pct: (e.querySelector('.pc b') || {}).textContent || '',
        rows: [].slice.call(e.querySelectorAll('.r')).map((r) => ({
          mine: r.classList.contains('mine'),
          pct: (r.querySelector('strong') || {}).textContent || '',
          label: (r.querySelector('em') || {}).textContent || '',
        })),
        n: (e.querySelector('.n') || {}).textContent || '',
      };
    });
    const calls = await q.evaluate(() => window.__SPLIT_CALLS.slice());
    await q.close();
    return { afterTest, box, calls, errs: qe };
  };

  const up = await look('up');
  ok('a forecast does not cast a vote', up.afterTest.calls === 0,
    up.afterTest.calls + ' calls after pressing test');
  ok('  and shows no split, because nothing has been ruled', up.afterTest.shown === false);

  ok('a ruling draws what everybody else did', up.box && !up.box.hidden && !up.box.missing);
  ok('  with your own share in the big number', up.box.pct === '28%', up.box.pct);
  ok('  all three shares below it', up.box.rows.length === 3,
    up.box.rows.map((r) => r.pct).join(' '));
  ok('  exactly one of them marked as yours',
    up.box.rows.filter((r) => r.mine).length === 1,
    JSON.stringify(up.box.rows.find((r) => r.mine) || null));
  /* BIGGEST FIRST, so taking the call nobody took is visible rather than inferred. */
  ok('  biggest first', up.box.rows[0].pct === '63%' && up.box.rows[2].pct === '10%',
    up.box.rows.map((r) => r.pct).join(' > '));
  /* THE ROW IS LABELED WITH THE OPTION AS THE PLAYER READ IT, not with its id. The two
     differ on every item in the docket, and an id on a reaction screen is a leak. */
  ok('  and the row says what the option said, not its id',
    up.box.rows.some((r) => r.mine && r.label.length > 4 && !/^[a-z0-9-]+you$/.test(r.label)),
    JSON.stringify(up.box.rows.find((r) => r.mine).label));
  ok('  with the sample size said out loud', /40 commissioners/.test(up.box.n), up.box.n);
  ok('  and the ruling was recorded once', up.calls.length === 1, up.calls.join(', '));

  /* THE STATE THE LIVE PROJECT IS ACTUALLY IN until somebody runs the migration. */
  const down = await look('down');
  ok('an unreachable backend draws no box at all', down.box.hidden === true);
  ok('  and does not break the reaction screen', !down.errs.length,
    down.errs.join(' | ') || 'none');
  ok('  no page errors with it working either', !up.errs.length, up.errs.join(' | ') || 'none');
}

console.log('\n=== nothing the desk writes reaches the screen as a database key ===');
{
  /* WHAT THIS PANEL DID TO A PLAYER. "What this changes" names every ledger field a ruling
     writes, in words, off a hand-kept table. A field missing from that table falls through to
     the raw path and the raw value, so an item that had never been added printed

       labour.reentry      window      was open
       brand.playoff       phone       was

     under a heading promising plain English. Both were reported as coding glitches, which is
     precisely what they look like, and there was nothing to catch them because the table is a
     list somebody remembers to update.

     So it is checked rather than remembered. Every path the docket can write, and every value
     it can write there, is run through the page's own two functions. A name that still
     contains a dot is a path that reached the screen; a string value that comes back exactly
     as it went in is a code word that did. */
  const pg = await b.newPage({ viewport: { width: 900, height: 900 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.addInitScript(arm + stub);
  await pg.goto(URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await pg.waitForTimeout(2000);

  /* Every (path, value) the docket can write, gathered in node off the real items. Options
     whose edit needs a cast are resolved with none, which is what the docket already tolerates
     everywhere else; anything that throws is simply not collected. */
  const D = require(ROOT + '/cfb/commish/docket.js');
  const pairs = [];
  D.ITEMS.forEach((it) => (it.options || []).forEach((o) => {
    let e = o.edit;
    if (typeof e === 'function') { try { e = e(null, it); } catch (x) { return; } }
    const set = (e && e.set) || {};
    Object.keys(set).forEach((k) => pairs.push([k, set[k]]));
  }));
  const seen = {};
  const uniq = pairs.filter(([k, v]) => {
    const key = k + '|' + JSON.stringify(v);
    if (seen[key]) return false; seen[key] = 1; return true;
  });
  ok('the docket writes something to check', uniq.length > 20, uniq.length + ' path and value pairs');

  const out = await pg.evaluate((rows) => {
    const W = window.PS_CFB_COMMISH_WORDS;
    if (!W || typeof W.pathName !== 'function' || typeof W.pathValue !== 'function') {
      return { missing: true };
    }
    /* THE FOUR HEADLINE TILES ARE NAMED ELSEWHERE and never reach these two functions, so
       checking them here would be checking a code path the panel does not use. The skip list
       comes off the page rather than being copied, or the copy is one more thing to keep in
       step with the original. */
    const skip = W.skip || {};
    return {
      rows: rows.filter(([k]) => !skip[k]).map(([k, v]) => ({ k: k, v: v,
        name: String(W.pathName(k)), word: String(W.pathValue(k, v)) })),
    };
  }, uniq);
  ok('  and the page exposes the two that turn it into words', !out.missing);
  if (!out.missing) {
    /* A NAME WITH A DOT IN IT IS A PATH. No real column heading in this mode has one. */
    const raw = out.rows.filter((r) => r.name.indexOf('.') >= 0 || r.name === r.k);
    ok('  every field has a name a person would use', !raw.length,
      raw.slice(0, 5).map((r) => r.k).join(', ') || out.rows.length + ' fields');
    /* A STRING VALUE THAT SURVIVES UNCHANGED IS A KEY. Every string in the ledger is a code
       word ("window", "twopoint", "school-paid", a sponsor id), so any of them coming back
       verbatim means nothing translated it. Numbers and booleans are exempt: those ARE the
       value, and pathValue's job there is only to put a unit on them. */
    const keys = out.rows.filter((r) => typeof r.v === 'string' && r.word === r.v);
    ok('  and every code word is said in English', !keys.length,
      keys.slice(0, 5).map((r) => r.k + '=' + r.v).join(', ')
        || out.rows.filter((r) => typeof r.v === 'string').length + ' code words translated');
    /* AND NOTHING COMES BACK EMPTY, which is what "was" with nothing after it was. */
    const blank = out.rows.filter((r) => !r.word.trim() || !r.name.trim());
    ok('  and none of it renders as a blank', !blank.length,
      blank.slice(0, 5).map((r) => r.k).join(', ') || 'all of them say something');
  }
  ok('  with no page errors', !errs.length, errs.join(' | ') || 'none');

  /* ---- two layouts that a later element quietly invalidated ----
     THE SAME FAULT TWICE, in two places, both found by a player rather than by anything here.

     A game row is a two column grid and the audience figure was pinned to `grid-row:1/3`,
     which is rows one and two counted by hand off a card that held two team lines. The day a
     rivalry name was added above them the teams moved to rows two and three and the figure
     stayed beside the name, so every named game rendered with its scoreline collapsed. "It is
     messing up the box score when the game has a name."

     And a verified badge was given the class `.tick`, which this sheet was already using for
     the season ticker at min-height:78px. A twelve pixel check mark rendered a hundred pixels
     tall and opened a blank band under the name of every account that had one. "This weird
     space appears on some tweets."

     Both are measured here, against the real stylesheet, in both states. */
  const box = await pg.evaluate(() => {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;width:420px';
    document.body.appendChild(host);
    const row = (name) => '<div class="gms"><div class="gm2' + (name ? ' riv named' : '') + '"'
      + ' style="--gc:#e11d48">'
      + (name ? '<em class="rivn">' + name + '</em>' : '')
      + '<span class="t w"><u>Notre Dame</u><s>43</s></span>'
      + '<span class="t"><u>USC</u><s>15</s></span>'
      + '<span class="v">6.9<i>M</i></span></div></div>';
    const read = (html) => {
      host.innerHTML = html;
      const g = host.querySelector('.gm2');
      const v = g.querySelector('.v').getBoundingClientRect();
      const ts = [...g.querySelectorAll('.t')].map((t) => t.getBoundingClientRect());
      return {
        /* The figure sits to the RIGHT of both team lines. */
        right: ts.every((t) => v.left >= t.right - 1),
        /* And beside them rather than above: its middle is inside their band. */
        beside: (v.top + v.bottom) / 2 >= ts[0].top && (v.top + v.bottom) / 2 <= ts[1].bottom,
        /* The two team lines are stacked, not side by side. */
        stacked: ts[1].top >= ts[0].bottom - 1,
      };
    };
    const plain = read(row(null));
    const named = read(row('THE JEWELED SHILLELAGH'));

    /* And the badge, at the size its own rule asks for rather than the ticker's. */
    host.innerHTML = '<div class="feed"><div class="post" style="--ac:#38bdf8">'
      + '<span class="av">WR</span><div><span class="hd"><b>The Wire Report</b>'
      + '<svg class="vtick" viewBox="0 0 24 24"><path d="M12 2l10 20H2z"/></svg>'
      + '<i>@thewirereport &middot; 41m</i></span>'
      + '<p>The presidents can defend this one to a board of trustees.</p></div></div></div>';
    const hd = host.querySelector('.hd').getBoundingClientRect();
    const tk = host.querySelector('.vtick').getBoundingClientRect();
    const tx = host.querySelector('.post p').getBoundingClientRect();
    const badge = { w: Math.round(tk.width), h: Math.round(tk.height),
      hd: Math.round(hd.height), gap: Math.round(tx.top - hd.bottom) };
    host.remove();
    return { plain, named, badge };
  });
  ok('a game row puts the audience beside the score, not above it',
    box.plain.right && box.plain.beside && box.plain.stacked, JSON.stringify(box.plain));
  ok('  and still does when the game has a name',
    box.named.right && box.named.beside && box.named.stacked, JSON.stringify(box.named));
  ok('a verified badge is the size of a badge',
    box.badge.w <= 20 && box.badge.h <= 20,
    box.badge.w + 'x' + box.badge.h);
  ok('  and opens no gap under the name it sits on',
    box.badge.hd <= 30 && box.badge.gap <= 14,
    'header ' + box.badge.hd + 'px, gap ' + box.badge.gap + 'px');

  await pg.close();
}

await b.close();
console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
