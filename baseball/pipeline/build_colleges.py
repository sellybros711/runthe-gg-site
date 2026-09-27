#!/usr/bin/env python3
"""Where every player in the pool went to college, for the college chemistry link.

    python3 baseball/pipeline/build_colleges.py            write baseball/data/colleges.json
    python3 baseball/pipeline/build_colleges.py --dry      print what it would write

WHY IT IS ITS OWN FILE. players.json is a season a row and a college is a fact
about a man, so it would be written onto every season he has: 44,000 rows carrying
a school name nobody reads on 41,000 of them. This is one entry a man, keyed on
the same Baseball-Reference id the pool uses.

WHERE IT COMES FROM. Lahman's CollegePlaying (a row per player per college year)
and Schools (the names), read through lahman.py, so CRAN first and the zips after.
Lahman keys on playerID and the pool keys on bbrefID; People is the join.

WHAT IT CANNOT SAY, said plainly. CollegePlaying stops at 2014, so a man who
played college ball after that is missing and simply has no college link. It
under-counts and never invents a pair, which is the safe direction for a link:
a missing one costs a little chemistry, a wrong one tells a reader two men were
team-mates at a school one of them never attended.

A MAN CAN HAVE MORE THAN ONE SCHOOL (a junior college, then a university), and
all of them are kept. Two men who shared any school share the link.
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lahman  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
POOL = os.path.join(ROOT, "baseball", "data", "players.json")
OUT = os.path.join(ROOT, "baseball", "data", "colleges.json")

# A school's full name is too long for a chemistry label on a phone, and the
# way a fan says it is often not a trimmed version of it. These are the schools
# with the most players in the pool, written the way a box score writes them.
SHORT = {
    "usc": "USC", "ucla": "UCLA", "lsu": "LSU", "unc": "North Carolina",
    "miamifl": "Miami", "tcu": "TCU", "byu": "BYU", "smu": "SMU", "unlv": "UNLV",
    "ucsb": "UC Santa Barbara", "ucirvine": "UC Irvine", "ucriverside": "UC Riverside",
    "calstfull": "Cal State Fullerton", "longbeachst": "Long Beach State",
    "california": "Cal", "olemiss": "Ole Miss", "texasam": "Texas A&M",
    "gatech": "Georgia Tech", "vatech": "Virginia Tech",
}


def short_name(sid, full):
    if sid in SHORT:
        return SHORT[sid]
    n = str(full or sid).strip()
    for pre in ("The ", "University of "):
        if n.startswith(pre):
            n = n[len(pre):]
    for suf in (" University", " State University"):
        if n.endswith(suf) and suf == " University":
            n = n[: -len(suf)]
    return n.replace(", ", " ").strip()


def build():
    pool = json.load(open(POOL))
    ids = {r["i"] for r in pool}
    cp = lahman.table("CollegePlaying.csv")
    sc = lahman.table("Schools.csv")
    pe = lahman.table("People.csv")
    to_bb = dict(zip(pe["playerID"], pe["bbrefID"]))
    names = dict(zip(sc["schoolID"], sc["name_full"]))
    p, schools = {}, {}
    for pid, sid, yr in zip(cp["playerID"], cp["schoolID"], cp["yearID"]):
        bb = to_bb.get(pid)
        if not isinstance(bb, str) or bb not in ids or not isinstance(sid, str):
            continue
        lst = p.setdefault(bb, [])
        if sid not in lst:
            lst.append(sid)
        schools[sid] = short_name(sid, names.get(sid))
    # One school is written as a string, several as a list: most men have one.
    out = {
        "v": 1,
        "source": "Lahman CollegePlaying, through 2014",
        "schools": dict(sorted(schools.items())),
        "p": {k: (v[0] if len(v) == 1 else v) for k, v in sorted(p.items())},
    }
    return out, len(ids)


def main():
    out, n = build()
    got = len(out["p"])
    print(f"  colleges: {got:,} of {n:,} players in the pool, {len(out['schools']):,} schools")
    # A join that silently matched nobody is the one way this goes wrong without
    # an error, so a result that small is refused rather than written.
    if got < n * 0.15:
        sys.exit(f"  only {got} players matched a college. Refusing to write.")
    if "--dry" in sys.argv:
        return
    with open(OUT, "w") as fh:
        json.dump(out, fh, separators=(",", ":"), ensure_ascii=True)
        fh.write("\n")
    print(f"  wrote {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
