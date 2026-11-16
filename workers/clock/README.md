# The clock

A Cloudflare Worker that starts the site's clock-critical GitHub workflows on time.

GitHub's scheduled runs are best effort. The Tuesday 8am Fantasy build first ran 6 to 8 hours
late on 10-27, 11-03 and 11-10, and only opened on time because the owner pressed Run workflow.
Cloudflare's cron triggers run on time, so this Worker ticks every five minutes and starts what
is due with GitHub's `workflow_dispatch` API. Every workflow keeps its own GitHub cron as a
second net, and each is safe to start twice.

| Job | When (Eastern) |
|---|---|
| `fantasy-pool.yml`, catch-up | Tuesday 8:05am |
| `fantasy-watchdog.yml` | Tuesday hourly 9am to 11pm, Wednesday every two hours, Thursday every two hours to 6pm |
| `fantasy-live.yml` | 20 minutes before every kickoff in `football/data/nfl_schedule.json`, and 10 minutes after |

The jobs live in one list in `clock.mjs`. Add a game's jobs there.

```
node workers/clock/check-clock.mjs      the decisions, offline: clock changes, Thanksgiving, Christmas
```

## Setting it up (once)

1. **A GitHub token for the clock.** GitHub, Settings, Developer settings, Personal access tokens,
   Fine-grained tokens, Generate new token. Repository access: only `runthe-gg-site`.
   Permissions: Actions, Read and write. Nothing else. Pick an expiry and put a reminder in your
   calendar to renew it.
2. **Three repository secrets.** In `runthe-gg-site`, Settings, Secrets and variables, Actions:
   - `CLOCK_GH_TOKEN`: the token from step 1.
   - `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with "Workers Scripts: Edit".
   - `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.

   The last two may already be there for the league tool's deploy.
3. **Deploy.** Actions, "Deploy the clock", Run workflow, tick "Actually deploy".
4. **Check it.** Cloudflare dashboard, Workers & Pages, `runthe-gg-clock`, Logs. Each tick logs
   what it started and GitHub's answer (204 is success), or "nothing due".

The token can only start workflows. It cannot push, read secrets or touch the database.
