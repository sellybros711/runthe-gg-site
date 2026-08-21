/*
 * THE PAINT JOBS. One object per helmet, no drawing anywhere in this file.
 *
 *   shell   the body            mask    the cage
 *   stripe  [colour, trim]      an empty array is a bare shell, which several clubs wear
 *   logo    a glyph name from helmet.js, or {word:'NY'} for a club whose mark is letters
 *   ink     [colour, second]    the mark's own colours
 *   pattern a glyph tiled across the shell, for a club whose shell is not one flat colour
 *
 * COLOURS ARE A FIRST PASS. The primaries and secondaries come from the ones the football
 * game already keeps, which are right; the shell, the facemask and which of the two the
 * stripe is are from memory and want checking against a photograph club by club. Where a
 * club's real mark is too detailed to survive nine pixels it carries a letter mark and is
 * flagged `placeholder`, so the page can say so out loud rather than quietly shipping a
 * lion that looks like a dog.
 */
(function () {
  'use strict';

  const nfl = [
    { name: 'Cardinals', sub: 'ARI', shell: '#ffffff', mask: '#97233F',
      stripe: ['#97233F', '#000000'], logo: 'bird', ink: ['#97233F', '#000000'], rough: true },
    { name: 'Falcons', sub: 'ATL', shell: '#101820', mask: '#101820',
      stripe: ['#A71930', '#A5ACAF'], logo: 'bird', ink: ['#A71930', '#A5ACAF'], rough: true },
    { name: 'Ravens', sub: 'BAL', shell: '#241773', mask: '#101820',
      stripe: ['#101820', '#9E7C0C'], logo: 'bird', ink: ['#101820', '#9E7C0C'], rough: true },
    { name: 'Bills', sub: 'BUF', shell: '#ffffff', mask: '#00338D',
      stripe: ['#00338D', '#C60C30'], logo: 'bull', ink: ['#00338D', '#C60C30'], rough: true },
    { name: 'Panthers', sub: 'CAR', shell: '#A5ACAF', mask: '#101820',
      stripe: ['#0085CA', '#101820'], logo: 'paw', ink: ['#0085CA', '#101820'], rough: true },
    { name: 'Bears', sub: 'CHI', shell: '#0B162A', mask: '#4a5568',
      stripe: ['#C83803', '#ffffff'], logo: { word: 'C' }, ink: ['#C83803', '#ffffff'] },
    /* The shell is the pattern. Nobody else in the league has one, and a system that could
       not do it would have to draw Cincinnati by hand for ever. */
    { name: 'Bengals', sub: 'CIN', shell: '#FB4F14', mask: '#101820', stripe: [],
      pattern: 'tiger', patternInk: '#101820', logo: 'none', ink: ['#101820', '#ffffff'] },
    /* No logo and no stripe, which is the whole of the Browns' helmet. */
    { name: 'Browns', sub: 'CLE', shell: '#FF3C00', mask: '#311D00', stripe: [],
      logo: 'none', ink: ['#311D00', '#ffffff'] },
    { name: 'Cowboys', sub: 'DAL', shell: '#869397', mask: '#869397',
      stripe: ['#003594', '#ffffff'], logo: 'star', ink: ['#003594', '#ffffff'] },
    { name: 'Broncos', sub: 'DEN', shell: '#002244', mask: '#FB4F14',
      stripe: ['#FB4F14', '#ffffff'], logo: { word: 'D' }, ink: ['#FB4F14', '#ffffff'],
      placeholder: true },
    { name: 'Lions', sub: 'DET', shell: '#B0B7BC', mask: '#0076B6',
      stripe: ['#0076B6', '#101820'], logo: { word: 'D' }, ink: ['#0076B6', '#101820'],
      placeholder: true },
    { name: 'Packers', sub: 'GB', shell: '#FFB612', mask: '#8A8D8F',
      stripe: ['#203731', '#ffffff'], logo: { word: 'G' }, ink: ['#203731', '#ffffff'] },
    { name: 'Texans', sub: 'HOU', shell: '#03202F', mask: '#03202F',
      stripe: ['#A71930', '#ffffff'], logo: { word: 'H' }, ink: ['#A71930', '#ffffff'],
      placeholder: true },
    { name: 'Colts', sub: 'IND', shell: '#ffffff', mask: '#A2AAAD',
      stripe: ['#002C5F', '#ffffff'], logo: 'horseshoe', ink: ['#002C5F', '#ffffff'] },
    { name: 'Jaguars', sub: 'JAX', shell: '#101820', mask: '#101820',
      stripe: ['#006778', '#D7A22A'], logo: { word: 'J' }, ink: ['#D7A22A', '#006778'],
      placeholder: true },
    { name: 'Chiefs', sub: 'KC', shell: '#E31837', mask: '#ffffff',
      stripe: ['#ffffff', '#FFB81C'], logo: { word: 'KC' }, ink: ['#ffffff', '#E31837'] },
    { name: 'Chargers', sub: 'LAC', shell: '#ffffff', mask: '#0080C6',
      stripe: ['#0080C6', '#FFC20E'], logo: 'bolt', ink: ['#0080C6', '#FFC20E'] },
    { name: 'Rams', sub: 'LAR', shell: '#003594', mask: '#ffffff',
      stripe: ['#FFA300', '#ffffff'], logo: 'ram', ink: ['#FFA300', '#ffffff'] },
    { name: 'Raiders', sub: 'LV', shell: '#A5ACAF', mask: '#101820',
      stripe: ['#101820', '#A5ACAF'], logo: 'shield', ink: ['#101820', '#ffffff'] },
    { name: 'Dolphins', sub: 'MIA', shell: '#ffffff', mask: '#008E97',
      stripe: ['#008E97', '#FC4C02'], logo: 'dolphin', ink: ['#008E97', '#FC4C02'] },
    { name: 'Vikings', sub: 'MIN', shell: '#4F2683', mask: '#FFC62F',
      stripe: ['#FFC62F', '#ffffff'], logo: 'horns', ink: ['#ffffff', '#FFC62F'] },
    { name: 'Patriots', sub: 'NE', shell: '#B0B7BC', mask: '#C60C30',
      stripe: ['#002244', '#C60C30'], logo: { word: 'NE' }, ink: ['#002244', '#C60C30'],
      placeholder: true },
    { name: 'Saints', sub: 'NO', shell: '#D3BC8D', mask: '#101820',
      stripe: ['#101820', '#D3BC8D'], logo: 'fleur', ink: ['#101820', '#D3BC8D'] },
    { name: 'Giants', sub: 'NYG', shell: '#0B2265', mask: '#A5ACAF',
      stripe: ['#ffffff', '#A71930'], logo: { word: 'NY' }, ink: ['#ffffff', '#A71930'] },
    { name: 'Jets', sub: 'NYJ', shell: '#125740', mask: '#ffffff',
      stripe: ['#ffffff', '#125740'], logo: { word: 'J' }, ink: ['#ffffff', '#125740'] },
    { name: 'Eagles', sub: 'PHI', shell: '#004C54', mask: '#101820',
      stripe: ['#A5ACAF', '#ffffff'], logo: 'wing', ink: ['#A5ACAF', '#ffffff'], rough: true },
    /* No stripe, and in real life the mark is on one side only. The renderer draws the side
       it is on, which is the side you are looking at, so that quirk comes out right for
       free rather than needing a flag. */
    { name: 'Steelers', sub: 'PIT', shell: '#101820', mask: '#101820', stripe: [],
      logo: 'hypo', ink: ['#FFB612', '#C60C30'] },
    { name: 'Seahawks', sub: 'SEA', shell: '#002244', mask: '#002244',
      stripe: ['#69BE28', '#A5ACAF'], logo: 'bird', ink: ['#69BE28', '#A5ACAF'], rough: true },
    { name: '49ers', sub: 'SF', shell: '#B3995D', mask: '#ffffff',
      stripe: ['#AA0000', '#ffffff'], logo: { word: 'SF' }, ink: ['#AA0000', '#ffffff'] },
    { name: 'Buccaneers', sub: 'TB', shell: '#34302B', mask: '#34302B', stripe: [],
      logo: 'flag', ink: ['#D50A0A', '#ffffff'] },
    { name: 'Titans', sub: 'TEN', shell: '#0C2340', mask: '#0C2340',
      stripe: ['#4B92DB', '#C8102E'], logo: { word: 'T' }, ink: ['#4B92DB', '#C8102E'],
      placeholder: true },
    { name: 'Commanders', sub: 'WAS', shell: '#5A1414', mask: '#FFB612',
      stripe: ['#FFB612', '#ffffff'], logo: { word: 'W' }, ink: ['#FFB612', '#ffffff'] },
  ];

  /* ── the vault ────────────────────────────────────────────────────────────────
   * A RETRO is a helmet a club really wore. A SPECIAL is one nobody ever did, which is
   * where a game gets to have its own ideas. Both are the same six fields as above, which
   * is the argument for the whole approach: a throwback costs a row, not a drawing.
   *
   * `how` is what the thing would be earned for. It is written here rather than left to
   * the imagination because an unlockable with no stated condition is decoration, and
   * every one of these lines is something both games already count.
   */
  const vault = [
    { kind: 'retro', how: 'Go 17-0 with Miami',
      kit: { name: 'Dolphins 1972', sub: 'Perfect', shell: '#ffffff', mask: '#A5ACAF',
        stripe: ['#008E97', '#FC4C02'], logo: 'dolphin', ink: ['#FC4C02', '#008E97'] } },
    { kind: 'retro', how: 'Win a title with Tampa Bay', locked: true,
      kit: { name: 'Bucs 1976', sub: 'Creamsicle', shell: '#D50A0A', mask: '#ffffff',
        stripe: ['#ffffff', '#D50A0A'], logo: 'flag', ink: ['#ffffff', '#D50A0A'] } },
    { kind: 'retro', how: 'Win a title with Denver',
      kit: { name: 'Broncos 1977', sub: 'Orange Crush', shell: '#FB4F14', mask: '#002244',
        stripe: ['#002244', '#ffffff'], logo: { word: 'D' }, ink: ['#002244', '#ffffff'] } },
    { kind: 'retro', how: 'Beat a 15 win team', locked: true,
      kit: { name: 'Oilers 1980', sub: 'Luv Ya Blue', shell: '#4B92DB', mask: '#ffffff',
        stripe: ['#C8102E', '#ffffff'], logo: { word: 'H' }, ink: ['#C8102E', '#ffffff'] } },
    { kind: 'retro', how: 'Win a title with Philadelphia', locked: true,
      kit: { name: 'Eagles 1960', sub: 'Kelly Green', shell: '#0B6623', mask: '#ffffff',
        stripe: ['#ffffff', '#C0C0C0'], logo: 'wing', ink: ['#ffffff', '#C0C0C0'] } },
    { kind: 'retro', how: 'Win a title with the Chargers',
      kit: { name: 'Chargers 1963', sub: 'Powder', shell: '#ffffff', mask: '#A5ACAF',
        stripe: ['#0080C6', '#FFC20E'], logo: 'bolt', ink: ['#0080C6', '#FFC20E'] } },
    { kind: 'special', how: 'Win the title',
      kit: { name: 'Champion', sub: 'Gold', shell: '#FFD23A', mask: '#8A6D0B',
        stripe: ['#8A6D0B', '#ffffff'], logo: 'star', ink: ['#8A6D0B', '#ffffff'] } },
    { kind: 'special', how: 'Go unbeaten', locked: true,
      kit: { name: 'Perfect', sub: 'Whiteout', shell: '#f4f7fb', mask: '#f4f7fb',
        stripe: ['#dfe7f4', '#c7d4e8'], logo: 'star', ink: ['#c7d4e8', '#f4f7fb'] } },
    { kind: 'special', how: 'Finish a season in every club',
      kit: { name: 'RunThe.GG', sub: 'House', shell: '#0f1729', mask: '#22c55e',
        stripe: ['#22c55e', '#0f1729'], logo: { word: 'RG' }, ink: ['#22c55e', '#ffffff'] } },
    { kind: 'special', how: 'Lose a title game by one score', locked: true,
      kit: { name: 'So Close', sub: 'Rust', shell: '#6b4a2f', mask: '#3b2a1c',
        stripe: ['#3b2a1c', '#8a6a4a'], logo: 'none', ink: ['#3b2a1c', '#8a6a4a'] } },
  ];

  /* Eight of the eighty three schools the college game already has colours for, to show the
     renderer does not care which league it is pointed at. */
  const college = [
    { name: 'Alabama', sub: 'ALA', shell: '#9E1B32', mask: '#828A8F',
      stripe: ['#ffffff', '#9E1B32'], logo: { word: 'A' }, ink: ['#ffffff', '#828A8F'] },
    { name: 'Michigan', sub: 'MICH', shell: '#FFCB05', mask: '#00274C',
      stripe: ['#00274C', '#FFCB05'], logo: 'wing', ink: ['#00274C', '#FFCB05'] },
    { name: 'Oregon', sub: 'ORE', shell: '#154733', mask: '#FEE123',
      stripe: ['#FEE123', '#154733'], logo: { word: 'O' }, ink: ['#FEE123', '#154733'] },
    { name: 'Texas', sub: 'TEX', shell: '#ffffff', mask: '#BF5700',
      stripe: ['#BF5700', '#ffffff'], logo: 'bull', ink: ['#BF5700', '#ffffff'] },
    { name: 'Ohio State', sub: 'OSU', shell: '#BB0000', mask: '#A7B1B7',
      stripe: ['#ffffff', '#BB0000'], logo: 'none', ink: ['#ffffff', '#BB0000'] },
    { name: 'Miami', sub: 'MIA', shell: '#F47321', mask: '#005030',
      stripe: ['#005030', '#ffffff'], logo: { word: 'U' }, ink: ['#005030', '#ffffff'] },
    { name: 'LSU', sub: 'LSU', shell: '#ffffff', mask: '#FDD023',
      stripe: ['#461D7C', '#FDD023'], logo: { word: 'LS' }, ink: ['#461D7C', '#FDD023'] },
    { name: 'Penn State', sub: 'PSU', shell: '#ffffff', mask: '#041E42',
      stripe: ['#041E42', '#ffffff'], logo: 'none', ink: ['#041E42', '#ffffff'] },
  ];

  window.KITS = { nfl, vault, college };
})();
