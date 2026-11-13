/* The result card's pieces, shared by the ladder level card, the daily card
 * and the Beat my play cards: the verdict with its stars, the star checklist,
 * and the one line summary of a run ("WON · 2 stars · 64% look").
 *
 * Each piece reads a few plain facts, so the daily card can build them from
 * the server's filed detail (no sim result on a second visit) exactly as the
 * level card builds them from a fresh run:
 *   { win, ot, p (the make chance or null), shotAt, bailout } */
import { STAR_RULES, LOOK, CLUTCH, starsOf } from './levels.js';

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

/* The verdict, the final score and the stars, side by side. */
export function verdictBlock(add, win, scoreLine, n, reduce) {
  const top = add('div', 'lvltop');
  const v = add('div', null, null, top);
  add('h2', 'verdict ' + (win ? 'win' : 'lose'), win ? 'WINNER' : 'LOSE', v);
  add('div', 'finalscore', scoreLine, v);
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
