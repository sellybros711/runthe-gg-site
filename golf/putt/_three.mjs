// scratch: give holes their own three-star target (three:N in the level)
import fs from 'fs'; import { createRequire } from 'module';
const P = createRequire(import.meta.url)('./putt.js'); let src = fs.readFileSync(new URL('./putt.js', import.meta.url), 'utf8');
for (const a of process.argv.slice(2)){ const [t, n, v] = a.split(':'), L = P.TOURS[t].levels[+n - 1], f = L.f.toString().slice(9);
  const i = src.indexOf(f); const j = src.lastIndexOf('{ par:', i); const seg = src.slice(j, i);
  if (/three:/.test(seg)) src = src.slice(0, j) + seg.replace(/three:\d+/, 'three:' + v) + src.slice(i);
  else src = src.slice(0, j) + seg.replace(/\{ par:(\d+),/, '{ par:$1, three:' + v + ',') + src.slice(i);
  console.log(a, src.slice(j, j + 30)); }
fs.writeFileSync(new URL('./putt.js', import.meta.url), src);
