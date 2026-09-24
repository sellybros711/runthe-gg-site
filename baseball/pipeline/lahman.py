#!/usr/bin/env python3
"""The Lahman tables, fetched without pybaseball's lahman module.

WHAT BROKE, AND IT IS NOT A BRANCH RENAME. `pybaseball.lahman` downloads
`https://github.com/chadwickbureau/baseballdatabank/archive/master.zip`, and
**that repository has been taken down**. The Lahman database is SABR's now. A
missing repository and a missing branch answer identically, with GitHub's own
404 page, so `ZipFile` said `File is not a zip file` about both and the first
reading of it here was the wrong one: `refs/heads/main` was tried, 404ed, and
that looked like confirmation of a rename. Separately, pybaseball 2.2.7 has no
`lahman.teams` at all: it is `teams_core` now. Two upstream changes, and both
reached this pipeline as a warning it printed and carried on past, which is how
a refresh produced a pool with positions on 0 of its 60,208 batters.

WHY THIS TAKES A LIST OF PLACES RATHER THAN A LIST OF REFS. Pinning one url is
the mistake that produced the fault, and the first fix here made a smaller
version of it: refs of ONE repository, which is no help at all when the
repository is what went. This repo already records the same lesson from the
hoops draft fetch, which demanded one way of writing a link and returned zero
picks for sixty six years. So `SOURCES` is whole urls, tried in order, and the
first that answers with a real zip wins.

**WHERE A CURRENT ARCHIVE ACTUALLY COMES FROM: CRAN.** SABR maintains Lahman now
and publishes it through a Box folder with no link a script may fetch, and driven
from a runner that folder's own Download endpoint answers HTTP 512. The R package
that redistributes it is the hand download, published: CRAN's GitHub mirror serves
every table on its own path, current to 2025. `from_cran` is tried first and the
zips below are the fallback. See the CRAN block for what it is worth in rows.

**"A MIRROR A YEAR BEHIND COSTS ALMOST NOTHING" WAS WRITTEN HERE AND IS FALSE.**
The argument was that positions and saves barely move for a season already played,
which is true of a season the mirror HAS. A mirror does not lag by a rounding
error: every one in the list below stops in 2021 and predates SABR adding the
Negro Leagues, so a rebuild off them leaves 2,421 batters with no position and
1,312 players the archive has never heard of. Measured rather than argued, and it
sailed through a 15 point coverage band at 89.6% against 99.4%, which is why
`pool_shape.py` compares the NEWEST season carrying each column: a share averaged
over a hundred and twenty-five years cannot see a source that simply stops.

**A 404 PAGE IS A PERFECTLY GOOD HTTP RESPONSE**, which is the whole reason the
old failure read as "not a zip file" rather than as "not found": the request
succeeded and the bytes were HTML. So the magic number is checked before the
archive is opened, and a candidate that answers with anything else is reported
with what it actually sent rather than with ZipFile's guess about it.

**MEMBERS ARE FOUND BY BASENAME, ANYWHERE IN THE TREE.** The top directory is
named after whichever ref answered (`baseballdatabank-main`), and the tables
moved into `core/` at some point, so a path built from either is a second thing
that breaks on somebody else's commit. `People.csv` was also called `Master.csv`
before the repo renamed it, so people is asked for under both names.

It caches the archive for the life of the process: one download answers every
table, which matters because the build asks for four.
"""

import io
import os
import posixpath
import sys
import urllib.error
import urllib.request
import zipfile

def _gh(repo, ref):
    return f"https://github.com/{repo}/archive/refs/heads/{ref}.zip"


# THE CURRENT SABR DATABASE ARRIVES THROUGH CRAN, and that is the whole answer
# to "where do we get a current archive".
#
# SABR maintains Lahman now and publishes it through a Box folder with no link a
# script is invited to fetch. `rm=box_download_shared_folder` is what that page's
# own Download button calls; driven from a runner it answers **HTTP 512** on both
# hosts, so it does not work unauthenticated. The R package's own script says
# "Current download URL unknown" and expects a hand-downloaded zip, which is the
# ecosystem saying out loud that it does this by hand.
#
# THE R PACKAGE IS THAT HAND DOWNLOAD, PUBLISHED. Its maintainers take SABR's
# release, build it into `Lahman` on CRAN, and CRAN's GitHub mirror serves every
# table on its own at a stable path. Version 14.0-0 of 2026-02-11 carries all
# four tables 1871 to 2025.
#
# Measured against the mirrors it replaces: Appearances 128,512 rows against
# 110,423, People 22,983 bbrefIDs against 20,662, and the shipped batters the
# archive has never heard of fall from **1,312 to 75**. Heavy Johnson's 1923 and
# Charlie Blackwell's 1921 are there (SABR's Negro Leagues, which the Chadwick
# snapshot predates) and so are Pete Crow-Armstrong and Wyatt Langford (who
# debuted after it).
#
# IT IS .RData AND NOT CSV, so it needs `pyreadr` and is tried through its own
# path rather than the zip chain below. A machine without pyreadr falls through
# to the zips exactly as before, which is why this is a preference and not a
# dependency.
CRAN = "https://raw.githubusercontent.com/cran/Lahman/master/data"

# Lahman's own table names, which are the file names. `People` was `Master` in
# the same rename the zip chain already knows about.
_CRAN_NAMES = {"people.csv": ["People", "Master"]}


# THE ZIP CHAIN IS THE FALLBACK NOW, tried only when CRAN does not answer.
# Upstream under both of its branch names, so the day the Chadwick Bureau puts
# it back nothing here has to change, then the mirrors, which are somebody
# else's copy of the last snapshot before it went. All four stop in 2021.
SOURCES = [
    ("chadwickbureau, master", _gh("chadwickbureau/baseballdatabank", "master")),
    ("chadwickbureau, main", _gh("chadwickbureau/baseballdatabank", "main")),
    ("xorq-labs mirror", _gh("xorq-labs/baseballdatabank", "master")),
    ("cbwinslow mirror", _gh("cbwinslow/baseballdatabank", "master")),
]

# A zip begins PK\x03\x04. An empty archive is PK\x05\x06, which is not one of
# these files and is worth refusing rather than reading as zero rows.
ZIP_MAGIC = b"PK\x03\x04"

# The one table the repo has renamed. Anything else is asked for by its own name.
ALIASES = {"people.csv": ["people.csv", "master.csv"]}

UA = {"User-Agent": "runthe.gg baseball pipeline"}

_archive = None
_source = None


def _fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def _csvs(z):
    return [p for p in z.namelist()
            if p.lower().endswith(".csv") and not p.endswith("/")]


def descend(z, depth=2):
    """A zip of a zip is still the archive, so go in and find the tables.

    A GITHUB ARCHIVE HOLDS THE CSVs AND A BOX FOLDER HOLDS A ZIP OF THEM. SABR
    publishes `lahman_1871-2025_csv.zip` inside its folder, so downloading the
    folder gives a zip whose only useful member is another zip, and a reader that
    looked for `Appearances.csv` in it would report an archive with no tables in
    it and move on to a mirror four years out of date.

    It only descends when there is NO csv at the current level, so a GitHub
    archive is untouched and never pays for this. Bounded, because a zip can name
    itself and the point of the fetch is to not hang.
    """
    if depth <= 0 or _csvs(z):
        return z
    inner = [p for p in z.namelist() if p.lower().endswith(".zip")]
    # Try the one that says it is the csv release first. A folder download can
    # carry the SQL and Access builds too, and those are zips holding no csv at
    # all. THIS IS AN OPTIMISATION AND NOT THE RULE: the loop below keeps going
    # until it finds csv either way, so no outcome can tell this ordering from a
    # plain sort, and check_lahman.py says so rather than claiming otherwise.
    # What it buys is not decoding a hundred megabytes of Access to learn there
    # is nothing in it.
    inner.sort(key=lambda p: (0 if "csv" in posixpath.basename(p).lower() else 1, p))
    for p in inner:
        try:
            with z.open(p) as fh:
                nested = zipfile.ZipFile(io.BytesIO(fh.read()))
        except Exception:
            continue
        got = descend(nested, depth - 1)
        if _csvs(got):
            print(f"  Lahman: the tables are inside {posixpath.basename(p)}")
            return got
    return z


def archive():
    """The Lahman zip, downloaded once. Raises with every candidate's answer."""
    global _archive, _source
    if _archive is not None:
        return _archive

    tried = []
    for label, url in SOURCES:
        try:
            body = _fetch(url)
        except urllib.error.HTTPError as e:
            tried.append(f"{label}: HTTP {e.code}")
            continue
        except Exception as e:
            tried.append(f"{label}: {type(e).__name__}: {e}")
            continue

        if not body.startswith(ZIP_MAGIC):
            # Name what actually came back. "File is not a zip file" is what the
            # old path said about exactly this, and it says nothing about why.
            head = body[:80].decode("utf-8", "replace").replace("\n", " ")
            tried.append(f"{label}: {len(body)} bytes, not a zip ({head!r})")
            continue

        _archive = descend(zipfile.ZipFile(io.BytesIO(body)))
        _source = url
        # WHAT WAS SKIPPED ON THE WAY IS THE HALF WORTH READING, and it was
        # thrown away: `tried` was only ever printed when EVERY source failed, so
        # a run that fell through to a mirror said nothing but the mirror's name.
        # SABR is first precisely so somebody learns whether it answers, and the
        # one run that could have said so reported only that xorq-labs had won.
        # A source that is skipped in silence is a source nobody can fix.
        for t in tried:
            print(f"  Lahman: skipped {t}")
        print(f"  Lahman: {label} ({len(body) // 1024}KB, "
              f"{len(_archive.namelist())} files)")
        return _archive

    raise RuntimeError(
        "No Lahman archive answered. Tried:\n    " + "\n    ".join(tried)
        + "\n  Every one of these is somebody else's repository and any of them"
        " can go the\n  way chadwickbureau/baseballdatabank did. SABR maintains"
        " the database now, at\n  sabr.org/lahman-database, and publishes it"
        " through a Box folder with no url a\n  script can fetch. Find a"
        " current archive, add it to SOURCES in"
        " baseball/pipeline/lahman.py, and put a note in CLAUDE.md saying where"
        " it came from."
    )


def source():
    return _source


def member(name):
    """The archive path for a table, found by basename anywhere in the tree."""
    wanted = ALIASES.get(name.lower(), [name.lower()])
    for path in archive().namelist():
        if path.endswith("/"):
            continue
        if posixpath.basename(path).lower() in wanted:
            return path
    have = sorted(
        posixpath.basename(p) for p in archive().namelist()
        if p.lower().endswith(".csv")
    )
    raise KeyError(
        f"{name} is not in the Lahman archive. It holds {len(have)} csv files"
        + (f", including {', '.join(have[:8])}" if have else "")
    )


def from_cran(name):
    """One Lahman table off CRAN's mirror, or None if that route is not open.

    IT ANSWERS None RATHER THAN RAISING, on purpose. Missing pyreadr, a renamed
    file and an unreachable host are all "this route is shut", and the caller's
    job is then to try the zips. A raise here would take down a build that has a
    perfectly good fallback sitting under it.
    """
    try:
        import pyreadr
    except ImportError:
        return None
    for stem in _CRAN_NAMES.get(name.lower(), [name[:-4] if name.lower().endswith(".csv") else name]):
        try:
            body = _fetch(f"{CRAN}/{stem}.RData")
        except Exception:
            continue
        # pyreadr reads a path rather than bytes, so it lands in a temp file.
        import tempfile
        fd, path = tempfile.mkstemp(suffix=".RData")
        try:
            with os.fdopen(fd, "wb") as fh:
                fh.write(body)
            got = pyreadr.read_r(path)
        except Exception:
            continue
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass
        if not got:
            continue
        df = got[next(iter(got))]
        print(f"  Lahman: {stem} from CRAN ({len(df):,} rows)")
        return df
    return None


def table(name):
    """One Lahman table as a DataFrame, current for preference."""
    import pandas as pd
    df = from_cran(name)
    if df is not None:
        return df
    with archive().open(member(name)) as fh:
        return pd.read_csv(fh, low_memory=False, encoding="utf-8-sig")


def save(name, out_dir):
    """Write one table out as its own csv, and answer how many rows it had."""
    df = table(name)
    os.makedirs(out_dir, exist_ok=True)
    df.to_csv(os.path.join(out_dir, name), index=False)
    return len(df)


if __name__ == "__main__":
    # A reading, so the archive can be checked from a machine with a network
    # without running the whole build.
    out = sys.argv[1] if len(sys.argv) > 1 else "data"
    for t in ["Appearances.csv", "People.csv", "Teams.csv", "Pitching.csv"]:
        try:
            print(f"  {t}: {save(t, out):,} rows")
        except Exception as e:
            print(f"  {t}: FAILED {e}")
            sys.exit(1)
    print(f"  from {source()}")
