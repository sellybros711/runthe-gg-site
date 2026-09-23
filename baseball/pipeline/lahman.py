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

**THE MIRRORS ARE UNOFFICIAL, AND "A MIRROR A YEAR BEHIND COSTS ALMOST NOTHING"
WAS WRITTEN HERE AND IS FALSE.** The argument was that positions and saves barely
move for a season already played, which is true of a season the mirror HAS. What
it misses is that a mirror does not lag by a rounding error: the one that answers
today carries Appearances to about 2016 and saves to about 2021, so a rebuild off
it gives the pool no position for **2,421 batters**, every one of them from 2017
on. The pool is then perfectly correct about Babe Ruth and knows nothing about
anybody currently playing, which is the half of the board a reader recognises.

Measured rather than argued, and it sailed through a 15 point coverage band at
89.6% against 99.4%. `pool_shape.py` compares the NEWEST season carrying each
column now, because a share averaged over a hundred and twenty-five years cannot
see a source that simply stops.

Upstream is still first so it wins the day it comes back. SABR publishes the
current database through a Box folder, which has no stable url a script can
fetch, so it is not in this list, and **a refresh that has to ship needs a
current archive rather than whichever mirror answers**.

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


# SABR'S OWN FOLDER, AND IT IS NOT A DOCUMENTED DOWNLOAD URL. SABR maintains the
# Lahman database now and publishes it through a Box folder, which has no link a
# script is invited to fetch: `rm=box_download_shared_folder` is what the web
# app's own Download button calls and it is undocumented, so it is allowed to
# stop working and the walk simply moves on to the next source when it does.
#
# It is FIRST because it is the only current one. The mirrors under it stop in
# 2021 and predate SABR adding the Negro Leagues, which between them leave 2,421
# batters with no position and 1,312 players the archive has never heard of.
_SABR_FOLDER = "rsry2en86bimvybwsorumfsxmf91002a"


def _box(host):
    return (f"https://{host}/index.php?rm=box_download_shared_folder"
            f"&shared_name={_SABR_FOLDER}")


# In order, and the order is the argument. SABR first because it is the live
# database. Then upstream under both of its branch names, so the day the
# Chadwick Bureau puts it back nothing here has to change. Then the mirrors,
# which are somebody else's copy of the last snapshot before it went.
SOURCES = [
    ("SABR, via its Box folder", _box("sabr.app.box.com")),
    ("SABR, via app.box.com", _box("app.box.com")),
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


def table(name):
    """One Lahman table as a DataFrame."""
    import pandas as pd
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
