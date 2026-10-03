/* Turns the runs check-arcade-phase5.mjs records into the tier table.

   A run is one game, one tier, one width. The table has one row per tier and
   one column per thing a player of that tier meets, each counted over the runs
   where it applies (a guest cannot open a card game, so "finished" is out of
   the games a guest can play, not out of twelve). Run against main and against
   this branch, the two tables are the before and the after. */

export const COLUMNS = [
  ['open',     'Games open',                 r => true,               r => r.playable],
  ['taps',     'Taps before the first move', r => r.playable,         r => r.gateTaps, 'mean'],
  ['board',    'Board on the first screen',  r => r.playable && r.view === 375, r => r.boardOnScreen],
  ['moved',    'First move lands',           r => r.playable,         r => r.moved],
  ['resume',   'Reload resumes the game',    r => r.moved,            r => r.resumed],
  ['finished', 'Reaches the end screen',     r => r.moved,            r => r.finished],
  ['sharetx',  'Share is text first',        r => r.finished,         r => r.shareText],
  ['errors',   'Runs with a page error',     r => true,               r => r.errors > 0, 'bad'],
];

export function table(runs){
  const out = {};
  for (const tier of ['guest', 'free', 'card']) {
    const rs = runs.filter(r => r.tier === tier);
    out[tier] = {};
    for (const [key, , applies, value, kind] of COLUMNS) {
      const sub = rs.filter(applies);
      if (kind === 'mean') {
        out[tier][key] = sub.length ? +(sub.reduce((a, r) => a + (value(r) || 0), 0) / sub.length).toFixed(1) : null;
      } else {
        out[tier][key] = { yes: sub.filter(value).length, of: sub.length };
      }
    }
  }
  return out;
}

export function cell(v){
  if (v == null) return '-';
  if (typeof v === 'number') return String(v);
  return v.of ? v.yes + ' / ' + v.of : '-';
}

export function markdown(before, after){
  const head = '| | ' + ['guest', 'free', 'card'].map(t => t + ' before | ' + t + ' after').join(' | ') + ' |';
  const sep = '|' + '---|'.repeat(7);
  const rows = COLUMNS.map(([key, label]) => '| ' + label + ' | ' +
    ['guest', 'free', 'card'].map(t => cell(before && before[t][key]) + ' | ' + cell(after[t][key])).join(' | ') + ' |');
  return [head, sep, ...rows].join('\n');
}
