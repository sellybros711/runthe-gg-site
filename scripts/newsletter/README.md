# The release newsletter

Players ask for an email when something big ships. When it does, an agent drafts
the email, you approve it in GitHub, and it goes to everyone on the list.

| Piece | Where |
|---|---|
| The list, and the rules for joining and leaving it | `supabase/121_newsletter.sql` (test: `supabase/test/newsletter_test.sql`) |
| The checkbox in each game's profile and on the home page | `/assets/newsletter.js` |
| The home page email box for guests | `index.html` (`#news`) → `/api/newsletter/subscribe` |
| Confirm and unsubscribe links | `functions/api/newsletter/` |
| The drafting agent | `scripts/newsletter/draft.mjs` |
| The sender | `scripts/newsletter/send.mjs` |
| The template | `scripts/newsletter/render.mjs` |
| Which games it may talk about | `scripts/newsletter/games.json` |
| The workflow | `.github/workflows/newsletter.yml` |

## One-time setup

1. **Run the migration.** Paste `supabase/121_newsletter.sql` into the Supabase SQL editor.
2. **Resend.** Make an account at resend.com, add the domain `runthe.gg`, and add the DNS
   records it shows you in Cloudflare (DNS for runthe.gg). Wait for "Verified". Create an
   API key with sending access.
3. **Cloudflare Pages** (Settings > Environment variables, Production): add `RESEND_API_KEY`.
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE` are already there for Stripe.
4. **GitHub secrets** (Settings > Secrets and variables > Actions):
   - Secrets: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`.
   - Variables: `NEWSLETTER_POSTAL_ADDRESS` (required, see below) and optionally
     `NEWSLETTER_PREVIEW_TO` (defaults to runthegames@outlook.com).
5. **The approval gate.** Settings > Environments > New environment, name it `newsletter`,
   tick **Required reviewers** and add yourself. The send job refuses to run without this.

**The postal address is a legal requirement.** US law (CAN-SPAM) requires a physical postal
address in every newsletter. A P.O. box or a virtual mailbox is fine. The sender refuses to run
without one rather than print a placeholder.

## Sending an issue

Either publish a GitHub Release (its description becomes the notes the email leads with), or
go to Actions > Release newsletter > Run workflow and type what you want said.

1. The **draft** job reads the commits since the last issue that touched a launched game, has
   Claude write the email, and mails a `[PREVIEW]` copy to you. The text is also in the run's
   summary.
2. The **send** job waits. Open the run and press **Review deployments**. **Approve and
   deploy** mails everyone on the list. **Reject** throws the draft away.

Don't like the draft? Reject it and run the workflow again with better notes.

## Launching a game

Add it to `games.json` on the day it goes on the home page. Until it is on that list, the
agent never sees a commit about it, so an unreleased game cannot leak into an email.

## Rules worth knowing

- Addresses are never public. `profiles` is world-readable, so they live in their own table,
  which no browser role can read.
- A signed-in player's address comes from their account on the server. A checkbox can't sign
  up somebody else.
- A guest isn't mailed until they confirm. The form answers the same way whether or not an
  address is already on the list, and it sends at most one confirm email per address every
  15 minutes (five total).
- Every email carries its reader's own unsubscribe link, plus the `List-Unsubscribe` header
  Gmail and Outlook turn into a one-click button.
- The model writes words only. The template supplies every tag and link, and escapes what the
  model wrote.
