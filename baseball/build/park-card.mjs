#!/usr/bin/env node
/* The picture on the home page's Run The Diamond card: the game's own big league
 * park, drawn by parks.js and written out as a static SVG, so the home page shows
 * the real ballpark without loading the game's scripts.
 *
 *   node baseball/build/park-card.mjs
 *
 * Re-run it after changing how The Diamond is drawn, and bump the ?v= on the
 * <img> in index.html. */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const P = require(path.join(HERE, '..', 'parks.js'));
const html = P.markings('home', 'card', P.SKY);
const m = /<svg[\s\S]*<\/svg>/.exec(html);
if (!m) throw new Error('parks.js drew no <svg>');
const svg = m[0]
  .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
  .replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="xMidYMid slice"');
const out = path.join(HERE, '..', 'park-card.svg');
writeFileSync(out, svg);
console.log('wrote', path.relative(process.cwd(), out), svg.length, 'bytes');
