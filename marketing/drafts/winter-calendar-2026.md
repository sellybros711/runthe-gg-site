# Winter calendar, 2026-11-16 to 2027-03-24 (DRAFTS)

**Drafts only. Nothing here is queued and nothing here can publish.** `publish.mjs` reads only
`marketing/queue/`. The owner approves every post. This answers the hub's four asks, taken from the
Advisor's reviews of 2026-11-16 (vault: `agents/advisor/reviews/2026-11-16-*.md`).

Every date below comes from those reviews, which cite their sources. **Re-check each one on the day**
(a schedule moves, a lockout ends). Every number in a post is read from the live game that morning.

## Ground rules this plan keeps

- **Only launched games.** Shut The Door, Run The Diamond, The Perfect Season (and its Fantasy
  Challenge), College Football and Run The Pitch are on `games.json`. **The College Fantasy for the
  Playoff is being built (12-18 onward). No post names it until it ships.** The same goes for the
  Diamond's 2026 season (ask 4).
- **Budget:** at most three X posts with a link a week. Each week below spends at most three.
- **Cadence:** one post a day, two at most, per `x-growth-playbook.md` (our 2nd post in a feed scores
  x0.625). One idea per post. A reason to send it.
- **A player's name or data in a post needs the owner's OK** (the Marketing never-list). The K-Rod
  post below is held on that.
- **The lockout is the owners' move.** No copy blames the players.
- **Shut The Door posts never give the outcome or the batters** (see
  `shut-the-door-daily-vote.md`).

## The calendar

| date | moment | game | post |
|---|---|---|---|
| Tue 11-24 | NFL Week 12 opens (Thanksgiving week) | Perfect Season Fantasy | P1 |
| Wed 11-25, 8pm ET | Packers at Rams, the first Thanksgiving Eve game (Netflix); entries lock at this kickoff | Perfect Season Fantasy | P1 reminder (a reply, not a post) |
| Thu 11-26 | Thanksgiving | Perfect Season | P2 |
| Thu 11-26 to Sat 11-28 | College rivalry weekend | College Football | P3 (the 15-0 trailer) |
| Tue 12-01 | MLB's labor deal expires | Shut The Door | P4a or P4b, the day the news breaks |
| Fri 12-04 and Sat 12-05 | College championship weekend | College Football | P5 |
| Sun 12-06 | Contemporary Era committee announces | Run The Diamond | hold, see below |
| Fri 12-18 | CFP first round starts (12-18 and 12-19) | College Football (and the Playoff Fantasy, **only if shipped**) | P6 |
| Fri 12-25 | Week 16, three NFL Christmas games | Perfect Season Fantasy | P7 |
| Wed 12-30, Fri 01-01 | CFP quarterfinals | College Football | reuse P6 |
| Thu 01-14, Fri 01-15 | CFP semifinals | College Football | reuse P6 |
| mid to late January | BBWAA Hall of Fame vote (2026's was 01-20) | Shut The Door | P8, held on the owner's OK |
| Mon 01-25 | CFP title game, Las Vegas | College Football | P9 |
| Sun 02-14 | Super Bowl LXI | Perfect Season | later |
| Wed 03-24 | MLB Opening Night 2027, if there is a season | Run The Diamond, Shut The Door | later |

**Shut The Door's daily vote is live since 11-05** (the vote moved from 11-16, the owner's call of
11-03). So `shut-the-door-daily-vote.md` and its drafts for 11-16 to 11-18 are **superseded** by
this file. Its template still holds. A vote post posted by hand from the X app costs nothing against
the three API link posts a week.

## Drafts, in date order

`{...}` is read from the live game on the day.

### P1: Perfect Season Fantasy, Tuesday 11-24 (X, link, spends 1 of 3)

```
Week 12 of the Fantasy Challenge is open. It locks Wednesday at 8pm ET, because the Thanksgiving Eve game, Packers at Rams, kicks off then.

Build your lineup before then.

https://runthe.gg/football/fantasy/?utm_source=x&utm_medium=social&utm_campaign=ps-fantasy-w12
```

Check: the page's URL and the lock time on the day. **The owner chose to keep the lock at the first
kickoff, Wednesday 11-25 at 8pm ET** (relayed by the Perfect Season Agent). The window is about 36
hours, so post first thing Tuesday and say the lock plainly.

### P2: Perfect Season, Thursday 11-26 (X, plain text, no link)

```
The Perfect Season has a badge for playing on Thanksgiving.

Link in bio.
```

Check: the badge is "Thanksgiving football: Play on Thanksgiving" in `achievements.js`. Read the
live name and rule that morning. Say nothing about the second badge until we know its rule.

### P3: College Football, rivalry weekend (video, X and Reels and Facebook)

The 15-0 trailer, with a rivalry hook:

```
Rivalry week. Draft six players and go 15-0.
```

Check: the trailer still awaits the owner's sign-off. The "six players" and "15-0" come from the
game's own draft and are re-read before posting. Post it Friday 11-27, once. **Spends 1 of 3.**

### P4a: Shut The Door, if a lockout starts (X video, spends 1 of 3)

Use the finished 4:5 video (v9). Post within a day of the news, not after 48 hours.

```
Baseball is locking out. Now it's time for you to lock in.

runthe.gg/shut-the-door
```

### P4b: Shut The Door, if a deal is reached

```
No lockout. One real save a day anyway.

runthe.gg/shut-the-door
```

### P5: College Football, championship weekend (X, plain text)

```
Championship weekend. Your 12 team playoff, your six players.

Link in bio.
```

Check: "12 team playoff" is in the game today (the Advisor read it). Re-read it.

### P6: College Football, Playoff (X video, spends 1 of 3)

Posted 12-18, then reused for each round with the round named. **If the College Fantasy for the
Playoff has shipped by then, this becomes its launch post, with its link. It is not drafted here
because it does not exist yet.** The agent that builds it supplies its URL, its rules and its prize
(if any), and the claim is read from that.

```
The Playoff starts today. You can run your own, with six players from any year.

runthe.gg/cfb
```

### P7: Perfect Season Fantasy, Christmas week (X, link)

```
Three NFL games on Christmas. The Fantasy Challenge is open.

Build the lineup.
```

Check: the live board fix for Thanksgiving week and Christmas is in site PR 1010, waiting on the
owner's merge. **P7 posts only once PR 1010 is merged.** Confirm on 12-23.

### P8: Shut The Door, Hall of Fame day (held)

An idea from the Advisor: a post on the vote's day for Francisco Rodriguez, whose 2008 save is one
of our thirty spots. **Held** for the owner's OK to name him (the never-list), and it must not name
the result of the spot. Draft once the date and the owner's word are in:

```
The Hall of Fame vote is today. Pitch the 2008 save yourself.

runthe.gg/shut-the-door
```

### P9: College Football, the title game (X)

Drafted on 01-20 from the live game, once the teams are known.

## Run The Diamond: nothing to post until it ships

The Diamond's 2026 season is "the one piece of news this game can make in the winter". The Advisor
has asked the Diamond's agent to add it. **I draft the post the day it ships**, from that agent's note
and the page's own description (which reads "1901-2025" today). A line that is ready then:

```
The 2026 season is in. Draft from 1901 to 2026.
```

Do not use it before the game's page says so.

## Ask 1: measuring

### What each game sends today (from the Advisor)

| game | today | the ask |
|---|---|---|
| Shut The Door | GA on the page, **no events** | five events: `std_start`, `std_finish` (outcome, mode, pitches), `std_share`, `std_vote`, `std_survivor_end`, and `from` when a visit came from the Diamond's promo (shut-the-door-ui) |
| College Commish | nothing, no GA | events when added (the cfb agent) |
| College Fantasy | GA loaded, **no events** | draw used, lineup saved, entered, swap, live opened (the cfb agent) |
| The Perfect Season's Fantasy | GA loaded, **no events** | the same list, plus a weekly read of `fantasy_entries` (the perfect-season agent) |
| 4th and What | its own `game_events` table (eight events), **no GA tag** | not launched yet, so none from me |

I do not add events. I ask each agent for the list above, and I read what they ship. The agents
named are the owners. Once an event lands I add it to the weekly read.

### The weekly read, starting now with Shut The Door's three tables

Run on Monday. It reads `shutdoor_outings`, `shutdoor_votes` and `shutdoor_survivor`. These hold
**signed-in plays only**, so every number undercounts: a guest who plays and never signs in is not in
them. Read the trend, not the size. (The day column is the Eastern day.)

```sql
-- Shut The Door, the last 7 days. Read only: safe to run as often as you like.
-- Supabase, SQL Editor, New query. Any day: it changes nothing.
select 'signed in outings' as what, count(*)::text as n
  from public.shutdoor_outings where day >= current_date - 7
union all
select 'players', count(distinct user_id)::text
  from public.shutdoor_outings where day >= current_date - 7
union all
select 'door shut', coalesce(round(100.0 * count(*) filter (where outcome = 'door_shut') / nullif(count(*), 0))::text || '%', '-')
  from public.shutdoor_outings where day >= current_date - 7
union all
select 'median percentile', coalesce((percentile_cont(0.5) within group (order by percentile))::int::text, '-')
  from public.shutdoor_outings where day >= current_date - 7
union all
select 'votes cast', count(*)::text
  from public.shutdoor_votes where day >= current_date - 7
union all
select 'survivor runs started', count(*)::text
  from public.shutdoor_survivor where day >= current_date - 7
union all
select 'best survivor run (saves)', coalesce(max(saves), 0)::text
  from public.shutdoor_survivor where day >= current_date - 7;
```

To confirm it worked: the first row should match
`select count(*) from public.shutdoor_outings where day >= current_date - 7;`.

If the owner wants it to run itself, that is a workflow for **shut-the-door-game** (it owns the
tables), not a change from me.

### What goes in the report

Each Monday, one line each: outings and players against last week, door shut rate, votes cast per
day, Survivor runs, and the X Analytics export's link clicks (`utm_source=x`). A post's effect is
read against these. The first read waits for the owner's X export (see the playbook).

## Open decisions for the owner

1. Approve the P-posts, one at a time. Nothing is queued until you do.
2. Name a player in a post (P8)? Yes or no.
3. Which of P4a or P4b depends on the news on 12-01. Do you want a draft kept ready for both?
