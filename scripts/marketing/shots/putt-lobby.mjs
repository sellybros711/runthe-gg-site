/* The Run The Tour lobby (the First Tee) with nothing on it: its sky, the drifting pixel clouds, the
   Putt Putt world it opens on, the haze at the horizon. The menus, the golfer and the buttons are
   hidden, and the Putt Putt side is widened to the whole screen.

   The Putt Putt trailer's "Introducing Putt Putt Tour" plays over it (the owner, 2026-10-19: "a cool
   design similar to the lobby of the game where it's that sky look"). It is the live lobby, so it
   wears whatever the season dresses it in. */
export const page = '/golf/';
export const seconds = 10;
export const hide = [];

export async function setup(page, t) {
  await t.until(() => !!document.querySelector('.ft-scene .ft-sky'), 60000);
  await page.addStyleTag({ content: `
    body *{visibility:hidden!important}
    .ft-scene,.ft-scene *{visibility:visible!important}
    .ft{--ftS:-6%!important}
    .ft-seam{display:none!important}
    .ft-shade{opacity:.55}` });
  await t.hold(2500);
}

export async function play(page, t) { await t.hold(+(process.env.LOBBY_MS || 4000)); }
