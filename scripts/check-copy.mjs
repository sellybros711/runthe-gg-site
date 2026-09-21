/*
 * check-copy.mjs : the copy rules that are not about dashes.
 *
 *   node scripts/check-copy.mjs              check the guarded pages
 *   node scripts/check-copy.mjs path/to/file check something else
 *   node scripts/check-copy.mjs --list       print every string it considers
 *
 * CLAUDE.md carries two rules about player-facing copy and only one of them had a
 * checker. check-dashes.mjs enforces the dash ban across whole directories. This
 * one enforces the rest, and it cannot work that way: the rest are about ENGLISH,
 * and a code comment is prose for the next developer that is allowed to run long,
 * hedge, and use whatever words it needs. So this reads the strings a PLAYER sees
 * and nothing else.
 *
 * ---------------------------------------------------------------------------
 * THE EXTRACTION IS THE HARD PART, AND GETTING IT WRONG IS SILENT
 * ---------------------------------------------------------------------------
 * The first version of this walk reported zero problems in the football game. It
 * was dropping every string containing "</" as code, which is most of the strings
 * that build UI, which is most of the copy. It missed the Challenge Bowl share
 * text, two spliced sentences and six placeholders. A checker that looks at the
 * wrong half of a file passes loudly and proves nothing.
 *
 * So the rule here is the opposite: keep anything that might be prose and let the
 * PATTERNS decide. A false positive costs somebody ten seconds; a false negative
 * costs the thing this file exists for.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES NOT CHECK, ON PURPOSE
 * ---------------------------------------------------------------------------
 * Sentence length is a warning and never a failure. "Short sentences, few commas"
 * is a rule about judgement: "QB, RB, two WR, TE and a flex" is six positions and
 * four commas and is exactly right. A hard limit there would be wrong more often
 * than it was right, so long sentences are printed under a separate heading and
 * the exit code ignores them.
 *
 * Nor does it check for the "rule of three". Three is the number of kinds of
 * special college season there are, and a checker cannot tell that from three
 * adjectives padding a sentence. The test is whether the three are information,
 * and that is a person's job.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { pathToFileURL } from 'url';

/* The pages a player reads. Narrower than check-dashes.mjs's directory walk on
   purpose: this looks at English, so it wants the files that hold copy rather
   than every file in a tree. */
const GUARDED = [
  'football/index.html',
  'football/c/index.html',
  'football/challenge/index.html',
  'cfb/index.html',
  'cfb/commish/index.html',
  'assets/store.js',
  /* A BUILD SCRIPT THAT WRITES WORDS ONTO AN IMAGE IS COPY. 06-og.mjs writes the
     headline baked into og-challenge.png, which is the most public text the college
     game produces: it is what a shared challenge link shows in a feed, and nobody
     reading the source of a build step reads it as prose.
     Its curly apostrophe is NOT a hit and must not become one again: see the note on
     the curly quote rule below, which is the same case and was already settled. */
  'cfb/build/06-og.mjs',
  /* Fantasy Challenge. On the list from the day it was written rather than after an audit,
     which is the cheap direction: the rule about adding a directory only once it is clean
     exists because the rest of the repo predates the rule, and this page does not. */
  'football/fantasy/index.html',
  'football/fantasy/draft.js',
  // The wrestling game and its data files. Added after the audit that cleared
  // them, per the rule on the dash checker: guard a directory only once it is
  // clean, never before, or the check becomes noise people learn to ignore.
  'wrestling/index.html',
  'wrestling/booking/index.html',
  'wrestling/world.js',
  'wrestling/roster.js',
  'wrestling/legends.js',
  'wrestling/personalities.js',
  'wrestling/moves.js',
  'wrestling/cosmetics.js',
  'wrestling/corrections.js',
];

/* ---------------------------------------------------------------------------
 * The rules. Each one says what to write instead, because a checker that only
 * says no is a checker people argue with.
 * ------------------------------------------------------------------------- */
const RULES = [
  /* NOT THE APOSTROPHE. The right single quote is the apostrophe in "today's"
     and "couldn't", and in this repo it is deliberate: inside a single-quoted
     JavaScript string a straight one has to be escaped, so the arcade writes
     105 of them rather than 105 backslashes. The owner confirmed they stay.
     The rule is about the ones that arrive by PASTE: a left single quote is
     never an apostrophe, and a pair of curly double quotes around a phrase is
     the shape text takes when it comes out of a chat window rather than a
     keyboard. Those are still worth catching. */
  { id: 'curly quote',
    re: /[‘“”]/,
    say: 'use a straight quote. Inside a single-quoted string that is \\\'' },
  /* Rule 4 and 7 of the humanizer guide, trimmed to the words that would actually
     turn up in a sports game. A word here is banned in COPY and nowhere else: the
     comments in these files use several of them correctly. */
  { id: 'promotional language',
    // "boasts a roster of" is the tell. The NOUN is ordinary English, and in a
    // wrestling game it is something a heel says out loud: "That is not a
    // boast. It is just the record." Match the verb with its object, not the
    // bare word, or the rule fires on dialogue and gets ignored.
    re: /(\bboasts\s+(?:a|an|the|over|more than|its)\b|\b(vibrant|breathtaking|stunning|renowned|must-visit|world-class|cutting-edge|state of the art|unparalleled|unrivall?ed|immersive|seamless(ly)?|elevate your|unleash|take it to the next level)\b)/i,
    say: 'say what it does instead' },
  /* "underscore" is on every list of these words and it is also the name of a
     character, which the username rules talk about. Matched as a VERB only, which
     means it has to be doing something to an object. Same trick would be needed
     for "key" and "landscape" if they were ever worth adding.

     "leverage" needs the same treatment and the object test is not enough for it. The
     AI tic is the verb, as in leverage the synergies. The NOUN is the ordinary English
     word for what one side of a negotiation has over the other, and this site has a
     college football game about labour and television money in it: "the only leverage
     the other side has" is not a word to swap for a plainer one, it IS the plainer one,
     and it takes an object exactly the way the verb does.
     So only the INFLECTED forms are matched. Nothing but a verb is ever leveraging or
     leveraged. That misses a bare imperative ("leverage the moment"), which is a miss
     worth taking: the alternative flags every correct use in the game and a check people
     learn to scroll past is worse than no check. */
  { id: 'AI vocabulary',
    re: /\b(delve|pivotal|tapestry|testament to|showcases?|intricate|interplay|myriad|plethora|holistic|robust|utilize|foster(s|ing)?|garner|leverag(es|ed|ing))\b|\bunderscor(e|es|ed|ing) (the|its|his|her|their|our|a|an|how|that|why)\b/i,
    say: 'plainer word' },
  { id: 'inflated significance',
    re: /\b(stands as|serves as|marks a (pivotal|key|defining)|represents a shift|evolving landscape|indelible|a (vital|crucial) (role|part))\b/i,
    say: 'is / has / does' },
  { id: 'superficial -ing clause',
    re: /,\s+(highlighting|underscoring|emphasizing|ensuring|reflecting|symbolizing|showcasing|fostering|encompassing)\b/i,
    say: 'a full stop, then say the thing' },
  { id: 'filler',
    re: /\b(in order to|due to the fact that|at this point in time|in the event that|has the ability to|it is important to note|for the purposes of)\b/i,
    say: 'to / because / now / if / can' },
  { id: 'hedging',
    re: /\b(could potentially|may possibly|might potentially|it could be argued)\b/i,
    say: 'say it or do not' },
  { id: 'chat artifact',
    re: /\b(let me know if|i hope this helps|feel free to|great question|you'?re absolutely right)\b/i,
    say: 'this is chatbot correspondence, not copy' },
  /* AN ARROW IS NOT AN EMOJI. U+2190 to U+21FF is the Arrows block, and the
     rule was catching the arrow on a button: "Pick a day ->", "See your day
     ->", "Next board ->". That is a typographic mark doing the job a mark
     does, telling you which way the button goes, and the advice it drew
     ("draw it, or say it in words") would have taken an affordance off five
     buttons to fix nothing. Pictographs only. */
  { id: 'emoji',
    re: /[\u{1F300}-\u{1FAFF}]/u,
    say: 'draw it, or say it in words' },
];
/* Printed, never failed. See the note at the top. */
const LONG = { words: 24, commas: 4 };

/* ---------------------------------------------------------------------------
 * Extraction
 * ------------------------------------------------------------------------- */
function scriptBlocks(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}
/* Comments out, strings kept. Walks the source a character at a time because a
   regex cannot tell a comment from the same characters inside a string, and this
   file's whole job depends on not confusing the two.
   AND IT HAS TO KNOW A REGEX LITERAL WHEN IT SEES ONE. /[&<>"']/g is a real line in
   store.js, and a walker that reads its double quote as the start of a string is
   lost for the rest of the file: every comment after it arrives as string content,
   and a rule below then fires on a code comment, which is a failure nobody can act
   on and the fastest way to teach people to ignore this. Whether a slash opens a
   regex or divides is decided by the token before it, which is the standard
   heuristic and is right about everything in this repo. */
const RE_CAN_START = /[({[,;:!&|?+\-*%~^=<>]$/;
const RE_KEYWORD = /\b(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/;
function stripComments(src) {
  let out = '', i = 0, prev = '';
  const n = src.length;
  const remember = (ch) => { if (!/\s/.test(ch)) prev += ch; };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '/' && (prev === '' || RE_CAN_START.test(prev) || RE_KEYWORD.test(prev))) {
      /* A regex literal. Skipped whole, character class and all, and it is never copy. */
      i++;
      let klass = false;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '[') klass = true;
        else if (src[i] === ']') klass = false;
        else if (src[i] === '/' && !klass) { i++; break; }
        else if (src[i] === '\n') break;      // not a regex after all; bail rather than eat the file
        i++;
      }
      while (i < n && /[a-z]/.test(src[i])) i++;   // flags
      prev = ')';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        out += src[i];
        if (src[i] === q) { i++; break; }
        i++;
      }
      prev = q;
      continue;
    }
    out += c;
    remember(c);
    if (prev.length > 12) prev = prev.slice(-12);
    i++;
  }
  return out;
}
function stringLiterals(src) {
  const out = [];
  const re = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let m;
  while ((m = re.exec(src))) out.push(m[2]);
  return out;
}
/* Text between tags in the static markup, which is where the titles and the long
   prose blocks live. Script and style are already handled above. */
function markupText(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
  const out = [...body.matchAll(/>([^<>]{3,})</g)].map((m) => m[1]);
  /* Attributes worth reading: a share card's title and description are copy a
     stranger sees before they have opened anything, and alt text is copy for anybody
     using a screen reader.
     NOT keywords. A meta keywords list is comma separated by definition and would
     be the loudest thing in the long-sentence warning for ever, which is how a
     warning stops being read. */
  const attr = /<meta[^>]*\bname="keywords"[^>]*>/gi;
  const body2 = body.replace(attr, ' ');
  out.push(...[...body2.matchAll(/\b(?:content|title|alt|placeholder|aria-label)="([^"]{4,})"/g)].map((m) => m[1]));
  return out;
}
const tidy = (s) => s
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;|&#\d+;/g, ' ')
  .replace(/\\n|\\t/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/* Anything that is plainly code rather than a sentence. Deliberately short: see
   the note at the top about which way to be wrong. A string has to look like an
   identifier, a selector or a bare path to be dropped. */
const NOT_COPY = [
  /^[a-z0-9_$-]+$/i,                   // one token: an id, a key, a class
  /^[.#][a-zA-Z]/,                     // a selector
  /[{}]/,                              // CSS, or an object literal
  /=>|\bfunction\b|\breturn\b|\|\||&&/,  // code
  /\*\/|^\s*\*/,                       // a comment the stripper could not close
  /^\/|^https?:|^data:|^[\w.-]+\.(js|css|png|svg|json|html)$/i,
  /^(GET|POST|application|text|image)\b/,
];
/* A last filter after the list above, because the list can only name shapes it has
   already seen. Copy is mostly letters and spaces; CSS, selectors and transforms are
   mostly punctuation and digits. Nine tenths is loose enough for "$140M salary cap"
   and "11-6" and tight enough for "padding:9px 11px;border-radius:10px". */
function looksLikeProse(s) {
  const plain = (s.match(/[A-Za-z ,.'"!?:;()$%-]/g) || []).length;
  return plain / s.length > 0.9;
}
function isCopy(s) {
  if (s.split(/\s+/).length < 3) return false;
  if (!/[a-z]{3}/.test(s)) return false;
  if (NOT_COPY.some((re) => re.test(s))) return false;
  return looksLikeProse(s);
}

/* EXPORTED, because check-numbers.mjs reads the same strings and a second copy of
   this walker would be a second copy of two bugs that were expensive to find: the
   `</` filter that hid twenty dashes, and the regex literal in store.js that
   desynced the string reader. One extractor, both checkers. */
export function copyOf(file) {
  const raw = readFileSync(file, 'utf8');
  const html = /\.html?$/i.test(file);
  const js = html ? scriptBlocks(raw).join('\n') : raw;
  const out = [];
  stringLiterals(stripComments(js)).forEach((s) => out.push(tidy(s)));
  if (html) markupText(raw).forEach((s) => out.push(tidy(s)));
  return [...new Set(out)].filter(isCopy);
}

/* ---------------------------------------------------------------------------
 * Run
 *
 * GUARDED BY isMain, because copyOf is imported by check-numbers.mjs and a module
 * that runs its whole check on import would print a second report inside the first
 * and, on a failure, process.exit out of the middle of the caller's run.
 * ------------------------------------------------------------------------- */
/* A GENERATED DATA FILE IS NAMES, NOT COPY.
 *
 * Pointed at arcade/, this walked into former.js, rosters.js and awards.js and
 * read six thousand player names as prose. It reported three problems, all of
 * them the same one: Montorie Foster and Harold E. Foster are called Foster,
 * and "foster" is on the AI vocabulary list. Garner, Leverage and Delve are
 * surnames too, and the next roster refresh decides how many of them the
 * check finds.
 *
 * Nobody writes these files and nobody reads them as sentences, so a hit in
 * one is noise by construction, and noise is how a checker stops being run.
 * They are all generated with a banner saying so, which is the honest test:
 * a file that says "GENERATED ... Do not edit" is not somewhere copy lives. */
const GENERATED = /^\/\*[\s\S]{0,400}?GENERATED\b[\s\S]{0,200}?Do not edit/i;
export function filesUnder(p) {
  if (statSync(p).isFile()) return [p];
  const out = [];
  for (const e of readdirSync(p)) {
    const f = join(p, e);
    if (/(^|\/)(node_modules|\.git)$/.test(f)) continue;
    if (statSync(f).isDirectory()) out.push(...filesUnder(f));
    else if (/\.(html|js|mjs)$/i.test(f)) {
      let head = '';
      try { head = readFileSync(f, 'utf8').slice(0, 700); } catch (x) { /* unreadable: check it */ }
      if (!GENERATED.test(head)) out.push(f);
    }
  }
  return out;
}
export { GUARDED };

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();

function main() {
const args = process.argv.slice(2);
const list = args.includes('--list');
const targets = args.filter((a) => !a.startsWith('--'));

const files = (targets.length ? targets.flatMap(filesUnder) : GUARDED);

let bad = 0, longCount = 0;
const found = [];
const longs = [];
for (const f of files) {
  for (const s of copyOf(f)) {
    if (list) { console.log(relative('.', f) + '  ' + s); continue; }
    for (const r of RULES) {
      const m = r.re.exec(s);
      if (m) { found.push([f, r, m[0], s]); bad++; }
    }
    for (const sent of s.split(/(?<=[.?!])\s+/)) {
      const w = sent.trim().split(/\s+/).length;
      const c = (sent.match(/,/g) || []).length;
      if (w >= LONG.words || c >= LONG.commas) { longs.push([f, w, c, sent.trim()]); longCount++; }
    }
  }
}
if (list) process.exit(0);

if (longs.length) {
  console.log('\n' + longs.length + ' long sentences. A warning, not a failure: judge each one.');
  console.log('"QB, RB, two WR, TE and a flex" is four commas and exactly right.\n');
  longs.sort((a, b) => (b[2] - a[2]) || (b[1] - a[1])).slice(0, 12).forEach(([f, w, c, s]) => {
    console.log('  ' + relative('.', f) + '  ' + w + ' words, ' + c + ' commas');
    console.log('    ' + s.slice(0, 150));
  });
  if (longs.length > 12) console.log('  ... and ' + (longs.length - 12) + ' more');
}

if (!bad) {
  console.log('\ncopy ok: ' + files.length + ' pages, nothing on the banned list');
  process.exit(0);
}
console.log('\n' + bad + ' copy problems.\n');
for (const [f, r, hit, s] of found) {
  console.log('  ' + relative('.', f) + '  (' + r.id + ': "' + hit + '")');
  console.log('    ' + s.slice(0, 150));
  console.log('    -> ' + r.say);
}
console.log('\nSee CLAUDE.md. Run with --list to see every string this reads.');
process.exit(1);
}
