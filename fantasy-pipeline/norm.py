"""Normalising a player name for matching. The Python half of a rule that is
written twice, in two languages, by necessity.

THE OTHER HALF IS normName() IN fantasy/worker/src/parse.mjs, and neither of
them is the authority. fantasy/lib/name-fixture.json is. The hot path is a
Cloudflare Worker, so it is JavaScript; the cold path needs nflreadpy, so it is
Python. There is no shared runtime to put this in, and the join between every
quote in this product and every player it is about is a string equality between
these two functions' outputs.

WHAT DRIFT LOOKS LIKE is what the database actually showed the night this was
written: 192 real quotes, correct player names, and every one of them
unresolved. Nothing throws, nothing is logged as an error, and the product
simply has no projections in it.


THE FOUR RULES, IN ORDER, AND THE ORDER MATTERS
-------------------------------------------------------------------------------
  1. lowercase
  2. drop a generational suffix as a whole word, with an optional trailing dot
  3. delete anything that is not a-z or whitespace
  4. collapse whitespace and trim

Two and three cannot be swapped. Stripping punctuation first turns "Jr." into
"jr" and "A.J." into "aj", which is fine, but it also turns "St. Brown" into
"st brown" before the suffix pass has had its say, and more importantly it
changes what counts as a word boundary either side of a suffix. The suffix pass
goes first and reads the name as written.


re.ASCII IS LOAD BEARING AND IS THE ONE THING MOST LIKELY TO BE DELETED
-------------------------------------------------------------------------------
JavaScript's \\b is defined over [A-Za-z0-9_] and nothing else, so an accented
letter is a NON word character there. Python's \\b on a str is Unicode aware, so
an accented letter IS a word character. That changes where a suffix boundary
falls.

Measured, both ways, against the real normName():

    "Penv" with a tilde     ASCII 'pe'   Unicode 'pev'    JavaScript 'pe'
    "Nv"   with a tilde     ASCII ''     Unicode 'v'      JavaScript ''

Both cases are in the fixture. Remove the flag and they are the only two that
fail, which is the point: everything else in the file passes either way, so a
run without them would certify a function that silently disagrees about any
player with an accent in his name.


SUFFIXES ARE DROPPED AND THAT IS A REAL RISK, TAKEN DELIBERATELY
-------------------------------------------------------------------------------
parse.mjs says this at length and it holds here. Marvin Harrison and Marvin
Harrison Jr. normalise identically. This string is a LOOKUP KEY into a
crosswalk that resolves to one id; it is never itself an identity. CLAUDE.md
records this repo folding two people into one record and a player emailing in
about it. build_players.py is what must refuse to guess, and it does.
"""

import re

# 'ii' before 'iii' in the alternation, matching parse.mjs character for
# character. A backtracking engine takes 'iii' anyway, because the boundary
# after 'ii' fails against the third i, and both engines backtrack. The fixture
# asserts it rather than leaving it to be believed.
_SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv|v)\.?\b", re.ASCII)
_NOT_NAME = re.compile(r"[^a-z\s]")
_RUNS = re.compile(r"\s+")


def norm_name(raw) -> str:
    """Normalise a player name. Must agree with normName() in parse.mjs on
    every case in fantasy/lib/name-fixture.json."""
    s = "" if raw is None else str(raw)
    s = s.lower()
    s = _SUFFIX.sub(" ", s)
    s = _NOT_NAME.sub("", s)
    s = _RUNS.sub(" ", s)
    return s.strip()
