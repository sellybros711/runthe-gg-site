#!/usr/bin/env python3
"""
The gate a weekly roster refresh must pass before it is proposed: compares the ROSTER in
golf/index.html now against the same file at a git ref (default HEAD) and fails loudly if the
refresh did anything a re-rate should never do.

  python3 golf/roster/check_refresh.py            # working tree against HEAD
  python3 golf/roster/check_refresh.py --ref main

A re-rate may only move ratings and the data_source date on current cards. So:
  - the same cards, by name, in the same order (none dropped, none added)
  - legend cards byte for byte the same (the legend guard held)
  - on every card, nothing but the rating fields and data_source changed
  - every rating a whole number from 40 to 99
  - no overall moved more than MAX_MOVE in one week (a bad name match looks like a huge mover)
  - no fewer cards carry a DataGolf date than before (a feed that lost players)
  - ROSTER_UPDATE is dated the newest DataGolf date, and lists exactly the cards whose overall moved
"""
import argparse, json, re, subprocess, sys

HTML = "golf/index.html"
RATED = {"overall", "dist", "acc", "app", "sht", "scr", "bnk", "put", "data_source"}
SKILLS = ["overall", "dist", "acc", "app", "sht", "scr", "bnk", "put", "clu"]
MAX_MOVE = 8


def roster(text):
    lines = text.split("\n")
    start = next(i for i, l in enumerate(lines) if l.startswith("const ROSTER=["))
    raw, cards = {}, []
    for l in lines[start + 1:]:
        if l.startswith("];"):
            break
        s = l.strip().rstrip(",")
        if s.startswith("{"):
            o = json.loads(s)
            cards.append(o)
            raw[o["name"]] = l
    return cards, raw


def update(text):
    m = re.search(r"const ROSTER_UPDATE=\{date:'([^']*)', players:\[(.*?)\]\};", text)
    if not m:
        return None, []
    return m.group(1), re.findall(r'\{n:("(?:[^"\\]|\\.)*"),f:(\d+),t:(\d+)\}', m.group(2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", default="HEAD")
    a = ap.parse_args()
    old_text = subprocess.run(["git", "show", f"{a.ref}:{HTML}"], capture_output=True, text=True, check=True).stdout
    new_text = open(HTML, encoding="utf-8").read()
    old, old_raw = roster(old_text)
    new, new_raw = roster(new_text)
    bad = []

    if [c["name"] for c in old] != [c["name"] for c in new]:
        gone = sorted({c["name"] for c in old} - {c["name"] for c in new})
        added = sorted({c["name"] for c in new} - {c["name"] for c in old})
        bad.append(f"the cards changed: dropped {gone[:10]}, added {added[:10]} (or the order moved)")
    byname = {c["name"]: c for c in old}
    moved = {}
    for c in new:
        o = byname.get(c["name"])
        if not o:
            continue
        legend = o.get("era") == "leg" or o.get("tier") == "legend"
        if legend and old_raw[c["name"]] != new_raw[c["name"]]:
            bad.append(f"legend card changed: {c['name']}")
        extra = {k for k in set(o) | set(c) if o.get(k) != c.get(k)} - RATED
        if extra:
            bad.append(f"{c['name']}: fields other than ratings changed: {sorted(extra)}")
        for k in SKILLS:
            v = c.get(k)
            if v is not None and (not isinstance(v, int) or not 40 <= v <= 99):
                bad.append(f"{c['name']}: {k} = {v!r}, not a whole number from 40 to 99")
        if o.get("overall") != c.get("overall"):
            moved[c["name"]] = (o["overall"], c["overall"])
            if abs(c["overall"] - o["overall"]) > MAX_MOVE:
                bad.append(f"{c['name']}: overall {o['overall']} -> {c['overall']}, more than {MAX_MOVE} in a week")

    dg = lambda cs: [re.search(r"DataGolf (\d{4}-\d\d-\d\d)", c.get("data_source", "")) for c in cs]
    old_dg = [m for m in dg(old) if m]
    new_dg = [m for m in dg(new) if m]
    if len(new_dg) < len(old_dg):
        bad.append(f"fewer cards carry a DataGolf date: {len(old_dg)} -> {len(new_dg)}")
    newest = max((m.group(1) for m in new_dg), default=None)

    date, plist = update(new_text)
    if moved:
        if date != newest:
            bad.append(f"ROSTER_UPDATE is dated {date}, the newest DataGolf date is {newest}")
        listed = {json.loads(n): (int(f), int(t)) for n, f, t in plist}
        if listed != moved:
            bad.append(f"ROSTER_UPDATE lists {len(listed)} moves, the roster has {len(moved)}")

    print(f"{len(new)} cards, {len(new_dg)} rated from DataGolf (newest {newest}), {len(moved)} overalls moved")
    for n, (f, t) in sorted(moved.items(), key=lambda x: (-abs(x[1][1] - x[1][0]), x[0])):
        print(f"  {n}: {f} -> {t}")
    if bad:
        print("\nFAIL")
        for b in bad:
            print("  " + b)
        sys.exit(1)
    print("roster refresh ok")


if __name__ == "__main__":
    main()
