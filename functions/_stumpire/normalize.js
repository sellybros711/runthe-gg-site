/* Stumpire text normalization. Pure functions, shared by the matcher, the
 * entity builder and the replay script, so all three agree on what a name
 * IS before anything compares two of them.
 */

const SUFFIX = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

/* British spellings that turn up in sports text, folded to American. Applied
   per token, so it never touches the inside of a surname. */
const SPELLING = {
  centre: 'center', defence: 'defense', offence: 'offense', colour: 'color',
  favourite: 'favorite', honour: 'honor', theatre: 'theater', metre: 'meter'
};

/* Accents off, case off, apostrophes and full stops dropped (O'Neal is
   oneal, C.J. is cj), ampersand to and, everything else a space. */
export function fold(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ`']/g, '')
    .replace(/\./g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/* Tokens with suffixes removed (never the only token), runs of single
   letters joined (c j stroud is cj stroud), spellings folded. */
export function tokens(s) {
  let t = fold(s).split(' ').filter(Boolean).map(w => SPELLING[w] || w);
  while (t.length > 1 && SUFFIX.has(t[t.length - 1])) t.pop();
  const out = [];
  let run = '';
  for (const w of t) {
    if (w.length === 1 && /[a-z]/.test(w)) { run += w; continue; }
    if (run) { out.push(run); run = ''; }
    out.push(w);
  }
  if (run) out.push(run);
  return out;
}

/* The generational suffix someone typed, if any: what tells Ken Griffey Jr.
   from Ken Griffey Sr. once the key has thrown it away. */
export function suffixOf(s) {
  const t = fold(s).split(' ').filter(Boolean);
  const last = t[t.length - 1];
  return t.length > 1 && SUFFIX.has(last) ? last : null;
}

/* The exact-match key: every token, no spaces. LeBron James, Lebron James
   and le bron james are one key; so are Smith-Schuster and Smith Schuster. */
export function key(s) { return tokens(s).join(''); }

/* Order free key, for "James LeBron". */
export function sortedKey(s) { return tokens(s).slice().sort().join(''); }

/* The last real token, for a surname-only answer. */
export function surname(s) { const t = tokens(s); return t.length ? t[t.length - 1] : ''; }

/* Damerau-Levenshtein (optimal string alignment) distance. */
export function editDistance(a, b) {
  const n = a.length, m = b.length;
  if (!n) return m; if (!m) return n;
  let p2 = new Array(m + 1), p1 = new Array(m + 1), cur = new Array(m + 1);
  for (let j = 0; j <= m; j++) p1[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    for (let j = 1; j <= m; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
      cur[j] = v;
    }
    const t = p2; p2 = p1; p1 = cur; cur = t;
  }
  return p1[m];
}

/* Similarity from 0 to 1 on two keys. */
export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

export function trigrams(k) {
  const s = '^' + k + '$';
  const out = new Set();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  return out;
}

export function slug(s) { return fold(s).replace(/\s+/g, '-'); }
