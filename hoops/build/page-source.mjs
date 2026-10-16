/*
 * What a check reads when it reads "the page": hoops/index.html and the script it runs.
 *
 * Until 2026-10-16 the page's code was inline in index.html, and the checks that lift a
 * function out of it (verify, check-bracket, check-earn and the rest) read index.html alone.
 * The code now lives in hoops/page.js, built from hoops/page/, so they read the page with the
 * script put back inside it, where its tag is. A check that is about the HTML itself
 * (check-posture) still reads index.html alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOPS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function pageSource() {
  const html = fs.readFileSync(path.join(HOOPS, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(HOOPS, 'page.js'), 'utf8');
  const tag = /<script src="page\.js\?v=\d+"><\/script>/;
  if (!tag.test(html)) throw new Error('hoops/index.html no longer loads page.js?v=, so pageSource() is reading a script the page does not run');
  /* The script goes back where its tag is, as the inline block it was, so a check that
     treats a <script> block's text differently from the page's prose reads it the same
     way it always did. */
  return html.replace(tag, () => '<script>\n' + js + '</script>');
}
