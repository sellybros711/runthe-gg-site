/* The share line every Arcade Lab game uses: a header, one strip of squares,
 * the url. No spoilers: the squares say how it went, never where. */
export const SHARE_URL = 'https://runthe.gg/arcade/';
export function shareText(name, dayNo, score, squares) {
  return name + ' #' + dayNo + ' ' + score + '\n' + squares.join('') + '\n' + SHARE_URL;
}
