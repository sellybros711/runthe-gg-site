# Data-generation prompt (paste into a regular claude.ai chat)

Run it **once per chunk** — small chunks are more accurate and easier to
spot-check. Save each result as `grid/data/<type>-<chunk>.json`.

Fill in the two `{{...}}` placeholders and paste the matching schema + vocab from
[README.md](./README.md).

---

```
You are compiling a FACTUAL dataset for a daily sports puzzle game. Accuracy is
critical: one wrong fact breaks the game, so it is ALWAYS better to omit a field
than to guess it.

Output ONLY a valid JSON array — no prose, no markdown fences. Each element is one
{{CHUNK, e.g. "NBA athlete"}}. Aim for about {{N, e.g. 40}} entries, spanning
multiple eras — not just current players.

Use EXACTLY this schema:

{{paste the ATHLETE schema block from README.md — or the TEAM / TERM block}}

RULES
- Include ONLY facts you are highly confident are correct and verifiable. If you
  are unsure of a field's value, OMIT that field entirely. Never guess. Omitting
  is free; a wrong value is a bug that ships.
- Do not invent people, teams, or stats. Real, verifiable entries only.
- For "awards" and "milestones", use ONLY the exact strings from this list and
  drop anything not on it:
  {{paste the relevant vocabulary line(s) from README.md}}
- "id": lowercase, "sport_firstname_lastname", globally unique.
- "fame": 5 = household name a casual fan knows; 4 = serious fans know; 3 = solid
  pro; 2 = deep cut; 1 = obscure. Be honest — most entries should be 3-4, few 5s.
- Favor BREADTH — many teams, colleges, birthplaces and eras. Variety is what
  keeps the puzzle from repeating.
- Every entry must be internally consistent (a listed team matches the era, the
  draft year precedes the awards, etc.).

Return the JSON array only.
```

---

## Chunks worth running

**Athletes** (weight NFL + NBA heaviest, MLB close third):
- `NBA athlete` — tier 5, then 4, then 3 (≈40 each)
- `NFL athlete` — tier 5, then 4, then 3
- `MLB athlete` — tier 5, then 4, then 3
- `NHL / Soccer / Tennis / Golf / Boxing / UFC athlete` — **biggest stars only**, tier 4-5, ≈15 each

**Reference:**
- `NFL team`, `NBA team`, `MLB team`, `NHL team` (all franchises)
- `college athletic program` (Power-5 + blue bloods)
- `US city` and `US state` (sports-relevant)
- `sports term / glossary word` per sport (≈30 each)
- `notable coach` per league

After each paste-back: `node grid/build-corpus.js` then
`node grid/match/verify-generator.js`. Read the warnings — they flag dropped
awards and suspicious values to fix at the source.
