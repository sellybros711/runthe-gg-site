#!/usr/bin/env python3
"""Is the rebuilt pool the same KIND of thing as the one that ships?

The refresh's first real run rebuilt a pool with 109,859 rows against the
shipped 44,344, positions on 0 of 60,208 batters against essentially all of
them, and 22,019 closers against 905. Every one of those is a different game:
no positions means no draft slots, and a quarter of the pool being closers means
the save rate is read off whoever happens to be there.

NOTHING IN THE RUN SAID SO. The build printed its summary and carried on, the
reference seasons agreed to the decimal (they are high-WAR rows and their bWAR
came through fine), and the only thing that went red was `check-labels` failing
on the longest CLUB LINE being 38 characters, because a pool 2.5 times the size
holds a longer name. That is a guard catching a catastrophe by its shadow.

WHY THE REFERENCE SEASONS COULD NOT CATCH IT, which is the part worth keeping:
they read WAR and price, and WAR and price were RIGHT. The bulk files fetched
cleanly. What failed was everything Lahman supplies, which is positions and
closer flags, plus whatever applies the playing-time floor. A pool can be
perfectly correct about every number it prints and still be the wrong pool.

SO THIS ASKS ABOUT SHAPE AND NEVER ABOUT A NUMBER IT HAS SEEN. The bands are
wide on purpose: a year of new baseball adds about a percent of rows and moves
no coverage at all, so anything inside these is a refresh and anything outside
is a pipeline that lost a source. They are not tuned to the failure above, which
misses every one of them by an order of magnitude.

It is a GATE and not a checker: it compares two files and has no opinion about
the game, which is why it lives beside the build rather than in baseball/.
"""

import json
import os
import sys

# A season of new baseball is about 1% of the rows. A tenth is room for a
# schedule change, a source adding a decade, or split_stints, which is an input
# and legitimately grows the pool by about 7%.
ROWS_BAND = 0.35

# Coverage is a SHARE and not a count, so it does not move when the pool grows.
# Anything that halves it has lost a source rather than refreshed one.
COVERAGE_DROP = 0.15


def load(path):
    with open(path) as fh:
        return json.load(fh)


def newest(rows, pred):
    got = [r["s"] for r in rows if pred(r)]
    return max(got) if got else 0


def shape(rows):
    bats = [r for r in rows if r["r"] == "b"]
    pitch = [r for r in rows if r["r"] == "p"]
    return {
        "rows": len(rows),
        "batters": len(bats),
        "pitchers": len(pitch),
        "batter positions": sum(1 for r in bats if r.get("pp")),
        "closers": sum(1 for r in rows if r.get("cl")),
        "pitchers with innings": sum(1 for r in pitch if r.get("ip") is not None),
        # A SHARE CANNOT SEE A STALE SOURCE, and that is what let one through.
        # The first rebuild that passed this gate carried positions on 89.6% of
        # its batters against 99.4%, which is inside a 15 point band and reads as
        # a rounding difference. It was not scattered: every missing man was from
        # 2017 on, because the Lahman MIRROR the fetch fell back to is years
        # behind. So the pool was correct about Babe Ruth and had no position for
        # anybody currently playing, which is the half of the board a reader
        # recognises.
        "newest season": newest(rows, lambda r: True),
        "newest with a position": newest(bats, lambda r: r.get("pp")),
        "newest closer": newest(pitch, lambda r: r.get("cl")),
    }


def share(n, of):
    return (n / of) if of else 0.0


def main():
    new_path = sys.argv[1]
    old_path = sys.argv[2]

    if not os.path.exists(old_path):
        print(f"No pool to compare against at {old_path}, so nothing is gated.")
        return 0

    new = shape(load(new_path))
    old = shape(load(old_path))

    print(f"{'':26}{'was':>12}{'now':>12}")
    for k in old:
        print(f"  {k:24}{old[k]:>12,}{new[k]:>12,}")
    print("")

    problems = []

    if old["rows"]:
        moved = abs(new["rows"] - old["rows"]) / old["rows"]
        if moved > ROWS_BAND:
            problems.append(
                f"the row count moved {moved:.0%}, from {old['rows']:,} to "
                f"{new['rows']:,}. A refresh adds about a percent."
            )

    checks = [
        ("batter positions", "batters", "positions"),
        ("pitchers with innings", "pitchers", "innings"),
    ]
    for field, base, what in checks:
        was = share(old[field], old[base])
        now = share(new[field], new[base])
        if was - now > COVERAGE_DROP:
            problems.append(
                f"{what} went from {was:.1%} of {base} to {now:.1%}. "
                f"That is a source the fetch did not get, not a refresh."
            )

    was_cl = share(old["closers"], old["pitchers"])
    now_cl = share(new["closers"], new["pitchers"])
    if abs(now_cl - was_cl) > COVERAGE_DROP:
        problems.append(
            f"closers went from {was_cl:.1%} of pitchers to {now_cl:.1%}. "
            f"The flag is falling back to an innings proxy."
        )

    # A COLUMN HAS TO REACH THE END OF THE POOL. The shares above are an average
    # over a hundred and twenty-five years, so a source that simply stops in 2017
    # moves them by a few points and sails through, while the game loses the
    # position of every player anybody watching today would recognise.
    #
    # STALE_YEARS is 2 because Lahman's own release lands in the January after a
    # season, so a refresh run before it is published is legitimately one year
    # short of the WAR files, which come from a different source and are current.
    # Two is that, plus a year of somebody not having updated a mirror.
    STALE_YEARS = 2
    end = new["newest season"]
    for field, what in [("newest with a position", "positions"),
                        ("newest closer", "closer flags")]:
        got = new[field]
        if end - got > STALE_YEARS:
            problems.append(
                f"{what} stop at {got} and the pool runs to {end}. "
                f"That source is {end - got} years behind the rest of the pool, "
                f"so every recent season is missing it."
            )

    if not problems:
        print("The rebuilt pool is the same kind of thing as the one that ships.")
        return 0

    print("THE REBUILT POOL IS NOT THE SAME KIND OF THING, so it is not shipped:")
    for p in problems:
        print(f"  {p}")
    print("")
    print("Read the fetch step's log. Every one of these means a source answered "
          "with something other than the data, and the build carries on by design "
          "rather than stopping, so the log is the only place it shows.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
