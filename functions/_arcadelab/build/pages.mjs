#!/usr/bin/env node
/* Write functions/_arcadelab/pages.js: every game's page shell and every
 * browser module, as strings. They are served by a Pages Function behind the
 * tester gate, never as static files. After editing web/*.html or any browser
 * module:
 *
 *   node functions/_arcadelab/build/pages.mjs
 *
 * test/pages.test.mjs fails if pages.js has drifted from the sources. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

/* What the browser may load. Server files (api, db, registry, gate, content) are not here. */
import { GAMES } from '../registry.js';
const SHARED = ['shared/seed.js', 'shared/gems.js', 'shared/share.js', 'shared/kit.js', 'shared/dmath.js', 'shared/replay.js', 'shared/app.js'];
const GAME_FILES = { pinball: ['names.js'] };
export const MODULE_FILES = [...SHARED, ...Object.values(GAMES).flatMap(g =>
  ['config.js', 'sim.js', ...(GAME_FILES[g.dir] || []), 'client.js'].map(f => 'games/' + g.dir + '/' + f))];

/* Each game's page is web/shell.html filled in; the host's cap is the game's color. */
const HATS = { 'roll-ball': '#141414', 'field-goal-flick': '#22B07D', 'hoop-shoot': '#E0533D', whack: '#1f4e79', 'drop-board': '#b8860b', pinball: '#6b3fa0' };

/* Each game's marquee: a display face, a header band, an accent and an emblem.
 * The band is drawn from what the game IS (lanes and rings, turf and yard
 * lines, hardwood, a carnival booth, a game show board, a neon playfield), so
 * a tester knows which game they are in before reading the name. */
const svg = (inner) => '<svg class="emb" viewBox="0 0 48 48" aria-hidden="true">' + inner + '</svg>';
export const THEMES = {
  'roll-ball': {
    font: 'Bungee', tagline: 'Nine balls. Find the rings.',
    vars: '--disp:"Bungee";--disp-size:22px;--accent:#E0533D;--accent-ink:#fff;--hdr-ink:#fff;--hdr-title:#ffd23f;--hdr-dim:#d9d5cc;'
      + '--hdr-shadow:0 2px 0 #b8341f,0 0 14px rgba(224,83,61,.55);'
      + '--hdr-bg:radial-gradient(120% 140% at 20% 0%,#3a2a20 0%,#141414 60%);'
      + '--hdr-fx:repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 2px,transparent 2px 22px);',
    emblem: svg('<circle cx="24" cy="24" r="21" fill="#E0533D" stroke="#141414" stroke-width="2"/><circle cx="24" cy="24" r="14" fill="#ffd23f" stroke="#141414" stroke-width="2"/><circle cx="24" cy="24" r="7" fill="#141414"/><circle cx="33" cy="32" r="6" fill="#f4efe4" stroke="#141414" stroke-width="2"/>')
  },
  'field-goal-flick': {
    font: 'Graduate', tagline: 'Five kicks. Read the wind.',
    vars: '--disp:"Graduate";--disp-size:21px;--accent:#ffd23f;--accent-ink:#141414;--hdr-ink:#fff;--hdr-title:#fff;--hdr-dim:#d8f5e8;'
      + '--hdr-shadow:0 2px 0 #0d5e41;'
      + '--hdr-bg:linear-gradient(180deg,#22B07D 0%,#178a60 100%);'
      + '--hdr-fx:repeating-linear-gradient(90deg,transparent 0 46px,rgba(255,255,255,.28) 46px 48px),repeating-linear-gradient(90deg,rgba(0,0,0,.06) 0 24px,transparent 24px 48px);',
    emblem: svg('<path d="M12 6v18h24V6M24 24v20" fill="none" stroke="#ffd23f" stroke-width="4" stroke-linecap="round"/><ellipse cx="24" cy="15" rx="7" ry="4.5" transform="rotate(-25 24 15)" fill="#8a4b22" stroke="#141414" stroke-width="1.6"/><path d="M21 16.5l6-3" stroke="#fff" stroke-width="1.4"/>')
  },
  'hoop-shoot': {
    font: 'Russo+One', tagline: 'Sixty seconds on the clock.',
    vars: '--disp:"Russo One";--disp-size:22px;--accent:#1d2129;--accent-ink:#fff;--hdr-ink:#fff;--hdr-title:#fff;--hdr-dim:#fbe3cc;'
      + '--hdr-shadow:0 2px 0 #6e3511,0 0 10px rgba(0,0,0,.25);'
      + '--hdr-bg:linear-gradient(180deg,#c8813a 0%,#a8622a 100%);'
      + '--hdr-fx:repeating-linear-gradient(90deg,rgba(0,0,0,.09) 0 1px,transparent 1px 34px),repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 17px,transparent 17px 34px);',
    emblem: svg('<circle cx="24" cy="24" r="20" fill="#E8742A" stroke="#141414" stroke-width="2"/><path d="M4 24h40M24 4v40M10 10c8 6 8 22 0 28M38 10c-8 6-8 22 0 28" fill="none" stroke="#141414" stroke-width="2"/>')
  },
  'whack': {
    font: 'Lilita+One', tagline: 'Hit the ones who fit.',
    vars: '--disp:"Lilita One";--disp-size:21px;--disp-ls:.01em;--accent:#ffd23f;--accent-ink:#141414;--hdr-ink:#fff;--hdr-title:#ffd23f;--hdr-dim:#cfe0f0;'
      + '--hdr-shadow:0 2px 0 #0d2a45;'
      + '--hdr-bg:linear-gradient(180deg,#1f4e79 0%,#163a5c 100%);'
      + '--hdr-fx:radial-gradient(circle,rgba(255,210,63,.16) 2px,transparent 2.5px) 0 0/16px 16px;',
    emblem: svg('<rect x="6" y="8" width="26" height="14" rx="5" transform="rotate(-30 19 15)" fill="#E0533D" stroke="#141414" stroke-width="2"/><path d="M24 22l14 20" stroke="#8a4b22" stroke-width="5" stroke-linecap="round"/><path d="M24 22l14 20" stroke="#141414" stroke-width="1" stroke-linecap="round" opacity=".35"/>')
  },
  'drop-board': {
    font: 'Rubik+Mono+One', tagline: 'Pick a slot. Hope it lands big.',
    vars: '--disp:"Rubik Mono One";--disp-size:18px;--disp-ls:.03em;--accent:#ffd23f;--accent-ink:#141414;--hdr-ink:#fff;--hdr-title:#ffd23f;--hdr-dim:#c9d3df;'
      + '--hdr-shadow:0 2px 0 #7a5a07,0 0 12px rgba(255,210,63,.35);'
      + '--hdr-bg:linear-gradient(180deg,#26333f 0%,#1f2a36 100%);'
      + '--hdr-fx:radial-gradient(circle,#ffd23f 2px,rgba(255,210,63,.25) 3px,transparent 4px) 6px calc(100% - 3px)/16px 8px repeat-x,radial-gradient(circle,#ffd23f 2px,rgba(255,210,63,.25) 3px,transparent 4px) 6px -3px/16px 8px repeat-x;',
    emblem: svg('<g fill="#d8dde4"><circle cx="24" cy="12" r="3"/><circle cx="16" cy="22" r="3"/><circle cx="32" cy="22" r="3"/><circle cx="8" cy="32" r="3"/><circle cx="24" cy="32" r="3"/><circle cx="40" cy="32" r="3"/></g><circle cx="20" cy="5" r="4.5" fill="#ffd23f" stroke="#141414" stroke-width="1.5"/><rect x="4" y="40" width="40" height="6" rx="2" fill="#b8860b"/>')
  },
  'pinball': {
    font: 'Audiowide', tagline: 'Three balls. Light the bases.',
    vars: '--disp:"Audiowide";--disp-size:22px;--accent:#ff4fa3;--accent-ink:#fff;--hdr-ink:#fff;--hdr-title:#ffd6f0;--hdr-dim:#d7c6ef;'
      + '--hdr-shadow:0 0 6px #ff4fa3,0 0 16px rgba(255,79,163,.7);'
      + '--hdr-bg:radial-gradient(120% 160% at 85% 0%,#5a2a96 0%,#2a1446 55%,#160a26 100%);'
      + '--hdr-fx:linear-gradient(115deg,transparent 40%,rgba(80,230,255,.22) 41%,transparent 43%),linear-gradient(115deg,transparent 62%,rgba(255,79,163,.2) 63%,transparent 65%);',
    emblem: svg('<path d="M6 36l16 6" stroke="#E0533D" stroke-width="6" stroke-linecap="round"/><path d="M42 36l-16 6" stroke="#E0533D" stroke-width="6" stroke-linecap="round"/><circle cx="24" cy="16" r="8" fill="#f2f2f2" stroke="#141414" stroke-width="2"/><circle cx="21" cy="13" r="2.5" fill="#fff"/><path d="M38 6l1.8 3.8 4.2.4-3.2 2.8 1 4-3.8-2.2-3.8 2.2 1-4-3.2-2.8 4.2-.4z" fill="#ffd23f"/>')
  }
};
const fill = (t, g) => {
  const th = THEMES[g.id];
  return t.replaceAll('{{TITLE}}', g.name).replaceAll('{{LABEL}}', g.name).replaceAll('{{DIR}}', g.dir)
    .replaceAll('{{HAT}}', HATS[g.id] || '').replaceAll('{{HOST}}', g.name + ' host')
    .replaceAll('{{FONT}}', th.font).replaceAll('{{TAGLINE}}', th.tagline).replaceAll('{{EMBLEM}}', th.emblem)
    .replaceAll('{{THEME}}', ':root{' + th.vars + '}');
};

export function render() {
  const mods = {};
  for (const f of MODULE_FILES) mods[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const build = crypto.createHash('sha256').update(JSON.stringify(mods)).digest('hex').slice(0, 10);
  const shell = fs.readFileSync(path.join(ROOT, 'web/shell.html'), 'utf8');
  const pages = {};
  for (const g of Object.values(GAMES)) pages[g.id] = fill(shell, g).replaceAll('__BUILD__', build);
  pages.admin = fs.readFileSync(path.join(ROOT, 'web/admin.html'), 'utf8').replaceAll('__BUILD__', build);
  return '/* GENERATED by build/pages.mjs. Do not edit by hand. */\n'
    + 'export const BUILD = ' + JSON.stringify(build) + ';\n'
    + 'export const PAGES = ' + JSON.stringify(pages) + ';\n'
    + 'export const MODULES = ' + JSON.stringify(mods) + ';\n';
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.writeFileSync(path.join(ROOT, 'pages.js'), render());
  console.log('wrote functions/_arcadelab/pages.js');
}
