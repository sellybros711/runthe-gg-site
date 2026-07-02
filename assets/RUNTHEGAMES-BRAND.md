# RunThe Games — Brand Assets

Master brand assets for **RunThe Games** (runthe.gg), the umbrella brand over
titles like RunThePitch and RunTheTour. The identity extends the existing family
system: a cream/teal double-outline crest, a gold championship trophy, and a
heavy condensed italic wordmark with a tri-color treatment.

## Palette

| Role            | Hex       | Notes                                  |
| --------------- | --------- | -------------------------------------- |
| Navy (primary)  | `#01122A` | Wordmark, backgrounds, `theme_color`   |
| Teal (accent)   | `#14A38C` | "THE", crest inner outline, taglines   |
| Cream           | `#FBF4E6` | Crest outer outline, text on dark, `background_color` |
| Gold (trophy)   | `#F6D66B → #EBB63A → #C88C1E` | Vertical gradient on the trophy |

## Wordmark

`RUN` (navy) · `THE` (teal) · `GAMES` (navy) — heavy condensed uppercase, ~9°
italic slant. Set in **Anton** (SIL Open Font License). On dark backgrounds the
navy segments switch to cream.

## Assets

Logo lockups (transparent unless noted):
- `runthegames-logo-full_navy.png` — emblem + wordmark, for light backgrounds
- `runthegames-logo-full_light.png` — cream wordmark, for dark backgrounds
- `runthegames-logo-full_navybg.png` — full lockup on navy
- `runthegames-logo-5x1_navy|light|navybg.png` — 5:1 header/upload logo (1000×200)
- `runthegames-wordmark_navy|light.png` — wordmark only

Emblem / crest:
- `runthegames-emblem.svg` — vector source (scales to any size)
- `runthegames-crest_transparent.png`, `runthegames-crest_navy.png` — 1024²

Icons:
- `runthegames-app-icon_512.png`, `_1024.png` — rounded-square app icon
- `runthegames-apple-touch-icon_180.png`
- `runthegames-favicon_16|32|48|64.png`
- `runthegames-social-avatar_512.png`, `_1024.png` — circular avatar

Social:
- `runthegames-og-image_1200x630.png` — Open Graph / link preview
- `runthegames-x-banner_1500x500.png` — X/Twitter header

All PNGs are ≤150 kB. To regenerate, re-render `runthegames-emblem.svg` and the
wordmark (Anton, tri-color) at the target sizes.

## Clear space & minimum size

Keep clear space around the logo equal to the height of the crest's play
triangle. Minimum legible wordmark height ≈ 24 px; below that, use the crest or
favicon alone.
