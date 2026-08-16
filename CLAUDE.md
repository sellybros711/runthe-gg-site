# Repo conventions

## Never use em dashes or en dashes

No `—`, no `–`, anywhere. Not in copy the player reads, not in placeholder
strings, not in code comments, not in `<title>` tags, not in commit messages,
not in PR descriptions. The same goes for the entities and escapes that produce
them: `&mdash;`, `&ndash;`, `&#8212;`, `&#8211;`, `—`, `–`.

This is not a style preference to weigh against readability. It is a hard rule.
If a sentence seems to need one, the sentence needs rewriting.

**Write this instead**, in rough order of how often it is the right answer:

| Instead of | Use | Example |
|---|---|---|
| explanation or naming | a colon | `Freshness 40/100: starting to go stale` |
| a second full sentence | a full stop | `Rep is there. You need OVR 62.` |
| a clause starting "and", "but", "so" | a comma | `You showboated, and paid for it.` |
| a genuine aside | parentheses | `(the bars above are damage taken, not lives)` |
| a number range | a hyphen | `out 1-8 weeks`, `elite 88-96` |
| fields on one line | a middot `·` | `CDP · Indie Circuit · Year 1` |
| a fragment the dash was propping up | nothing | delete it and close the gap |

Two dashes in one sentence (`X — like this — Y`) almost always wants commas or
parentheses, never one of each.

### Enforcement

```
node scripts/check-dashes.mjs
```

Exits non-zero and prints `file:line` for every offender. It runs in CI on any
push or pull request touching `wrestling/**` (`.github/workflows/dash-check.yml`).

The guarded list inside that script is currently just `wrestling/`. The rest of
the repo predates the rule and still contains hundreds of em dashes; add a
directory to `GUARDED` only after cleaning it, never before, or the check
becomes noise people learn to ignore.

Run the checker against anything ad hoc:

```
node scripts/check-dashes.mjs path/to/file-or-dir
```

## The wrestling game

`wrestling/index.html` is the whole career game in one self-contained file, by
site convention (the golf game at `golf/index.html` is the model). A name
collision anywhere in that script kills the entire thing, and the browser only
reports the symptom (`X is not defined`), so after editing:

```
python3 -c "
import re
s=open('wrestling/index.html').read()
b=max(re.findall(r'<script[^>]*>(.*?)</script>',s,re.S),key=len)
open('/tmp/x.js','w').write(b)
" && node --check /tmp/x.js
```

The game is unlisted: not linked from the homepage, nav or sitemap, and
noindexed. Keep it that way unless asked.
