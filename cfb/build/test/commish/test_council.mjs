/* THE LADDER, ON ITS OWN.
 *
 *   node cfb/build/test/commish/test_council.mjs
 *
 * council.js is a pure function of one number, which makes it the cheapest thing in this
 * mode to be sure about and the most expensive to get quietly wrong: a seat order with a
 * typo in it seats nobody and the screen simply shows one fewer row, forever, with no error
 * and nothing to notice.
 *
 * The three things that would break it and never throw:
 *
 *   a seat id that is not a bloc          the row is silently never unlocked
 *   a threshold out of order              a seat opens and then closes again
 *   a curve nobody reaches                the top seat exists and no career gets there
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const ROOT = path.resolve(new URL('../../../..', import.meta.url).pathname);
const C = require(ROOT + '/cfb/commish/council.js');
const B = require(ROOT + '/cfb/commish/blocs.js');

let bad = 0;
const ok = (n, p, x) => { if (!p) bad++; console.log((p ? '  ok   ' : ' FAIL  ') + n + (x !== undefined ? '   ' + x : '')); };

console.log('\n=== every seat is a real bloc ===');
{
  const known = B.BLOCS.map((b) => b.id);
  const unknown = C.SEATS.filter((s) => known.indexOf(s) < 0);
  /* THE FAILURE THIS CATCHES IS SILENT. blindAt returns ids and the room is drawn from
     blocs.js, so a seat named "Big10" instead of "Big Ten" never matches a row: that bloc
     is readable from the first ruling and one real bloc is dark forever. Nothing throws. */
  ok('no seat names a bloc that does not exist', !unknown.length, unknown.join(', ') || 'all nine');
  ok('  and every bloc has a seat', C.SEATS.length === known.length
    && known.every((k) => C.SEATS.indexOf(k) >= 0),
    C.SEATS.length + ' seats for ' + known.length + ' blocs');
  ok('  with none of them twice', new Set(C.SEATS).size === C.SEATS.length);
}

console.log('\n=== power plays its cards closest ===');
{
  /* THE ORDER IS A RULE, NOT A TASTE. The more voting weight a bloc holds the later its seat
     opens, which is what makes the last rung worth the climb: the SEC and the Big Ten moving
     together is literally the condition that removes you. */
  const vote = {}; B.BLOCS.forEach((b) => { vote[b.id] = b.vote; });
  const weights = C.SEATS.map((s) => vote[s]);
  let monotone = true;
  for (let i = 1; i < weights.length; i++) if (weights[i] < weights[i - 1]) monotone = false;
  ok('votes never decrease as the seats go up', monotone, weights.join(' '));
  ok('  the first seats hold no vote at all', weights[0] === 0 && weights[1] === 0);
  /* The two that end a term are the two hardest to read, which is the whole design. */
  const last2 = C.SEATS.slice(-2);
  ok('  and the last two are the coalition that removes you',
    last2.indexOf('SEC') >= 0 && last2.indexOf('Big Ten') >= 0, last2.join(' and '));
}

console.log('\n=== the curve ===');
{
  ok('a brand new commissioner already has a council', C.seatsAt(0) === C.OPENING_SEATS,
    C.seatsAt(0) + ' seats at 0 rulings');
  ok('  which is enough to be a read and not the whole room',
    C.OPENING_SEATS >= 2 && C.OPENING_SEATS < C.SEATS.length);

  const rising = C.AT.every((v, i) => i === 0 ? v > 0 : v > C.AT[i - 1]);
  ok('the thresholds only go up', rising, C.AT.join(', '));
  ok('  one per seat above the opening ones',
    C.AT.length === C.SEATS.length - C.OPENING_SEATS);

  /* A SEAT MUST NEVER CLOSE. seatsAt is read on every desk and every preview, so a curve
     that dips would take an advisor away from somebody for making a ruling. */
  let never = true, prev = 0;
  for (let n = 0; n <= C.AT[C.AT.length - 1] + 20; n++) {
    const s = C.seatsAt(n);
    if (s < prev) never = false;
    prev = s;
  }
  ok('  and a seat once opened never closes again', never);

  const full = C.AT[C.AT.length - 1];
  ok('the full council is reachable inside a couple of terms', C.seatsAt(full) === C.SEATS.length
    && full <= 90, 'nine of nine at ' + full + ' rulings, about ' + (full / 35).toFixed(1) + ' terms');
  /* The fourth seat is the one that proves the ladder is moving, so it has to land inside a
     first term rather than being a thing somebody is told about and never sees. */
  ok('  and the fourth arrives inside a first term', C.AT[0] <= 12,
    'at ' + C.AT[0] + ' rulings');
}

console.log('\n=== what the screens ask it ===');
{
  ok('a council and its blind list are always the whole room',
    [0, 1, 5, 12, 30, 55, 500].every((n) =>
      C.councilAt(n).length + C.blindAt(n).length === C.SEATS.length),
    'checked at 0, 1, 5, 12, 30, 55 and 500 rulings');
  ok('  and they never name the same bloc twice',
    [0, 5, 30, 500].every((n) => {
      const both = C.councilAt(n).concat(C.blindAt(n));
      return new Set(both).size === both.length;
    }));

  const n0 = C.nextSeat(0);
  ok('a new commissioner is told what the next seat is and what it costs',
    !!n0 && n0.seat === C.OPENING_SEATS + 1 && n0.at === C.AT[0] && n0.need === C.AT[0],
    n0 ? 'seat ' + n0.seat + ' (' + n0.id + ') at ' + n0.at : 'nothing');
  ok('  and the ordinal for it is a word', /^[a-z]+$/.test(C.ORDINAL[n0.seat] || ''),
    C.ORDINAL[n0.seat]);
  ok('  every seat has one', C.SEATS.every((_, i) => /^[a-z]+$/.test(C.ORDINAL[i + 1] || '')));
  /* NULL AT THE TOP, because "your tenth seat opens at Infinity" is not a line to print. */
  ok('a full council is told there is nothing left to earn',
    C.nextSeat(C.AT[C.AT.length - 1]) === null && C.nextSeat(99999) === null);

  /* Junk in, sane out: this reads a number off localStorage and a URL. */
  ok('rubbish in the career count does not open or close seats',
    [null, undefined, NaN, -5, '3', 2.9].every((v) => {
      const s = C.seatsAt(v);
      return s >= C.OPENING_SEATS && s <= C.SEATS.length;
    }), 'null, undefined, NaN, -5, "3" and 2.9 all seat a legal council');
}

console.log(bad ? '\n' + bad + ' FAILED' : '\nall clear');
process.exit(bad ? 1 : 0);
