/* LAB: what both front-screen prototypes share (2026-10-29). Not linked from the game, not indexed,
 * and nothing here is wired into setlist/index.html. The owner is choosing between two layouts; the
 * one picked gets built properly into the game, and this folder goes.
 *
 * It reads the game's own pieces: the band's frames from world.js, the outfits from outfits.js, and
 * last night and the next dates from goose_latest.json. Signed out, so only the first outfits are
 * open, exactly as a new player sees them.
 */
import { bandFrames, bandPose, PLAYERS } from '../world.js?v=5';
import { ROLES, OUTFITS, LADDER } from '../outfits.js?v=1';

export { ROLES, OUTFITS, LADDER, PLAYERS, bandPose };

export async function latest(){
  try {
    const r = await fetch('../data/goose_latest.json', { cache: 'no-cache' });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function daysUntil(iso){
  const d = new Date(iso + 'T12:00:00'), now = new Date();
  return Math.max(0, Math.round((d - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)) / 864e5));
}
export const shortDate = iso => { const d = new Date(iso + 'T12:00:00'); return d.toLocaleString('en-US', { month: 'short' }) + ' ' + d.getDate(); };

/* The dress being tried on. The prototype keeps it in memory only: a choice here never reaches the game. */
export const dress = { guitar: 'road', keys: 'suit', bass: 'denim', drums: 'vest' };

/* The band's frames in the current dress. Painted on the main thread: a prototype, not the game. */
let framesCache = null, framesKey = '';
export function frames(){
  const key = JSON.stringify(dress);
  if (key !== framesKey){ framesCache = bandFrames(dress); framesKey = key; }
  return framesCache;
}

/* The index of a role in world.js's PLAYERS, which is the order bandPose wants. */
export const playerIndex = role => PLAYERS.findIndex(p => p[0] === role);

/* One player, big, on their own little stage: a canvas that loops their playing frames. */
export function playerCanvas(cv, role, opts = {}){
  const k = opts.scale || 4, g = cv.getContext('2d');
  cv.width = 34 * k; cv.height = 44 * k;
  let dead = false, raf = 0;
  const i = playerIndex(role), t0 = performance.now();
  const draw = now => {
    if (dead) return;
    if (!cv.isConnected){ dead = true; return; }
    const t = (now - t0) / 1000;
    const { img, bob } = bandPose(frames(), i, t, { energy: .55, mode: role === 'keys' ? 12 : 0, bow: false });
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, (4 - bob) * k, 34 * k, 46 * k);
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return () => { dead = true; cancelAnimationFrame(raf); };
}

/* THE WARDROBE: four players, each standing over their own six outfits. Shared by both prototypes, and
   the answer to "integrate the band into where you customise their looks". */
export function wardrobeHTML(){
  return `<div class="wardrobe">${ROLES.map(r => {
    const cur = OUTFITS[r.id].find(o => o.id === dress[r.id]) || OUTFITS[r.id][0];
    return `<section class="wr-player" data-role="${r.id}">
      <div class="wr-stage"><canvas class="wr-cv" data-player="${r.id}" aria-hidden="true"></canvas></div>
      <div class="wr-meta"><span class="wr-role">${esc(r.label)}</span><span class="wr-now">${esc(cur.name)}</span></div>
      <div class="wr-chips" role="radiogroup" aria-label="What ${esc(r.label.toLowerCase())} wears">
        ${OUTFITS[r.id].map((o, i) => {
          const open = i === 0, on = o.id === cur.id, L = o.look;
          return `<button type="button" class="wr-chip${open ? '' : ' locked'}${on ? ' on' : ''}" role="radio" aria-checked="${on}"
            data-outfit="${r.id}:${o.id}" data-rung="${i}" aria-label="${esc(o.name)}${open ? '' : ', locked'}">
            <i style="background:${L.jacket || L.shirt || '#efe6cf'}"></i><i style="background:${L.pants || '#e8dec4'}"></i></button>`;
        }).join('')}
      </div>
    </section>`;
  }).join('')}</div>
  <p class="wr-say" id="wrSay">Sign in to earn new outfits. Every show you build counts.</p>`;
}
/* Wires a wardrobe already in the DOM. A locked outfit can be tried on in the lab, so the owner sees
   every look; the line under it says what it would take in the game. */
export function mountWardrobe(root, onChange){
  const stops = [];
  const start = () => { stops.splice(0).forEach(f => f());
    root.querySelectorAll('.wr-cv').forEach(cv => stops.push(playerCanvas(cv, cv.dataset.player, { scale: 3 }))); };
  start();
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-outfit]');
    if (!b) return;
    const [role, id] = b.dataset.outfit.split(':'), i = Number(b.dataset.rung);
    dress[role] = id;
    const p = b.closest('.wr-player');
    p.querySelectorAll('.wr-chip').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
    p.querySelector('.wr-now').textContent = OUTFITS[role][i].name;
    const say = root.querySelector('#wrSay');
    if (say) say.textContent = i === 0 ? 'Free for everyone.' : `Trying it on. In the game it opens when you: ${LADDER[i - 1].clue.replace(/\.$/, '').toLowerCase()}.`;
    if (onChange) onChange();
  });
  return () => stops.forEach(f => f());
}

/* Last night's setlist as the game prints it: set by set, segues marked. */
export function setlistHTML(last){
  if (!last) return '<p class="muted">Last night loads with the archive.</p>';
  return last.sets.map(s => `<div class="sl-set"><span class="sl-k">${esc(s.label)}</span><span class="sl-v">${
    s.songs.map(x => esc(x.n) + (x.s ? ' <b class="sl-seg">&gt;</b>' : ',')).join(' ').replace(/,$/, '')}</span></div>`).join('');
}
