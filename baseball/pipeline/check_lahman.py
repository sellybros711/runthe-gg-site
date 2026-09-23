#!/usr/bin/env python3
"""The Lahman reader, against archives built to every shape it has to survive.

GITHUB'S ARCHIVE HOST CANNOT BE REACHED FROM THE DEVELOPMENT SANDBOX, and that
is worth saying plainly rather than leaving somebody to read a green run as
proof the fetch works. `codeload.github.com` answers 403 on the CONNECT here,
the same split the ESPN feed records. So:

  verified here      the ref walk, the magic number refusal, and finding a
                     table in each of the three layouts the repo has used
  NOT verified here  that GitHub still serves an archive at any of those refs

The first real verification is a run of `baseball-data.yml`, and what to read in
its log is the line naming the ref that answered. A hand built fixture can only
prove the reader handles the shapes it was told about.

Every archive below is built in memory, so this needs no network and no files.
"""

import io
import sys
import zipfile

import lahman

FAILS = []


def claim(ok, what, detail=""):
    print(("  ok    " if ok else "  FAIL  ") + what)
    if not ok:
        if detail:
            print(f"        {detail}")
        FAILS.append(what)


def _csvs_of(z):
    return [p for p in z.namelist() if p.lower().endswith('.csv')]


def zip_of(paths):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for p in paths:
            z.writestr(p, "playerID,yearID\nruthba01,1923\n")
    return zipfile.ZipFile(io.BytesIO(buf.getvalue()))


def with_archive(z, fn):
    """Drive the reader against one archive, then put it back."""
    keep = lahman._archive
    lahman._archive = z
    try:
        return fn()
    finally:
        lahman._archive = keep


print("\n1. A table is found in every layout the repo has used")

LAYOUTS = {
    "today, under core/": [
        "baseballdatabank-main/core/Appearances.csv",
        "baseballdatabank-main/core/People.csv",
        "baseballdatabank-main/core/Pitching.csv",
        "baseballdatabank-main/core/Teams.csv",
    ],
    "the master branch's own top directory": [
        "baseballdatabank-master/core/Appearances.csv",
        "baseballdatabank-master/core/People.csv",
    ],
    "a dated tag": [
        "baseballdatabank-2024.1/core/Appearances.csv",
        "baseballdatabank-2024.1/core/People.csv",
    ],
    "flat, the way it used to ship": [
        "baseballdatabank-main/Appearances.csv",
        "baseballdatabank-main/People.csv",
    ],
    "upper/lower case, as a mirror may write it": [
        "bbdb/CORE/appearances.csv",
        "bbdb/CORE/people.csv",
    ],
}

for name, paths in LAYOUTS.items():
    z = zip_of(paths)
    try:
        got = with_archive(z, lambda: lahman.member("Appearances.csv"))
        claim(got in paths, f"Appearances is found: {name}", f"got {got}")
    except Exception as e:
        claim(False, f"Appearances is found: {name}", str(e))

print("\n2. People was called Master, so both names answer")

z = zip_of(["baseballdatabank-main/Master.csv"])
try:
    got = with_archive(z, lambda: lahman.member("People.csv"))
    claim(got.endswith("Master.csv"), "an archive with only Master.csv answers People", got)
except Exception as e:
    claim(False, "an archive with only Master.csv answers People", str(e))

z = zip_of(["baseballdatabank-main/core/People.csv"])
try:
    got = with_archive(z, lambda: lahman.member("People.csv"))
    claim(got.endswith("People.csv"), "and People.csv still answers People", got)
except Exception as e:
    claim(False, "and People.csv still answers People", str(e))

print("\n3. A table that is not there says what IS")

z = zip_of(["baseballdatabank-main/core/People.csv",
            "baseballdatabank-main/core/Teams.csv"])
try:
    with_archive(z, lambda: lahman.member("Pitching.csv"))
    claim(False, "a missing table raises", "it did not raise")
except KeyError as e:
    msg = str(e)
    claim("Pitching.csv" in msg, "a missing table names what was asked for", msg)
    claim("People.csv" in msg, "and lists what the archive does hold", msg)
except Exception as e:
    claim(False, "a missing table raises KeyError", f"{type(e).__name__}: {e}")

print("\n4. What member() answers is a file that opens")

# A real GitHub archive carries directory entries, so the walk skips anything
# ending in a slash. THAT SKIP CANNOT BE PROVED BY MUTATION AND THIS SECTION
# DOES NOT PRETEND TO: removing it passes green, because `posixpath.basename`
# of a path ending in a slash is the empty string, so a directory can never
# match a table name in the first place. The skip is belt and braces against a
# future change to how matching is done, and is kept on those terms.
#
# What IS worth asserting is the requirement underneath it, which survives any
# rewrite of the matching: whatever comes back has to be a member the archive
# can open, because the caller's very next move is to read it.
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w") as w:
    w.writestr("baseballdatabank-main/Appearances.csv/", "")
    w.writestr("baseballdatabank-main/core/Appearances.csv", "playerID\nx\n")
z2 = zipfile.ZipFile(io.BytesIO(buf.getvalue()))
try:
    got = with_archive(z2, lambda: lahman.member("Appearances.csv"))
    body = with_archive(z2, lambda: z2.open(got).read())
    claim(body.startswith(b"playerID"),
          "the real file is found beside a directory of the same name", got)
except Exception as e:
    claim(False, "the real file is found beside a directory of the same name",
          f"{type(e).__name__}: {e}")

print("\n5. A 404 page is refused as a 404 page")

# THIS IS THE DEFECT THE WHOLE FILE EXISTS FOR. The old path handed HTML to
# ZipFile and reported "File is not a zip file", which says nothing about which
# url answered or what it sent.
HTML = b"<!DOCTYPE html>\n<html><body>404 Not Found</body></html>\n"
EMPTY_ZIP = b"PK\x05\x06" + b"\x00" * 18

calls = []


def stub(body):
    def go(url):
        calls.append(url)
        return body
    return go


keep_fetch, keep_archive = lahman._fetch, lahman._archive
try:
    lahman._fetch, lahman._archive = stub(HTML), None
    # EVERY ARM CATCHES THE GENERAL CASE, because the defect this section is
    # written for does not raise RuntimeError: with the magic number unchecked
    # the HTML goes straight to ZipFile, which raises BadZipFile from inside the
    # loop and takes the whole checker down as a traceback. That is a guard with
    # teeth and no voice, so the arms report the type they actually got.
    try:
        lahman.archive()
        claim(False, "an archive of HTML is refused", "it was accepted")
    except RuntimeError as e:
        msg = str(e)
        claim("not a zip" in msg, "an archive of HTML is refused", msg[:120])
        claim("404 Not Found" in msg,
              "and the message carries what the server actually sent", msg[:160])
        claim(len(calls) == len(lahman.SOURCES),
              f"every source is tried before giving up "
              f"({len(calls)} of {len(lahman.SOURCES)})")
        claim(len({u for _, u in lahman.SOURCES}) == len(lahman.SOURCES)
              and len({u.split("/archive/")[0] for _, u in lahman.SOURCES}) > 1,
              "and they are not all one repository, which is what actually went",
              str([u for _, u in lahman.SOURCES]))
    except Exception as e:
        claim(False, "an archive of HTML is refused by the reader",
              f"ZipFile got there first: {type(e).__name__}: {e}")

    calls.clear()
    lahman._fetch, lahman._archive = stub(EMPTY_ZIP), None
    try:
        lahman.archive()
        claim(False, "an empty archive is refused", "it was accepted")
    except RuntimeError:
        claim(True, "an empty archive is refused too")
    except Exception as e:
        claim(False, "an empty archive is refused by the reader",
              f"{type(e).__name__}: {e}")

    # And the walk STOPS at the first real one rather than fetching them all.
    good = io.BytesIO()
    with zipfile.ZipFile(good, "w") as w:
        w.writestr("baseballdatabank-main/core/People.csv", "playerID\nx\n")
    calls.clear()
    lahman._fetch, lahman._archive = stub(good.getvalue()), None
    lahman.archive()
    claim(len(calls) == 1, f"the first real zip wins and the rest are not fetched "
                           f"({len(calls)} request)")
    claim(lahman.source() is not None, "and the ref that answered is recorded",
          str(lahman.source()))
finally:
    lahman._fetch, lahman._archive = keep_fetch, keep_archive

print("\n6. The tables the build asks for are the tables the fetch gets")

# The fetch got Appearances, People and Teams. build_positions.py loads
# Appearances, People and PITCHING, so the closer flags always fell through to
# the broken download even on a run where the other three worked.
import re

fetch_src = open("fetch_inputs.py").read()
build_src = open("build_positions.py").read()
price_src = open("build_pricing.py").read()

fetched = set(re.findall(r'LAHMAN_TABLES\s*=\s*\[([^\]]*)\]', fetch_src))
fetched = set(re.findall(r'"([A-Za-z]+\.csv)"', fetched.pop())) if fetched else set()
claim(bool(fetched), f"the fetch declares its Lahman tables in one list ({len(fetched)})")

wanted = set(re.findall(r'load_lahman_table\("([A-Za-z]+\.csv)"\)', build_src))
wanted |= set(re.findall(r'"(Teams\.csv)"', price_src))
claim(bool(wanted), f"the builds name the tables they load ({len(wanted)})")

missing = wanted - fetched
claim(not missing, "every table a build loads is a table the fetch gets",
      f"not fetched: {sorted(missing)}")

print("\n7. The build stops rather than writing a pool nobody can draft")

# THE READER BEING RIGHT IS HALF OF IT. What actually shipped a broken pool was
# the two `except` blocks below Step 2 and Step 3, which printed a warning and
# carried on, so the workflow's next step found a file and committed it. Both
# faults are invisible at the row level: every price is right, every name is
# right, and the pool is unplayable.
#
# So this DRIVES the real script, in a copy of its own directory, with a `lahman`
# module that refuses. Asserting the source carries a `sys.exit` would only ask
# whether the file says what it says.

import os
import shutil
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))

BAT = ("player_ID,name_common,year_ID,team_ID,WAR,pitcher\n"
       "ruthba01,Babe Ruth,1923,NYY,14.1,N\n"
       "gehrilo01,Lou Gehrig,1927,NYY,11.8,N\n"
       # TRADED MID SEASON, and his two stints are what the position read has to
       # sum. Two rows in the spine collapse to one priced season already.
       "hendero01,Rickey Henderson,1989,NYA,3.1,N\n"
       "hendero01,Rickey Henderson,1989,OAK,4.2,N\n")
PIT = ("player_ID,name_common,year_ID,team_ID,WAR,pitcher,IPouts_start,IPouts_relief\n"
       "johnswa01,Walter Johnson,1913,WSH,14.6,Y,1040,20\n"
       # A REAL CLOSER: no starts, 53 saves.
       "riverma01,Mariano Rivera,2004,NYY,4.0,Y,0,240\n"
       # A SETUP MAN: no starts and two saves. The innings proxy calls him a
       # closer, because all it knows is that he never starts, and the saves
       # column says he is not one. Both readings sit in the pool at once until
       # the saves answer is allowed to say no.
       "quantpa01,Paul Quantrill,2001,TOR,2.5,Y,0,250\n")

APPEARANCES = ("playerID,yearID,G_c,G_1b,G_2b,G_3b,G_ss,G_lf,G_cf,G_rf,G_dh\n"
               "ruth,1923,0,4,0,0,0,148,0,0,0\n"
               "gehrig,1927,0,155,0,0,0,0,0,0,0\n"
               # Eight games in left and seven for the other club is fifteen, so
               # he qualifies on the SEASON and on neither stint. Read per club
               # he comes out with no position at all, which is how 2,422
               # batters lost theirs against the pool that ships.
               "henderson,1989,0,0,0,0,0,8,0,0,0\n"
               "henderson,1989,0,0,0,0,0,7,0,0,0\n")
PITCHING = ("playerID,yearID,SV\n"
            "johnson,1913,2\n"
            "rivera,2004,53\n"
            "quantrill,2001,2\n")
PEOPLE_ROWS = [("ruth", "ruthba01"), ("gehrig", "gehrilo01"),
               ("henderson", "hendero01"), ("johnson", "johnswa01"),
               ("rivera", "riverma01"), ("quantrill", "quantpa01")]


def people(with_ids=True):
    out = "playerID,bbrefID\n"
    for lah, bbref in PEOPLE_ROWS:
        out += f"{lah},{bbref if with_ids else ''}\n"
    return out


REFUSES = (
    "def table(name):\n"
    "    raise RuntimeError('no archive answered (fixture)')\n"
    "def save(name, out):\n"
    "    raise RuntimeError('no archive answered (fixture)')\n"
)


def drive(what, lahman_src=None, tables=None, args=()):
    """Run the real build_positions.py in a copy of this directory."""
    tmp = tempfile.mkdtemp(prefix="lahman-build-")
    try:
        shutil.copy(os.path.join(HERE, "build_positions.py"), tmp)
        with open(os.path.join(tmp, "lahman.py"), "w") as fh:
            fh.write(lahman_src if lahman_src is not None
                     else open(os.path.join(HERE, "lahman.py")).read())
        d = os.path.join(tmp, "data")
        os.makedirs(d)
        open(os.path.join(d, "war_daily_bat.txt"), "w").write(BAT)
        open(os.path.join(d, "war_daily_pitch.txt"), "w").write(PIT)
        for name, body in (tables or {}).items():
            open(os.path.join(d, name), "w").write(body)
        r = subprocess.run([sys.executable, "build_positions.py", *args],
                           cwd=tmp, capture_output=True, text=True, timeout=300)
        return r.returncode, r.stdout + r.stderr
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


ALL = {"Appearances.csv": APPEARANCES, "People.csv": people(),
       "Pitching.csv": PITCHING}

# EVERY ARM REFUSES, AND THAT IS ABOUT THE ARMS RATHER THAN THE SUBJECT. Two of
# them were written against the real reader, on the strength of a green run, and
# what made them green was this sandbox having no route to the archive. On a
# runner the fetch would have worked and both would have reported the build
# failing to stop. A fixture that passes because the machine is offline is the
# repo's own note about a timing property checked by hoping to lose the race.
# THE COUNTS ARE DERIVED FROM THE FIXTURE, never written. Both were pinned as
# "2/2" and "0/2" and went red the moment the fixture grew a third batter, which
# is a check that fails on somebody improving it.
BATTERS = len({ln.split(",")[0] for ln in BAT.strip().splitlines()[1:]})
CLOSERS = sum(1 for ln in PITCHING.strip().splitlines()[1:]
              if int(ln.split(",")[2]) >= 20)

code, log = drive("everything present", lahman_src=REFUSES, tables=ALL)
claim(code == 0, "a build with the Lahman tables finishes", log[-400:])
claim(f"Batters with positions: {BATTERS}/{BATTERS}" in log,
      f"and the positions land, all {BATTERS} of them", log[-500:])
claim(f"Closers (saves-based): {CLOSERS}" in log,
      f"and {CLOSERS} of the three arms is the closer, off the saves column",
      log[-500:])

# THE SETUP MAN IS THE CLAIM, and the count above cannot make it: he never
# starts, so the innings proxy calls him a closer, and two saves says he is not
# one. Read off the shipped row rather than off the log, because what the game
# reads is the flag.
def closer_flags(text):
    import json as _j
    return {r["name"]: bool(r.get("is_closer_proxy"))
            for r in _j.loads(text) if r.get("role") == "pitch"}


flags = None
tmp = tempfile.mkdtemp(prefix="lahman-flags-")
try:
    shutil.copy(os.path.join(HERE, "build_positions.py"), tmp)
    open(os.path.join(tmp, "lahman.py"), "w").write(REFUSES)
    d = os.path.join(tmp, "data")
    os.makedirs(d)
    open(os.path.join(d, "war_daily_bat.txt"), "w").write(BAT)
    open(os.path.join(d, "war_daily_pitch.txt"), "w").write(PIT)
    for name, body in ALL.items():
        open(os.path.join(d, name), "w").write(body)
    subprocess.run([sys.executable, "build_positions.py"], cwd=tmp,
                   capture_output=True, text=True, timeout=300)
    out = os.path.join(tmp, "priced_players_enriched.json")
    if os.path.exists(out):
        flags = closer_flags(open(out).read())
finally:
    shutil.rmtree(tmp, ignore_errors=True)

claim(flags is not None, "the enriched rows are readable", str(flags))
if flags:
    claim(flags.get("Mariano Rivera") is True,
          "53 saves is a closer", str(flags))
    claim(flags.get("Paul Quantrill") is False,
          "and two saves is NOT, however few games he starts", str(flags))
    claim(flags.get("Walter Johnson") is False,
          "and a starter is not one either", str(flags))

# ONE TABLE MISSING AT A TIME, or the arm proves nothing about the step it
# names. Written with no tables at all, reintroducing the Appearances swallow
# still stopped the build, at the PITCHING step one screen further down, so the
# arm passed on the defect it exists for and only its message assertion moved.
code, log = drive("no Appearances", lahman_src=REFUSES,
                  tables={"People.csv": people(), "Pitching.csv": PITCHING})
claim(code != 0, "no Appearances stops the build", log[-300:])
claim("FATAL" in log and "draft slot" in log,
      "and says the slots would have nothing eligible for them", log[-300:])

code, log = drive("no Appearances, waved through", lahman_src=REFUSES,
                  tables={"People.csv": people(), "Pitching.csv": PITCHING},
                  args=("--allow-no-positions",))
claim(code == 0, "and the flag is still a way through", log[-300:])
claim(f"Batters with positions: 0/{BATTERS}" in log,
      "which builds exactly the pool that shipped", log[-500:])

code, log = drive("no Pitching", lahman_src=REFUSES,
                  tables={"Appearances.csv": APPEARANCES, "People.csv": people()})
claim(code != 0, "no Pitching stops the build too", log[-300:])
claim("22,019 closers against 905" in log,
      "and says what the innings guess costs", log[-300:])

blank = dict(ALL, **{"People.csv": people(with_ids=False)})
code, log = drive("People with no bbrefID", lahman_src=REFUSES, tables=blank)
claim(code != 0, "a join that collapses stops the build", log[-400:])
claim("under 50%" in log, "and names the coverage rather than the exception",
      log[-400:])

# WHAT THIS CANNOT SAY is that the fallback is lahman.py rather than
# pybaseball's. Putting the old `from pybaseball import lahman` back passes
# every arm above, because pybaseball is not installed here either, so both
# raise and the guards below them fire identically. Section 6 holds the table
# list, and the reader's own sections hold the reader. Nothing here proves which
# module a machine WITH pybaseball would reach for, and pretending otherwise
# would be an assertion that can only pass.

print("\n8. The pricing build survives Lahman actually loading")

# THIS BRANCH HAD NEVER RUN. `load_eligibility` returned None on every previous
# run of this pipeline, because Lahman had not loaded since the archive moved, so
# the merge below it was dead code and took the build down the first time it
# fired. That is this repo's own "look for the door before building the room",
# arriving at a branch rather than a screen.
#
# ONE DEFECT AND NOT TWO. It surfaced as `Unalignable boolean Series` from the
# coverage report's sample line, which reads like a second fault and is not: the
# join duplicated rows, so the boolean was shorter than the frame it indexed.
# Moving that sample above the merge is hardening, it is written up as such in
# build_pricing.py, and reintroducing it alone passes green here.

BAT = ("player_ID,name_common,year_ID,team_ID,WAR\n"
       "ruthba01,Babe Ruth,1923,NYY,14.1\n"
       "hornsro01,Rogers Hornsby,1924,SLN,12.5\n"
       # TRADED MID SEASON, which is the whole point: two Appearances rows, one
       # priced row, and a join that must not turn him into two.
       "hendero01,Rickey Henderson,1989,NYA,3.1\n"
       "hendero01,Rickey Henderson,1989,OAK,4.2\n")
PIT = ("player_ID,name_common,year_ID,team_ID,WAR,G,GS,SV\n"
       "johnswa01,Walter Johnson,1913,WSH,14.6,48,36,2\n"
       "riverma01,Mariano Rivera,2004,NYY,4.0,74,0,53\n")

APP = ("playerID,yearID,teamID,G_c,G_1b,G_2b,G_3b,G_ss,G_lf,G_cf,G_rf,G_dh\n"
       "ruth,1923,NYA,0,4,0,0,0,148,0,0,0\n"
       "hornsby,1924,SLN,0,0,143,0,0,0,0,0,0\n"
       # 40 and 45 games in centre, neither over ELIG_GAMES on its own at a
       # higher floor, and 85 together: summing is the right reading as well as
       # the unique one.
       "henderson,1989,NYA,0,0,0,0,0,0,40,0,0\n"
       "henderson,1989,OAK,0,0,0,0,0,0,45,0,0\n")
PEOPLE = ("playerID,bbrefID\n"
          "ruth,ruthba01\nhornsby,hornsro01\n"
          "henderson,hendero01\njohnson,johnswa01\nrivera,riverma01\n")
TEAMS = ("yearID,teamID,name,W,L\n1923,NYA,New York Yankees,98,54\n"
         "1989,OAK,Oakland Athletics,99,63\n")


def price_run(tables):
    tmp = tempfile.mkdtemp(prefix="pricing-")
    try:
        d = os.path.join(tmp, "data")
        out = os.path.join(tmp, "out")
        os.makedirs(d)
        os.makedirs(out)
        open(os.path.join(d, "war_daily_bat.txt"), "w").write(BAT)
        open(os.path.join(d, "war_daily_pitch.txt"), "w").write(PIT)
        for name, body in tables.items():
            open(os.path.join(d, name), "w").write(body)
        r = subprocess.run([sys.executable, "build_pricing.py",
                            "--data-dir", d, "--out-dir", out],
                           cwd=HERE, capture_output=True, text=True, timeout=300)
        rows = None
        priced = os.path.join(out, "priced_players.csv")
        if os.path.exists(priced):
            rows = [ln for ln in open(priced).read().splitlines() if ln.strip()][1:]
        return r.returncode, r.stdout + r.stderr, rows
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


ALL_LAH = {"Appearances.csv": APP, "People.csv": PEOPLE, "Teams.csv": TEAMS}

code, log, rows = price_run({})
claim(code == 0, "it builds with no Lahman at all, as it always has", log[-400:])
base = len(rows or [])
claim(base == 5, f"five priced men, the traded one collapsed to a season ({base})",
      str(rows))

code, log, rows = price_run(ALL_LAH)
claim(code == 0, "and it builds with Lahman loaded, which had never once happened",
      log[-600:])
claim(len(rows or []) == base,
      f"the eligibility join multiplies nobody ({len(rows or [])} against {base})",
      str(rows))
claim(any("CF" in (r or "") for r in (rows or [])),
      "and the traded man's two stints sum to one eligible position", str(rows))

print("\n9. A zip of a zip is still the archive")

# SABR publishes lahman_1871-2025_csv.zip INSIDE a Box folder, so downloading the
# folder gives a zip whose only useful member is another zip. A reader that
# looked for Appearances.csv at the top would report an archive with no tables
# and move on to a mirror four years out of date, which is the quiet failure
# this whole chain exists to stop.


def nest(paths, inner_name="lahman_1871-2025_csv.zip", extra=()):
    """A zip holding a zip holding the tables, plus whatever else."""
    inner = io.BytesIO()
    with zipfile.ZipFile(inner, "w") as w:
        for p in paths:
            w.writestr(p, "playerID,yearID\nruthba01,1923\n")
    outer = io.BytesIO()
    with zipfile.ZipFile(outer, "w") as w:
        w.writestr(inner_name, inner.getvalue())
        for name, body in extra:
            w.writestr(name, body)
    return zipfile.ZipFile(io.BytesIO(outer.getvalue()))


z = nest(["lahman_1871-2025_csv/Appearances.csv",
          "lahman_1871-2025_csv/People.csv"])
try:
    got = with_archive(lahman.descend(z), lambda: lahman.member("Appearances.csv"))
    claim(got.endswith("Appearances.csv"), "a table inside a nested zip is found", got)
except Exception as e:
    claim(False, "a table inside a nested zip is found", f"{type(e).__name__}: {e}")

# A FOLDER CARRIES THE OTHER BUILDS TOO, and they are zips with no csv in them.
# WHAT THIS PROVES IS THAT ONE DOES NOT STOP THE SEARCH, and not that the csv
# build is tried first: the loop keeps going until it finds csv, so ordering the
# candidates is an optimisation and no outcome can distinguish it from a plain
# sort. That is asserted honestly rather than dressed up, the same way the
# trailing-slash skip is in section 4. The decoy still sorts AHEAD of the real
# one (Lahman really does publish an Access build) so the arm is at least
# exercising the case where the first candidate is the wrong one.
acc = io.BytesIO()
with zipfile.ZipFile(acc, "w") as w:
    w.writestr("lahman_1871-2025_access/lahman.mdb", "not a table\n")
z = nest(["lahman_1871-2025_csv/Appearances.csv"],
         extra=[("lahman_1871-2025_access.zip", acc.getvalue())])
try:
    got = with_archive(lahman.descend(z), lambda: lahman.member("Appearances.csv"))
    claim(got.endswith("Appearances.csv"),
          "and a build with no csv in it does not stop the search", got)
except Exception as e:
    claim(False, "and a build with no csv in it does not stop the search",
          f"{type(e).__name__}: {e}")

# A GITHUB ARCHIVE MUST NOT PAY FOR ANY OF THIS. It has csv at the top, so the
# descent returns it untouched, which is asserted as identity rather than by
# reading it: a copy would be a second object and a second decode of 30MB.
flat = zip_of(["baseballdatabank-main/core/Appearances.csv"])
claim(lahman.descend(flat) is flat,
      "a flat archive is handed back as it is, not re-opened")

# Bounded, because a zip can name itself and the fetch must not hang.
deep = nest(["a/Appearances.csv"])
for _ in range(4):
    outer = io.BytesIO()
    with zipfile.ZipFile(outer, "w") as w:
        buf = io.BytesIO()
        deep.fp.seek(0)
        w.writestr("more.zip", deep.fp.read())
    deep = zipfile.ZipFile(io.BytesIO(outer.getvalue()))
try:
    got = lahman.descend(deep)
    claim(not _csvs_of(got), "a zip nested past the bound is given up on rather than chased",
          str(got.namelist()[:3]))
except Exception as e:
    claim(False, "a zip nested past the bound is given up on rather than chased",
          f"{type(e).__name__}: {e}")

print("")
if FAILS:
    print(f"{len(FAILS)} failed.\n")
    sys.exit(1)
print("All good.\n")
