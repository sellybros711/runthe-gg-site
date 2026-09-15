/* The GENERATED copy, measured as a corpus rather than read line by line.
 *
 *   (nohup python3 -m http.server 8099 &)
 *   node golf/check-voice-gen.mjs
 *
 * check-voice.mjs reads the strings as they are written. This reads what a PLAYER actually gets,
 * which is a different thing: the decision copy is assembled from templates, so a line that is fine
 * on its own can still be the ninth time this round somebody has read a sentence with that exact
 * shape. Machine-written prose gives itself away by sameness more than by vocabulary, and sameness
 * is invisible in the source and obvious in the output.
 *
 * So this generates every decision the game can ask, on every hole of every daily course, and
 * measures the corpus:
 *
 *   REPETITION     distinct lines against lines served, and the most-served single line
 *   RHYTHM         sentence length, its spread, and how much of the corpus sits in one bucket
 *   OPENINGS       how concentrated the first two words are
 *   COMMA SPLICE   two independent clauses joined by a comma, which CLAUDE.md sends to a full stop
 *   RULE OF THREE  "x, y and z." as a share of lines
 *   TELLS          the same vocabulary rules check-voice.mjs applies to the static copy
 *
 * The thresholds are stated where they are asserted and every one of them is arguable. They are set
 * from what this corpus does today so that a REGRESSION fails rather than a number somebody likes.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const HOST = process.env.HOST || 'http://localhost:8099';
const SRC = ROOT + '/golf/index.html';
const PROBE = ROOT + '/golf/__test_voicegen.html';

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++;
  console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + JSON.stringify(x).slice(0, 220) : '')); };
const head = (t) => console.log('\n' + t + '\n' + '-'.repeat(t.length));

const HOOK = `
window.__VG = {
  /* every decision the game can ask, with the skill level varied, because dScenario picks its
     template off the situation and a single skill reads only part of the deck */
  corpus(){
    var out=[], keys=Object.keys(DAILY_COURSES);
    S.daily=true; S.h2h=null; S.moment=null;
    var skills=[42, 66, 80, 93];
    for(var si=0; si<skills.length; si++){
      S.dailySkills={}; CATS.forEach(function(c){ S.dailySkills[c.k]=skills[si]; });
      for(var ci=0; ci<keys.length; ci++){
        var ck=keys[ci], holes=(DAILY_COURSES[ck]||{}).holes||[];
        for(var h=0; h<holes.length; h++){
          S.dailySeed=20260101+si; S.dailyCourse=ck;
          var sc; try{ sc=dScenario(ck,h,0,71); }catch(e){ continue; }
          if(!sc) continue;
          out.push({k:'prompt', t:sc.prompt||''});
          if(sc.tag) out.push({k:'tag', t:sc.tag});
          (sc.opts||[]).forEach(function(o){
            if(o.l) out.push({k:'option', t:o.l});
            if(o.n) out.push({k:'note', t:o.n});
          });
        }
      }
    }
    return out;
  }
};
`;

function buildProbe() {
  const src = fs.readFileSync(SRC, 'utf8');
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, best = null;
  while ((m = re.exec(src))) { if (!best || m[1].length > best[1].length) best = m; }
  const at = best.index + best[0].length - '</script>'.length;
  fs.writeFileSync(PROBE, src.slice(0, at) + '\n' + HOOK + '\n' + src.slice(at));
}

// ── the measures ───────────────────────────────────────────────────────────────────────────────
const pct = (n, d) => (100 * n / Math.max(1, d)).toFixed(1) + '%';
const sentences = (t) => t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
const words = (t) => t.split(/\s+/).filter(w => /[A-Za-z]/.test(w)).length;

/* A COMMA SPLICE, as close as a regex gets. Two independent clauses joined by a comma: a pronoun or
   article-noun subject and a finite verb on each side. It over-reports on a leading subordinate
   clause ("If you flush it, you have a look"), so the leading conjunctions are excluded first. This
   is the pattern CLAUDE.md sends to a full stop, and it is the single most common way generated
   copy reads longer than it is. */
const SPLICE = /\b(you|he|she|it|they|we|this|that|the \w+)\s+\w*(is|are|was|were|has|have|had|can|will|would|need|needs|leaves|takes|gives|means|costs|puts|makes|gets|goes|sits|stops|holds)\b[^,.!?]{0,40},\s+(you|he|she|it|they|we|this|that|the \w+)\s+\w*(is|are|was|were|has|have|had|can|will|would|need|needs|leaves|takes|gives|means|costs|puts|makes|gets|goes|sits|stops|holds)\b/i;
const LEADIN = /^(if|when|unless|although|though|while|after|before|since|because|once|as)\b/i;

const RULE_OF_THREE = /\b[\w-]+, [\w-]+,? and [\w-]+\s*[.!?]/;
const TELLS = {
  dash: /[—–]|&mdash;|&ndash;/,
  vocab: /\b(additionally|moreover|furthermore|crucial|pivotal|vital|profound|intricate|seamless|robust|enduring|showcas\w+|underscor\w+|testament|foster\w*|garner\w*)\b/i,
  negparallel: /\b(not (just|merely|only) (a|an|about)?\b[^.!?]{0,60}?\b(it('s| is)|but)\b|more than (just )?(a|an)\b)/i,
  copula: /\b(serves as|stands as|acts as|represents a|marks a)\b/i,
  ing: /,\s+(highlighting|underscoring|emphasizing|ensuring|reflecting|symbolizing|contributing to|showcasing|allowing for|enabling)\b/i,
};

const run = async () => {
  buildProbe();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.addInitScript(() => { try { localStorage.setItem('bag_tour_done', 'true'); } catch (e) {} });
  await page.goto(HOST + '/golf/__test_voicegen.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.__VG', null, { timeout: 20000 });

  const rows = (await page.evaluate(() => window.__VG.corpus())).filter(r => r.t && r.t.trim());
  await browser.close();

  head('the corpus');
  const byKind = {};
  rows.forEach(r => { byKind[r.k] = (byKind[r.k] || 0) + 1; });
  console.log(`    lines a player can be served: ${rows.length}   ${Object.entries(byKind).map(([k, v]) => k + ' ' + v).join(', ')}`);
  ok('there is enough of it to measure', rows.length > 3000, rows.length);

  // ── repetition ───────────────────────────────────────────────────────────────────────────────
  head('repetition: how often the same line comes back');
  const tally = new Map();
  rows.forEach(r => tally.set(r.t, (tally.get(r.t) || 0) + 1));
  const uniq = tally.size;
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(`    distinct lines: ${uniq} of ${rows.length} served   (${pct(uniq, rows.length)})`);
  console.log(`    most-served line: "${top[0][0].slice(0, 70)}"  ${top[0][1]}x`);
  top.slice(1, 4).forEach(t => console.log(`                      "${t[0].slice(0, 70)}"  ${t[1]}x`));
  // a prompt is the sentence the player reads on the decision screen, so it carries the repetition
  const prompts = rows.filter(r => r.k === 'prompt');
  const pTally = new Map();
  prompts.forEach(r => pTally.set(r.t.replace(/\d+/g, '#'), (pTally.get(r.t.replace(/\d+/g, '#')) || 0) + 1));
  const pTop = [...pTally.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`    decision PROMPTS, ignoring the yardage: ${pTally.size} shapes across ${prompts.length} decisions`);
  console.log(`    the commonest shape is ${pct(pTop[0][1], prompts.length)} of them:`);
  console.log(`      "${pTop[0][0].slice(0, 110)}"`);
  ok('no single prompt shape is more than a fifth of what a player reads',
    pTop[0][1] / prompts.length < 0.20, { share: pct(pTop[0][1], prompts.length) });
  ok('and there are enough shapes that a round of 18 need not repeat one', pTally.size >= 18, pTally.size);

  // ── rhythm ───────────────────────────────────────────────────────────────────────────────────
  head('rhythm: sentence length and its spread');
  const sents = [];
  rows.forEach(r => sentences(r.t).forEach(s => sents.push(words(s))));
  const mean = sents.reduce((a, b) => a + b, 0) / sents.length;
  const sd = Math.sqrt(sents.reduce((a, b) => a + (b - mean) ** 2, 0) / sents.length);
  const sorted = sents.slice().sort((a, b) => a - b);
  const q = f => sorted[Math.floor(f * (sorted.length - 1))];
  console.log(`    ${sents.length} sentences   mean ${mean.toFixed(1)} words, sd ${sd.toFixed(1)}`);
  console.log(`    p10 ${q(0.10)}   median ${q(0.5)}   p90 ${q(0.90)}   longest ${sorted[sorted.length - 1]}`);
  const short = sents.filter(n => n <= 6).length, long = sents.filter(n => n >= 16).length;
  console.log(`    six words or fewer: ${pct(short, sents.length)}   sixteen or more: ${pct(long, sents.length)}`);
  /* Monotony is the tell, not length. A corpus whose sentences are all within a couple of words of
     each other reads as machine-set however good any one of them is, so the spread is the measure. */
  ok('the sentence length actually varies, rather than sitting on one number', sd > 3.5, +sd.toFixed(2));
  ok('and short sentences are a real part of the mix', short / sents.length > 0.12, pct(short, sents.length));

  // ── openings ─────────────────────────────────────────────────────────────────────────────────
  /* OPENINGS, on the PROMPTS only and with the numbers kept as a "#". The tags are "160 yds, in a
     stiff wind" by design, so counting their first two words measures the yardage rather than the
     writing. The prompt is the sentence somebody reads, so it is the one whose openings matter, and
     a number that varies every hole is not a repeated opening. */
  head('openings: how many prompts start the same way');
  const opens = new Map();
  prompts.forEach(r => { const k = r.t.replace(/\d+/g, '#').toLowerCase().split(/\s+/).slice(0, 2).join(' ');
    if (k) opens.set(k, (opens.get(k) || 0) + 1); });
  const oTop = [...opens.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`    distinct two-word openings across ${prompts.length} prompts: ${opens.size}`);
  oTop.forEach(o => console.log(`      "${o[0]}"  ${o[1]}  (${pct(o[1], prompts.length)})`));
  ok('no two-word opening owns more than a third of the prompts',
    oTop[0][1] / prompts.length < 0.34, { opening: oTop[0][0], share: pct(oTop[0][1], prompts.length) });

  /* AND THE NUMBER A PLAYER ACTUALLY FEELS. Shares across the whole corpus are the wrong unit: the
     thing that reads as machine-written is the same sentence twice in one sitting, and a sitting is
     18 holes. So play the rounds and count the repeats inside each one. */
  head('what one round feels like');
  const rounds = new Map();
  prompts.forEach((r, i) => {
    const key = Math.floor(i / 18);
    if (!rounds.has(key)) rounds.set(key, []);
    rounds.get(key).push(r.t.replace(/\d+/g, '#'));
  });
  let dup = 0, worst = 0, nRounds = 0;
  for (const shapes of rounds.values()) {
    if (shapes.length < 18) continue;
    nRounds++;
    const c = new Map();
    shapes.forEach(s => c.set(s, (c.get(s) || 0) + 1));
    const repeats = [...c.values()].reduce((a, b) => a + (b - 1), 0);
    dup += repeats; worst = Math.max(worst, Math.max(...c.values()));
  }
  console.log(`    ${nRounds} rounds of 18 decisions`);
  console.log(`    a prompt shape a player has already seen this round: ${(dup / nRounds).toFixed(1)} of 18 on average`);
  console.log(`    worst single round served the same shape ${worst} times`);
  ok('most of a round is sentences the player has not already read today',
    dup / nRounds < 6, { repeatsPerRound: +(dup / nRounds).toFixed(1) });

  // ── the house rules ──────────────────────────────────────────────────────────────────────────
  head('the rules this repo already keeps, applied to what comes out');
  const splices = [...tally.keys()].filter(t => !LEADIN.test(t) && SPLICE.test(t));
  console.log(`    comma splices: ${splices.length} of ${uniq} distinct lines   (${pct(splices.length, uniq)})`);
  splices.slice(0, 4).forEach(s => console.log(`      ${s.slice(0, 120)}`));
  ok('a comma splicing two clauses stays rare, per CLAUDE.md',
    splices.length / uniq < 0.04, { n: splices.length, share: pct(splices.length, uniq) });

  const threes = [...tally.keys()].filter(t => RULE_OF_THREE.test(t));
  console.log(`    rule of three: ${threes.length} of ${uniq}   (${pct(threes.length, uniq)})`);
  threes.slice(0, 3).forEach(s => console.log(`      ${s.slice(0, 120)}`));
  ok('lists of exactly three are not a habit', threes.length / uniq < 0.05,
    { n: threes.length, share: pct(threes.length, uniq) });

  head('the AI tells, in the generated output rather than the source');
  for (const [name, re] of Object.entries(TELLS)) {
    const hits = [...tally.keys()].filter(t => re.test(t));
    ok(`${name}: none reaches a player`, hits.length === 0, hits.slice(0, 3));
  }

  head('page errors');
  ok('none', errs.length === 0, errs.slice(0, 2));
};

try { await run(); } finally { try { fs.unlinkSync(PROBE); } catch (e) {} }
console.log('\n' + (bad ? bad + ' FAILED' : 'all good'));
process.exit(bad ? 1 : 0);
