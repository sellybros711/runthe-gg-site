/* ONE MAN, TWO RECORDS: the rule, written once.
 *
 * Sportegories builds its player file from four sources (the curated corpus,
 * former.js, supplement.js and the live rosters), and a man reaches it twice
 * whenever two of them write him two ways. A player reported one "every time
 * I play", and a sweep of the whole file found that they come from a handful
 * of causes rather than a handful of players:
 *
 *   a suffix     the rosters write "Deebo Samuel Sr." and "Byron Murphy Jr."
 *                where every other source writes the bare name, so the pool
 *                key (which keeps the suffix) never matches. 28 men.
 *   one name     the corpus lists Michael Jordan, Stephen Curry and forty
 *                other stars twice (once "Point Guard", once "Guard" with a
 *                college), and an edge rusher comes in as a Linebacker from
 *                one source and a Defensive Lineman from another, which the
 *                merge reads as two men. "NC State" and "North Carolina
 *                State" did the same through the college test. 70 more.
 *   a middle     "Larry D. Johnson" beside "Larry Johnson".
 *   a nickname   Penny and Anfernee, Hollywood and Marquise Brown, C.J. and
 *                Chauncey Gardner-Johnson, Obo and Ogbo Okoronkwo.
 *   a new name   Chad Johnson and Chad Ochocinco.
 *
 * Each half holds part of him, so a right answer is refused whenever the
 * category needs a fact the other half has, and the answer list can name him
 * twice. Nothing throws, which is why it kept coming back one report at a time.
 *
 * So this file is the RULE and scripts/sportegories-people.json is the short
 * list of calls a rule cannot make. build-sportegories.mjs uses classify() to
 * pair records, and check-sportegories.mjs runs the same classify() over the
 * shipped file and fails on any pair it cannot account for.
 *
 *   'auto'   the same written name (suffix and middle names aside), no
 *            contradiction, and a shared club in a shared decade. Joined with
 *            no list, so the nightly roster refresh can never reintroduce a
 *            suffix duplicate.
 *   'ask'    the names are related in a way that is ALSO true of brothers and
 *            strangers (a nickname, a prefix, initials, one letter apart, the
 *            same career under a new surname). Somebody has to decide, once,
 *            in the json: `same` or `apart`. Until then the check fails.
 *   'apart'  something proves two men: two different suffixes (Ken Griffey
 *            Sr. and Jr.), a pitcher and a hitter, a quarterback and a tight
 *            end, Miami and Southern Miss.
 *
 * Records are compared in a plain shape so both readers can use it:
 *   { name, sport, pos, t: [club names], col, dec: [decades] }
 */

export const SUFFIX = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/* first, last, the middle tokens and the suffix. A dotted or two-letter first
   name ("C.J.", "AJ") is kept as written and marked as initials. */
const PARTS = new Map();
export function parts(name) {
  const key = String(name || '');
  if (PARTS.has(key)) return PARTS.get(key);
  const v = parts0(key);
  PARTS.set(key, v);
  return v;
}
function parts0(name) {
  const raw = String(name || '').trim().split(/\s+/).filter(Boolean);
  let t = raw.map(norm).filter(Boolean);
  let suffix = null;
  if (t.length > 2 && SUFFIX.has(t[t.length - 1])) { suffix = t[t.length - 1]; t = t.slice(0, -1); }
  if (!t.length) return null;
  const firstRaw = raw[0] || '';
  const initials = /^([A-Za-z]\.){2,}$/.test(firstRaw) || /^[A-Z]{2}$/.test(firstRaw);
  return { first: t[0], last: t[t.length - 1], mid: t.slice(1, -1), suffix, initials, all: t };
}

/* Nicknames and the given names they stand for. Only used to RAISE a question
   ('ask'); it never joins anybody on its own, so a wrong entry costs a line in
   the json rather than a wrong answer. */
const NICK_PAIRS = [
  ['mike', 'michael'], ['mikey', 'michael'], ['pat', 'patrick'], ['penny', 'anfernee'], ['sauce', 'ahmad'],
  ['hollywood', 'marquise'], ['magic', 'earvin'], ['chris', 'christopher'], ['matt', 'matthew'],
  ['tom', 'thomas'], ['tommy', 'thomas'], ['bill', 'william'], ['billy', 'william'], ['will', 'william'],
  ['willie', 'william'], ['bob', 'robert'], ['bobby', 'robert'], ['rob', 'robert'], ['robbie', 'robert'],
  ['bert', 'robert'], ['jim', 'james'], ['jimmy', 'james'], ['jamie', 'james'], ['joe', 'joseph'],
  ['joey', 'joseph'], ['dan', 'daniel'], ['danny', 'daniel'], ['dave', 'david'], ['davey', 'david'],
  ['tony', 'anthony'], ['steve', 'stephen'], ['steve', 'steven'], ['stevie', 'steven'], ['ken', 'kenneth'],
  ['kenny', 'kenneth'], ['nick', 'nicholas'], ['nicky', 'nicholas'], ['alex', 'alexander'], ['al', 'albert'],
  ['al', 'alan'], ['al', 'alfred'], ['ben', 'benjamin'], ['benny', 'benjamin'], ['sam', 'samuel'],
  ['sammy', 'samuel'], ['ed', 'edward'], ['eddie', 'edward'], ['ted', 'edward'], ['ted', 'theodore'],
  ['rick', 'richard'], ['ricky', 'richard'], ['rich', 'richard'], ['dick', 'richard'], ['greg', 'gregory'],
  ['josh', 'joshua'], ['zach', 'zachary'], ['zack', 'zachary'], ['andy', 'andrew'], ['drew', 'andrew'],
  ['larry', 'lawrence'], ['ron', 'ronald'], ['ronnie', 'ronald'], ['jeff', 'jeffrey'], ['tim', 'timothy'],
  ['timmy', 'timothy'], ['cam', 'cameron'], ['nate', 'nathan'], ['nate', 'nathaniel'], ['jon', 'jonathan'],
  ['johnny', 'john'], ['jack', 'john'], ['charlie', 'charles'], ['chuck', 'charles'], ['chas', 'charles'],
  ['fred', 'frederick'], ['freddie', 'frederick'], ['frank', 'francis'], ['frankie', 'frank'],
  ['gene', 'eugene'], ['gerry', 'gerald'], ['jerry', 'gerald'], ['jerry', 'jerome'], ['hank', 'henry'],
  ['harry', 'henry'], ['ike', 'isaac'], ['izzy', 'isaiah'], ['jake', 'jacob'], ['jay', 'jason'],
  ['kev', 'kevin'], ['len', 'leonard'], ['lenny', 'leonard'], ['leo', 'leonard'], ['lou', 'louis'],
  ['manny', 'manuel'], ['marty', 'martin'], ['max', 'maxwell'], ['mo', 'maurice'], ['mo', 'mohamed'],
  ['nando', 'fernando'], ['phil', 'phillip'], ['phil', 'philip'], ['pete', 'peter'], ['ray', 'raymond'],
  ['reggie', 'reginald'], ['russ', 'russell'], ['sandy', 'alexander'], ['stan', 'stanley'],
  ['terry', 'terrence'], ['terry', 'terence'], ['tre', 'trevon'], ['trey', 'tremaine'], ['vince', 'vincent'],
  ['walt', 'walter'], ['wally', 'walter'], ['wes', 'wesley'], ['zeke', 'ezekiel'], ['gabe', 'gabriel'],
  ['abe', 'abraham'], ['doug', 'douglas'], ['don', 'donald'], ['donnie', 'donald'], ['jose', 'joseph'],
  ['sonny', 'sonny'], ['kj', 'kenneth'], ['tj', 'thomas'], ['cj', 'christopher'], ['dj', 'david']
];
const NICK = new Map();
for (const [a, b] of NICK_PAIRS) {
  if (a === b) continue;
  (NICK.get(a) || NICK.set(a, new Set()).get(a)).add(b);
  (NICK.get(b) || NICK.set(b, new Set()).get(b)).add(a);
}
const nickOf = (a, b) => !!(NICK.get(a) && NICK.get(a).has(b));

function oneApart(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 3) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++d > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return d + (a.length - i) + (b.length - j) <= 1;
}

/* How two written names relate, or null if they are simply different names. */
export function relation(A, B) {
  const a = parts(A.name), b = parts(B.name);
  if (!a || !b) return null;
  if (a.last === b.last) {
    if (a.first === b.first) {
      if (a.suffix && b.suffix && a.suffix !== b.suffix) return 'two-suffixes';
      if (a.mid.join('') !== b.mid.join('') && a.mid.length && b.mid.length) return 'two-middles';
      return 'name';                       // same name, a suffix or a middle aside
    }
    if (nickOf(a.first, b.first)) return 'nickname';
    if ((a.first.length >= 2 && b.first.startsWith(a.first)) || (b.first.length >= 2 && a.first.startsWith(b.first))) return 'prefix';
    if ((a.initials || b.initials) && a.first[0] === b.first[0]) return 'initials';
    if (oneApart(a.first, b.first)) return 'spelling';
    return null;
  }
  // A new surname on the same career: the same first name and EXACTLY the same
  // clubs (two at least). Chad Johnson and Chad Ochocinco.
  if (a.first === b.first && A.t.length >= 2 && A.t.length === B.t.length && A.t.every((t) => B.t.includes(t))) return 'renamed';
  return null;
}

/* Position families. Looser than the builder's merge on purpose: an edge
   rusher is a Linebacker in one source and a Defensive End in another, and
   the merge splitting Myles Garrett into two men is half of what this fixes.
   Basketball positions never contradict (small forwards guard centres). */
const FAMILY = {
  Quarterback: 'QB', 'Running Back': 'RB', Fullback: 'RB', 'Wide Receiver': 'WR', 'Tight End': 'TE',
  'Offensive Lineman': 'OL', 'Offensive Tackle': 'OL', Guard: 'OL', Center: 'OL',
  'Defensive Lineman': 'FRONT', 'Defensive End': 'FRONT', 'Defensive Tackle': 'FRONT', Linebacker: 'FRONT',
  Cornerback: 'DB', Safety: 'DB', Kicker: 'K', 'Place Kicker': 'K', Punter: 'P', 'Long Snapper': 'LS',
  Pitcher: 'PIT', 'Starting Pitcher': 'PIT', 'Relief Pitcher': 'PIT'
};
function family(sport, pos) {
  if (!pos || sport === 'NBA' || sport === 'WNBA') return null;
  if (sport === 'MLB') return FAMILY[pos] === 'PIT' ? 'PIT' : 'BAT';
  if (sport === 'NFL') return FAMILY[pos] || null;
  return null;
}

/* Colleges, normalised harder than the merge does, because the question here
   is "could this be the same school", and the merge's version split NC State
   from North Carolina State and Hawaii from Hawai'i. */
const SCHOOL_ALIAS = {
  'ole miss': 'mississippi', pitt: 'pittsburgh', cal: 'california', 'nc state': 'north carolina state',
  uconn: 'connecticut', utep: 'texas el paso', 'app state': 'appalachian state', smu: 'southern methodist',
  tcu: 'texas christian', byu: 'brigham young', ucf: 'central florida', unlv: 'nevada las vegas',
  usc: 'southern california', lsu: 'louisiana state', fiu: 'florida international', fau: 'florida atlantic',
  umass: 'massachusetts', 'miami fl': 'miami', 'miami florida': 'miami'
};
function schools(col) {
  return String(col || '').split(';').map((s) => {
    let x = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '')
      .replace(/\(.*?\)/g, ' ').replace(/,.*$/, '')
      .replace(/\b(university|univ|college|of|the|at|cc|jc|community|junior)\b/g, ' ')
      .replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
    return SCHOOL_ALIAS[x] || x;
  }).filter(Boolean);
}
const ini = (s) => s.split(' ').map((w) => w[0]).join('');
function sameSchool(a, b) {
  if (a === b || a.startsWith(b) || b.startsWith(a) || a.endsWith(b) || b.endsWith(a)) return true;
  const ia = ini(a), ib = ini(b);
  return ia === b || ib === a || 'u' + ia === b || 'u' + ib === a || ia + 'u' === b || ib + 'u' === a;
}
export function collegeConflict(x, y) {
  const A = schools(x), B = schools(y);
  if (!A.length || !B.length) return false;
  for (const a of A) for (const b of B) if (sameSchool(a, b)) return false;
  return true;
}
export function sameCollege(x, y) {
  const A = schools(x), B = schools(y);
  if (!A.length || !B.length) return false;
  return !collegeConflict(x, y);
}

export function contradiction(A, B) {
  if (A.sport !== B.sport) return 'sport';
  const fa = family(A.sport, A.pos), fb = family(B.sport, B.pos);
  if (fa && fb && fa !== fb) return 'position';
  if (collegeConflict(A.col, B.col)) return 'college';
  return null;
}

export const shareClub = (A, B) => A.t.some((t) => B.t.includes(t));
export const shareDecade = (A, B) => A.dec.some((d) => B.dec.includes(d));

/* 'auto' | 'ask' | 'apart' | null (unrelated, or nothing to go on). */
export function classify(A, B) {
  if (A.sport !== B.sport) return null;
  const rel = relation(A, B);
  if (!rel) return null;
  if (rel === 'two-suffixes' || rel === 'two-middles') return 'apart';
  if (!shareDecade(A, B) || !shareClub(A, B)) return null;
  if (contradiction(A, B)) return 'apart';
  if (rel === 'name') return 'auto';
  // Initials and one-letter spellings are common between strangers, so they
  // need the college as well before anybody is asked.
  if ((rel === 'initials' || rel === 'spelling') && !sameCollege(A.col, B.col)) return null;
  return 'ask';
}

/* Every pair worth classifying, without comparing all nine thousand records
   with each other: names can only relate through a shared surname, or (for a
   new surname) a shared first name and the same clubs. Returns [i, j, verdict]
   for every pair classify() has an opinion on. */
export function candidates(recs) {
  const buckets = new Map();
  const put = (k, i) => (buckets.get(k) || buckets.set(k, []).get(k)).push(i);
  recs.forEach((r, i) => {
    const p = parts(r.name); if (!p) return;
    put(r.sport + '|L|' + p.last, i);
    if (r.t.length >= 2) put(r.sport + '|F|' + p.first + '|' + r.t.slice().sort().join('/'), i);
  });
  const seen = new Set(), out = [];
  for (const ids of buckets.values()) {
    for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) {
      const i = ids[x], j = ids[y], k = i < j ? i + ',' + j : j + ',' + i;
      if (seen.has(k)) continue; seen.add(k);
      const v = classify(recs[i], recs[j]);
      if (v) out.push([Math.min(i, j), Math.max(i, j), v]);
    }
  }
  return out;
}

/* Union-find over record indices: a man can be three records (a corpus row
   twice and a roster row), and every one of them has to carry all of him. */
export function groups(n, pairs) {
  const up = Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  for (const [a, b] of pairs) { const ra = find(a), rb = find(b); if (ra !== rb) up[Math.max(ra, rb)] = Math.min(ra, rb); }
  const by = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); (by.get(r) || by.set(r, []).get(r)).push(i); }
  return [...by.values()].filter((g) => g.length > 1);
}

/* The json's key for a pair, order-free. */
export const pairKey = (sport, a, b) => sport + '|' + [norm(a), norm(b)].sort().join('|');
