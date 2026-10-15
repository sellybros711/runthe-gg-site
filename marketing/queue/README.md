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

The setup for each account is in the knowledge base at `agents/marketing/marketing-accounts-setup.md`.
