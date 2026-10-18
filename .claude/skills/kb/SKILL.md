---
name: kb
description: Look things up in, and write back to, the Run The Games knowledge base (the private Obsidian vault sellybros711/runthe-gg-kb). Use before designing or changing any game (why it works the way it does, owner rulings, past bugs, rosters and data, economy), when a game's CLAUDE.md points to a note, and after a meaningful change to a game so its notes stay true.
---

# The knowledge base

`sellybros711/runthe-gg-kb` is the long-term memory for every game. Each game's `CLAUDE.md` in this
repo holds only the rules a change must keep; the why, the history, the owner's rulings and past
bugs are in the vault. GitHub is the source of truth. The owner reads and edits it in Obsidian on a
Mac and an iPhone.

## 1. Get the vault

- **Cloud session:** it is at `/home/user/runthe-gg-kb` when the session has it. If that folder is
  missing, attach it with the `add_repo` tool (owner `sellybros711`, repo `runthe-gg-kb`), clone it
  where the tool says, and register it.
- **The owner's Mac:** `~/Documents/GitHub/runthe-gg-kb` (cloned by GitHub Desktop).
- Run `git -C <vault> pull` first. The owner may have edited it on the phone since your last look.

If the vault cannot be reached, say so, and carry on only with work the code alone can answer.

## 2. Look things up, cheaply

Never read the vault wholesale. In order:

1. `node scripts/find.mjs <words>` from the vault root. Add `--game <game>` to narrow it. It prints
   the matching notes with a summary and a line each. This is usually enough to pick one or two notes.
2. `games/<game>/<game>-overview.md` lists every note for that game, with what each is for.
3. **Read `games/<game>/<game>-owner-rulings.md` before any design work.** Those calls are not up for
   re-deciding; a change against one needs the owner.
4. Open only the notes the task needs.
5. `history/` is the verbatim record from before the migration. Search it with `--history` only when
   the live notes do not answer. Do not edit it.

Game folders: `football` (The Perfect Season and the Fantasy Challenge), `cfb`, `hoops`, `baseball`,
`golf` (Run The Tour and Putt Putt), `shut-the-door` (Shut The Door), `mythiball`, `wrestling`, `setlist` (Segue),
`arcade`, `last-shot`, `4th-and-what` (4th and What).
Site-wide rules: `platform/`. Bugs and QA findings: `qa/issues/`. Agent specs: `agents/`.

## 3. Write back after a meaningful change

A meaningful change is one that changes how a game behaves, a rule a future change must keep, a
number a player sees, the data, or something a bug taught. A typo fix or a refactor that changes
nothing visible is not.

1. Find the note it belongs in with `find.mjs`. **Edit the existing note**; a second note on one
   topic is the failure this vault exists to prevent. A new note only for a genuinely new topic,
   started from `_templates/` (decision, bug, feature, golf-hole, qa-report).
2. **Decisions are append-only.** A changed decision is a new dated note
   (`games/<game>/decisions/YYYY-MM-DD-<game>-<slug>.md`) with `supersedes: [old-note]`; the old one
   gets `status: superseded` and a link forward, and nothing else in it changes.
3. A bug worth remembering goes in `qa/issues/YYYY-MM-DD-<slug>.md`: symptom, cause, fix, and the
   check that now guards it.
4. If the change also alters a rule a code change must keep, update the game's `CLAUDE.md` in this
   repo too, in the same piece of work.
5. Every note needs its header (title, game, area, status, updated, summary). No em or en dashes.
6. In the vault: `node scripts/build-index.mjs`, then `node scripts/check-vault.mjs`. Both must pass.
7. Commit on a `claude/*` branch and open a pull request. **Never push to `main`**; the owner edits
   `main` from Obsidian.
8. **Merge your own vault PR once `vault-check` is green.** Never on red. If the owner has edited the
   same lines since, merge `main` into the branch first, and stop and ask if the edits collide.

PRs on this repo (`runthe-gg-site`) are never merged by Claude. Those go live on the site; the owner
merges them.
