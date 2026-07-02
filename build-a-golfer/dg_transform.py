#!/usr/bin/env python3
"""
dg_transform.py — re-rate the RunTheTour roster from DataGolf Strokes-Gained skill ratings.

WHAT IT DOES
  Pulls DataGolf's player skill ratings (per-round SG by category + driving distance/accuracy),
  normalizes every matched CURRENT player to the game's 0-99 scale (tour average = 80, elite ~96),
  recomputes each player's overall from the roster weights, and writes the updated golfers.json.
  Legends / historical-peak players and anything that doesn't match the feed are left untouched.
  Composure (clu) has no SG stat, so existing clu values are preserved.

WHY
  The roster skills were last normalized from a 2026-06-22 DataGolf snapshot. This regenerates them
  from a fresh pull so ratings track real current skill (e.g. a top-SG ball-striker rates as one).

SECURITY
  Reads the DataGolf key from the DG_KEY environment variable. The key is NEVER printed, logged,
  written to disk, or embedded in any output. Do not pass it on the command line.

PREREQUISITES (in this managed web environment)
  1. Set DG_KEY in the environment's variables.
  2. Allow outbound HTTPS to feeds.datagolf.com in the environment's network policy
     (it is blocked by default — a fresh pull will fail with a proxy 403 until you allow it).
  Or just run this script anywhere you already have the key + open network (e.g. your laptop).

USAGE
  python3 dg_transform.py                 # dry run: pull + match + report, writes NOTHING
  python3 dg_transform.py --write         # pull + apply, overwrites golfers.json (after a .bak)
  python3 dg_transform.py --input feed.json [--write]   # use a saved feed instead of the API
  python3 dg_transform.py --report out.md # also write the full match/change report to a file

The dry run prints a report: matched/unmatched players, the derived per-category slopes, and the
biggest rating moves. Eyeball it before --write.
"""
import os, sys, json, re, argparse, unicodedata, datetime, shutil, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROSTER_PATH = os.path.join(HERE, "golfers.json")
DG_URL = "https://feeds.datagolf.com/preds/skill-ratings?display=value&file_format=json&key={key}"

# ---- normalization config (documented; tweak here if the report looks off) -------------------------
# Two-step rating so OVERALL tracks true total skill while each box keeps its real shape:
#   1) OVERALL is anchored to DataGolf sg_total  (overall = 80 + sg_total * OVR_SLOPE).
#      This is the fix for "a higher-SG player must out-rate a lower one" — sg_total is the truth.
#   2) Per-category SHAPE comes from each category's own SG (a great putter still shows great putting),
#      then all SG-derived boxes are shifted by a constant so their weighted average equals the
#      anchored overall. So the overall can't drift from sg_total, and the boxes keep their profile.
# NOTE: we do NOT normalize each category to its own σ — around-the-green SG has a tiny spread, so a
# σ-slope blows small edges up into elite boxes (the McNealy-looks-better-than-Young bug). SG strokes
# are already comparable across categories, so a moderate fixed slope per category is correct.
TOUR_AVG  = 80.0          # SG 0 maps here (tour average)
OVR_SLOPE = 5.2           # overall rating points per stroke of sg_total (Scheffler ~+2.7 -> ~94)
SHAPE = {"app": 13.0, "put": 15.0, "arg": 16.0}   # rating points per SG, for category shape only
CLAMP_LO, CLAMP_HI = 55, 99
# DataGolf reports driving as a skill RELATIVE to tour average: driving_dist = yards vs avg (e.g. McIlroy
# +21), driving_acc = fraction of fairways vs avg (e.g. +0.059 = +5.9 pts). Anchor delta 0 -> 80.
DIST_SLOPE = 0.90      # rating points per yard of driving distance above/below average
ACC_SLOPE  = 1.20      # rating points per percentage-point of fairways hit above/below average
DIST_AVG_YDS = 299.0   # only used if a feed ever reports ABSOLUTE yards instead of a delta
ACC_ABS_AVG  = 61.0    # only used if a feed ever reports ABSOLUTE accuracy %
SG_CATS = ("dist", "acc", "app", "sht", "scr", "bnk", "put")   # everything the feed drives (not clu)
# composure has no SG signal — keep whatever the roster already has
PRESERVE_FIELDS = ("clu",)

# Manual name aliases for players DataGolf spells differently than the roster (extend as needed).
# key = normalized DataGolf name, value = normalized roster name
ALIASES = {
    # "matsuyama hideki": "hideki matsuyama",   # example; most resolve automatically
}

# letters NFKD can't decompose to ASCII (Nordic etc.) — the feed writes them ASCII, the roster doesn't
_TRANSLIT = str.maketrans({"ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae", "å": "a", "Å": "a",
                           "ß": "ss", "ł": "l", "Ł": "l", "đ": "d", "Đ": "d", "ð": "d", "þ": "th"})
def norm_name(n: str) -> str:
    """Normalize a player name for matching. Handles DataGolf 'Last, First', accents/Nordic, suffixes."""
    n = (n or "").strip()
    if "," in n:
        last, first = n.split(",", 1)
        n = first.strip() + " " + last.strip()
    n = n.translate(_TRANSLIT)
    n = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode()
    n = n.lower()
    n = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", " ", n)
    n = re.sub(r"[^a-z ]", " ", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n

def clampi(x, lo=CLAMP_LO, hi=CLAMP_HI):
    return int(round(max(lo, min(hi, x))))

def fetch_feed():
    key = os.environ.get("DG_KEY")
    if not key:
        sys.exit("ERROR: DG_KEY is not set. Export your DataGolf key as DG_KEY (never on the CLI).")
    url = DG_URL.format(key=key)
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            data = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        # never echo the URL (it contains the key)
        sys.exit(f"ERROR: DataGolf request failed (HTTP {e.code}). Check the key / your plan.")
    except Exception as e:
        sys.exit(f"ERROR: DataGolf request failed ({type(e).__name__}). "
                 f"Is feeds.datagolf.com allowed by the network policy?")
    return data

def players_from_feed(feed):
    """DataGolf returns either a list or an object with a 'players'/'rankings' array."""
    if isinstance(feed, list):
        return feed
    for k in ("players", "rankings", "skill_ratings", "data"):
        if isinstance(feed.get(k), list):
            return feed[k]
    raise SystemExit("ERROR: could not find the player array in the feed. Keys: " + ", ".join(feed.keys()))

def getf(row, *names):
    """First present, numeric field among aliases; None if absent."""
    for n in names:
        if n in row and row[n] not in (None, "", "NA"):
            try:
                return float(row[n])
            except (TypeError, ValueError):
                pass
    return None

# the live game embeds the roster as `const ROSTER=[...]` in the HTML (it does NOT fetch golfers.json),
# so a re-rate must also patch those lines. We touch ONLY re-rated players' skill fields, leaving every
# other line (legends, unmatched) byte-identical so the diff stays minimal.
SYNC_KEYS = ("dist", "acc", "app", "sht", "scr", "bnk", "put", "clu", "overall", "data_source")
def sync_html(path, golfers, matched_names):
    upd = {norm_name(p["name"]): p for p in golfers if p["name"] in matched_names}
    lines = open(path, encoding="utf-8").read().split("\n")
    try:
        start = next(i for i, l in enumerate(lines) if l.startswith("const ROSTER=["))
    except StopIteration:
        raise SystemExit("ERROR: could not find 'const ROSTER=[' in the HTML.")
    end = next(i for i in range(start + 1, len(lines)) if lines[i].strip() == "];")
    count = 0
    for i in range(start + 1, end):
        raw = lines[i]
        s = raw.strip().rstrip(",")
        if not (s.startswith("{") and s.endswith("}")):
            continue
        try:
            obj = json.loads(s)
        except json.JSONDecodeError:
            continue
        p = upd.get(norm_name(obj.get("name", "")))
        if not p:
            continue
        for k in SYNC_KEYS:
            if k in p:
                obj[k] = p[k]
        indent = raw[:len(raw) - len(raw.lstrip())]
        lines[i] = indent + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ","
        count += 1
    open(path, "w", encoding="utf-8").write("\n".join(lines))
    return count

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="overwrite golfers.json (otherwise dry run)")
    ap.add_argument("--input", help="read the DataGolf feed from a local JSON file instead of the API")
    ap.add_argument("--report", help="also write the full report to this file")
    ap.add_argument("--html", help="ALSO patch the embedded ROSTER in this HTML (e.g. build-a-golfer.html)")
    args = ap.parse_args()

    if args.input and args.input.lower().endswith(".csv"):
        import csv as _csv
        rows = list(_csv.DictReader(open(args.input, newline="", encoding="utf-8")))
        last_updated = (rows[0].get("last_updated") if rows else None) or "unknown"
    else:
        feed = json.load(open(args.input)) if args.input else fetch_feed()
        rows = players_from_feed(feed)
        last_updated = (feed.get("last_updated") if isinstance(feed, dict) else None) or "unknown"

    # index the feed by normalized name
    feed_by_name = {}
    for r in rows:
        nm = r.get("player_name") or r.get("name") or ""
        key = norm_name(nm)
        key = ALIASES.get(key, key)
        if key:
            feed_by_name[key] = r

    roster = json.load(open(ROSTER_PATH))
    meta, golfers = roster["_meta"], roster["golfers"]
    weights = meta["weights"]

    roster_names = {norm_name(p["name"]): p for p in golfers}

    def clampf(x, lo=CLAMP_LO, hi=CLAMP_HI):
        return max(float(lo), min(float(hi), x))

    def rate_player(row, clu):
        """Build the 7 SG-driven skill ratings (shape), anchored so the weighted overall == 80+sg_total*OVR_SLOPE."""
        sg_app  = getf(row, "sg_app", "app")
        sg_putt = getf(row, "sg_putt", "putt")
        sg_arg  = getf(row, "sg_arg", "arg")
        sg_tot  = getf(row, "sg_total", "total")
        dist_v  = getf(row, "driving_dist", "dist", "ott_dist")
        acc_v   = getf(row, "driving_acc", "acc", "ott_acc")
        raw = {}
        if sg_app  is not None: raw["app"] = TOUR_AVG + sg_app  * SHAPE["app"]
        if sg_putt is not None: raw["put"] = TOUR_AVG + sg_putt * SHAPE["put"]
        if sg_arg  is not None: raw["sht"] = TOUR_AVG + sg_arg  * SHAPE["arg"]
        if "sht" in raw:   # scrambling = around-green + putting; bunker derived from short game (no split in feed)
            raw["scr"] = (0.60*raw["sht"] + 0.40*raw["put"]) if "put" in raw else raw["sht"]
            raw["bnk"] = 0.70*raw["sht"] + 0.30*raw.get("scr", raw["sht"])
        if dist_v is not None:                                  # yards vs avg (delta); guard for absolute yards
            dist_delta = (dist_v - DIST_AVG_YDS) if dist_v > 150 else dist_v
            raw["dist"] = TOUR_AVG + dist_delta * DIST_SLOPE
        if acc_v is not None:                                   # fairway-rate vs avg (fraction); guard for absolute %
            acc_pts = (acc_v - ACC_ABS_AVG) if acc_v > 1.5 else acc_v * 100
            raw["acc"] = TOUR_AVG + acc_pts * ACC_SLOPE
        cats = [k for k in SG_CATS if k in raw]
        if not cats:
            return None, None
        w_avail = sum(weights[k] for k in cats)
        w_clu, denom = weights["clu"], sum(weights[k] for k in cats) + weights["clu"]
        if sg_tot is None:
            return {k: clampi(raw[k]) for k in cats}, None
        target = clampf(TOUR_AVG + sg_tot * OVR_SLOPE, 40, 99)
        # uniform shift so the weighted avg (present boxes + composure) lands on target, even with clamps
        shift = 0.0
        for _ in range(6):
            cur = (sum(weights[k]*clampf(raw[k]+shift) for k in cats) + w_clu*clu) / denom
            shift += (target - cur) * denom / w_avail
        return {k: clampi(raw[k] + shift) for k in cats}, target

    matched, unmatched_roster, changes = [], [], []
    # date the ratings to the FEED, not the run day (the data is as-of last_updated)
    today = (last_updated or "").split(" ")[0]
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", today):
        today = datetime.date.today().isoformat()

    for p in golfers:
        row = feed_by_name.get(norm_name(p["name"]))
        if not row:
            if p.get("tier") in ("star", "rising"):
                unmatched_roster.append(p["name"])
            continue
        clu = p.get("clu", p.get("overall", TOUR_AVG))
        final, _target = rate_player(row, clu)
        if final is None:
            continue
        old_overall = p.get("overall")
        for k, v in final.items():
            p[k] = v
        p["clu"] = clu
        ov = sum(p[k]*w for k, w in weights.items()) / sum(weights.values())   # all 8, clu preserved
        p["overall"] = clampi(ov, 40, 99)
        p["data_source"] = f"current (DataGolf {today})"
        matched.append(p["name"])
        if old_overall is not None:
            changes.append((p["overall"] - old_overall, p["name"], old_overall, p["overall"]))

    cal_rows = [r for k, r in feed_by_name.items() if k in roster_names]   # for the report line only

    # feed players we never placed (helps spot roster gaps / alias needs)
    unmatched_feed = sorted(k for k in feed_by_name if k not in roster_names)

    # ---- report ----
    out = []
    out.append(f"DataGolf skill-rating transform — feed last_updated={last_updated}")
    out.append(f"overall anchored to sg_total (slope {OVR_SLOPE}/stroke); shape slopes "
               f"app/put/arg = {SHAPE['app']}/{SHAPE['put']}/{SHAPE['arg']} rating/SG; "
               f"calibration matches={len(cal_rows)}")
    out.append(f"matched & re-rated: {len(matched)} roster players")
    out.append(f"roster star/rising NOT in feed: {len(unmatched_roster)}")
    if unmatched_roster:
        out.append("   " + ", ".join(sorted(unmatched_roster)[:40]) + (" …" if len(unmatched_roster) > 40 else ""))
    changes.sort(key=lambda c: c[0])
    out.append("biggest DROPS:  " + " | ".join(f"{n} {o}->{w} ({d:+d})" for d, n, o, w in changes[:8]))
    out.append("biggest RISES:  " + " | ".join(f"{n} {o}->{w} ({d:+d})" for d, n, o, w in reversed(changes[-8:])))
    out.append(f"feed names not on roster: {len(unmatched_feed)} (first 30) -> " + ", ".join(unmatched_feed[:30]))
    report = "\n".join(out)
    print(report)
    if args.report:
        open(args.report, "w").write(report + "\n")

    if args.write:
        meta["generated"] = today
        meta["data_source_note"] = (
            f"dist/acc/app/sht/scr/bnk/put for matched players = DataGolf Strokes-Gained skill ratings "
            f"({today}) normalized to 0-99 (tour avg=80, elite~96). sht=around-green SG; scr=0.6·sht+0.4·putt; "
            f"bnk=0.7·sht+0.3·scr (no separate sand-save in this feed). Composure (clu) and unmatched/legend "
            f"players remain manual/reputation.")
        shutil.copy(ROSTER_PATH, ROSTER_PATH + ".bak")   # snapshot the pre-run roster before overwriting
        # write the updated roster
        with open(ROSTER_PATH, "w") as f:
            json.dump(roster, f, ensure_ascii=False, indent=1)
        print(f"\nWROTE {ROSTER_PATH} ({len(matched)} players re-rated).")
        if args.html:
            n = sync_html(args.html, golfers, set(matched))
            print(f"PATCHED {args.html} ({n} embedded ROSTER lines updated).")
    else:
        print("\nDRY RUN — nothing written. Re-run with --write to apply"
              + (" (and --html to patch the game)." if args.html else "."))

if __name__ == "__main__":
    main()
