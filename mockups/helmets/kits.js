/*
 * THE PAINT JOBS, for the college game.
 *
 *   shell   the body            mask    the cage
 *   stripe  [colour, trim]      an empty array is a bare shell, which several schools wear
 *   logo    a glyph name from helmet.js, or {word:'A'} for a school whose mark is letters
 *   ink     [colour, second]    the mark's own colours
 *
 * THE COLOURS ARE NOT INVENTED HERE. cfb/data/cfb_team_seasons.json already carries a
 * primary and a secondary for all eighty three schools, because the game paints the home
 * screen and the draft in them. This file reads that file. So the eighty three helmets
 * below cost nothing but a shape, and if a colour is wrong it is wrong in one place and
 * fixing it fixes the game too.
 *
 * WHAT A DEFAULT LOOKS LIKE. Shell in the primary, a stripe of the secondary, a facemask a
 * shade off the shell so the cage still reads, and the school's own abbreviation as the
 * mark. That is a real helmet for a good half of the country and a placeholder for the
 * rest, which is the honest state of a first pass.
 *
 * AND COLLEGE SUITS THIS BETTER THAN THE PROS DO. Half of these schools really do wear a
 * single letter: Alabama's A, Georgia's G, Tennessee's T, Nebraska's N, Michigan State's
 * S. Where the NFL wanted a leaping panther and a raven at nine pixels across, this wants
 * letters, and letters are the one thing a pixel grid is good at.
 */
(function () {
  'use strict';

  /* ── the ones worth doing by hand ─────────────────────────────────────────────
   * A school whose helmet is not simply "primary with a secondary stripe". Everything
   * absent from here is generated below, and the page says which is which.
   *
   * `note` is what is still wrong with it, printed under the helmet, because a mockup
   * that hides its own gaps is worth less than one that points at them.
   */
  const OVERRIDES = {
    Alabama: { shell: '#9E1B32', mask: '#8A8D8F', stripe: ['#ffffff', '#9E1B32'],
      logo: 'none', ink: ['#ffffff', '#9E1B32'],
      note: 'crimson, white stripe, no mark: the number goes on the side' },
    Michigan: { shell: '#00274C', mask: '#FFCB05', stripe: ['#FFCB05', '#00274C'],
      logo: 'wing', ink: ['#FFCB05', '#00274C'],
      note: 'the winged front is a shell treatment, not a mark, and wants its own' },
    'Ohio State': { shell: '#A7B1B7', mask: '#8A8D8F', stripe: ['#BB0000', '#ffffff'],
      logo: 'none', ink: ['#BB0000', '#ffffff'], note: 'silver shell, buckeye stickers' },
    'Penn State': { shell: '#ffffff', mask: '#041E42', stripe: ['#041E42', '#ffffff'],
      logo: 'none', ink: ['#041E42', '#ffffff'] },
    'Notre Dame': { shell: '#C99700', mask: '#C99700', stripe: [],
      logo: 'none', ink: ['#0C2340', '#C99700'] },
    Texas: { shell: '#ffffff', mask: '#ffffff', stripe: ['#BF5700', '#ffffff'],
      logo: 'bull', ink: ['#BF5700', '#ffffff'], note: 'the longhorn wants a real pass' },
    Oklahoma: { shell: '#841617', mask: '#841617', stripe: ['#ffffff', '#841617'],
      logo: { word: 'OU' }, ink: ['#ffffff', '#841617'] },
    LSU: { shell: '#ffffff', mask: '#FDD023', stripe: ['#461D7C', '#FDD023'],
      logo: { word: 'LS' }, ink: ['#461D7C', '#FDD023'], note: 'the mark is LSU, not LS' },
    Georgia: { shell: '#BA0C2F', mask: '#000000', stripe: ['#000000', '#ffffff'],
      logo: { word: 'G' }, ink: ['#000000', '#ffffff'] },
    Florida: { shell: '#ffffff', mask: '#0021A5', stripe: ['#FA4616', '#0021A5'],
      logo: { word: 'F' }, ink: ['#0021A5', '#FA4616'] },
    Auburn: { shell: '#0C2340', mask: '#0C2340', stripe: ['#E87722', '#ffffff'],
      logo: { word: 'AU' }, ink: ['#E87722', '#ffffff'] },
    Tennessee: { shell: '#ffffff', mask: '#FF8200', stripe: ['#FF8200', '#ffffff'],
      logo: { word: 'T' }, ink: ['#FF8200', '#ffffff'] },
    Miami: { shell: '#F47321', mask: '#005030', stripe: ['#005030', '#ffffff'],
      logo: { word: 'U' }, ink: ['#005030', '#ffffff'] },
    Clemson: { shell: '#F66733', mask: '#522D80', stripe: ['#522D80', '#ffffff'],
      logo: 'paw', ink: ['#522D80', '#ffffff'] },
    'Florida State': { shell: '#782F40', mask: '#CEB888', stripe: ['#CEB888', '#782F40'],
      logo: { word: 'FS' }, ink: ['#CEB888', '#782F40'], note: 'the spear wants drawing' },
    USC: { shell: '#990000', mask: '#8A8D8F', stripe: ['#FFC72C', '#990000'],
      logo: { word: 'SC' }, ink: ['#FFC72C', '#990000'] },
    Oregon: { shell: '#154733', mask: '#FEE123', stripe: ['#FEE123', '#154733'],
      logo: { word: 'O' }, ink: ['#FEE123', '#154733'] },
    Nebraska: { shell: '#E41C38', mask: '#ffffff', stripe: ['#ffffff', '#E41C38'],
      logo: { word: 'N' }, ink: ['#ffffff', '#E41C38'] },
    Wisconsin: { shell: '#C5050C', mask: '#ffffff', stripe: ['#ffffff', '#C5050C'],
      logo: { word: 'W' }, ink: ['#ffffff', '#C5050C'] },
    'Michigan State': { shell: '#18453B', mask: '#18453B', stripe: ['#ffffff', '#18453B'],
      logo: { word: 'S' }, ink: ['#ffffff', '#18453B'] },
    Iowa: { shell: '#000000', mask: '#FFCD00', stripe: ['#FFCD00', '#000000'],
      logo: 'bird', ink: ['#FFCD00', '#000000'], note: 'the tigerhawk wants a real pass' },
    Washington: { shell: '#4B2E83', mask: '#B7A57A', stripe: ['#B7A57A', '#4B2E83'],
      logo: { word: 'W' }, ink: ['#B7A57A', '#4B2E83'] },
    'Texas A&M': { shell: '#500000', mask: '#500000', stripe: ['#ffffff', '#500000'],
      logo: { word: 'AM' }, ink: ['#ffffff', '#500000'] },
    UCLA: { shell: '#ffffff', mask: '#2D68C4', stripe: ['#2D68C4', '#F2A900'],
      logo: { word: 'UC' }, ink: ['#2D68C4', '#F2A900'], note: 'the script is four letters' },
    Colorado: { shell: '#CFB87C', mask: '#000000', stripe: ['#000000', '#CFB87C'],
      logo: 'bull', ink: ['#000000', '#CFB87C'], note: 'a buffalo, and this is not one yet' },
    Utah: { shell: '#CC0000', mask: '#ffffff', stripe: ['#ffffff', '#000000'],
      logo: { word: 'U' }, ink: ['#ffffff', '#000000'] },
    'Virginia Tech': { shell: '#630031', mask: '#CF4420', stripe: ['#CF4420', '#630031'],
      logo: { word: 'VT' }, ink: ['#CF4420', '#ffffff'] },
    Arizona: { shell: '#0C234B', mask: '#AB0520', stripe: ['#AB0520', '#ffffff'],
      logo: { word: 'A' }, ink: ['#AB0520', '#ffffff'] },
    'Arizona State': { shell: '#8C1D40', mask: '#FFC627', stripe: ['#FFC627', '#8C1D40'],
      logo: { word: 'A' }, ink: ['#FFC627', '#8C1D40'], note: 'a pitchfork, not an A' },
    Stanford: { shell: '#8C1515', mask: '#ffffff', stripe: ['#ffffff', '#8C1515'],
      logo: { word: 'S' }, ink: ['#ffffff', '#8C1515'] },
    Missouri: { shell: '#F1B82D', mask: '#000000', stripe: ['#000000', '#F1B82D'],
      logo: { word: 'M' }, ink: ['#000000', '#F1B82D'] },
    Louisville: { shell: '#AD0000', mask: '#000000', stripe: ['#ffffff', '#AD0000'],
      logo: { word: 'L' }, ink: ['#ffffff', '#000000'] },
  };

  /* Two letters at most, and the abbreviation is usually already that. */
  const markFor = (abbr, school) => {
    const src = String(abbr || school || '').replace(/[^A-Za-z]/g, '');
    return { word: src.slice(0, 2).toUpperCase() };
  };

  const shade = (hex, amount) => {
    const n = parseInt(String(hex).replace('#', ''), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)]
      .map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  const lum = (hex) => {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  };

  /* THE DEFAULT, which is what eighty three minus the list above look like. Primary shell,
     secondary stripe, a facemask a shade off the shell so the cage does not vanish into
     it, and the abbreviation as the mark. */
  function defaultKit(t) {
    const shell = t.color || '#334155';
    const alt = t.alt_color && t.alt_color !== shell ? t.alt_color : shade(shell, 0.28);
    return {
      shell,
      mask: lum(shell) < 0.4 ? shade(shell, 0.16) : shade(shell, -0.22),
      stripe: [alt, lum(alt) > 0.55 ? shade(alt, -0.25) : '#ffffff'],
      logo: markFor(t.abbreviation, t.school),
      ink: [alt, shell],
      generated: true,
    };
  }

  /* One row per school, out of the game's own data. Everything the page shows is built
     from this, so a school that is in the game is a helmet with no further work. */
  async function load(url) {
    const rows = await fetch(url).then((r) => r.json());
    const seen = {};
    for (const t of rows) if (!seen[t.school]) seen[t.school] = t;
    return Object.values(seen)
      .sort((a, b) => a.school.localeCompare(b.school))
      .map((t) => {
        const over = OVERRIDES[t.school];
        return Object.assign({
          name: t.school, sub: t.abbreviation || '', conference: t.conference || '',
        }, over ? Object.assign({ generated: false }, over) : defaultKit(t));
      });
  }

  /* ── the vault ────────────────────────────────────────────────────────────────
   * A RETRO is a helmet a school really wore. A SPECIAL is one nobody ever did, which is
   * where a game gets to have its own ideas. Both are the same six fields as a school,
   * which is the argument for the whole approach: a throwback costs a row, not a drawing.
   *
   * `how` is what the thing would be earned for, written down rather than left to the
   * imagination, because an unlockable with no stated condition is decoration. Every line
   * here is something the college game already counts.
   */
  const vault = [
    { kind: 'retro', how: 'Go 15-0',
      kit: { name: 'Leather', sub: '1920s', shell: '#7a5230', mask: '#5a3b22', stripe: [],
        logo: 'none', ink: ['#5a3b22', '#7a5230'] } },
    { kind: 'retro', how: 'Win the title with Miami', locked: true,
      kit: { name: 'Miami 1987', sub: 'Green shell', shell: '#005030', mask: '#F47321',
        stripe: ['#F47321', '#ffffff'], logo: { word: 'U' }, ink: ['#F47321', '#ffffff'] } },
    { kind: 'retro', how: 'Win the title with Nebraska',
      kit: { name: 'Nebraska 1995', sub: 'Blackshirt', shell: '#000000', mask: '#E41C38',
        stripe: ['#E41C38', '#ffffff'], logo: { word: 'N' }, ink: ['#E41C38', '#ffffff'] } },
    { kind: 'retro', how: 'Beat three ranked teams in one season', locked: true,
      kit: { name: 'Oregon 1999', sub: 'Lightning', shell: '#004F27', mask: '#FEE123',
        stripe: ['#FEE123', '#004F27'], logo: 'bolt', ink: ['#FEE123', '#004F27'] } },
    { kind: 'retro', how: 'Win a New Year’s Six bowl', locked: true,
      kit: { name: 'Texas 1969', sub: 'Wishbone', shell: '#ffffff', mask: '#8A8D8F',
        stripe: ['#BF5700', '#ffffff'], logo: 'none', ink: ['#BF5700', '#ffffff'] } },
    { kind: 'special', how: 'Win the national title',
      kit: { name: 'Champion', sub: 'Gold', shell: '#FFD23A', mask: '#8A6D0B',
        stripe: ['#8A6D0B', '#ffffff'], logo: 'star', ink: ['#8A6D0B', '#ffffff'] } },
    { kind: 'special', how: 'Go unbeaten', locked: true,
      kit: { name: 'Perfect', sub: 'Whiteout', shell: '#f4f7fb', mask: '#f4f7fb',
        stripe: ['#dfe7f4', '#c7d4e8'], logo: 'star', ink: ['#c7d4e8', '#f4f7fb'] } },
    { kind: 'special', how: 'Play a season in all five Power conferences',
      kit: { name: 'RunThe.GG', sub: 'House', shell: '#0f1729', mask: '#22c55e',
        stripe: ['#22c55e', '#0f1729'], logo: { word: 'RG' }, ink: ['#22c55e', '#ffffff'] } },
    { kind: 'special', how: 'Lose the title game by one score', locked: true,
      kit: { name: 'So Close', sub: 'Rust', shell: '#6b4a2f', mask: '#3b2a1c',
        stripe: ['#3b2a1c', '#8a6a4a'], logo: 'none', ink: ['#3b2a1c', '#8a6a4a'] } },
  ];

  window.KITS = { load, vault, OVERRIDES };
})();
