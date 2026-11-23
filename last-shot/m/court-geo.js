/* The half court in feet, as the sim sees it. x runs 0 to 50 across the
 * floor, y runs 0 (the baseline) to 47 (half court). The rim is at
 * (25, 5.25). Standard NBA dimensions, the same ones hoops/courts.js uses. */
export const COURT = Object.freeze({
  W: 50, H: 47, RIM: { x: 25, y: 5.25 }, R3: 23.75, CORNER_X: 3, CORNER_Y: 14,
  LANE: 16, FT: 19, FTR: 6, BOARD: 4, RA: 4
});

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const toRim = p => dist(p, COURT.RIM);

/* Beyond the arc, or in either corner. */
export function isThree(p) {
  if (p.y <= COURT.CORNER_Y) return p.x <= COURT.CORNER_X || p.x >= COURT.W - COURT.CORNER_X;
  return toRim(p) >= COURT.R3;
}

/* 'rim' (inside 5 ft), 'three', or 'two' (everything else). */
export function zoneOf(p) {
  if (isThree(p)) return 'three';
  return toRim(p) <= 5 ? 'rim' : 'two';
}

export function clampToCourt(p) {
  return { x: Math.max(0.5, Math.min(COURT.W - 0.5, p.x)), y: Math.max(0.5, Math.min(COURT.H - 0.5, p.y)) };
}

/* Distance from p to the segment a-b. */
export function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
