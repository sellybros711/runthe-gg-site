/* The result card's pieces, shared by the ladder level card, the daily card
 * and the Beat my play cards: the verdict with its stars, the star checklist,
 * and the one line summary of a run ("WON · 2 stars · 64% look").
 *
 * Each piece reads a few plain facts, so the daily card can build them from
 * the server's filed detail (no sim result on a second visit) exactly as the
 * level card builds them from a fresh run:
 *   { win, ot, p (the make chance or null), shotAt, bailout } */
import { STAR_RULES, LOOK, CLUTCH, starsOf } from './levels.js?b=d720f93be5';

export const pct = p => Math.round(p * 100) + '%';

/* add(tag, cls, text, to): make an element and put it in to (or the card). */
export function adder(c) {
  return (tag, cls, text, to) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    (to || c).appendChild(e);
    return e;
  };
}

export function factsOf(res) {
  return { win: res.outcome === 'win', ot: res.how === 'ot', p: res.shot ? res.shot.p : null, shotAt: res.shotAt, bailout: !!(res.shot && res.shot.bailout) };
}
/* The daily's filed detail carries bailout (from 2026-11-13). A run filed
   before that has none, and the stars give it away: a win with an open look,
   late enough, that still missed the third star was a heave. */
export function factsOfDetail(d) {
  const win = d.outcome === 'win', p = typeof d.p === 'number' ? d.p : null;
  const late = d.shotAt != null && d.shotAt <= CLUTCH;
  return { win, ot: d.how === 'ot', p, shotAt: d.shotAt, bailout: typeof d.bailout === 'boolean' ? d.bailout : win && p != null && p >= LOOK && late && d.stars < 3 };
}

/* The scorebook box (2026-11-19): YOU | THEM, our score circled, OT under it.
   The plain line ("90-88 · OT", .finalscore) stays in it for a screen reader
   and the checks; the drawn box is aria-hidden. */
export function scoreBox(add, s, win, to) {
  const w = add('div', 'sbook ' + (win ? 'win' : 'lose'), null, to);
  add('div', 'finalscore', scoreLineOf(s.us, s.them, s.ot), w);
  const g = add('div', 'sgrid', null, w);
  g.setAttribute('aria-hidden', 'true');
  add('span', null, 'YOU', g); add('span', null, 'THEM', g);
  add('b', 'us', String(s.us), g); add('b', null, String(s.them), g);
  if (s.ot) add('i', 'sot', 'OT', w).setAttribute('aria-hidden', 'true');
  return w;
}

/* The verdict and its scorebook box on one line (they wrap on a narrow card). */
export function verdictHead(add, cls, word, win, s, to) {
  const h = add('div', 'vhead', null, to);
  const v = add('h2', 'verdict ' + cls, word, h);
  scoreBox(add, s, win, h);
  return v;
}

/* The verdict, the final score and the stars, side by side. */
export function verdictBlock(add, win, s, n, reduce) {
  const top = add('div', 'lvltop');
  verdictHead(add, win ? 'win' : 'lose', win ? 'WINNER' : 'LOSE', win, s, top);
  const st = add('div', 'stars', null, top);
  st.setAttribute('aria-label', n + ' of 3 stars');
  for (let i = 0; i < 3; i++) {
    const s = add('span', 'star' + (i < n ? ' got' : ''), '★', st);
    if (i < n && !reduce) s.style.animationDelay = (0.25 + i * 0.4) + 's';
  }
  return top;
}

/* What each star asks, ticked or crossed, with what this run did under it. */
export function checklist(add, n, f) {
  const notes = [
    f.win ? '' : f.ot ? 'Lost in overtime.' : '',
    f.p != null ? (f.p >= LOOK ? 'Your look: ' + pct(f.p) + '.' : 'Your look: ' + pct(f.p) + '. Open is ' + pct(LOOK) + '.') : 'No shot.',
    f.p != null ? (f.bailout ? 'It was a bail out.' : f.shotAt != null ? 'It went up with ' + f.shotAt.toFixed(1) + '.' : '') : ''
  ];
  const ul = add('ul', 'checks');
  STAR_RULES.forEach((r, i) => {
    const li = add('li', i < n ? 'met' : 'not', null, ul);
    add('span', 'mark', i < n ? '✓' : '✗', li);
    const t = add('span', 'ct', null, li);
    add('b', null, r, t);
    if (notes[i]) add('small', null, notes[i], t);
  });
  return ul;
}

/* "WON · 2 stars · 64% look", "LOST · 38% look", "LOST · no shot". */
export function summaryOf(res) {
  const look = res.shot ? pct(res.shot.p) + ' look' : 'no shot';
  if (res.outcome !== 'win') return 'LOST · ' + look;
  const n = starsOf(res);
  return 'WON · ' + n + (n === 1 ? ' star' : ' stars') + ' · ' + look;
}

export const scoreLineOf = (us, them, ot) => us + '-' + them + (ot ? ' · OT' : '');
/* a run's score for the box: { us, them, ot } */
export const scoreOfRun = r => ({ us: r.us, them: r.them, ot: r.how === 'ot' });
