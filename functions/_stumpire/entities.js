/* The Stumpire dataset, loaded once per isolate. Every lookup by id goes
 * through here, so a published answer is always resolved against the same
 * records the matcher and the typeahead see. */
import DATA from './data/entities.js';

const POS_ABBR = {
  'Quarterback': 'QB', 'Running Back': 'RB', 'Fullback': 'FB', 'Wide Receiver': 'WR',
  'Tight End': 'TE', 'Offensive Lineman': 'OL', 'Offensive Tackle': 'OT', 'Guard': 'G',
  'Center': 'C', 'Defensive Lineman': 'DL', 'Defensive End': 'DE', 'Defensive Tackle': 'DT',
  'Linebacker': 'LB', 'Cornerback': 'CB', 'Safety': 'S', 'Defensive Back': 'DB',
  'Kicker': 'K', 'Place Kicker': 'K', 'Punter': 'P', 'Long Snapper': 'LS',
  'Point Guard': 'PG', 'Shooting Guard': 'SG', 'Small Forward': 'SF', 'Power Forward': 'PF',
  'Forward': 'F', 'Pitcher': 'P', 'Starting Pitcher': 'SP', 'Relief Pitcher': 'RP',
  'Catcher': 'C', 'First Baseman': '1B', 'Second Baseman': '2B', 'Third Baseman': '3B',
  'Shortstop': 'SS', 'Left Fielder': 'LF', 'Center Fielder': 'CF', 'Right Fielder': 'RF',
  'Outfielder': 'OF', 'Designated Hitter': 'DH'
};

let STORE = null;
export function setEntities(list) { STORE = index(list); return STORE; }   // tests
export function store() { return STORE || (STORE = index(DATA.entities)); }

function index(list) {
  const byId = new Map();
  for (const e of list) byId.set(e.id, e);
  return { list, byId };
}

export function posParent() { return (DATA && DATA.posParent) || {}; }

export function get(id) { return store().byId.get(id) || null; }

/* "QB · NFL · 1990s-2010s": what tells two Chris Johnsons apart. */
export function tag(e) {
  if (!e) return '';
  if (e.k === 't') return e.s + ' team' + (e.city ? ' · ' + e.city : '');
  const parts = [];
  if (e.pos) parts.push(POS_ABBR[e.pos] || e.pos);
  parts.push(e.s);
  const dc = e.dc || [];
  if (dc.length) parts.push(dc.length === 1 ? dc[0] + 's' : dc[0] + 's-' + dc[dc.length - 1] + 's');
  return parts.join(' · ');
}

export function brief(e) { return e ? { id: e.id, name: e.n, tag: tag(e) } : null; }
