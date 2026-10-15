# Repo conventions

These load in every session, so they are the short form. The full story behind each rule (why it
exists, how it broke before) is in the knowledge base, `platform/` (see the last section).

## Never use em dashes or en dashes

No `—`, no `–`, anywhere: player copy, placeholders, code comments, `<title>` tags, commit messages,
PR descriptions. Nor the entities and escapes that make them: `&mdash;`, `&ndash;`, `&#8212;`,
`&#8211;`, `—`, `–`. This is a hard rule. If a sentence seems to need one, rewrite the sentence.

| Instead of | Use | Example |
|---|---|---|
| explanation or naming | a colon | `Freshness 40/100: starting to go stale` |
| a second full sentence | a full stop | `Rep is there. You need OVR 62.` |
| a clause starting "and", "but", "so" | a comma | `You showboated, and paid for it.` |
| a genuine aside | parentheses | `(the bars above are damage taken, not lives)` |
| a number range | a hyphen | `out 1-8 weeks`, `elite 88-96` |
| fields on one line | a middot `·` | `CDP · Indie Circuit · Year 1` |
| an empty value or a score | a hyphen | a blank stat tile shows `-` |
| a fragment the dash was propping up | nothing | delete it and close the gap |

```
node scripts/check-dashes.mjs                     the guarded directories (CI runs it)
node scripts/check-dashes.mjs path/to/file-or-dir anything ad hoc
```

`GUARDED` in that script and the `paths:` in `.github/workflows/dash-check.yml` are two copies of one
list. Add a directory to both, in the same commit, and only after cleaning it. A sweep must read its
own diff for non-comment lines: a dash can be an empty value, not punctuation.

## Short sentences. Few commas.

Player copy is read on a phone, mid-game. Write short declarative sentences. A comma splicing two
clauses is two sentences: `Needed 10. Won 14. Season 4 needs 11.` Code comments can run long.

The football and college games talk like the owner: casual, contractions, hype saved for big moments.

```
node scripts/check-copy.mjs          the strings a player sees (--list prints them all)
```

## A number a player reads is the number the game plays

When a number is in copy, interpolate it from the engine or write the sentence without it. Static
pages cannot interpolate, so `check-numbers` holds them, and it records its own coverage: a reworded
claim that it no longer finds fails, so re-record with `--update`.

```
node scripts/check-numbers.mjs       (--list, --update)
```

## Sibling scripts carry a hand-written cache version

A change to a versioned file (`engine.js?v=52`, or a data file like `players.json?v=3`) is three
things in one commit: the edit, the bump, and the record.

```
node scripts/check-cachebust.mjs            verify
node scripts/check-cachebust.mjs --update   after bumping
```

A page that pins a module's `API_VERSION` (`BOARD_VERSION`, `NEED_BOARD` and the like) falls back to a
stub that answers null when they disagree. That fails SILENTLY, so move the pair together.

## No game opens a tutorial by itself

The owner's call (2026-10-13). Every guide is behind a button. Nothing calls one on a timer, on boot
or on a first screen.

## The release newsletter

`scripts/newsletter/README.md` is the runbook. A game goes on `scripts/newsletter/games.json` the day it
goes on the home page and not before. Addresses live in `newsletter_subscribers`, never in `profiles`.

## The knowledge base

Long-term knowledge lives in a separate private repo, `sellybros711/runthe-gg-kb` (an Obsidian
vault). Each game's own `CLAUDE.md` here holds only the rules a change must keep, and points at its
notes there.

- In a cloud session it is cloned at `/home/user/runthe-gg-kb`. If it is not, attach it with
  add_repo before a design task. A small code fix can go ahead without it.
- The `kb` skill (`.claude/skills/kb/SKILL.md`) has the steps: how to reach it, look things up
  with `node scripts/find.mjs <words>`, and write back.
- After a meaningful change to a game, update its note there by pull request. Claude merges its own
  vault PRs once `vault-check` is green (that repo's `CLAUDE.md` has the rules).
- Never put session logs or progress notes in any `CLAUDE.md`. Decisions go in the knowledge base.
