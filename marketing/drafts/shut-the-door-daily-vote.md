# Shut The Door: the daily vote on socials (DRAFTS)

**Drafts only. Nothing here is queued, and nothing here can publish.** `publish.mjs` reads only
`marketing/queue/`. Shut The Door is unlisted, so none of this goes out until the owner launches it.
It is not on the newsletter list and these drafts do not add it.

If the launch is after 2026-11-15, the three filled-in days below are not used. The template still
is. Re-run the command at the bottom for the real dates, because the candidates depend on the date.

## What the posts can say about the vote

Every fact here is read from the code, not from memory.

- From 2026-11-16 each day's daily is one of two real closer spots, picked by a vote the day
  before (`modes.js VOTE.EPOCH`, CONTRACT.md 16).
- Who votes: signed in, once, after finishing today's daily. Guests see the two spots.
- It locks at midnight Eastern (the app's own words: "it locks at midnight eastern").
- More votes wins. A tie or no votes plays the first card (A).
- The two candidates come from `modes.js candidates()`, a pure function of the date. A is the first.
  The app lists A first, so every post does too.
- The app names a candidate as the pitcher, then `occasion · spot` (`modes-ui.js cardLine`). The posts
  copy that line exactly. Outs and runners in the longer posts come from the same card
  (`situation.outs`, `situation.bases`).
- Next day the home says `picked by your votes · 63-48` (example only). That count is the only vote
  number a post may use, copied from the app that morning. If the home says "the vote didn't load.
  first pick plays", post no count.

## The app vote counts. The social poll is a mirror.

Every post says it plainly: the poll on X or Instagram is for fun, the vote in the app picks the spot.
That is also the new player hook. Someone who votes on X and wants it to count has to play today's
daily first.

**Merging the two counts: not proposed.** I looked for a sound way and there isn't one today.

- The app vote is one per signed-in player who finished the daily. A social vote can't be checked
  against either, and one person can vote on X, Instagram and Facebook.
- The server locks the winner itself on the first read after midnight. A social count would need
  the owner to type a number into it every night. That's a manual step with no record, on the
  thing everyone's daily depends on.
- Using the social poll only to break a tie was considered too. It has the same manual step. And a
  tie already has a rule (A plays), which every device can work out without the server.

If the owner wants it anyway, that's a contract change (CONTRACT.md 16 and `supabase/160`), not a
marketing one.

## Never in a post

- **The outcome.** Not the result, not a hint. No "rewrite history", "you know how this one ended",
  "do better than he did", no record chase, no series state ("to win it all", "clincher", "facing
  elimination"). The card never shows the outcome, so the post doesn't either.
- **The batters.** The hitters you face are the real ones, in order. Naming who's due up can give a
  spot away. Leave them out.
- Anything the card doesn't hold. The Papelbon card has no team, so the post names none.
- A proxy spot without its flag. Before 2008 there's no pitch tracking, and the game says so
  ("older spots have no pitch tracking. their pitches come from modern pitch data."). A post
  that names one carries the short flag where there's room.
- Reaction voting on Facebook ("like for A, love for B"). Meta treats it as vote baiting and cuts
  the post's reach.

## When

One post a day at 10am Pacific (18:00 UTC in November), on the day the votes are cast. That leaves
11 hours to midnight Eastern. Set the poll on X and Instagram to close before midnight Eastern.

From the second day on, the same post opens with the spot people picked for today.

## The template

`{A}` and `{B}` are the app's lines. `{a}` and `{b}` are the short poll labels (X and Instagram
allow 25 characters an option). `{DD}` is the day being decided, `MMDD`.

### X (posted by hand: publish.mjs has no polls)

Text, then a native poll with two options, `{a}` and `{b}`, length 10 hours.

```
{today line, from day two on}
tomorrow's Shut The Door daily is your call.

{A}
{B}

poll's for fun. the app vote picks it. play today's, then vote.

https://runthe.gg/shut-the-door/?utm_source=x&utm_medium=social&utm_campaign=std-vote-{DD}
```

Today line: `you picked today's. {winner}, {count}.` If there's no count, drop it:
`you picked today's. {winner}.`

Posting by hand from the X app costs nothing against the three API link posts a week, so the link
stays in. If polls are ever automated (X's API takes a poll on a post), that's a publish.mjs change,
and a link post would then count against the budget.

### Instagram story (posted by hand: the API can't add stickers)

One frame. The image is a phone screenshot of the app's "tomorrow's daily" block, taken signed in,
after finishing, **before voting** so no counts show.

- Text at the top: `tomorrow's spot. your call.`
- Poll sticker: question `tomorrow's daily?`, options `{a}` and `{b}`.
- Link sticker: `vote in the app`, to
  `https://runthe.gg/shut-the-door/?utm_source=instagram&utm_medium=social&utm_campaign=std-vote-{DD}`
- Small text at the bottom: `this poll's for fun. the app vote counts.`

From day two, an earlier frame: the home screen screenshot with the `picked by your votes` line on
it. The app's own line carries the count, so nothing is typed.

### Facebook Page

Text plus the link, so the share card shows. No reaction voting. A Facebook story with a poll
sticker is fine (the same frame as Instagram). A feed post asking for reactions is not.

```
{today line, from day two on}
tomorrow's Shut The Door daily is up to you.

{A}. {outs and runners}.
{B}. {outs and runners}.

the vote's in the game. sign in, finish today's daily, and you get one vote. it locks at midnight eastern.

https://runthe.gg/shut-the-door/?utm_source=facebook&utm_medium=social&utm_campaign=std-vote-{DD}
```

### Reddit: doesn't fit

No Reddit draft. A post every day for a vote is repeated self-promotion. The channel playbook rules
that out ("never the same text", "space posts out"), and so do most sports subreddits' rules. I
couldn't read the live rules for r/baseball, r/mlb, r/WebGames or r/browsergames from this session:
reddit.com is blocked by this session's network proxy. Read them before posting anything there.

The Reddit post that fits is one launch post: the builder's story, in r/WebGames or r/browsergames,
or in a sports sub's weekly thread if its rules allow. That belongs in the launch kit, not the daily
vote.

## Day 1: votes on Sunday 2026-11-15, for the 11-16 daily

The first day picked by a vote. Candidates from `modes.js candidates(schedule, '2026-11-16')`:

| | app line | poll label | card |
|---|---|---|---|
| A | Tyler Glasnow · game 6 · 2025 world series · bot 9, up 2 | Glasnow · G6 2025 WS | runners on second and third, nobody out |
| B | Aroldis Chapman · game 7 · 2016 world series · bot 8, up 3 | Chapman · G7 2016 WS | two outs, a runner on first |

**X**, 2026-11-15 18:00 UTC. Poll: `Glasnow · G6 2025 WS` / `Chapman · G7 2016 WS`, 10 hours.

```
first vote ever. you pick tomorrow's Shut The Door daily.

Tyler Glasnow · game 6 · 2025 world series · bot 9, up 2
Aroldis Chapman · game 7 · 2016 world series · bot 8, up 3

poll's for fun. the app vote picks it. play today's, then vote.

https://runthe.gg/shut-the-door/?utm_source=x&utm_medium=social&utm_campaign=std-vote-1116
```

**Instagram story**, 2026-11-15 18:00 UTC. The template frame. Poll options `Glasnow · G6 2025 WS`
and `Chapman · G7 2016 WS`. Link `utm_campaign=std-vote-1116`.

**Facebook**, 2026-11-15 18:00 UTC.

```
first vote ever. you pick tomorrow's Shut The Door daily.

Tyler Glasnow · game 6 · 2025 world series · bot 9, up 2. runners on second and third, nobody out.
Aroldis Chapman · game 7 · 2016 world series · bot 8, up 3. two outs, a runner on first.

the vote's in the game. sign in, finish today's daily, and you get one vote. it locks at midnight eastern.

https://runthe.gg/shut-the-door/?utm_source=facebook&utm_medium=social&utm_campaign=std-vote-1116
```

## Day 2: votes on Monday 2026-11-16, for the 11-17 daily

| | app line | poll label | card |
|---|---|---|---|
| A | Josh Hader · nl wild card game · 2019 · bot 8, up 2 | Hader · 2019 Wild Card | bases empty, nobody out |
| B | Jonathan Papelbon · game 4 · 2007 world series · bot 8, up 1 | Papelbon · G4 2007 WS | bases empty, one out. proxy spot (modern pitch data) |

`{winner}` is `Tyler Glasnow, game 6` or `Aroldis Chapman, game 7`, whichever the home shows.
`{count}` is the home line's count as written (`63-48` in the example).

**X**, 2026-11-16 18:00 UTC. Poll: `Hader · 2019 Wild Card` / `Papelbon · G4 2007 WS`, 10 hours.

```
you picked today's. {winner}, {count}.
now tomorrow's.

Josh Hader · nl wild card game · 2019 · bot 8, up 2
Jonathan Papelbon · game 4 · 2007 world series · bot 8, up 1

poll's for fun. the app vote picks it. play today's, then vote.

https://runthe.gg/shut-the-door/?utm_source=x&utm_medium=social&utm_campaign=std-vote-1117
```

**Instagram story**, 2026-11-16 18:00 UTC. The result frame, then the vote frame. Poll options
`Hader · 2019 Wild Card` and `Papelbon · G4 2007 WS`. Bottom text gets one more line:
`papelbon's is an older spot. modern pitch data.` Link `utm_campaign=std-vote-1117`.

**Facebook**, 2026-11-16 18:00 UTC.

```
you picked today's. {winner}, {count}.
tomorrow's up to you again.

Josh Hader · nl wild card game · 2019 · bot 8, up 2. bases empty, nobody out.
Jonathan Papelbon · game 4 · 2007 world series · bot 8, up 1. bases empty, one out. (an older spot, so its pitches come from modern pitch data)

the vote's in the game. sign in, finish today's daily, and you get one vote. it locks at midnight eastern.

https://runthe.gg/shut-the-door/?utm_source=facebook&utm_medium=social&utm_campaign=std-vote-1117
```

## Day 3: votes on Tuesday 2026-11-17, for the 11-18 daily

| | app line | poll label | card |
|---|---|---|---|
| A | Francisco Rodríguez · september 13, 2008 · top 9, up 3 | Rodríguez · 9/13/2008 | mariners at angels. bases empty, nobody out |
| B | Brian Wilson · game 5 · 2010 world series · bot 9, up 2 | Wilson · G5 2010 WS | bases empty, nobody out |

`{winner}` is `Josh Hader, 2019 wild card` or `Jonathan Papelbon, game 4`.

**X**, 2026-11-17 18:00 UTC. Poll: `Rodríguez · 9/13/2008` / `Wilson · G5 2010 WS`, 10 hours.

```
you picked today's. {winner}, {count}.
now tomorrow's.

Francisco Rodríguez · september 13, 2008 · top 9, up 3
Brian Wilson · game 5 · 2010 world series · bot 9, up 2

poll's for fun. the app vote picks it. play today's, then vote.

https://runthe.gg/shut-the-door/?utm_source=x&utm_medium=social&utm_campaign=std-vote-1118
```

**Instagram story**, 2026-11-17 18:00 UTC. The result frame, then the vote frame. Poll options
`Rodríguez · 9/13/2008` and `Wilson · G5 2010 WS`. Link `utm_campaign=std-vote-1118`.

**Facebook**, 2026-11-17 18:00 UTC.

```
you picked today's. {winner}, {count}.
tomorrow's up to you again.

Francisco Rodríguez · september 13, 2008 · top 9, up 3. mariners at angels, bases empty, nobody out.
Brian Wilson · game 5 · 2010 world series · bot 9, up 2. bases empty, nobody out.

the vote's in the game. sign in, finish today's daily, and you get one vote. it locks at midnight eastern.

https://runthe.gg/shut-the-door/?utm_source=facebook&utm_medium=social&utm_campaign=std-vote-1118
```

## Before each post: re-read the candidates

The candidates depend on the date and on `data/schedule.json`'s rotation. A rebuilt rotation moves
them. Check the day before, from the site repo's root, with the day being decided:

```
node -e "const M=require('./shut-the-door/modes.js'),s=require('./shut-the-door/data/schedule.json');for(const d of process.argv.slice(1))M.candidates(s,d).forEach((id,i)=>{const c=s.packs[id].card,t=c.situation;console.log(d,i?'B':'A',c.pitcher,'|',c.title,'|',t.half,t.inning,'up',t.score.us-t.score.them,'|',t.outs,'out, bases',t.bases,'|',c.resolution)})" 2026-11-16 2026-11-17 2026-11-18
```

`bases` is a bitmask: 1 first, 2 second, 4 third (6 is second and third). `resolution: proxy` gets
the flag. The app's tomorrow block is the final word: if it disagrees with this file, the app is
right.
