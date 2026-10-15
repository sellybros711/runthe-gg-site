# The arcade

The repo-wide rules are in the root CLAUDE.md. This file holds only what a change to `arcade/` must
obey. The why and the history live in the knowledge base.

## The knowledge base

`sellybros711/runthe-gg-kb`, folder `games/arcade/`. Start at `arcade-overview.md`. In a cloud
session it is cloned at `/home/user/runthe-gg-kb`. If it is not there, attach it (add_repo) before a
design task. After a meaningful change, update the matching note by pull request there.

| task | read |
|---|---|
| player data, colleges, clubs, namesakes | `arcade-namesakes.md` |
| a How to play block or a tip | `arcade-howto.md` |

## Commands

```
node scripts/check-namesakes.mjs     the corpus built twice, with and without namesake rows: must match
node scripts/check-howto.mjs         the twelve How to play blocks against tokens.js
```

## Rules a change here must keep

- **`name|sport` is not a person.** Two players can share both. `samePerson()` treats them as one
  only unless the clubs, the numbers AND the position all disagree. **Do not normalize position
  strings**: "Guard" against "Point Guard" is what keeps the two Dee Browns apart.
- A club printed under a player's name must be one of the clubs his record already has (`data.js`
  drops any other `pt`). The fallback is his first club.
- A Number Game round never uses a stint outside the player's own career (`_ownStint()` in
  `arcade/table/index.html`).
- **Write a tip from the code, not from the game's description.** Nothing reads a tip, so it goes
  stale silently.
- **The entitlement paragraph follows `tokens.js`.** The four free games need no account; an account
  saves the result. `check-howto.mjs` holds all twelve pages to it.
- Two surfaces say how to play: the block on each page and the "?" modal in `arcade/howto.js`. Edit
  both. Neither opens by itself.
- The data files (jerseys, rosters, the Sportegories corpus) are rebuilt by bots and are dash-checked,
  so a scraped name carrying an en dash fails CI.
