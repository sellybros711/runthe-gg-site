/* The daily seed, shared by every Arcade Lab game, browser and server alike.
 *
 * The day is the calendar date in America/New_York, so the daily turns over at
 * midnight Eastern for everybody. seed = fnv1a(dateKey + '|' + gameId), and all
 * randomness in a sim comes from mulberry32 off that seed. Nothing here may call
 * Math.random: the server replays a run from its input log and has to land on
 * exactly the number the player saw.
 */
export const TIME_ZONE = 'America/New_York';
/* Daily #1 is this Eastern date. Only used for the number on the share line. */
export const EPOCH = '2026-10-10';

export function dateKey(nowMs) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(nowMs));
  const g = t => p.find(x => x.type === t).value;
  return g('year') + '-' + g('month') + '-' + g('day');
}

/* Day arithmetic in UTC on the date itself, so a clock change cannot floor
   two midnights into the wrong day. */
export function dayNumber(key) {
  const d = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((d(key) - d(EPOCH)) / 86400000) + 1;
}

export function prevDateKey(key) {
  const t = Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) - 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/* Milliseconds until the next Eastern midnight, for the countdown. */
export function msToNextDay(nowMs) {
  const today = dateKey(nowMs);
  let lo = nowMs, hi = nowMs + 26 * 3600000;
  while (hi - lo > 1000) { const mid = Math.floor((lo + hi) / 2); if (dateKey(mid) === today) lo = mid; else hi = mid; }
  return hi - nowMs;
}

export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function seedFor(key, gameId) { return hashStr(key + '|' + gameId); }

export function mulberry32(a) {
  a = a >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A stream keyed to one throw, so ball 4 lands the same way whatever balls
   1 to 3 did. */
export function streamFor(seed, tag) { return mulberry32((seed ^ hashStr(String(tag))) >>> 0); }
