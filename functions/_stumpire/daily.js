/* Choosing a day's slate from the prompt pool, so the game can run without
 * an editor publishing by hand every night.
 *
 * Every prompt is tried at every at-bat; a prompt is a candidate for a slot
 * only if it passes every rule there (the ramp, the bands, the coverage, the
 * wildcard). Then five are chosen in at-bat order with the slate rules held
 * (every league, none over two, one team prompt at most), preferring prompts
 * not used in the last RECENT_DAYS. The order is shuffled by the date, so a
 * date always gives the same slate and a re-run is a no-op. */
import { CONFIG } from './config.js';
import { previewPrompt, buildSlate } from './publish.js';

function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function slotFit(pool, searchAvg, date) {
  const fit = [];
  for (let slot = 0; slot < CONFIG.AT_BATS; slot++) {
    fit[slot] = pool.filter(d => {
      try { return !previewPrompt(d, slot, searchAvg, {}, { seed: date, autoWildcard: true }).check.errors.length; }
      catch (e) { return false; }
    });
  }
  return fit;
}

export function chooseSlate(pool, searchAvg, date, recent = new Set()) {
  const fit = slotFit(pool, searchAvg, date);
  const order = slot => fit[slot].slice().sort((a, b) => hash(date + slot + a.id) - hash(date + slot + b.id));
  const tryPass = avoidRecent => {
    const pick = [];
    const go = slot => {
      if (slot === CONFIG.AT_BATS) {
        const leagues = new Set(pick.map(p => p.league));
        return CONFIG.LEAGUES.every(l => leagues.has(l));
      }
      for (const d of order(slot)) {
        if (pick.some(p => p.id === d.id)) continue;
        if (avoidRecent && recent.has(d.id)) continue;
        if (pick.filter(p => p.league === d.league).length >= CONFIG.LEAGUE_MAX_PER_SLATE) continue;
        if (d.type === 'team' && pick.some(p => p.type === 'team')) continue;
        pick.push(d);
        if (go(slot + 1)) return true;
        pick.pop();
      }
      return false;
    };
    return go(0) ? pick : null;
  };
  const defs = tryPass(true) || tryPass(false);
  if (!defs) return { ok: false, errors: ['no five prompts in the pool pass every rule together'], fit: fit.map(f => f.length) };
  const built = buildSlate(defs, searchAvg, () => ({}), { seed: date, autoWildcard: true });
  return { ...built, fit: fit.map(f => f.length) };
}
