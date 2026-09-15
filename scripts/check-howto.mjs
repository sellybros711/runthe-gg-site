/*
 * check-howto.mjs : the arcade's "How to play" blocks, held to the entitlement code.
 *
 *   node scripts/check-howto.mjs
 *
 * WHY THIS EXISTS
 * Twelve game pages each carry a paragraph describing what a visitor gets free,
 * what an account adds and what the Card opens. It is the same product fact
 * twelve times, written by hand twelve times, and NOTHING READS IT. So when the
 * entitlement model changed the paragraphs did not, and every one of them said
 * the four free games "come free with a RunThe.GG account".
 *
 * They do not. tokens.js is explicit: signed out gets those four, one play each
 * per day, no account and no sign-up. What an account adds is that the result
 * is SAVED, plus one play of each card game, once ever. So twelve pages were
 * asking a stranger to sign up for something already free, which is the exact
 * wall the "A VISITOR PLAYS FIRST" note in tokens.js exists to knock down.
 *
 * Nothing failed, and nothing could: the pages render, the games work, and the
 * only symptom is copy that is false about the product. That is what this file
 * is for. It does not check English; check-copy.mjs does that. It checks that
 * the NUMBERS AND NAMES in the how-to blocks are the ones the code enforces.
 */
import { readFileSync } from 'fs';
import { createContext, runInContext } from 'vm';

let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);

/* ---- what the code actually says ---------------------------------------- */
const box = {}; box.self = box; box.window = box; box.globalThis = box;
createContext(box);
runInContext(readFileSync('arcade/tokens.js', 'utf8'), box);
runInContext(readFileSync('arcade/calendar.js', 'utf8'), box);

const src = readFileSync('arcade/tokens.js', 'utf8');
const grab = (re) => { const m = re.exec(src); return m ? m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')) : []; };
const GAMES = grab(/var GAMES\s*=\s*\[([^\]]*)\]/);
const FREE = grab(/var FREE_LIST\s*=\s*\[([^\]]*)\]/);

const NAME = {
  table: 'The Number Game', match: 'Common Ground', career: 'Career Path', oddone: 'Odd One Out',
  rankit: 'Rank It', almamater: 'Alma Mater', guess: 'Guess the Player', crossword: 'the Daily Crossword',
  sportegories: 'Sportegories', rollcall: 'Roll Call', chain: 'Chain', highlow: 'High Low',
};
/* The bare name as it is written mid-sentence in a list, which drops the "the"
   the Daily Crossword carries when it leads one. */
const LISTED = Object.assign({}, NAME, { crossword: 'Daily Crossword', table: 'Number Game' });

const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
              'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];

const page = (k) => readFileSync('arcade/' + k + '/index.html', 'utf8');
const howto = (k) => {
  const m = /<details class="gj"[^>]*>([\s\S]*?)<\/details>/.exec(page(k));
  return m ? m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') : '';
};

console.log('1) the free four, and that they cost nothing');
{
  const named = FREE.map((k) => LISTED[k]);
  for (const k of GAMES) {
    const t = howto(k);
    if (!t) { fail(k + ' has no how-to block'); continue; }
    const missing = named.filter((n) => !t.includes(n));
    /* A free game lists the OTHER three, so it is allowed to omit itself. */
    const expect = FREE.includes(k) ? missing.filter((n) => n !== LISTED[k]) : missing;
    if (expect.length) fail(k + ' does not name the free games ' + expect.join(', '));
  }
  if (!bad) ok('all ' + GAMES.length + ' pages name ' + named.join(', '));
}
{
  /* The claim that broke. tokens.js: "no account and no sign-up". */
  const liars = GAMES.filter((k) => /four games (that come )?free with a RunThe\.GG account/i.test(howto(k)));
  if (liars.length) fail('these say the free four need an account, which tokens.js says they do not: ' + liars.join(', '));
  else ok('none of them charges an account for a game that is free without one');
}

console.log('\n2) the counts match the code');
{
  const n = WORD[GAMES.length] || String(GAMES.length);
  const wrong = GAMES.filter((k) => {
    const t = howto(k);
    const m = /all (\w+)(?: Arcade games| with| without)/.exec(t);
    return m && m[1].toLowerCase() !== n;
  });
  if (wrong.length) fail('these count the arcade wrong (it is ' + GAMES.length + '): ' + wrong.join(', '));
  else ok('"all ' + n + '" matches GAMES in tokens.js');

  /* The sport editions are whichever pages load mode.js, so the copy is held to
     the pages rather than to a number somebody remembered. */
  const eds = GAMES.filter((k) => /arcade\/mode\.js/.test(page(k)));
  const e = WORD[eds.length] || String(eds.length);
  const off = GAMES.filter((k) => {
    const m = /(\w+) of the games also have NBA, NFL and MLB editions/.exec(howto(k));
    return m && m[1].toLowerCase() !== e;
  });
  if (off.length) fail('these claim the wrong number of sport editions (it is ' + eds.length + ': ' + eds.join(', ') + '): ' + off.join(', '));
  else ok('"' + e + ' of the games" matches the pages that load mode.js: ' + eds.join(', '));
}

console.log('\n3) the card games say the free play is once, not daily');
{
  const cards = GAMES.filter((k) => !FREE.includes(k));
  const quiet = cards.filter((k) => !/one play of it, once ever/.test(howto(k)));
  if (quiet.length) fail('these never mention the one free play an account gets: ' + quiet.join(', '));
  else ok('all ' + cards.length + ' card games say it, and say it is once ever');
  /* "once ever" is the whole of it. A daily trial is just a bigger free tier,
     which is the note tokens.js writes above readTrial(). */
  const daily = cards.filter((k) => /free (play|try) of it (each|every) day/i.test(howto(k)));
  if (daily.length) fail('these describe the trial as a daily one: ' + daily.join(', '));
  else ok('and none of them describes it as daily');
}

if (bad) { console.error('\n' + bad + ' problem' + (bad === 1 ? '' : 's')); process.exit(1); }
console.log('\nhow-to ok: ' + GAMES.length + ' pages agree with tokens.js');
