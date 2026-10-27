/* THE ROOM BUILDER, off the main thread.
 *
 * Building a room is a second or two of work on a phone, and on the main thread it froze the page as
 * the lights went down. Here the same code (world.js) draws the room into OffscreenCanvases and hands
 * the pictures back as ImageBitmaps, which cost the page nothing to receive. stage.js falls back to
 * building on the main thread if this worker cannot start or answers with an error.
 */
import { buildWorld, rigFor, bandFrames } from './world.js?v=3';

self.onmessage = async e => {
  const { id, vid, seed, kind } = e.data;
  try {
    // The menus only want the band: their frames, nothing of a room.
    if (kind === 'band'){
      const moved = [];
      const map = v => v instanceof OffscreenCanvas ? (b => (moved.push(b), b))(v.transferToImageBitmap())
        : Array.isArray(v) ? v.map(map) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, map(x)]));
      self.postMessage({ id, frames: map(bandFrames()) }, moved);
      return;
    }
    // The rooms are 80KB, so they are fetched only for a room, never for the menu's band.
    const { ROOMS, RIGS } = await import('./rooms.js?v=3');
    const R = ROOMS[vid] || ROOMS.lawn;
    const W = buildWorld(R, rigFor(R, RIGS), seed, true);
    const moved = [];
    const bm = c => { const b = c.transferToImageBitmap(); moved.push(b); return b; };
    // The band's frames keep their shape: a list per player, and the keys player's lists by station.
    const map = v => v instanceof OffscreenCanvas ? bm(v)
      : Array.isArray(v) ? v.map(map) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, map(x)]));
    // The crowd's sprites come too, so nobody in the crowd is painted mid-song on the main thread.
    self.postMessage({ id, back: bm(W.back), front: bm(W.front), frames: map(W.frames), crowd: map(W.crowd) }, moved);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
