/* RunTheHouse, the copy lint.
 *
 *   node house/lint-strings.js
 *
 * GDD §17 lays down copy rules and version 0.1 left them as intentions. An
 * intention does not survive twenty sessions of writing UI text at speed. This
 * is cheap now and expensive to retrofit, so it exists before the UI does.
 *
 * It reads strings.js AND every string literal in index.html, because the rule
 * is "no em dashes in any UI string", not "no em dashes in the file we
 * remembered to check".
 *
 * Exit code 1 on any violation, so it can gate a build.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const STR = require('./strings.js');

const HERE = __dirname;
let failures = 0;

function fail(where, rule, text) {
  failures++;
  console.log(`  ${rule.padEnd(22)} ${where}`);
  console.log(`    ${text.length > 110 ? text.slice(0, 110) + '...' : text}`);
}

/* Emoji, including the pictographic ranges and the variation selectors that
   smuggle them in. GDD §17: no emojis, anywhere, ever. */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
const EM_DASH = /[—–]/;

/* Phrasing that reads as a chatbot rather than a house. The list is short on
   purpose: it catches the specific tics that creep in, not every phrase
   somebody might dislike. */
const ASSISTANT = [
  /\bgreat job\b/i, /\bwell done\b/i, /\bnice work\b/i, /\boops\b/i,
  /\blet's\b/i, /\bhere's\b/i, /\bfeel free\b/i, /\bplease note\b/i,
  /\bas an ai\b/i, /\bi'm sorry\b/i, /\bunfortunately\b/i, /\bdon't worry\b/i,
  /\byou can now\b/i, /\bsuccessfully\b/i, /\bawesome\b/i, /\bgood luck\b/i,
];

/* The one bank allowed to raise its voice, per strings.js. */
const EXCLAIM_OK = new Set(['reaction']);

function checkText(where, text, opts) {
  if (EMOJI.test(text)) fail(where, 'emoji', text);
  if (EM_DASH.test(text)) fail(where, 'em dash', text);
  if (!(opts && opts.allowExclaim) && text.indexOf('!') !== -1) fail(where, 'exclamation', text);
  for (const re of ASSISTANT) if (re.test(text)) fail(where, 'assistant phrasing', text);
  /* Assembly hygiene: a fragment that ends mid-space or doubles a space will
     produce a visible seam once it is slotted into a sentence. */
  if (/\s\s/.test(text)) fail(where, 'double space', text);
  if (/\s[.,;:]/.test(text)) fail(where, 'orphan punctuation', text);
}

console.log('\nRunTheHouse copy lint\n');

// ─── the banks ───────────────────────────────────────────────────────────────

let bankCount = 0, lineCount = 0;
for (const bank of Object.keys(STR.S)) {
  bankCount++;
  const lines = STR.S[bank];
  for (let i = 0; i < lines.length; i++) {
    lineCount++;
    checkText(`strings.js ${bank}[${i}]`, lines[i], { allowExclaim: EXCLAIM_OK.has(bank) });
  }
}

// ─── the UI ──────────────────────────────────────────────────────────────────

/*
 * Pulls quoted literals and visible markup text out of index.html. This is
 * deliberately a crude scan rather than a parser: it over-reports on things
 * like CSS content strings, which is the safe direction for a lint whose whole
 * job is to be annoying about punctuation.
 */
const uiPath = path.join(HERE, 'index.html');
if (fs.existsSync(uiPath)) {
  const src = fs.readFileSync(uiPath, 'utf8');

  const body = src.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  const markup = body.replace(/<[^>]+>/g, '\n');
  markup.split('\n').map((x) => x.trim()).filter((x) => x.length > 1).forEach((t, i) => {
    checkText(`index.html markup:${i}`, t, {});
  });

  const scripts = src.match(/<script[\s\S]*?<\/script>/g) || [];
  for (const block of scripts) {
    const lits = block.match(/'[^'\n]{4,}'|"[^"\n]{4,}"|`[^`]{4,}`/g) || [];
    for (const raw of lits) {
      const t = raw.slice(1, -1);
      /* Skip things that are obviously not prose. */
      if (/^[#.\[\]\w-]+$/.test(t)) continue;
      if (/^(https?:|data:|[\w-]+\/[\w-]+)/.test(t)) continue;
      if (/^[\d\s.,%-]+$/.test(t)) continue;
      if (/[{}<>]|=>|\bfunction\b|;\s*$/.test(t)) continue;
      checkText('index.html script', t, {});
    }
  }
} else {
  console.log('  index.html not present yet, banks only\n');
}

console.log(`\n  ${bankCount} banks, ${lineCount} authored fragments`);
if (failures) {
  console.log(`  ${failures} violation${failures === 1 ? '' : 's'}\n`);
  process.exit(1);
}
console.log('  clean\n');
