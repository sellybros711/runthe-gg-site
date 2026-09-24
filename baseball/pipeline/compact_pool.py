#!/usr/bin/env python3
"""The fourth stage, and the one that was missing.

build_positions.py ends at priced_players_enriched.json, which carries verbose
column names (bbref_id, primary_pos, war_raw) because it is the frame the build
was working in. The game fetches baseball/data/players.json, which carries
compact keys (i, pp, w) because every visitor downloads it. NOTHING IN THIS REPO
TURNED ONE INTO THE OTHER, so the pool that ships was produced by a step nobody
committed and the refresh workflow could not reproduce it: it ran three stages,
then did `git add baseball/data/players.json` on a file the build never wrote,
found it unchanged, printed "The pool did not move" and exited green.

That is the worst shape a data job can have. It is not a crash and not a red
run: it is a workflow that looks like it refreshed the pool every single time
and has never once written a byte of it.

WHAT THE COMPACTION ACTUALLY IS, read off the shipped file rather than guessed:

  i   bbref_id                  n   name                s   season
  t   team                      r   role's first letter ("bat" -> b, "pitch" -> p)
  p   price_m, 1 decimal        w   war_raw, 2 decimals
  pp  primary_pos               ep  eligible_pos
  cl  1 when is_closer_proxy    ip  innings, 1 decimal

pp and ep are DROPPED when empty rather than written as "", which is 145 rows of
the 44,344, all of them Negro Leagues seasons Lahman has no position for. cl is
dropped unless it is true. ip is dropped for every batter and for the 940
pitchers who have none. A key written as null would be three bytes a row for
nothing, and the page already reads all four as optional.

THE ORDER IS PRICE DESCENDING and it is load-bearing rather than tidy: the draft
board walks the pool and the reserve floor reads off the cheap end, so a pool in
input order is a different game.

Verified by round trip on the pool that ships: invert the compaction, run this
over the result, and the bytes come back identical on all 44,344 rows. That
proves the field rules and the sort. It cannot prove how ties are broken against
a fresh build, because the compact file does not carry the order the enriched
frame was in, so that is left to pandas' stable sort exactly as before.
"""

import json
import math
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(SCRIPT_DIR))

IN_PATH = os.path.join(SCRIPT_DIR, "priced_players_enriched.json")
OUT_PATH = os.path.join(REPO, "baseball", "data", "players.json")

# See compact() for how this was read off the shipped pool and what it is for.
WAR_FLOOR = 0.5


def _num(v):
    """A missing value arrives as None, as NaN, or as the string 'nan'."""
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        if not v or v.lower() == "nan":
            return None
        try:
            v = float(v)
        except ValueError:
            return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return f


def _round(v, places):
    """Round, and stay a FLOAT even when the decimals are zero.

    The shipped pool writes 7.0 and 217.0 rather than 7 and 217, because it came
    out of pandas and every one of these columns is a float there. Coercing a
    whole number to an int reads like tidying and costs the round trip: it is
    the first thing this was written with and it diverged at Rogers Hornsby, the
    fifth row of the file.
    """
    f = _num(v)
    if f is None:
        return None
    return round(f, places)


def _text(v):
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s.lower() == "nan" else s


def compact(rows):
    out = []
    for row in rows:
        # THE CUT, AND IT IS NOT THE PLAYING-TIME FLOOR THIS WAS WRITTEN UP AS.
        # The build frame is every player-season Baseball-Reference has, 109,859
        # of them, and the pool that ships is 44,344. What separates them was in
        # none of the four stages, so a refresh rebuilt a pool two and a half
        # times the size and the only thing that went red was check-labels, on
        # the longest club line being 38 characters.
        #
        # Read off the shipped file rather than guessed, the same way the field
        # rules above were: its lowest war_raw is EXACTLY 0.50, with 259 rows
        # sitting on it and not one below. That is a cliff rather than a
        # distribution, so it is a filter, and it is on war_raw for both roles
        # rather than on innings or games. A pitcher's price is discounted by
        # the innings anchor and his floor is not.
        #
        # What it is FOR is the wheel. Half the men below it are a September
        # call-up or a man who got hurt in April, and a board drawn from them is
        # a board of names nobody recognises at a price nobody will pay. It is
        # also 65,515 rows every visitor would download to never be offered.
        w = _num(row.get("war_raw"))
        if w is None or w < WAR_FLOOR:
            continue
        rec = {
            "i": _text(row.get("bbref_id")),
            "n": _text(row.get("name")),
            "s": int(row["season"]),
            "t": _text(row.get("team")),
            "r": _text(row.get("role"))[:1],
            "p": _round(row.get("price_m"), 1),
            "w": _round(row.get("war_raw"), 2),
        }
        pp = _text(row.get("primary_pos"))
        ep = _text(row.get("eligible_pos"))
        if pp:
            rec["pp"] = pp
        if ep:
            rec["ep"] = ep
        if bool(row.get("is_closer_proxy")):
            rec["cl"] = 1
        ip = _round(row.get("ip"), 1)
        if ip is not None:
            rec["ip"] = ip
        out.append(rec)

    # Descending price. Python's sort is stable, so rows priced the same keep the
    # order the build put them in, which is what the shipped file does.
    out.sort(key=lambda r: r["p"], reverse=True)
    return out


def write(rows, path):
    # ensure_ascii, which is the default and is written out to say it is meant:
    # the shipped pool escapes a name to í rather than carrying the byte, so
    # turning it off changes 4KB of the file and every accented player in it.
    with open(path, "w") as fh:
        json.dump(rows, fh, separators=(",", ":"), ensure_ascii=True)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else IN_PATH
    dst = sys.argv[2] if len(sys.argv) > 2 else OUT_PATH

    if not os.path.exists(src):
        print(f"No {src}. Run build_positions.py first.")
        return 1

    with open(src) as fh:
        rows = json.load(fh)

    out = compact(rows)

    # IT WROTE THE POOL BEFORE IT COULD NOTICE THE POOL WAS EMPTY. `compact`
    # reads the enriched frame's verbose keys, so handed the ALREADY COMPACT
    # file, which is an ordinary mistake to make by hand, every row misses and
    # the result is `[]`. That was written to disk and the stage exited 0: the
    # shape gate two steps later is what caught it, which is a guard catching
    # another stage's garbage rather than the stage refusing to make it.
    #
    # The floor is a share of what came IN rather than a row count, so it is
    # right whatever the pool grows to, and it is generous: the real WAR floor
    # drops about 60% of the frame, so anything under a tenth surviving is a
    # reader that matched nothing rather than a filter that bit hard.
    if len(out) < max(1, len(rows) // 10):
        print(f"  {len(out)} of {len(rows)} rows survived, which is not a pool.")
        print("  compact() reads the enriched frame's own column names, so this is")
        print("  almost always the wrong input file rather than a real filter.")
        return 1

    write(out, dst)

    bats = sum(1 for r in out if r["r"] == "b")

    # THE RECORD HAS TO DESCRIBE THE FILE THAT SHIPS. build_positions.py writes
    # provenance.json off its own frame, which is every player-season the sources
    # hold; this stage then drops everything under the WAR floor, so the record
    # said 109,859 rows beside a pool of 44,344. That file's own header argues a
    # machine-written record cannot drift from the data beside it, and it was
    # drifting by a factor of two and a half: it is the record of the BUILD and
    # the pool is what a reader has. So the shipped counts are written back here,
    # at the stage that produces them, and the build's own figure is kept under
    # its own name rather than overwritten, because how many rows the sources
    # held is a real fact about the run and the only place it is recorded.
    prov_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "provenance.json")
    if os.path.exists(prov_path):
        with open(prov_path) as fh:
            prov = json.load(fh)
        prov["built_rows"] = prov.get("rows")
        prov["war_floor"] = WAR_FLOOR
        prov["rows"] = len(out)
        prov["batting"] = bats
        prov["pitching"] = len(out) - bats
        prov["seasons"] = [min(r["s"] for r in out), max(r["s"] for r in out)]
        with open(prov_path, "w") as fh:
            json.dump(prov, fh, indent=2)
            fh.write("\n")
        print(f"  Recorded the shipped shape in {prov_path}")

    print(f"  Wrote {dst}")
    print(f"  {len(rows)} rows in, {len(rows) - len(out)} under "
          f"{WAR_FLOOR} WAR, {len(out)} out")
    print(f"  {len(out)} rows: {bats} batting, {len(out) - bats} pitching")
    print(f"  seasons {min(r['s'] for r in out)} to {max(r['s'] for r in out)}")
    print(f"  dearest {out[0]['n']} {out[0]['s']} at ${out[0]['p']}M")
    return 0


if __name__ == "__main__":
    sys.exit(main())
