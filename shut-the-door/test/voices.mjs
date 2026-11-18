/* Shut The Door: the voice of the ump (voices.js), the page's half of supabase/165.
 * node shut-the-door/test/voices.mjs
 *
 *   1. the script, the consent (word for word), the audio types and the limits are the server's
 *   2. the checks: audio only, not empty, at most MAX_MS, at most MAX_BYTES
 *   3. a codec or an x- type reads as its base type; a file with no type is read off its name
 *   4. the recorder takes the first type the browser can make
 *   5. every call the game makes (ui.js SFX.ump) maps to lines on the script, and only to them
 *   6. the preload plan: at most PER_LINE a line, only lines on the script, nothing invented
 *   7. the record sheet's helpers: iPhone Safari's take (audio/mp4, a codec on its type) and Chrome's
 *      (webm) both pass; a mic refusal reads as blocked, no mic, or neither; the meter's bars; the next
 *      line after a send skips the sent ones */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V = require(path.join(DIR, 'voices.js'));
const SQL = fs.readFileSync(path.join(DIR, '..', 'supabase', '165_shut_the_door_ump_voices.sql'), 'utf8');
const UI = fs.readFileSync(path.join(DIR, 'ui.js'), 'utf8');

let passes = 0, fails = 0;
function ok(c, what) { if (c) { passes++; console.log('ok    ' + what); } else { fails++; console.log('FAIL  ' + what); } }
const arr = (name) => {
  const m = new RegExp('function public\\.' + name + '\\(\\)[\\s\\S]*?array\\[([\\s\\S]*?)\\]').exec(SQL);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
};

/* 1 */
ok(JSON.stringify(arr('shutdoor_ump_lines')) === JSON.stringify(V.LINES.map((l) => l.id)), '1 the script is the server\'s, in order (' + V.LINES.length + ' lines)');
const consent = (/when 1 then '((?:[^']|'')*)'/.exec(SQL) || [])[1];
ok(consent && consent.replace(/''/g, "'") === V.CONSENT && V.CONSENT_V === 1, '1 the consent is the server\'s word for word, version 1');
ok(V.CONSENT === 'I recorded this myself. I\'m 18 or older. I give Run The Games permission to use, edit and play this recording in its games, for free and forever.', '1 the consent is the owner\'s text');
ok(JSON.stringify(arr('shutdoor_ump_mimes')) === JSON.stringify(V.MIMES), '1 the audio types are the server\'s');
ok(SQL.includes('bytes between 1 and ' + V.MAX_BYTES) && SQL.includes('duration_ms between 1 and ' + V.MAX_MS) && SQL.includes('file_size_limit = excluded') && SQL.includes(', ' + V.MAX_BYTES + ','),
  '1 the size and length caps are the table\'s and the bucket\'s (' + V.MAX_BYTES + ' bytes, ' + V.MAX_MS + ' ms)');
ok(SQL.includes('n >= ' + V.PENDING_MAX) && SQL.includes('char_length(credit) <= ' + V.CREDIT_MAX), '1 the pending limit and the credit length are the server\'s');
ok(V.LINES.map((l) => l.text).join('|') === 'Strike!|Strike three!|Ball!|Ball four, take your base!|Out!|Yer out!|Safe!|Foul ball!|Time!|Play ball!|Steee-rike!|That\'s a strike!',
  '1 the lines read as the owner wrote them');

/* 2 */
ok(V.check({ mime: 'audio/webm', bytes: 20000, ms: 1200 }) === null, '2 a short webm goes');
ok(V.check({ mime: 'video/mp4', bytes: 20000, ms: 1200 }) === 'Audio files only.', '2 a video is refused');
ok(/Too long/.test(V.check({ mime: 'audio/mp4', bytes: 20000, ms: 3400 })), '2 longer than ' + V.MAX_MS + ' ms is refused');
ok(V.check({ mime: 'audio/mp4', bytes: 20000, ms: 3030 }) === null, '2 a take stopped at ' + V.MAX_MS + ' ms (a frame over) goes');
ok(/Too big\. Keep it under 300 KB\./.test(V.check({ mime: 'audio/wav', bytes: V.MAX_BYTES + 1, ms: 1000 })), '2 bigger than the cap is refused, in KB');
ok(/empty/.test(V.check({ mime: 'audio/wav', bytes: 0, ms: 1000 })) && /empty/.test(V.check({ mime: 'audio/wav', bytes: 10, ms: 40 })), '2 an empty take is refused');

/* 3 */
ok(V.baseMime('audio/webm;codecs=opus') === 'audio/webm' && V.baseMime('audio/x-m4a') === 'audio/mp4' && V.baseMime('audio/x-wav') === 'audio/wav', '3 codecs and x- types read as their base');
ok(V.baseMime('', 'call.m4a') === 'audio/mp4' && V.baseMime('', 'call.MP3') === 'audio/mpeg' && V.baseMime('', 'call.txt') === '', '3 no type: read off the name');

/* 4 */
ok(V.recorderMime((t) => t === 'audio/mp4') === 'audio/mp4' && V.recorderMime((t) => t.startsWith('audio/webm')) === 'audio/webm;codecs=opus' && V.recorderMime(() => false) === '',
  '4 the recorder takes the first type the browser makes, else its own');
ok(V.MIMES.includes(V.baseMime(V.recorderMime(() => true))), '4 what the recorder makes is a type the server takes');

/* 5 */
const words = [...new Set([...UI.matchAll(/SFX\.ump\(([^)]*)\)/g)].flatMap((m) => [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1])))];
ok(words.length >= 8 && words.every((w) => V.linesFor(w).length > 0), '5 every call the game makes has a line (' + words.join(', ') + ')');
const ids = new Set(V.LINES.map((l) => l.id));
ok(Object.values(V.CALLS).flat().every((l) => ids.has(l)), '5 every call maps only to lines on the script');
ok(V.LINES.every((l) => Object.values(V.CALLS).flat().includes(l.id)), '5 every line on the script is played by some call');
ok(V.linesFor('nope').length === 0, '5 an unknown call has no line: silence');

/* 6 */
let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const list = [];
for (let i = 0; i < 9; i++) list.push({ id: 's' + i, line: 'strike', path: 'u/s' + i });
list.push({ id: 'b0', line: 'ball', path: 'u/b0' }, { id: 'x', line: 'not_a_line', path: 'u/x' }, { id: 'y', line: 'ball', path: null });
const p = V.plan(list, 2, rand);
ok(p.filter((c) => c.line === 'strike').length === 2 && p.filter((c) => c.line === 'ball').length === 1 && p.length === 3, '6 at most two a line, off-script and pathless rows dropped');
ok(V.plan([], 2, rand).length === 0 && V.plan(null).length === 0, '6 nothing approved: nothing fetched');

/* 7 */
const safari = V.recorderMime((t) => t === 'audio/mp4');
ok(safari === 'audio/mp4' && V.check({ mime: V.baseMime('audio/mp4;codecs=mp4a.40.2'), bytes: 24000, ms: 1800 }) === null, '7 an iPhone Safari take (audio/mp4, with a codec) goes');
ok(V.check({ mime: V.baseMime('audio/webm;codecs=opus'), bytes: 24000, ms: 1800 }) === null, '7 a Chrome take (webm) goes');
ok(/Too big/.test(V.check({ mime: 'audio/mp4', bytes: V.MAX_BYTES + 1, ms: 1800 })) && /Audio files only/.test(V.check({ mime: 'video/mp4', bytes: 2000, ms: 1800 })), '7 over the cap or not audio, either browser: refused');
ok(V.micError('NotAllowedError') === 'denied' && V.micError('SecurityError') === 'denied' && V.micError('NotFoundError') === 'none' && V.micError('AbortError') === 'other', '7 a mic refusal reads as blocked, no mic, or neither');
ok(['denied', 'none', 'other', 'cannot'].every((k) => /upload a file/i.test(V.MIC_SAY[k])), '7 every mic refusal points at the upload');
const pk = V.peaks([0, .2, .9, .1, .4, 1.5], 3);
ok(pk.length === 3 && pk[0] === .2 && pk[1] === .9 && pk[2] === 1 && V.peaks([], 5).length === 0, '7 the meter: the loudest in each slice, clamped to 1');
const all = {}; V.LINES.forEach((l) => { all[l.id] = true; });
ok(V.nextOpen({}, 0) === 1 && V.nextOpen({ strike3: true }, 0) === 2 && V.nextOpen({ strike: true }, V.LINES.length - 1) === 1 && V.nextOpen(all, 3) === -1, '7 after a send: the next line not sent yet, wrapping; none left is -1');

console.log(`\n${passes} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
