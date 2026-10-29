# Social post queue

One file per post. **Merging a post into main is the approval to publish it.** The Marketing Agent
drafts posts here in pull requests; the owner edits and merges the ones to publish.

`.github/workflows/marketing-publish.yml` publishes X, Facebook and Instagram posts when their
`publish_at` time comes, then moves each file to `marketing/published/` with a link to the post.
Reddit and newsletter posts are never published automatically: post those by hand.

Nothing is published until the accounts are connected (repo secrets) and the repo variable
`MARKETING_LIVE` is set to `true`. Until then the workflow only reports what it would do.

The format, and the rules a post is checked against, are in the header of
`scripts/marketing/publish.mjs`. Check a draft with:

```
node scripts/marketing/publish.mjs --check
```

## Video first

Most posts are a gameplay clip with a one line caption (the owner's call, 2026-10-15). Record one:

```
node scripts/marketing/record.mjs football --out marketing/clips/2026-10-20-football.mp4
```

It plays the game from this checkout in a phone-shaped browser, with the taps visible, and writes a
1080x1920 H.264 MP4. Each game's play-through is a shot in `scripts/marketing/shots/`. Every take is
a different draft, so record a few and keep the best. Watch it before queueing it.

Commit the clip in `marketing/clips/` with its post and point the post at it (`video:
marketing/clips/2026-10-20-football.mp4`). X gets the file uploaded. Instagram (as a Reel) and the
Facebook Page fetch it from runthe.gg, so the clip has to be merged and deployed before the post is
due: queue video posts at least an hour out. A video caption is twenty words at most.

The setup for each account is in the knowledge base at `agents/marketing/marketing-accounts-setup.md`.
