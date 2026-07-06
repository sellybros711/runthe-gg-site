# RunTheCase — build notes (internal test build)

Game #4 on the RunThe.GG platform. **Background build — not released live.** It is
intentionally:

- `noindex,nofollow` (see the `<meta>` in `index.html`)
- **not** linked from the homepage (`/index.html`)
- **not** listed in `sitemap.xml`

Reachable directly at `/case/` for testing. Flip those three things (plus the homepage
game card + sitemap entry) when it's ready to ship — same pattern the other dormant
games (`/globe/`, `/wrestling/`) used.

## Layout

```
case/
  index.html               game shell + UI (hub, investigation, board, interrogation,
                            accusation, resolution) — vanilla JS, no build step
  engine.js                loader, 5-phase case FSM, scoring, consequences, career
                            promotion/firing, localStorage save — window.RunTheCase
  data/
    schema/                 JSON Schemas (case, characters, threads, career, save) —
                             the data contract, ported + extended from the handoff docs
    career.json              7 ranks, promotion gates, firing curve, scoring weights
    characters.json          recurring cast
    threads.json             villain/antagonists/15 breadcrumbs/6 callbacks
    badges.json              12 spoiler-safe badges
    case_registry.json       all 44 case slots across the 7 ranks — 2 'authored'
                             (playable), 42 'planned' (locked tiles, title+teaser only)
    cases/
      modern_04_water_damage.json    authored — cadet rank, simplest shape
      modern_30_cleanup_crew.json    authored — from the original handoff package
  tools/
    validate.mjs            dependency-free referential-integrity checker (Node 18+)
  README.md                 this file
```

Matches platform conventions: single-file game shell, content in separate JSON/JS,
no bundler, dormant-build meta pattern.

## Design decisions locked for this pass

The original handoff docs flagged two calls gating further authoring:

1. **Inside-Man identity → Okafor.** `characters.json`'s `det_okafor` now carries
   `thread_role: "inside_man"` and `threads.json`'s `inside_man_id` points at him.
   This is internal-only data — never surfaced in player-facing text (engine spec's
   spoiler-safety rule). Cases 08/31/34 are still just locked placeholder titles;
   whoever authors them next should lean into this.
2. **Voss's profession → registered-agent / compliance-consultant cover** for a chain
   of logistics/shell companies. See `villain_voss.cover_identity` in `characters.json`.
   This is what the Case 04 (`bc_voss_invoice`) and Case 12 (`bc_shell_lease`)
   breadcrumbs are dressed as.

Both are placeholders per the original docs (`is_placeholder: true`) — the names
themselves ("Voss", "Boone", "Nadia") still want a real naming pass before ship, only
their narrative *function* is locked.

## What's playable now

- **Full 5-phase state machine** (Briefing → Investigation → Board ⇄ Interrogation →
  Accusation → Resolution) against the two authored cases, verified end to end in a
  real browser: evidence logging, specialist-gated hotspots, board connections
  progressively unlocking new hotspots/dialogue, branching interrogation trees gated
  by evidence, scoring (suspect/evidence/motive weights), wrongful-accusation
  consequences (reputation hit, recurring-NPC spawn, partner trust, wronged-suspect
  tracking), promotion/firing checks, and badge awards.
- **Open-world hub**: all 44 cases are visible across all 7 ranks at once (not gated
  case-by-case) — the two authored cases are freely selectable, replayable, and
  revisitable once solved; the other 42 show as honest "sealed" placeholders rather
  than being hidden. This is the "free case selection" + "persistent map" + "side
  content between cases" open-world request — see the Cases / Network / Partner /
  Detective hub tabs.
- **localStorage save** (`rtc_save_v1`), matching `data/schema/save.schema.json`.
  No Supabase/account wiring yet — intentional for this pass, matches "dormant test"
  status. Wiring it into the shared account system (like RunTheTour/RunThePitch) is
  the natural next step once this is ready to go further.

## Known simplifications (documented in code, flagging here too)

- **Partner override.** The engine spec calls for consequences to fire "if the player
  overrode their partner" — this build doesn't yet model an explicit partner-suggests/
  player-overrides UI step, so every wrongful accusation is treated as an override
  when the case defines `partner_override_trust_delta`. Worth revisiting once a case
  actually wants the partner to weigh in mid-interrogation.
- **Promotion gates only count authored cases.** With just 2 of 44 cases built, a
  literal "solve every case in the rank" gate would never be satisfiable. `checkPromotion`
  in `engine.js` only requires the *authored* cases in a rank to be closed. Loosen this
  back to the full rank once more cases exist.
- **Motive decoys live in `index.html`**, not the case JSON (`MOTIVE_DECOYS`), since
  only 2 cases exist to hand-write decoys for. Move this into the case schema
  (e.g. `solution.decoy_motives`) once more cases are authored, so authoring a case
  doesn't require touching engine code.
- **Quick Case mode** (engine spec §8) is schema-supported (`mode: "quick"`,
  `quick_flavor`) but no Quick Case content has been authored yet — out of scope for
  this pass.

## Next build steps

1. Author more of the 42 locked cases against `data/schema/case.schema.json`
   (`tools/validate.mjs` keeps them honest) — the Case 08/31/34 Inside-Man arc and the
   Case 12/25 shell-company callbacks are already wired into `threads.json` and ready
   to write toward.
2. Move motive decoys into the case data contract.
3. Loosen the promotion-gate simplification back to full-rank once enough cases exist
   per rank to make that meaningful.
4. Wire the save into the shared Supabase account system when this is ready to leave
   "dormant test" status, and flip the three dormant-build switches at the top of this
   file.
