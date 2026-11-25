/* Run The Course: where a course is kept.
 *
 * SIGNED IN, THE SERVER OWNS THE COURSE. The page files one shift when it
 * ends (its number, its command log, its checksum). The server re-runs the
 * shift with the same sim and keeps its own numbers, so cash, stars and
 * unlocks are never the page's word. Nothing is sent on a timer, a frame or a
 * poll, and a shift that is already filed is never sent again.
 *
 * LOCAL FIRST. The course and any unfiled shifts are in localStorage, so a
 * guest can play, a dropped connection loses nothing, and a refresh mid-shift
 * starts that same day again (its seed comes from the course).
 *
 * A GUEST'S COURSE IS CLAIMED ON SIGN IN. Unfiled shifts are kept in order,
 * up to QUEUE_MAX. When the account has no course yet, they are filed one by
 * one and the server replays each. An account that already has a course
 * keeps it: the server's copy wins.
 *
 * A day played with a debug tool is never saved, here or anywhere. */
import { newCourse, migrateCourse } from './sim.js?v=3';

export const KEY = 'rtc_course_v1';
export const QUEUE_MAX = 30;

export function createStore({ cfg, map, api = '/api/course/', fetchFn, storage, auth, randomSeed }) {
  const doFetch = fetchFn || ((u, o) => fetch(u, o));
  const ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const seed = randomSeed || (() => (crypto.getRandomValues(new Uint32Array(1))[0] | 0));
  let mem = null, busy = null;
  const fresh = () => ({ course: newCourse(cfg, map, seed()), queue: [], uid: null, lost: false });
  function read() {
    if (mem) return mem;
    let d = null;
    try { d = JSON.parse(ls.getItem(KEY)); } catch (e) { d = null; }
    if (!d || !Array.isArray(d.queue) || !migrateCourse(d.course, cfg)) d = fresh();
    return (mem = d);
  }
  function write() { try { ls.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* a browser that will not save keeps the session in memory */ } }
  const who = () => { const s = auth && auth(); return s && s.token ? s : null; };
  async function call(path, body) {
    const s = who();
    if (!s) return null;
    try {
      const r = await doFetch(api + path, { method: body ? 'POST' : 'GET', cache: 'no-store',
        headers: body ? { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' } : { Authorization: 'Bearer ' + s.token },
        body: body ? JSON.stringify(body) : undefined });
      let j = null;
      try { j = await r.json(); } catch (e) { j = null; }
      return { status: r.status, body: j };
    } catch (e) { return null; }
  }
  /* File the queue, oldest first. Stops at the first shift that will not go. */
  async function drain(d) {
    while (d.queue.length) {
      const q = d.queue[0], r = await call('shift', q);
      if (!r) return 'offline';
      if (r.status === 200 && r.body && r.body.course) { d.queue.shift(); if (!d.queue.length) d.course = r.body.course; write(); continue; }
      if (r.status === 409 && r.body && r.body.course) { d.queue = []; d.course = r.body.course; write(); return 'server'; }
      if (r.status === 401) return 'signedout';
      /* a shift the server will not run (an old version, a bad log): drop the queue, take the server's course */
      d.queue = []; write();
      const s = await call('state?seed=' + d.course.seed);
      if (s && s.status === 200 && s.body && s.body.course) { d.course = s.body.course; write(); }
      return 'refused';
    }
    return 'saved';
  }
  function once(fn) { if (busy) return busy; busy = fn().finally(() => { busy = null; }); return busy; }

  return {
    course() { return read().course; },
    pending() { return read().queue.length; },
    /* On load and on a change of account: take the account's course, or claim the guest's. */
    sync() {
      return once(async () => {
        let d = read();
        const s = who();
        if (!s) return 'guest';
        if (d.uid && d.uid !== s.userId) { mem = d = fresh(); write(); }      // another account's copy is never used
        const r = await call('state?seed=' + d.course.seed);
        if (!r) return 'offline';
        if (r.status !== 200 || !r.body || !r.body.course) return r.status === 401 ? 'signedout' : 'offline';
        const server = r.body.course;
        const mine = d.uid === s.userId || (d.uid == null && !d.lost && server.shiftsFiled === 0 && server.seed === d.course.seed);
        d.uid = s.userId;
        if (d.queue.length && mine && d.queue[0].no === server.shiftsFiled + 1) { write(); return drain(d); }
        d.queue = []; d.course = server; d.lost = false; write();
        return 'saved';
      });
    },
    /* A shift just ended. Keep it, and file it if somebody is signed in. */
    finish(end, log, debug) {
      if (debug) return Promise.resolve('debug');
      const d = read();
      d.course = end.course;
      d.queue.push({ no: end.result.no, v: end.result.v, checksum: end.result.checksum, log });
      if (d.queue.length > QUEUE_MAX) { d.queue = []; d.lost = true; }
      write();
      if (!who()) return Promise.resolve('device');
      return once(() => drain(d));
    },
    reset() { mem = fresh(); write(); return mem.course; }
  };
}
