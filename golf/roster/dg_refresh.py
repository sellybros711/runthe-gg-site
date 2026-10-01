#!/usr/bin/env python3
"""
dg_refresh.py: the weekly golf roster refresh, run against the LIVE game file.

Re-rates every CURRENT player card in golf/index.html from DataGolf's Strokes-Gained skill ratings,
then rewrites the in-game Roster Updates page (const ROSTER_UPDATE) with everybody whose overall moved.
It is build-a-golfer/dg_transform.py (on claude/update-rosters-ojyhuj) with the same rating math, aimed
at golf/index.html instead of a separate build file, because golf/index.html is the file that ships.

Rating, unchanged from the original: overall is anchored to sg_total (80 + sg_total * 5.2), each skill
box keeps its own SG shape, composure (clu) is kept, and legend cards are never re-rated (their peak
cards are hand-owned). Players who do not match the feed are left exactly as they are.

SECURITY: the key comes from DG_KEY in the environment and is never printed, logged or written.

USAGE
  python3 golf/roster/dg_refresh.py                  # dry run: pull, match, report, write nothing
  python3 golf/roster/dg_refresh.py --write          # apply to golf/index.html
  python3 golf/roster/dg_refresh.py --input feed.json [--write]   # a saved feed instead of the API
  python3 golf/roster/dg_refresh.py --report out.txt # also write the report to a file
"""
import os, sys, json, re, argparse, unicodedata, datetime, shutil, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
DG_URL = "https://feeds.datagolf.com/preds/skill-ratings?display=value&file_format=json&key={key}"

# ---- normalization config (documented; tweak here if the report looks off) -------------------------
# Two-step rating so OVERALL tracks true total skill while each box keeps its real shape:
#   1) OVERALL is anchored to DataGolf sg_total  (overall = 80 + sg_total * OVR_SLOPE).
#      This is the fix for "a higher-SG player must out-rate a lower one" : sg_total is the truth.
#   2) Per-category SHAPE comes from each category's own SG (a great putter still shows great putting),
#      then all SG-derived boxes are shifted by a constant so their weighted average equals the
#      anchored overall. So the overall can't drift from sg_total, and the boxes keep their profile.
# NOTE: we do NOT normalize each category to its own σ : around-the-green SG has a tiny spread, so a
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
# composure has no SG signal : keep whatever the roster already has
PRESERVE_FIELDS = ("clu",)

# Manual name aliases for players DataGolf spells differently than the roster (extend as needed).
# key = normalized DataGolf name, value = normalized roster name
ALIASES = {
    # "matsuyama hideki": "hideki matsuyama",   # example; most resolve automatically
}

# letters NFKD can't decompose to ASCII (Nordic etc.) : the feed writes them ASCII, the roster doesn't
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

# LEGEND CARDS ARE HAND-OWNED AND THIS SCRIPT NEVER TOUCHES THEM.
# A legend is a peak-era card (Nicklaus at his best, Prime Phil), not a rating of how the man plays
# today, so a live feed has nothing to say about it. The trap is that ~16 of them are modern-era names
# the feed still carries (Kaymer, McDowell, Webb Simpson, Bubba...), so a name match happily re-rated
# a 95-rated peak card down to its holder's present form, and the values had to be restored by hand
# after every run. era and tier agree on all 113 legend cards; both are checked so a card missing one
# field still can't slip through.
def is_legend(p):
    return p.get("era") == "leg" or p.get("tier") == "legend"

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


HTML_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "index.html")
# the roster weights the overall is computed with (golfers.json _meta.weights, the game's own formula)
WEIGHTS = {"dist": 0.11, "acc": 0.12, "app": 0.21, "sht": 0.10, "scr": 0.08, "bnk": 0.06, "put": 0.19, "clu": 0.13}
SYNC_KEYS = ("dist", "acc", "app", "sht", "scr", "bnk", "put", "clu", "overall", "data_source")

def read_roster(lines):
    """The game embeds the roster as `const ROSTER=[` then one JSON object per line, then `];`."""
    start = next((i for i, l in enumerate(lines) if l.startswith("const ROSTER=[")), None)
    if start is None:
        raise SystemExit("ERROR: could not find 'const ROSTER=[' in golf/index.html.")
    end = next(i for i in range(start + 1, len(lines)) if lines[i].strip() == "];")
    rows = []
    for i in range(start + 1, end):
        s = lines[i].strip().rstrip(",")
        if s.startswith("{") and s.endswith("}"):
            rows.append((i, json.loads(s)))
    return rows

def write_roster(lines, rows, changed):
    n = 0
    for i, obj in rows:
        if obj["name"] not in changed:
            continue
        raw = lines[i]; indent = raw[:len(raw) - len(raw.lstrip())]
        lines[i] = indent + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ","
        n += 1
    return n

def write_roster_update(lines, date, moves):
    """Rewrite const ROSTER_UPDATE: every player whose overall moved, biggest moves first."""
    idx = next((i for i, l in enumerate(lines) if l.startswith("const ROSTER_UPDATE={")), None)
    if idx is None:
        raise SystemExit("ERROR: could not find 'const ROSTER_UPDATE={' in golf/index.html.")
    moves = sorted(moves, key=lambda m: (-abs(m[2] - m[1]), -(m[2] - m[1]), m[0]))
    ps = ",".join("{n:" + json.dumps(n) + ",f:" + str(f) + ",t:" + str(t) + "}" for n, f, t in moves)
    lines[idx] = "const ROSTER_UPDATE={date:'" + date + "', players:[" + ps + "]};"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="apply to golf/index.html (otherwise a dry run)")
    ap.add_argument("--input", help="read the DataGolf feed from a local JSON or CSV file instead of the API")
    ap.add_argument("--report", help="also write the report to this file")
    ap.add_argument("--html", default=HTML_PATH, help="the game file to patch (default golf/index.html)")
    ap.add_argument("--rerate-legends", action="store_true", help="also re-rate legend cards (off by default)")
    args = ap.parse_args()

    if args.input and args.input.lower().endswith(".csv"):
        import csv as _csv
        rows_in = list(_csv.DictReader(open(args.input, newline="", encoding="utf-8")))
        last_updated = (rows_in[0].get("last_updated") if rows_in else None) or "unknown"
    else:
        feed = json.load(open(args.input)) if args.input else fetch_feed()
        rows_in = players_from_feed(feed)
        last_updated = (feed.get("last_updated") if isinstance(feed, dict) else None) or "unknown"

    feed_by_name = {}
    for r in rows_in:
        key = norm_name(r.get("player_name") or r.get("name") or "")
        key = ALIASES.get(key, key)
        if key:
            feed_by_name[key] = r

    lines = open(args.html, encoding="utf-8").read().split("\n")
    roster_rows = read_roster(lines)
    golfers = [o for _, o in roster_rows]
    weights = WEIGHTS
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

    matched, unmatched_roster, changes, held = [], [], [], []
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
        if is_legend(p) and not args.rerate_legends:
            held.append(p["name"])          # in the feed, deliberately not re-rated
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


    unmatched_feed = sorted(k for k in feed_by_name if k not in roster_names)
    moves = [(n, o, w) for d, n, o, w in changes if d != 0]

    out = []
    out.append(f"DataGolf skill-rating refresh: feed last_updated={last_updated}")
    out.append(f"matched and re-rated: {len(matched)} current players; {len(moves)} overalls moved")
    out.append(f"legend cards held (in the feed, never re-rated): {len(held)}" + ((" -> " + ", ".join(sorted(held))) if held else ""))
    out.append(f"roster star/rising NOT in feed: {len(unmatched_roster)}" + ((" -> " + ", ".join(sorted(unmatched_roster)[:40])) if unmatched_roster else ""))
    changes.sort(key=lambda c: c[0])
    out.append("biggest DROPS:  " + " | ".join(f"{n} {o}->{w} ({d:+d})" for d, n, o, w in changes[:10]))
    out.append("biggest RISES:  " + " | ".join(f"{n} {o}->{w} ({d:+d})" for d, n, o, w in reversed(changes[-10:])))
    ovs = sorted((p["overall"] for p in golfers if p["name"] in set(matched)), reverse=True)
    if ovs:
        out.append(f"current-player overall: top {ovs[:5]}, mean {sum(ovs)/len(ovs):.1f}")
    out.append(f"feed names not on roster: {len(unmatched_feed)} (first 30) -> " + ", ".join(unmatched_feed[:30]))
    report = "\n".join(out)
    print(report)
    if args.report:
        open(args.report, "w").write(report + "\n")

    if args.write:
        n = write_roster(lines, roster_rows, set(matched))
        if moves:
            write_roster_update(lines, today, moves)
        open(args.html, "w", encoding="utf-8").write("\n".join(lines))
        print(f"\nPATCHED {args.html}: {n} roster lines; Roster Updates page {'rewritten for ' + today if moves else 'left alone (nobody moved)'}.")
    else:
        print("\nDRY RUN: nothing written. Re-run with --write to apply.")

if __name__ == "__main__":
    main()
