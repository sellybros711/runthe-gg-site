# Run The Diamond: "the 2026 season is in" (DRAFTS)

**Drafts only. Nothing here is queued.** The owner picks one X post and one Instagram and Facebook
post, then I queue them in a PR for the owner to merge.

## What is true now (read from the merged code, site PR 1016, commit 3ed588c)

- The pool runs **1901 to 2026**. The page's own description says it: "Draft an all-time MLB roster
  from 1901-2026 under a $190M cap, simulate a 162-game season, and chase the World Series."
- The cap is $190M (`CAP_MUSD: 190` in `baseball/engine.js`).
- The share card (`baseball/og.png`) now says 1901-2026.

## What the posts do not say

- **No claim about 2026 positions.** The Perfect Season agent notes 37 of the 2026 rookies have no
  position until the January Lahman rebuild. So no "every 2026 player", no "full 2026 rosters".
  "The 2026 season is in" is true. More than that is not yet.
- **No player's name** (the Marketing never-list needs the owner's OK to name one).
- **No count of players or rows.** None is needed, and the data changes in January.
- **Nothing about the lockout.** If one starts on 12-01, a winter post can tie to it then
  (`winter-calendar-2026.md`, P4).

## When

Winter news before Opening Night (2027-03-24). **Suggested: Monday 11-30, 17:00 UTC (12pm ET).** It
goes before the 12-01 labor news, so the winter hook is ours and not a reaction. It spends 1 of 3 X
link posts that week (Monday to Sunday UTC), and leaves two for the lockout post and one more.
Week of 11-23 already carries the Fantasy post (Tue) and a rivalry-week video (Fri), so this
week is full.

## X, option A: the news (link)

```
The 2026 season is in. Run The Diamond now drafts from 1901 to 2026.

$190M cap. 162 games. One World Series.
```

## X, option B: the dare (link)

```
This year's best can now share a roster with every era back to 1901.

Draft it under the $190M cap and see if it wins the World Series.
```

Both carry
`https://runthe.gg/baseball/?utm_source=x&utm_medium=social&utm_campaign=diamond-2026`
in the `link:` header, so the share card shows by itself. A is the plain news. B gives a reason to
send it ("send this to someone who thinks this year's team is the best ever"), so I rank B first
under the playbook, but it is the owner's call.

## Instagram and Facebook (image: the share card)

Instagram needs an image or a video. The post uses the updated share card,
`https://runthe.gg/baseball/og.png`. **A video would be stronger and there is no Diamond shot in
`scripts/marketing/shots/` yet** (only football). Say the word and I build and record one first, then
this waits for the clip.

```
The 2026 season is in. Draft from 1901 to 2026 under a $190M cap, play 162 games, chase the World Series.

Free. No download. runthe.gg/baseball (link in bio)
```

Facebook gets the same text with the clickable link, as the channel notes say.

## Open decisions for the owner

1. X: A or B (or neither)?
2. Monday 11-30, or another day?
3. Instagram and Facebook: post the share card now, or wait for a recorded clip?
