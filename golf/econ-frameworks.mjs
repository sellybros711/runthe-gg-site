/* Three boost frameworks for Run The Tour, each built around the boosts frozen on 2026-10-16.
 *
 *   node golf/econ-audit.mjs --json /tmp/econ.json
 *   node golf/econ-frameworks.mjs /tmp/econ.json OUTDIR     writes OUTDIR/fw-A.json, fw-B.json, fw-C.json
 *                                                          (econ-sim.mjs --framework reads them) and
 *                                                          OUTDIR/frameworks.json, every item's row
 *
 * The owner's boost rule: nothing frozen is lowered, removed, moved or re-statted. A framework says what an
 * item SHOULD carry; an item below that gets the difference added (on the stats the table names for a new
 * boost, on its own strongest stat for a raise), an item at or above it stays exactly as it is and is marked.
 *
 * Power is counted as the item's POSITIVE points: a downside is the item's trade-off, not a discount.
 *
 * Kept as they are in every framework, because the owner already ruled on them (the code says so):
 *   - colours and patterns are cosmetic, bar the lore-unlocked heritage prints (+1 each, already there);
 *   - a Tour Pass piece carries no boost, so the pass never sells power;
 *   - the sixteen card pieces (nameplates, backdrops) and skins are worn on the card, not the golfer.
 */
import fs from 'node:fs';
import path from 'node:path';

// the stats a NEW boost goes on, item by item, from what the item is (primary first)
const STATS = {
  hw: { tweed: ['app', 'clu'], straw: ['scr', 'clu'], laurel: ['clu', 'app'], backwards: ['clu', 'scr'], pirate: ['scr', 'bnk'],
    grad: ['app', 'acc'], witch: ['put', 'sht'], reaperhood: ['clu', 'put'], elf: ['sht', 'scr'], antlers: ['dist', 'acc'],
    football: ['dist', 'clu'], floppy: ['acc', 'scr'], knight: ['clu', 'bnk'], turkey: ['scr', 'sht'], cap: ['clu'] },
  ew: { prismshades: ['app', 'put'], goldshades: ['clu', 'app'], beach: ['acc', 'scr'], eyeblack: ['clu', 'dist'], wayfarer: ['app', 'clu'],
    sport: ['acc', 'dist'], cateye: ['put', 'app'], readers: ['put'], rose: ['clu', 'put'], steampunk: ['app', 'sht'], cyber: ['acc', 'app'],
    patriot: ['clu', 'acc'], groucho: ['scr', 'sht'], diamond: ['clu', 'put'] },
  ball: { featherie: ['sht', 'scr'], comet: ['app', 'sht'], red: ['clu'], neon: ['dist', 'app'], marble: ['put', 'app'], eight: ['scr', 'bnk'],
    gold: ['app', 'put'], frost: ['acc', 'sht'], obsidian: ['dist', 'scr'], flamingo: ['sht', 'scr'], ghost: ['scr', 'bnk'], eyeball: ['app', 'put'],
    snowball: ['sht', 'bnk'], pigskin: ['dist', 'scr'], rungames: ['app', 'scr'], cranberry: ['sht', 'bnk'], blackcat: ['scr', 'bnk'] },
  cleats: { saddle: ['acc'], sunday: ['clu', 'acc'], neon: ['dist', 'acc'], golden: ['acc', 'bnk'], rocket: ['dist', 'acc'], phantom: ['bnk', 'acc'],
    bone: ['bnk', 'sht'], rungames: ['acc', 'dist'] },
  top: { cardigan: ['clu', 'app'], blazer: ['clu', 'put'], cape: ['clu', 'scr'], duckfloatie: ['scr', 'bnk'] },
  leg: { plusfours: ['acc', 'app'] },
};
// the collections, one stat each, so the eight cover the eight stats (framework B)
const SETS = { drop1: 'acc', drop2: 'clu', rungames: 'app', summer: 'scr', spooky: 'put', winter: 'sht', harvest: 'bnk', biggame: 'dist' };

const LADDER = { accessory: { common: 1, rare: 2, epic: 3, legendary: 4 }, club: { common: 1, rare: 3, epic: 4, legendary: 5 }, putter: { common: 1, rare: 2, epic: 3, legendary: 4 } };
const kindOf = (cat) => cat === 'club' ? 'club' : cat === 'putter' ? 'putter' : 'accessory';
const pos = (b) => b ? Object.values(b).filter((x) => x > 0).reduce((a, x) => a + x, 0) : 0;
const earned = (r) => r.src.some((s) => s.startsWith('collection') || s === 'built in Putt Putt') || (r.cat === 'ball' && r.id === 'blackcat');
const isPass = (r) => r.rarity === 'pass' || r.src.some((s) => s.startsWith('pass'));
const limited = (r) => !!r.window;   // a themed drop: on sale one month a year

export const FRAMEWORKS = {
  A: { name: 'A. One ladder by rarity', slots: ['hw', 'ew', 'pat', 'putter', 'club', 'ball', 'cleats'], skillCap: 5, totalCap: 20,
    blurb: 'Every rarity has a power budget: an accessory is worth 1, 2, 3 or 4 points from common to legendary, a club set 1, 3, 4 or 5. Balls and cleats become boost slots, and their boosts go to the stats gear barely touches today (bunker, short game, accuracy). Caps stay at +5 a stat and +20 in all.',
    target(r) { const L = LADDER[kindOf(r.cat)]; return L[r.rarity] || (earned(r) ? L.rare : 0); } },
  B: { name: 'B. The ladder, plus collection sets', slots: ['hw', 'ew', 'pat', 'putter', 'club'], skillCap: 5, totalCap: 20, sets: SETS, setCap: 8,
    blurb: 'The same ladder on the slots that count today (headwear, eyewear, putters, clubs). On top, each finished collection is worth +1 on its own stat for good, one stat per collection so the eight cover all eight, outside the gear caps. The seasonal drops, the hardest things in the game, become the thing to finish.',
    target(r) { if (!['hw', 'ew', 'putter', 'club'].includes(r.cat)) return 0; const L = LADDER[kindOf(r.cat)]; return L[r.rarity] || (earned(r) ? L.rare : 0); } },
  C: { name: 'C. Boosts scale with how hard an item is to get', slots: ['hw', 'ew', 'pat', 'putter', 'club', 'ball', 'cleats', 'top', 'leg'], skillCap: 6, totalCap: 26,
    blurb: 'The ladder, plus one for an item on sale only one month a year, plus one for an item that can only be earned (built in Putt Putt, a collection reward, a hunt prize). Balls, cleats, outerwear and legwear count. Caps rise to +6 a stat and +26 in all, so a stat can reach 105.',
    target(r) { const L = LADDER[kindOf(r.cat)]; let t = L[r.rarity] || (earned(r) ? L.epic : 0); if (!t) return 0; if (limited(r)) t++; if (earned(r)) t++; return t; } },
};

function addFor(r, need) {
  const add = {};
  if (r.boost && pos(r.boost) > 0) { const top = Object.keys(r.boost).filter((k) => r.boost[k] > 0).sort((a, b) => r.boost[b] - r.boost[a])[0]; add[top] = need; return add; }
  const st = (STATS[r.cat] || {})[r.id]; if (!st) return null;
  const p = st.length > 1 ? Math.ceil(need / 2) : need; add[st[0]] = p; if (st.length > 1 && need - p > 0) add[st[1]] = need - p;
  return add;
}

export function buildFramework(E, key) {
  const F = FRAMEWORKS[key]; const rows = []; const boost = {};
  for (const r of E.items) {
    if (!F.slots.includes(r.cat) && !(r.boost)) continue;
    const kept = isPass(r) ? 'Tour Pass piece: no power (owner)' : r.cat === 'pat' ? 'pattern: heritage +1 only (owner)' : r.src.includes('free') ? 'free to every player' : null;
    const now = pos(r.boost);
    const target = kept ? now : F.target(r);
    let add = null, mark = '';
    if (!kept && target > now) { add = addFor(r, target - now); if (add) boost[r.key] = add; else mark = 'no stats named'; }
    else if (!kept && now > target && target > 0) mark = 'above target, kept';
    else if (kept) mark = kept;
    rows.push({ key: r.key, cat: r.cat, name: r.name, rarity: r.rarity, drop: r.drop, src: r.src.join('; '), now: r.boost || null, nowPts: now, target, add, mark });
  }
  return { key, name: F.name, blurb: F.blurb, slots: F.slots, skillCap: F.skillCap, totalCap: F.totalCap, sets: F.sets || null, setCap: F.setCap || 0, boost, rows };
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const E = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
  const all = {};
  for (const k of Object.keys(FRAMEWORKS)) { const fw = buildFramework(E, k); all[k] = fw;
    fs.writeFileSync(path.join(out, 'fw-' + k + '.json'), JSON.stringify({ boost: fw.boost, slots: fw.slots, skillCap: fw.skillCap, totalCap: fw.totalCap, sets: fw.sets, setCap: fw.setCap }, null, 1));
    const n = Object.keys(fw.boost).length, pts = Object.values(fw.boost).reduce((a, b) => a + pos(b), 0);
    console.log(fw.name + ': ' + n + ' items gain ' + pts + ' points; ' + fw.rows.filter((r) => r.mark === 'above target, kept').length + ' sit above their target and stay');
  }
  fs.writeFileSync(path.join(out, 'frameworks.json'), JSON.stringify(all, null, 1));
}
