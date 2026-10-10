/* The page gate, as a pure function so the tests can drive it.
 *
 *   /arcade/lab/<game>/          the game's page shell
 *   /arcade/lab/admin/           the content admin (admins only)
 *   /arcade/lab/m/games/<dir>/*  that game's browser modules
 *   /arcade/lab/m/shared/*       the shared browser modules (any lab game)
 *
 * Everything is served by a Pages Function from pages.js and never as a static
 * file, so there is no other URL that hands it out. Anybody the flag and the
 * tester list refuse gets the site's 404 page with a 404 status. */
import { GAMES, accessFor } from './registry.js';
import { PAGES, MODULES } from './pages.js';

export async function pageGate(sub, uid, db) {
  const parts = String(sub || '').split('/').filter(Boolean);
  let need = null, out = null;
  let adminOnly = false;
  if (parts.length === 1 && GAMES[parts[0]]) {
    need = [GAMES[parts[0]]];
    out = { type: 'text/html; charset=utf-8', body: PAGES[parts[0]] };
  } else if (parts.length === 1 && parts[0] === 'admin') {
    need = Object.values(GAMES); adminOnly = true;
    out = { type: 'text/html; charset=utf-8', body: PAGES.admin };
  } else if (parts[0] === 'm' && MODULES[parts.slice(1).join('/')] != null) {
    const key = parts.slice(1).join('/');
    if (parts[1] === 'shared') need = Object.values(GAMES);
    else if (parts[1] === 'games') need = Object.values(GAMES).filter(g => g.dir === parts[2]);
    out = { type: 'text/javascript; charset=utf-8', body: MODULES[key] };
  }
  if (!need || !need.length || !out) return null;
  let role = null, flags = {};
  try { role = uid ? await db.role(uid) : null; flags = await db.flags(); } catch (e) { return null; }
  const allowed = adminOnly ? role === 'admin' : need.some(g => !!accessFor(role, flags[g.flag]));
  return allowed ? out : null;
}
