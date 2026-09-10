/*
 * test_splits.mjs - the sentence said about what everybody else did.
 *
 * splits.js has a transport half and a wording half, and only the wording half is worth
 * a test without a database: the transport is four fetch calls that all resolve null on
 * failure, and the way it goes wrong is a migration nobody ran, which no unit test can
 * see. The wording is where a real mistake lives, because every mistake here is a false
 * statement about other people shown to somebody in a screenshot.
 *
 * WHAT IS ACTUALLY BEING CHECKED
 *   * a thin sample never produces a percentage
 *   * the percentages on the screen add up to a hundred
 *   * being in the minority reads as being in the minority
 *   * a three way split does not call 34% "the minority" just because it is under half
 *   * nothing here throws on a shape the server could plausibly return
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const S = require(path.join(here, '..', '..', '..', 'commish', 'splits.js'));

let fails = 0;
const ok = (cond, what, detail) => {
  if (cond) console.log('  ok   ' + what + (detail ? '   ' + detail : ''));
  else { fails++; console.log('  FAIL ' + what + (detail ? '   ' + detail : '')); }
};
const head = (s) => console.log('\n=== ' + s + ' ===');
const split = (counts) => ({ item: 'x', total: Object.values(counts).reduce((a, b) => a + b, 0), counts });

head('a thin sample is never dressed up as a percentage');
{
  /* One vote is you. The failure this guards is the one that would ship by default: a
     naive implementation says "100% of commissioners did the same" to the first person
     who ever plays, which is true and useless and reads as broken. */
  const p1 = S.phrase(split({ a: 1 }), 'a');
  ok(p1 && p1.early === true && p1.pct === null, 'the very first ruling says nobody else has', p1 && p1.line);

  const p4 = S.phrase(split({ a: 2, b: 2 }), 'a');
  ok(p4 && p4.early === true, 'and four is still too few', p4 && p4.line);

  /* And the floor is a floor rather than a vibe: one more vote crosses it. */
  const under = S.phrase(split({ a: 4, b: 3 }), 'a');
  const over = S.phrase(split({ a: 4, b: 4 }), 'a');
  ok(under.early && !over.early, 'the line is exactly MIN_SHOW', S.MIN_SHOW + ': 7 early, 8 not');
  ok(!over.early && typeof over.pct === 'number', 'and past it there is a number', over.pct + '%');
}

head('the numbers on the screen add up');
{
  /* THREE ROWS OF ROUNDED PERCENTAGES DO NOT HAVE TO SUM TO A HUNDRED and that is fine;
     what must never happen is a row whose percentage disagrees with the same option's
     percentage in the headline. Both come off the same counts, and this is the test that
     says so. */
  const sp = split({ hold: 25, raise: 11, scrap: 5 });
  const ph = S.phrase(sp, 'raise');
  const rows = S.bars(sp, 'raise', {});
  const row = rows.find((r) => r.id === 'raise');
  ok(ph.pct === row.pct, 'the headline share is the same share as the row', ph.pct + '% both');
  ok(ph.total === 41, 'and the total is the sum of the counts', String(ph.total));
  const sum = rows.reduce((a, r) => a + r.pct, 0);
  ok(Math.abs(sum - 100) <= 2, 'the rows land on a hundred within rounding', sum + '%');
}

head('which side of the room you were on');
{
  const sp = split({ hold: 25, raise: 11, scrap: 5 });
  ok(S.phrase(sp, 'hold').stance === 'with', 'the biggest call reads as with the room');
  ok(S.phrase(sp, 'raise').stance === 'against', 'a smaller one reads as against it');
  ok(S.phrase(sp, 'scrap').rare === true, 'and the one almost nobody took is flagged rare',
    S.phrase(sp, 'scrap').line);
  ok(S.phrase(sp, 'raise').rare === false, 'while a real second place is not', '27%');

  /* A THREE WAY SPLIT IS THE CASE THIS GETS WRONG. 34% is under half, and calling it a
     minority would flag two of the three options on nearly every item in the docket as
     unusual, which would make the flag mean nothing. Stance is decided against the
     LEADER, not against 50%. */
  const even = split({ a: 34, b: 33, c: 33 });
  ok(S.phrase(even, 'a').stance === 'with' && S.phrase(even, 'a').rare === false,
    'a plurality of 34 is not a minority', '34%');
  ok(S.phrase(even, 'b').rare === false, 'and neither is 33', '33%');

  /* A dead tie for the lead is not being the odd one out. */
  const tie = split({ a: 20, b: 20 });
  ok(S.phrase(tie, 'a').stance === 'with' && S.phrase(tie, 'b').stance === 'with',
    'a dead tie puts both of you with the room');
}

head('the bars');
{
  const sp = split({ hold: 25, raise: 11, scrap: 5 });
  const rows = S.bars(sp, 'raise', { hold: 'Hold the line', raise: 'Raise the cap' });
  ok(rows.length === 3, 'every option that got a vote gets a row', String(rows.length));
  ok(rows[0].id === 'hold', 'biggest first, so an unpopular call is visibly unpopular');
  ok(rows.filter((r) => r.mine).length === 1 && rows.find((r) => r.mine).id === 'raise',
    'exactly one row is yours');
  ok(rows[0].label === 'Hold the line', 'a label the page passed in is used');
  ok(rows[2].label === 'scrap', 'and one it did not falls back to the id rather than to blank');

  /* An option nobody picked has no row, because a zero row would be drawn as an empty bar
     and read as a rendering fault. The headline still names it if it is yours, which it
     cannot be: you just picked it, so it is at least one. */
  const none = S.bars(split({ a: 5, b: 0 }), 'a', {});
  ok(none.length === 1, 'an option with no votes gets no bar', String(none.length));
}

head('nothing here throws');
{
  /* Every one of these is a shape the server could return: a project without the
     migration, a network that answered with an error page, a JSON body that parsed but
     is not what was expected. The correct answer to all of them is null, and the wrong
     answer is an exception on a screen that has already painted. */
  const junk = [null, undefined, {}, { counts: null }, { counts: {} }, 'nope', 42, [],
    { counts: { a: 'x', b: NaN } }, { total: 9, counts: { a: -3 } }];
  let threw = null;
  for (const j of junk) {
    try { S.phrase(j, 'a'); S.bars(j, 'a', {}); } catch (e) { threw = String(j) + ': ' + e.message; }
  }
  ok(!threw, 'ten malformed answers, none of them an exception', threw || String(junk.length) + ' shapes');
  ok(S.phrase({ counts: {} }, 'a').early === true, 'an empty split reads as early, not as zero percent');
  ok(S.phrase({ counts: { a: 'x', b: NaN } }, 'a').early === true,
    'and counts that are not numbers are not counted');
}

head('the batch cap matches the SQL');
{
  /* commish_splits() raises past 120 rather than truncating, so the client must not send
     121 and hope. A term is about 45 rulings, so this is headroom rather than a limit
     anybody meets. */
  ok(S.MAX_BATCH === 120, 'the client stops where the function stops', String(S.MAX_BATCH));
}

console.log('');
if (fails) { console.log(fails + ' FAILED'); process.exit(1); }
console.log('all clear');
