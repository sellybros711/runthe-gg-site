#!/usr/bin/env python3
"""The Lahman tables, fetched without pybaseball's lahman module.

WHAT BROKE. `pybaseball.lahman` downloads
`https://github.com/chadwickbureau/baseballdatabank/archive/master.zip` and the
Chadwick Bureau renamed that branch, so the request now answers with a 404 page
and `ZipFile` raises `File is not a zip file`. Separately, pybaseball 2.2.7 has
no `lahman.teams` at all: it is `teams_core` now. Two upstream changes, and both
reached this pipeline as a warning it printed and carried on past, which is how
a refresh produced a pool with positions on 0 of its 60,208 batters.

WHY THIS DOES NOT PIN ONE URL. That is the mistake that produced the fault: one
hardcoded branch name, correct until somebody else renamed it. This repo already
records the same lesson from the hoops draft fetch, which demanded one way of
writing a link and returned zero picks for sixty six years. So the refs are a
LIST, tried in order, and the first one that answers with a real zip wins. A
branch rename costs a redirect rather than a silent empty column.

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

REPO = "https://github.com/chadwickbureau/baseballdatabank/archive"

# In order. `main` first because that is what the rename landed on, `master`
# after it because a fork or a mirror may not have followed, and the dated tags
# last so a refresh still works on the day somebody renames the branch again.
REFS = [
    "refs/heads/main",
    "refs/heads/master",
    "refs/tags/v2024.1",
    "refs/tags/v2023.1",
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


def archive():
    """The Lahman zip, downloaded once. Raises with every candidate's answer."""
    global _archive, _source
    if _archive is not None:
        return _archive

    tried = []
    for ref in REFS:
        url = f"{REPO}/{ref}.zip"
        try:
            body = _fetch(url)
        except urllib.error.HTTPError as e:
            tried.append(f"{ref}: HTTP {e.code}")
            continue
        except Exception as e:
            tried.append(f"{ref}: {e}")
            continue

        if not body.startswith(ZIP_MAGIC):
            # Name what actually came back. "File is not a zip file" is what the
            # old path said about exactly this, and it says nothing about why.
            head = body[:80].decode("utf-8", "replace").replace("\n", " ")
            tried.append(f"{ref}: {len(body)} bytes, not a zip ({head!r})")
            continue

        _archive = zipfile.ZipFile(io.BytesIO(body))
        _source = url
        print(f"  Lahman: {ref} ({len(body) // 1024}KB, "
              f"{len(_archive.namelist())} files)")
        return _archive

    raise RuntimeError(
        "No Lahman archive answered. Tried:\n    " + "\n    ".join(tried)
        + "\n  The repository may have moved. Check "
        "https://github.com/chadwickbureau/baseballdatabank and add the ref "
        "to REFS in baseball/pipeline/lahman.py."
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
