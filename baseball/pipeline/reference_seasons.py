#!/usr/bin/env python3
"""What a handful of famous seasons came out at, printed into the run's log.

THE POOL CANNOT BE CHECKED AGAINST ITS SOURCE FROM THE DEVELOPMENT SANDBOX.
baseball-reference.com and fangraphs.com are both refused by the egress proxy,
so every figure in CLAUDE.md's write-up of this data was RECALLED rather than
fetched, and one of them did not match: Ted Williams 1941 ships at 10.36 against
a remembered 10.6. That is either a stale pull or a bad memory, and there is
exactly one machine in this project that can tell the two apart, which is the
GitHub runner this file is meant to run on.

So the refresh prints these rows on the way past. A number in a log is not a
guard and is not pretending to be one: what it is for is a person reading one
run and settling a question that cannot be settled anywhere else.

WHY THESE SEASONS. Every one is a figure a reader can look up in a second and
argue with, which is the whole property that makes them useful here. Williams
1941 is the open question. Ruth 1923 is the dearest row in the pool, so it
anchors the price curve's top. Walter Johnson 1913 is the dearest pitcher, and
his price carries the innings discount, so a build that lost the anchor shows up
there first. Bonds 2001 is the row the bWAR against fWAR argument was settled on
(11.9, 12.5, and a blend of 12.2, and the pool says 11.86).

Called with two pools it prints both and marks what moved, which is the only
form of this worth having: a single column of numbers asks somebody to remember
what they were yesterday.
"""

import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(SCRIPT_DIR))
POOL = os.path.join(REPO, "baseball", "data", "players.json")

# bbref id, season, and what this row is here to answer.
REFERENCE = [
    ("willite01", 1941, "the open question: 10.36 here, 10.6 recalled"),
    ("ruthba01", 1923, "the dearest row in the pool"),
    ("johnswa01", 1913, "the dearest arm, and the innings discount"),
    ("bondsba01", 2001, "bWAR 11.9, fWAR 12.5, a blend would be 12.2"),
    ("gehrilo01", 1927, ""),
    ("mantlmi01", 1957, ""),
    ("morgajo02", 1975, ""),
    ("martipe02", 2000, ""),
    ("gibsobo01", 1968, ""),
    ("henderi01", 1990, ""),
]


def load(path):
    with open(path) as fh:
        rows = json.load(fh)
    by_key = {}
    for r in rows:
        by_key.setdefault((r["i"], r["s"]), []).append(r)
    return rows, by_key


def describe(rows):
    if not rows:
        return None
    # A two-way season is two rows, one per side of the ball, so both are shown
    # rather than one of them silently winning.
    return "  ".join(
        f"{r['r']} WAR {r['w']:.2f} ${r['p']:.1f}M" for r in rows
    )


def main():
    now_path = sys.argv[1] if len(sys.argv) > 1 else POOL
    was_path = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.exists(now_path):
        print(f"No pool at {now_path}.")
        return 1

    now_rows, now = load(now_path)
    was = load(was_path)[1] if was_path and os.path.exists(was_path) else None

    print(f"{len(now_rows)} rows, seasons "
          f"{min(r['s'] for r in now_rows)} to {max(r['s'] for r in now_rows)}")
    if was is not None:
        print(f"compared against {was_path}")
    print("")

    moved = 0
    for pid, season, why in REFERENCE:
        line = describe(now.get((pid, season)))
        if line is None:
            print(f"  {pid} {season}: NOT IN THE POOL")
            moved += 1
            continue
        name = now[(pid, season)][0]["n"]
        head = f"  {name} {season}".ljust(30)
        print(f"{head} {line}" + (f"      ({why})" if why else ""))
        if was is not None:
            before = describe(was.get((pid, season)))
            if before != line:
                moved += 1
                print(f"{'  was'.ljust(30)} {before or 'not in the old pool'}")

    print("")
    if was is None:
        print("No pool to compare against, so this is a reading and not a diff.")
    elif moved:
        print(f"{moved} of {len(REFERENCE)} reference seasons MOVED.")
    else:
        print("Every reference season is unchanged. The sources answered the "
              "same as last time, so a figure that disagrees with this pool "
              "disagrees with Baseball-Reference rather than with a stale pull.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
