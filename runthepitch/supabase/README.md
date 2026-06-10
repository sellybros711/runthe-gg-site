# Leaderboard cleanup & anti-forgery hardening

The old leaderboard trusted a **browser-computed** score: the client called
`submit_draft(p_overall, …)` and the server stored whatever number it was sent.
Anyone could open dev-tools and POST a 99.9 champion without playing. That's how
the forged top scores (a 99.1 + a cluster of 94–96.8 on 2026-06-10, vs a 93.0
all-time ceiling across the prior ~2,270 drafts) got onto the board.

This folder fixes it. Run the files **in order** in the Supabase **SQL editor**
(they need owner/service rights — the public anon key can't DELETE or replace
functions, which is the whole point).

## Run order

1. **`01_delete_forged.sql`** — preview the forged rows (`overall >= 94`), then
   uncomment the `DELETE` to remove them. Adjust the threshold if you want.

2. **`02_wc_players.sql`** — create the authoritative `wc_players` ratings table,
   then import the data:
   *Table editor → `wc_players` → Insert → Import data from CSV →* upload
   **`wc_players.csv`** (9,976 rows; columns map 1:1).

3. **`03_harden_submit_draft.sql`** — replace `submit_draft()` with a version that
   takes the drafted **player IDs** and **recomputes** the team overall from
   `wc_players` (browser number ignored), validates squad shape (1 GK, legal
   formation, no duplicates, known IDs), clamps progress, and stores the
   server-computed score.

## Client

`index.html` (`submitDraftRow`) already sends `p_player_ids` to the new function,
with a fallback to the legacy signature so saves keep working in the gap before
you apply the migration. Bump the asset `?v=` in `index.html` when you deploy so
clients pick up the new submit path.

## What this does / doesn't stop

- ✅ No more impossible scores. The server now bounds every entry by **real**
  ratings, so the max anyone can post is a structurally-valid squad
  (~98.8 Quick / ~99.1 Full at the absolute cherry-pick ceiling).
- ✅ Can't invent a 99-rated keeper or duplicate the best striker six times.
- ⚠️ Residual: because the World Cup **simulation runs client-side**, `progress`
  (how far the run went) still can't be fully verified — a cheater could claim
  "champion" on a legitimately-scored squad. The *overall* (what the board ranks
  by) is now trustworthy. Closing the progress gap would require server-authoritative
  match simulation, a larger change.

## Re-running after a player-data swap

Re-run `02` (or just `TRUNCATE wc_players;` and re-import the regenerated
`wc_players.csv`). Regenerate the CSV with:

```
python3 - <<'PY'
import json, csv
d=json.load(open('data/players_all.json'))
aw=lambda a: '' if a is None else ('|'.join(map(str,a)) if isinstance(a,list) else str(a))
with open('supabase/wc_players.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['player_id','wc_overall','position','is_captain','award'])
    for p in d: w.writerow([p['player_id'],p['wc_overall'],p['position'],
                            'true' if p.get('is_captain') else 'false', aw(p.get('award'))])
PY
```
