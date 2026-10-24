// A CLOSE OR BACK BUTTON IS NEVER UNDER THE PHONE'S TOP. The owner, 2026-10-18: the Haunted Links close sat
// at top:14px of a full screen overlay, under the clock and the notch on an iPhone, and could not be tapped.
// The page is viewport-fit=cover, so a full screen layer starts at the very top of the glass. Any close or
// back control pinned near the top of one must add env(safe-area-inset-top).
//
// This reads every CSS rule in the golf page and the Putt Putt files. A rule for a close or back control
// that is position fixed or absolute with a top in px, and no safe-area-inset-top, fails, unless it is in
// INSIDE below: a control inside a card or a box that never reaches the top of the screen.
//
//   node golf/check-safe-top.mjs
import fs from 'fs';
import path from 'path';

const root = path.dirname(new URL(import.meta.url).pathname);
const files = ['index.html', ...fs.readdirSync(path.join(root, 'putt')).filter(f => f.endsWith('.js')).map(f => 'putt/' + f)];
const INSIDE = {
};
const CONTROL = /(^|[\s>.#-])(x|close|closb|back|bk|leave|exit|quit)(?![\w-])/i;
let bad = 0, seen = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decl = m[2];
    if (!/position:\s*(fixed|absolute)/.test(decl) || !/(^|;)\s*top:\s*(-?\d+(\.\d+)?px|calc|max|min)/.test(decl)) continue;
    for (let sel of m[1].split(',')) {
      sel = sel.replace(/^[\s\S]*['"`;]/, '').trim();
      const last = sel.split(/\s+|>/).filter(Boolean).pop() || '';
      if (sel.includes("::")) continue;
      if (!CONTROL.test(last.replace(/:[\w-]+(\([^)]*\))?/g, ''))) continue;
      seen++;
      if (/safe-area-inset-top/.test(decl) || INSIDE[sel]) continue;
      bad++;
      const line = src.slice(0, m.index + m[0].indexOf(m[1].trim())).split('\n').length;
      console.log(`FAIL golf/${f}:${line}  ${sel}  { ${decl.trim().slice(0, 90)} }`);
    }
  }
}
console.log(bad ? `${bad} close or back control(s) can sit under the phone's top. Add env(safe-area-inset-top,0px) to top.` : `ok  ${seen} close and back controls pinned to the top all clear the phone's top`);
process.exit(bad ? 1 : 0);
