# X growth playbook (DRAFT, for the owner)

Drafts only. Nothing here posts. Built from the owner's prompt (the "X Algorithm Explained, In Depth"
post by @ryangrowthh) and checked against the code at github.com/xai-org/x-algorithm, commit
`b220448` (2026-11-03). The post itself could not be opened from this session (x.com is outside its
network), so every number below is read from the repo, not from the post.

Anything marked **(interpretation)** is a reading of the code, not something the code says.

## 1. How a post reaches For You (3 stages)

**Scouts: who gets a look at the post.**
- Thunder: people who follow @RunTheGG.
- Phoenix: strangers whose history looks like the people who engage with us.
- SimClusters: the baseball and sports-game niches we sit in.

**Judge: what each viewer is predicted to do.** Each weight multiplies the *predicted chance* of
that action for that viewer, not a count (`home-mixer/params/param.rs`, which says so in its own
comments).

| positive | weight | negative | weight |
|---|---|---|---|
| copy-link share | 20.0 | report | -234.0 |
| reply | 5.0 | mute author | -58.8 |
| reply, from a mutual follow | 5.0 + 15.0 = 20.0 | not interested | -52.272 |
| quote | 5.0 | block author | -31.2 |
| share via DM | 5.0 | scrolled past | -0.02 |
| follow author | 4.0 | | |
| share (other) | 2.0 | | |
| repost | 1.0 | | |
| like | 0.66 | | |
| dwell on a click | 0.4 | | |
| click | 0.3 | | |
| open link | 0.2 | | |
| profile click | 0.0 | | |

Three things in the code the image leaves out, all of which matter to a small account:

- **Mutuals count 4x on replies.** The bidirectional boost (shipped July 2026, `docs/BIDIRECTIONAL_BOOST_CHANGE.md`)
  adds 15 to the reply weight when the viewer and the author follow each other.
- **The first 2 hours are an audition.** `author_cold_start.rs`: an author with 50,000 followers or
  fewer, on a post under 2 hours old with under 200 home impressions, gets sampled into exploration
  slots by its **like rate** (likes per home view). So for us, early likes from real followers matter
  far more than the 0.66 suggests.
- **Our own posts compete with each other.** Author diversity (`scoring.rs`: decay 0.5, floor 0.25):
  our 2nd post in one viewer's feed scores x0.625, the 3rd x0.44, the 4th x0.34.

**Bouncer: what gets thrown out.** Posts over 48 hours old (`MAX_POST_AGE`), posts the viewer already
saw, muted keywords, spam and low reputation accounts. Video heads only count a video over 10
seconds (`MinVideoDurationMs` 10,000).

One more from the code's comments: an action only counts when the post was served in the Home
timeline. Sending friends the link in a group chat to like it does nothing for ranking.

## 2. Audit of the last 30 days

**Not done: no data reachable.** This session can't open x.com, and the X app was set up to post only
and never read (`marketing-accounts-setup.md`). The only signal on file is the owner's: College
Football has done best. The pipeline itself has published nothing (the log: PR 528 withdrawn, the
vote drafts held).

To run it: on x.com, Analytics, then Content, then Export data (last 28 days). Put the CSV in the chat.
The audit will then show, per post: shares, replies, quotes and follows against likes, the multi-idea
posts, anything likely to draw "not interested" or a mute, and whether posting days overlap.

## 3. Ten changes, ranked by reach impact

1. **Make every post something to send.** Copy-link share is 20.0, DM 5.0. The daily save is a group
   chat object: one spot, one day, a score to compare. End posts with a reason to send it ("send this
   to the guy who says he could close"), not "like and RT". Targets: copy link 20, DM 5.
2. **Turn followers into mutuals.** Follow back every real baseball fan, writer and creator who
   engages. Their replies to us then weigh 20 instead of 5. No follow trains or engagement groups.
   Target: the bidirectional reply boost.
3. **Stay on the post for its first 2 hours.** Post when the audience is up (evenings Eastern for
   baseball, game windows for football) and answer every reply. The cold start sampler is reading our
   like rate the whole time. Target: cold start slots, reply 5.
4. **One idea per post.** One game, one hook, one link. A post with four bullets asks for four
   different reactions and gets none, and a viewer who only wanted one of them taps "not
   interested" (-52.3). Target: not interested.
5. **Hook in the first second, 10 seconds or longer.** The trailers already open on the hook line.
   Keep every video past 10 s so the video heads score it, and cut dead air so people don't scroll
   past. Target: dwell 0.4, video gate, not dwelled.
6. **Ask a real question people want to answer.** "ABS challenges in the World Series: yes or no?"
   earns replies and quotes (5.0 each) because people have an opinion, and it fits a game that has
   the challenge in it. Never "reply with your team". Target: reply 5, quote 5.
7. **One post a day, two at most, hours apart.** Our 3rd post in a feed is worth 0.44 of the first.
   A thread or a burst of posts mostly competes with itself. Target: author diversity.
8. **Ride the calendar, inside 48 hours.** A post is dead after 48 hours. Post on the moment
   (the lockout news, the Hall of Fame vote, a bowl game), never days later. Bring back an evergreen
   clip as a new post with a new hook. Target: the 48 hour filter, Phoenix.
9. **Make the profile the follow.** Follow is 4.0, and it comes from a profile visit. Pin the best
   trailer, keep the bio to one line ("free daily sports games. no download."), and run series that
   give a reason to come back ("Save #12"). Target: follow 4.0.
10. **Never do the things that cost hundreds.** No tagging big accounts that didn't ask, no repeated
    identical posts, no rage bait about players. One report (-234) or mute (-58.8) outweighs a lot
    of likes for that viewer and people like them. Target: report, mute, block.

## 4. Three rewrites

These are our three weakest drafts on file, judged by the rules above (no live data yet).

**A. The daily vote post (`shut-the-door-daily-vote.md`).** Weak: four ideas (vote, today's pick,
the app vote disclaimer, play first) and nothing to send.

```
tomorrow's save is your call.

{A}
or
{B}

vote in the app after today's. send this to whoever you'd trust with the ball.

https://runthe.gg/shut-the-door/?utm_source=x&utm_medium=social&utm_campaign=std-vote-{DD}
```

One idea (pick tomorrow's spot), a specific reader (a baseball fan with an opinion), a CTA that
earns a copy-link share. Keep the X poll with it. The "poll's for fun" line moves to the first reply.

**B. The long lockout caption, on X.** Weak on X: five ideas in one post. Use the hook alone with
the video, and put the rest in the replies under it.

```
Baseball is locking out. Now it's time for you to lock in.

runthe.gg/shut-the-door
```

Then two of our own replies, one idea each: "Survivor Mode: how many saves in a row can you make?"
and "Every pitch is graded on real pitching and batting data. Post your Pitching IQ." The bullets
stay whole on Instagram and Facebook, where they work.

**C. The trailer post that only announces.** Weak: "here's our game" gives nobody a reason to reply
or send it. Swap the announcement for a dare tied to the clip.

```
One real save. The real batters, in order.

Close it, then send it to someone who can't.

runthe.gg/shut-the-door
```

## 5. Weekly reach check (every Monday)

From the X Analytics export, for the last 7 days:

| check | goal |
|---|---|
| (shares + replies + quotes) per 1,000 impressions, per post | going up week on week |
| follows per post | at least 1 on every video post |
| posts with likes but 0 replies, 0 shares | fewer each week: rewrite their format |
| posts per day | 1, never more than 2 |
| new mutual follows with baseball accounts | 10 a week |
| link clicks to runthe.gg (UTM `utm_source=x`) | the number that pays |
