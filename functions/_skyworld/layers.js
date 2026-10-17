/* The layers of a game build: one district each on a game's island.
 *
 * A file belongs to the first layer whose rule matches it, so a check of the money path is Payments.
 * A district exists only where the game has at least one file in that layer, so a game with no
 * payments has no market stall. Paths are relative to the repo root. Notes and docs (.md) are no layer. */

export const LAYERS = [
  { id: 'engine', name: 'Engine and sim' },
  { id: 'ui', name: 'Screens and UI' },
  { id: 'art', name: 'Art and motion' },
  { id: 'data', name: 'Data and rosters' },
  { id: 'accounts', name: 'Accounts and backend' },
  { id: 'payments', name: 'Payments' },
  { id: 'checks', name: 'Checks and CI' }
];

const RULES = [
  ['payments', /stripe|checkout|(^|[-_/])(store|shop|prices?|purchase|buy)([-_./]|$)/i],
  ['checks', /(^|\/)(check-[^/]*|[^/]*\.test)\.m?js$|(^|\/)tests?\/|^\.github\/workflows\//i],
  ['accounts', /(^|\/)(auth|cloudsave|accounts?|profile|board|leaderboards?|api|db-[a-z]+|cookie|gate)[-_.a-z]*\.m?js$|^supabase\/|^functions\/api\//i],
  ['data', /(^|\/)data\/|\.(json|csv|tsv)$|roster|(^|\/)(seed|import|fetch|sync)[-_a-z]*\.m?js$/i],
  ['art', /\.(png|jpe?g|gif|webp|svg|ttf|woff2?|mp3|ogg|wav)$|(^|\/)(art|sprites?|fonts?|img|images|icons?|anim|cutscenes?)\/|sprite|render|pxhd|3d|logo|anim|pose|rig|look|palette|paint/i],
  ['ui', /\.(html|css)$|(^|[-_/])(ui|screens?|menus?|home|panels?|hud|modal|nav)([-_./]|$)/i],
  ['engine', /\.m?js$/i]
];

export function layerOf(path) {
  if (/\.md$/i.test(path) || /(^|\/)\.[^/]+$/.test(path)) return null;
  for (const [id, re] of RULES) if (re.test(path)) return id;
  return null;
}

/* { engine: 12, ui: 4, ... } for a list of paths */
export function countLayers(paths) {
  const n = {};
  for (const p of paths) { const l = layerOf(p); if (l) n[l] = (n[l] || 0) + 1; }
  return n;
}
