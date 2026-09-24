"""The Python half of the name contract.

    python3 fantasy-pipeline/test_norm.py

Reads fantasy/lib/name-fixture.json and drives norm_name() against every case.
fantasy/check-worker.mjs drives normName() against the same file. Neither
implementation is the authority and neither test may be "fixed" by editing the
fixture to suit it.

NO TEST FRAMEWORK, on purpose. Every other checker in this repo is a script
that prints one line per claim and exits non-zero, and the workflow that runs
this one already has to install nflreadpy; adding pytest to make twenty string
comparisons look official is a dependency for nothing.

IT ASSERTS THE FIXTURE IS NOT EMPTY, which is the coverage argument
check-numbers.mjs makes in CLAUDE.md: a loop over no cases passes, and a reader
that silently found nothing is how an extractor in this repo has already been
wrong three times.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from norm import norm_name  # noqa: E402

FIXTURE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "fantasy", "lib", "name-fixture.json",
)

fails = 0
passes = 0


def ck(claim: str, ok: bool, detail: str = "") -> None:
    global fails, passes
    if ok:
        passes += 1
        print(" ok   " + claim)
    else:
        fails += 1
        print(" FAIL " + claim + (("\n         " + detail) if detail else ""))


def main() -> int:
    with open(FIXTURE, encoding="utf-8") as fh:
        fixture = json.load(fh)

    cases = fixture.get("cases") or []

    print("\nThe name contract, Python side")
    print("-" * 62)

    # COVERAGE FIRST. A reader that finds nothing passes every assertion below
    # it, which is the exact shape of failure this repo has shipped three
    # times. The floor is deliberately near the real count rather than at 1:
    # a fixture that lost most of its cases is as broken as one that lost all
    # of them, and only this line would notice.
    ck("the fixture was actually read", len(cases) >= 25, f"{len(cases)} cases")

    for c in cases:
        raw = c["raw"]
        want = c["norm"]
        got = norm_name(raw)
        ck(f"{raw!r} -> {want!r}", got == want, f"got {got!r} ({c.get('why', '')})")

    # THE EMPTY STRING IS NOT AN ALIAS. A name that is nothing but a suffix
    # normalises away entirely, and stored as a key it would match every other
    # name that normalises to nothing. build_players.py refuses it; this is the
    # claim that it has something to refuse.
    ck("a name that is only a suffix normalises to nothing",
       norm_name("Jr.") == "" and norm_name("III") == "",
       f"{norm_name('Jr.')!r} {norm_name('III')!r}")

    # AND THE FLAG. Stated as its own claim rather than left to the two fixture
    # rows, because if somebody deletes re.ASCII those rows fail with no hint
    # as to why, and this line names the reason in the failure output.
    ck("re.ASCII is on, so word boundaries match JavaScript's",
       norm_name("Ñv") == "" and norm_name("Peñv") == "pe",
       "an accented letter must be a NON word character here, as it is in JS. "
       "Without re.ASCII these answer 'v' and 'pev'.")

    print("-" * 62)
    if fails:
        print(f"\n{fails} of {passes + fails} checks FAILED.")
        print("Do NOT edit the fixture to make this pass. One of the two")
        print("implementations is wrong, and the fixture says which behaviour")
        print("the product depends on.")
        return 1
    print(f"\n{passes} checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
