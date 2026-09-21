/* Player-facing copy, read for the tells of machine-written English.
 *
 *   node golf/check-voice.mjs              the whole report
 *   node golf/check-voice.mjs --list bold  every hit for one rule
 *   node golf/check-voice.mjs --fail       exit non-zero on anything in FAIL_ON
 *
 * The rules come from the owner's humanizer brief, which is Wikipedia's "Signs of AI writing"
 * (WikiProject AI Cleanup). They are not a style preference sitting beside CLAUDE.md's dash and
 * short-sentence rules, they are the same argument one level up: copy read on a phone mid-round by
 * somebody reaching for the next button cannot afford a sentence that is decorating rather than
 * saying something.
 *
 * WHAT COUNTS AS PLAYER-FACING, and why the extraction is fussy about it. This file is one 39,000
 * line page holding CSS, engine code and copy in the same string soup, and a scanner that reads all
 * of it reports class names, easing curves and SQL as prose. So a string has to look like a
 * sentence somebody reads before any rule is applied to it, and the SKIP list below is what that
 * costs. Every rule counts only inside that filtered set, which is why the numbers here are smaller
 * and more useful than a grep over the file.
 *
 * A HIT IS A QUESTION, NOT A DEFECT. "Journey" is an AI tell in a paragraph about a company's
 * commitment to excellence and is the correct word for a 30 year career mode. The report prints the
 * line so it can be read, and only the rules in FAIL_ON are ever allowed to fail a build.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const ARGV = process.argv.slice(2);
const li = ARGV.findIndex(a => a === '--list' || a.startsWith('--list='));
const ONLY = li < 0 ? null : (ARGV[li].includes('=') ? ARGV[li].split('=')[1] : ARGV[li + 1]);
const REST = ARGV.filter((a, i) => !a.startsWith('--') && !(li >= 0 && !ARGV[li].includes('=') && i === li + 1));
const FILES = (REST.length ? REST : ['golf/index.html', 'golf/how-to-play.html'])
  .map(f => path.resolve(ROOT, f));
const FAILING = process.argv.includes('--fail');

/* Rules that are allowed to fail a build. The rest are reported and judged by a person, because
   every one of them has a legitimate use somewhere in a golf game. */
const FAIL_ON = ['dash', 'negparallel', 'copula', 'chatbot', 'filler', 'promo'];

// ── what is prose ──────────────────────────────────────────────────────────────────────────────
const SKIP = [
  /^[\s\d.,:;%+\-*/()[\]{}<>=|&!?'"`]*$/,          // punctuation and numbers only
  /^[a-z][a-zA-Z0-9]*$/,                            // one identifier
  /^[-a-z0-9]+(\s+[-a-z0-9]+)*$/ ,                  // css-ish token runs, re-admitted below if sentence-like
  /[{};]\s*$/,                                      // a css declaration
  /^(https?:|\/|#|\.|data:|url\(|rgba?\(|var\(|calc\(|linear-|radial-|translate|matrix)/i,
  /^[A-Z_]+$/,                                      // CONSTANT
  /^\w+([-_]\w+)+$/,                                // kebab or snake key
  /\b(px|em|rem|vh|vw|deg|ms)\b.*\b(px|em|rem|vh|vw|deg|ms)\b/,  // two css units
  /^(select|insert|update|delete|create|alter)\s/i, // sql
  /^[A-Za-z ]+\.(js|css|png|svg|html|json|mjs)$/i,
  /* CODE THAT LEAKED OUT OF A TEMPLATE LITERAL. A `${...}` holding an object or an arrow function
     has braces inside it, so no single regex splits interpolations off cleanly, and what survives is
     a run of real JS that reads as a long sentence. These are what that looks like, and dropping
     them is what took the dash count from 20 to the handful that are actually copy. */
  /[;{}]\s*[})]|\)\s*\{|=>|\bfunction\b|\/\/ CS\d|\bconst \w+=|\blet \w+=|\.join\(|\.map\(|\.push\(|===|!==|\|\||&&/,
  /^[)}\];,]/,
];
const isProse = (s) => {
  const t = s.trim();
  if (t.length < 14 || t.length > 900) return false;
  if (!/\s/.test(t)) return false;
  if (SKIP.some(r => r.test(t))) return false;
  const words = t.split(/\s+/).filter(w => /[A-Za-z]{2,}/.test(w));
  if (words.length < 3) return false;
  // a sentence has a lowercase word that is not a css keyword, and some punctuation or a verb-ish shape
  if (!/[a-z]{3,}/.test(t)) return false;
  if (/^[a-z-]+:\s/.test(t) && !/[.!?]/.test(t)) return false;
  return true;
};

// ── the rules ──────────────────────────────────────────────────────────────────────────────────
const W = (...a) => new RegExp('\\b(' + a.join('|') + ')\\b', 'i');
const DASHCHARS = String.fromCharCode(0x2014, 0x2013, 0x2012, 0x2015);
/* THE ONE RULE THAT CANNOT WRITE ITSELF DOWN. golf/ is on check-dashes.mjs's GUARDED list now, so
   this file may not contain an em dash, an en dash, or any entity that resolves to one, which is
   exactly the set it exists to find. Hence the code points and the split entity names. The
   alternative was exempting files whose job is finding dashes, and an exemption like that is one
   somebody else takes later for a worse reason. */
const DASHRE = new RegExp('[' + DASHCHARS + ']|&' + 'mdash;|&' + 'ndash;|&#821[12];|\\\\u201[34]');

const RULES = [
  { id: 'dash', what: 'em or en dash, or the entity that makes one', re: DASHRE },
  /* THE APOSTROPHE, NOT THE QUOTE MARK. The brief says to prefer straight quotes because a curly one
     is an AI tell in plain text. That is not the finding here: this game has 4,830 curly double
     quotes and every one of them is quoted speech, in a press conference or a rival talking, which
     is house style and reads better than the straight version. Consistency is what a reader notices,
     and the apostrophe is where this game is NOT consistent: "you're" and "you’re" both ship, so the
     same contraction is set two ways on two screens. Straight is the side to standardise on, since
     it is the one that survives being copied into a share sheet or a leaderboard name. */
  { id: 'apos', what: "curly apostrophe where the rest of the copy uses a straight one",
    re: /’/ },
  { id: 'vocab', what: 'AI vocabulary',
    re: W('additionally', 'delve', 'pivotal', 'crucial', 'vital', 'profound', 'intricate',
      'intricacies', 'interplay', 'tapestry', 'testament', 'underscore[sd]?', 'underscoring',
      'showcase[sd]?', 'showcasing', 'foster(s|ed|ing)?', 'garner(s|ed|ing)?', 'enduring',
      'indelible', 'align with', 'enhance[sd]?', 'seamless(ly)?', 'robust', 'leverage[sd]?',
      'holistic', 'myriad', 'plethora', 'utilize[sd]?', 'furthermore', 'moreover',
      'in today\'s', 'ever-evolving', 'landscape of') },
  { id: 'promo', what: 'advertisement voice',
    re: W('boasts', 'nestled', 'breathtaking', 'stunning', 'must-visit', 'vibrant',
      'renowned', 'groundbreaking', 'unparalleled', 'world-class', 'cutting-edge',
      'state of the art', 'state-of-the-art', 'unforgettable', 'unrivaled', 'unrivalled',
      'premier', 'elevate your', 'take it to the next level', 'commitment to',
      'rich (history|tradition|heritage)', 'in the heart of (the )?(a |an )?[A-Z]') },
  { id: 'copula', what: 'a dressed-up "is"',
    re: /\b(serves as|stands as|acts as|functions as|represents a|marks a|exists as)\b/i },
  { id: 'ing', what: 'a participle tacked on to add depth',
    re: /,\s+(highlighting|underscoring|emphasizing|ensuring|reflecting|symbolizing|signifying|contributing to|cultivating|fostering|encompassing|showcasing|solidifying|cementing|paving the way|allowing for|enabling)\b/i },
  { id: 'negparallel', what: 'not just X, it is Y',
    re: /\b(not (just|merely|only) (a|an|about)?\b[^.!?]{0,60}?\b(it('s| is)|but)\b|more than just an?\b)/i },
  { id: 'vague', what: 'attributed to nobody',
    re: /\b(experts (say|believe|argue|agree)|observers (have )?(said|noted|cited)|industry reports|some critics|many believe|it is (widely )?(believed|considered|regarded)|studies (show|suggest)|research shows)\b/i },
  { id: 'filler', what: 'filler that a shorter phrase replaces exactly',
    re: /\b(in order to|due to the fact that|at this point in time|in the event that|has the ability to|have the ability to|it is important to (note|remember)|it should be noted|for the purpose of|in terms of|with regard to|a wide (range|variety) of|a number of)\b/i },
  { id: 'hedge', what: 'stacked hedging',
    re: /\b(could potentially|may potentially|might possibly|can potentially|it could be argued|somewhat of a|arguably one of)\b/i },
  { id: 'chatbot', what: 'chat transcript left in the copy',
    re: /\b(I hope this helps|let me know if|would you like me to|here('s| is) (a|an|the) (overview|summary|breakdown)|certainly!|of course!|great question|as an AI|as of my (last )?(training|knowledge))\b/i },
  { id: 'future', what: 'generic upbeat ending',
    re: /\b(the future (looks|is) bright|exciting times (lie )?ahead|a (major )?step in the right direction|the sky('s| is) the limit|onward and upward|journey (toward|towards) (excellence|greatness))\b/i },
  { id: 'range', what: 'from X to Y where X and Y are not a scale',
    re: /\bfrom [a-z][^.!?,]{4,40} to [a-z][^.!?,]{4,40}, from [a-z]/i },
  { id: 'bold', what: 'a bolded inline header followed by a colon',
    re: /<(b|strong)>[^<]{2,40}<\/(b|strong)>\s*:/i },
  { id: 'rot', what: 'rule of three: three items and a full stop',
    re: /\b\w+, \w+,? and \w+\.(\s|$)/ },
];

// ── extraction ─────────────────────────────────────────────────────────────────────────────────
/* Strings come out of three places and each needs its own reader: JS literals (three quote styles,
   escapes intact), HTML text nodes, and the attributes a player actually reads (title, alt,
   placeholder, aria-label). Everything inside <style> is dropped whole. */
function strings(src) {
  const out = [];
  const noStyle = src.replace(/<style[\s\S]*?<\/style>/gi, m => '\n'.repeat((m.match(/\n/g) || []).length));
  const lineAt = (i) => noStyle.slice(0, i).split('\n').length;

  // JS and HTML-attribute string literals
  const lit = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = lit.exec(noStyle))) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    if (!raw) continue;
    // a template literal is many fragments; split on ${...} so an interpolation is not read as prose
    raw.split(/\$\{[^}]*\}/).forEach(frag => {
      const txt = frag.replace(/<[^>]+>/g, ' ').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (isProse(txt)) out.push({ line: lineAt(m.index), text: txt, from: 'js' });
    });
  }
  // HTML text nodes outside <script>
  noStyle.replace(/<script[\s\S]*?<\/script>/gi, m => '\n'.repeat((m.match(/\n/g) || []).length))
    .split('\n').forEach((ln, i) => {
      ln.replace(/>([^<>]{14,})</g, (_, t) => {
        const txt = t.replace(/\s+/g, ' ').trim();
        if (isProse(txt)) out.push({ line: i + 1, text: txt, from: 'html' });
        return '';
      });
    });
  return out;
}

// ── run ────────────────────────────────────────────────────────────────────────────────────────
const all = [];
for (const f of FILES) {
  if (!fs.existsSync(f)) continue;
  strings(fs.readFileSync(f, 'utf8')).forEach(s => all.push({ ...s, file: path.relative(ROOT, f) }));
}
// the same sentence can be built twice; report a phrase once but say how many places carry it
const seen = new Map();
for (const s of all) {
  const k = s.text.toLowerCase();
  if (seen.has(k)) seen.get(k).n++; else seen.set(k, { ...s, n: 1 });
}
const lines = [...seen.values()];

console.log(`\nplayer-facing strings read: ${lines.length} distinct (${all.length} occurrences)`);
console.log(`across: ${FILES.map(f => path.relative(ROOT, f)).join(', ')}\n`);

let failed = 0;
const table = [];
for (const r of RULES) {
  const hits = lines.filter(l => r.re.test(l.text));
  table.push({ rule: r.id, what: r.what, hits: hits.length, hitList: hits });
  if (FAIL_ON.includes(r.id) && hits.length) failed += hits.length;
}
const wid = Math.max(...table.map(t => t.rule.length));
for (const t of table) {
  const gate = FAIL_ON.includes(t.rule) ? (t.hits ? ' FAIL ' : '  ok  ') : (t.hits ? ' read ' : '  ok  ');
  console.log(`${gate} ${t.rule.padEnd(wid)}  ${String(t.hits).padStart(4)}   ${t.what}`);
}

const show = ONLY ? table.filter(t => t.rule === ONLY) : table.filter(t => t.hits && FAIL_ON.includes(t.rule));
for (const t of show) {
  if (!t.hits) continue;
  console.log(`\n${t.rule}: ${t.what}`);
  const n = ONLY ? t.hitList.length : Math.min(t.hitList.length, 6);
  t.hitList.slice(0, n).forEach(h => {
    console.log(`  ${h.file}:${h.line}${h.n > 1 ? ` (x${h.n})` : ''}`);
    console.log(`    ${h.text.slice(0, 190)}`);
  });
  if (!ONLY && t.hitList.length > n) console.log(`  ... and ${t.hitList.length - n} more (--list ${t.rule})`);
}

console.log('');
if (FAILING) process.exit(failed ? 1 : 0);
