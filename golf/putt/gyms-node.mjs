/* golf/putt/gyms-node.mjs: the trail gyms in node. gyms.js (the registry) and every kind file in gymkinds/ run in one
   sandbox, the way the page runs them, and the registry comes back (RTT_PUTT_GYMS). check-putt.mjs and econ-sim.mjs
   load the gyms through this, so a new kind file is in both the moment it exists. */
import fs from 'node:fs';
import vm from 'node:vm';
export const KIND_DIR = new URL('./gymkinds/', import.meta.url);
export function kindFiles(){ return fs.readdirSync(KIND_DIR).filter(f => f.endsWith('.js')).sort(); }
export function loadGyms(){ const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('./gyms.js', import.meta.url), 'utf8'), ctx, { filename:'gyms.js' });
  for (const f of kindFiles()) vm.runInContext(fs.readFileSync(new URL(f, KIND_DIR), 'utf8'), ctx, { filename:'gymkinds/' + f });
  return ctx.RTT_PUTT_GYMS; }
