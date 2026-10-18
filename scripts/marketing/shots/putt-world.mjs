/* Putt Putt Tour: a walk up the trail into hole --arg, in that hole's world. */
import { open, trail, walk } from './lib/putt.mjs';
export { page, hide } from './lib/putt.mjs';
export const seconds = 20;
export async function setup(page, t) { await open(page, t); await trail(page, t, parseInt(t.arg, 10)); }
export async function play(page, t) { await t.hold(400); await walk(page, t, 5200); await t.hold(300); }
