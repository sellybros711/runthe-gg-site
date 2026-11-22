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
 *      line after a send skips the sent ones
 *   8. the way through the script: a send goes on to the next open line and never wraps; the last
 *      line's send, or a send with every later line sent, is the end screen; Skip moves one on and on
 *      the last line is Finish; twelve skips reach the end and send nothing (the browser check holds
 *      that umpSubmit is called zero times, test/check-browser.mjs 19)
 *   9. one voice an outing (the owner, 2026-11-19): a clip's voice is its uploader's folder; the pick
 *      prefers a voice that covers every line, else the most lines; it is the same for the same
 *      outing id and can differ between outings; the plan fetches only that voice's clips
 *  10. sound.js in a stand-in audio world: a call plays only the outing's voice; a line it lacks, or
 *      no voice yet, falls to the game's own ump (silent), never another voice's clip; across many
 *      outings no outing ever hears two voices
 *  11. the review sheet's filters: a person is the row's username (a rejected row too, with no path),
 *      else its voice; Person and Call filter together; with a person picked, script order; how many
 *      lines a person has live comes from the Live rows */
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

/* 8 */
const N = V.LINES.length, sentAll = (upto) => { const o = {}; V.LINES.forEach((l, i) => { if (i <= upto) o[l.id] = true; }); return o; };
ok(V.afterSend({ strike: true }, 0) === 1 && V.afterSend({ strike: true, strike3: true, ball: true }, 0) === 3, '8 after a send: the next line not sent yet');
ok(V.afterSend({ [V.LINES[N - 1].id]: true }, N - 1) === -1, '8 the last line sent: the end screen, even with earlier lines open');
ok(V.afterSend(sentAll(N - 1), 4) === -1 && V.afterSend({ strike: true, ...Object.fromEntries(V.LINES.slice(6).map((l) => [l.id, true])) }, 5) === -1,
  '8 every later line already sent: the end screen, never a wrap back');
ok(V.afterSkip(0) === 1 && V.afterSkip(N - 2) === N - 1 && V.afterSkip(N - 1) === -1, '8 Skip moves one on; on line ' + N + ' it is Finish');
{ let i = 0, taps = 0; while (i >= 0 && taps < 50) { i = V.afterSkip(i); taps++; } ok(taps === N && i === -1, '8 ' + N + ' taps of Skip and Finish reach the end screen (' + taps + ')'); }

/* 9 */
const clip = (u, line, n) => ({ id: u + line + (n || ''), line, path: u + '/' + line + (n || '') + '.webm' });
const full = (u) => V.LINES.map((l) => clip(u, l.id));
ok(V.voiceOf({ path: 'abc-123/x.webm' }) === 'abc-123' && V.voiceOf({ path: 'x.webm' }) === null && V.voiceOf({ path: 'a/b/c.webm' }) === null && V.voiceOf(null) === null,
  '9 a clip\'s voice is its uploader\'s folder; anything else has none');
const part = (u, k) => V.LINES.slice(0, k).map((l) => clip(u, l.id));
const mix = [...part('ann', 5), ...full('bob'), ...part('cat', 11), ...full('dee'), { id: 'z', line: 'not_a_line', path: 'zed/z.webm' }, { id: 'q', line: 'strike', path: null }];
const picks = new Set();
for (let o = 0; o < 200; o++) picks.add(V.pickVoice(mix, 'outing-' + o));
ok([...picks].sort().join() === 'bob,dee', '9 a voice that covers all ' + N + ' lines is preferred, and either full voice can be picked (' + [...picks].sort().join() + ')');
ok(V.pickVoice(mix, 'outing-7') === V.pickVoice(mix, 'outing-7') && V.pickVoice([...mix].reverse(), 'outing-7') === V.pickVoice(mix, 'outing-7'),
  '9 the same outing id picks the same voice, whatever the list\'s order');
const short = [...part('ann', 5), ...part('cat', 11), ...part('eve', 11).slice(1), clip('ann', 'strike', 2)];
ok(new Set(Array.from({ length: 100 }, (_, o) => V.pickVoice(short, 'o' + o))).size === 1 && V.pickVoice(short, 'x') === 'cat',
  '9 nobody covers every line: the voice with the most lines (cat, 11), never a pair');
ok(V.pickVoice([], 'x') === null && V.pickVoice(null, 'x') === null && V.pickVoice([{ line: 'strike', path: 'nofolder.webm' }], 'x') === null, '9 nothing live: no voice');
const many = [...full('bob'), clip('bob', 'strike', 2), clip('bob', 'strike', 3), ...full('dee')];
const pb = V.plan(many, 2, rand, 'bob');
ok(pb.length === N + 1 && pb.every((c) => V.voiceOf(c) === 'bob') && pb.filter((c) => c.line === 'strike').length === 2, '9 the plan fetches only the outing\'s voice, at most two a line');

/* 10 */
{
  const vm = await import('node:vm');
  const played = [], listeners = {};
  class Node { connect() {} }
  class Param { constructor() { this.value = 1; } setValueAtTime() {} setTargetAtTime() {} cancelScheduledValues() {} exponentialRampToValueAtTime() {} }
  class FakeAC {
    constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000; this.destination = new Node(); }
    createDynamicsCompressor() { const n = new Node(); ['threshold', 'knee', 'ratio', 'attack', 'release'].forEach((k) => { n[k] = new Param(); }); return n; }
    createGain() { const n = new Node(); n.gain = new Param(); return n; }
    createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
    createBufferSource() { const n = new Node(); n.start = () => played.push(n.buffer.id); return n; }
    decodeAudioData(b, ok) { ok({ id: new TextDecoder().decode(b), duration: 0.8 }); }
    resume() {}
  }
  const win = { AudioContext: FakeAC };
  const sandbox = { window: win, navigator: {}, Math, Date, Promise, setTimeout, TextDecoder, Uint8Array, Float32Array,
    document: { hidden: false, addEventListener: (e, f) => { (listeners[e] = listeners[e] || []).push(f); }, removeEventListener() {} },
    fetch: (url) => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(url).buffer) }) };
  win.STD_VOICES = V;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'sound.js'), 'utf8'), sandbox);
  const S = win.STD_SFX;
  listeners.pointerdown.forEach((f) => f());
  const settle = () => new Promise((r) => setTimeout(r, 20));
  /* bob has every line but foul; dee has every line */
  const urlOf = (c) => 'https://x/' + c.path;
  const live = [...full('bob').filter((c) => c.line !== 'foul'), ...full('dee')];
  const hand = (v) => S.umpClips(V.plan(live, 2, rand, v).map((c) => ({ line: c.line, url: urlOf(c), voice: v })));
  hand('bob'); hand('dee');
  for (let k = 0; k < 40; k++) await settle();
  const who = (id) => /^https:\/\/x\/([^/]+)\//.exec(id)[1];
  S.umpUse(null); S.ump('strike');
  ok(played.length === 0, '10 no voice picked yet: the call is the game\'s own ump (silent), no player\'s clip');
  S.umpUse('bob'); for (let k = 0; k < 30; k++) ['strike', 'k', 'ball', 'out', 'safe', 'time', 'play'].forEach((w) => S.ump(w));
  ok(played.length > 0 && played.every((id) => who(id) === 'bob'), '10 an outing with bob\'s voice plays only bob (' + played.length + ' calls)');
  const before = played.length; S.ump('foul');
  ok(played.length === before, '10 a line bob lacks (foul ball) falls to the game\'s own ump, never dee\'s clip');
  played.length = 0; S.umpUse('dee'); S.ump('foul'); S.ump('strike');
  ok(played.length === 2 && played.every((id) => who(id) === 'dee'), '10 the next outing\'s voice (dee) answers its own calls, foul ball too');
  /* many outings, each through the page's own pick: one voice each */
  let mixed = 0;
  for (let o = 0; o < 60; o++) {
    played.length = 0;
    S.umpUse(V.pickVoice(live, 'run-' + o));
    for (let k = 0; k < 12; k++) ['strike', 'ball', 'foul', 'out', 'k'].forEach((w) => S.ump(w));
    if (new Set(played.map(who)).size > 1) mixed++;
  }
  ok(mixed === 0, '10 sixty outings, never two voices in one');
}

/* 11 */
{
  const row = (u, line, st, at, p) => ({ id: u + line + st, username: u, line, status: st, createdAt: at, path: p === undefined ? 'f-' + u + '/' + line + '.wav' : p });
  const rows = [row('rae', 'safe', 'pending', '3'), row('rae', 'strike', 'pending', '2'), row('rae', 'thats_a_strike', 'pending', '1'), row('rae', 'ball4', 'rejected', '0', null),
    row('mike', 'strike', 'pending', '5'), row(null, 'out', 'pending', '6'), { id: 'z', line: 'out', path: null }];
  const ps = V.people(rows);
  ok(JSON.stringify(ps.map((p) => p.label + ':' + p.n)) === JSON.stringify(['@mike:1', '@rae:4', 'No username:1', 'No username (f-null):1']),
    '11 a person is the username, a rejected row too; no username falls to the voice, then to none (' + ps.map((p) => p.label + ':' + p.n).join(', ') + ')');
  ok(V.filterRows(rows, 'all', 'all').length === rows.length && V.filterRows(rows, 'all', 'all')[0].line === 'safe', '11 All and All: every row, in the list\'s own order');
  ok(V.filterRows(rows, 'u:rae', 'all').map((x) => x.line).join() === 'strike,ball4,safe,thats_a_strike', '11 a person picked: their rows in script order');
  ok(V.filterRows(rows, 'all', 'strike').map((x) => x.username).join() === 'rae,mike', '11 a call picked: that line from everyone');
  ok(V.filterRows(rows, 'u:rae', 'strike').length === 1 && V.filterRows(rows, 'u:mike', 'safe').length === 0, '11 the two filters together');
  const liveRows = [...V.LINES.map((l) => row('mike', l.id, 'approved', '1')), row('rae', 'strike', 'approved', '1'), row('rae', 'strike', 'approved', '2'), row('rae', 'nope', 'approved', '3')];
  ok(Object.keys(V.liveLinesOf(liveRows, 'u:mike')).length === N && Object.keys(V.liveLinesOf(liveRows, 'u:rae')).length === 1 && Object.keys(V.liveLinesOf(liveRows, 'u:nobody')).length === 0,
    '11 lines live: mike ' + N + ' of ' + N + ', rae 1 (two takes of one line, an off-script line not counted), nobody 0');
}

console.log(`\n${passes} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
