/* Run The Floor's mark: an 8-bit basketball.
 *
 * Every size is a GRID of cells rather than a picture scaled down, and every grid comes
 * from the same few rules, so the 16px favicon and the 512px icon are one drawing at two
 * resolutions. logo.mjs scales a grid by a WHOLE number only: a cell that lands between
 * two screen pixels is resampled and its edges go soft, which is the one thing pixel art
 * cannot survive.
 *
 * THE GRID IS ODD, and that is the fix the first draft needed. On a 20 cell grid there is
 * no middle column, so the upright seam sat one cell right of centre and the whole ball
 * leaned. On 21 cells the seam, the level seam and the two side seams are symmetric.
 *
 * THE OUTLINE IS ONE CELL, found as the inside cells that touch the outside. A ring drawn
 * as "within a cell of the radius" comes out two cells thick on the diagonals and puts a
 * dark block in every corner.
 *
 * THE SIDE SEAMS ARE STRAIGHT WITH A STEP OUT AT EACH END, which is how a sprite artist
 * draws ")(" at this size. A curve traced from real geometry comes out as a staircase with
 * teeth, which was tried and looked worse.
 *
 * THE LIGHT IS CUT INTO DIAGONAL BANDS off the top left, never blended.
 */

export const PAL = {
  ink: '#2a1206',
  hl: '#ffc27a', lt: '#ff9e45', base: '#f07a22', mid: '#d25e16', dk: '#a8430e',
};

function ballGrid(N) {
  const c = (N - 1) / 2, R = c + 0.35;
  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N && Math.hypot(x - c, y - c) <= R;
  /* Where the side seams sit, and how far up they step out toward the rim. */
  const side = Math.round(c / 2), step1 = Math.round(c * 0.62), step2 = Math.round(c * 0.84);
  const g = [];
  for (let y = 0; y < N; y++) {
    const row = [];
    for (let x = 0; x < N; x++) {
      if (!inside(x, y)) { row.push(null); continue; }
      const dx = x - c, dy = y - c;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      const ady = Math.abs(dy);
      const s = side + (ady >= step2 ? 2 : ady >= step1 ? 1 : 0);
      if (edge || dx === 0 || dy === 0 || Math.abs(dx) === s) { row.push(PAL.ink); continue; }
      /* The bands scale with the ball, so a small ball keeps the same light. */
      const k = (dx + dy) / c;
      row.push(k < -0.95 ? PAL.hl : k < -0.4 ? PAL.lt : k > 0.95 ? PAL.dk : k > 0.5 ? PAL.mid : PAL.base);
    }
    g.push(row);
  }
  return g;
}

/* A grid as SVG, one rect per horizontal run of one colour. crispEdges keeps a cell a
   cell when the browser scales it by a whole number. */
export function toSvg(g) {
  const N = g.length, out = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N;) {
      const col = g[y][x];
      let w = 1;
      while (x + w < N && g[y][x + w] === col) w++;
      if (col) out.push(`<rect x="${x}" y="${y}" width="${w}" height="1" fill="${col}"/>`);
      x += w;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">${out.join('')}</svg>`;
}

/* The ball at N cells. 21 is the mark; 15 is the favicon, which is 16px with its one
   pixel of drop shadow. */
export const ball = (N = 21) => toSvg(ballGrid(N));
