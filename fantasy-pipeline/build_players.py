"""Build the crosswalk: who is who, so a quote can be attributed to a player.

    python3 fantasy-pipeline/build_players.py --dry-run     # writes nothing
    python3 fantasy-pipeline/build_players.py               # writes

Reads nflverse through nflreadpy, filters to the players this product is about,
normalises every name with the rule fantasy/lib/name-fixture.json pins, and
writes fantasy_players and fantasy_player_aliases. Then calls
fantasy_resolve_names(), which attaches the quotes that were already collected
before the crosswalk existed.

THE ODDS API KEY IS NOT INVOLVED AND MUST NEVER BE. This is the cold path. It
touches nflverse (public, free) and Supabase, and nothing else. If a change
here starts wanting the provider key, that change belongs in the Worker.


WHY THIS RUNS IN GITHUB ACTIONS AND NOT IN THE WORKER
-------------------------------------------------------------------------------
The brief's split: anything needing Python or more than a couple of seconds is
cold path, where being slow is free. This downloads a 24,000 row table and does
a pile of string work. It changes about as often as an NFL roster does, which
is daily at most, so a Worker doing it every minute would be absurd.


WHAT IT REFUSES TO DO, WHICH IS THE PART WORTH READING
-------------------------------------------------------------------------------
Two silent wrongs are possible here and both are refusals rather than guesses.

  * A COLLIDING NAME. alias_norm is a PRIMARY KEY, so if two players normalise
    identically only one can own it, and whichever one loses gets the other's
    quotes attributed to him for ever. CLAUDE.md records this repo folding two
    people into one record and a player emailing in about it. So a collision
    writes NEITHER alias and reports both, and those players simply have no
    quotes attributed until somebody adds a rule that tells them apart.

    Measured on real data the day this was written: 0 collisions among active
    fantasy players, 153 across all history. The season filter is the only
    reason it is zero, and a Jr. debuting while his father is still playing
    breaks it. It is not hypothetical, it is just not today.

  * AN EMPTY NORMALISATION. A name that is nothing but a suffix normalises to
    "", and stored as a key that matches every other name that normalises to
    nothing. Refused outright.


AND WHAT IT REFUSES TO FINISH
-------------------------------------------------------------------------------
A run that produces far fewer players than an NFL season has is a data shape
change, not a quiet week, and it FAILS rather than writing a crosswalk with
holes in it. A crosswalk missing half the league does not throw anywhere: the
poller keeps collecting, the quotes keep storing, and the only symptom is
players with no projection, which looks exactly like a player with no market.
That is the one failure this product must never produce silently.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from norm import norm_name  # noqa: E402

# The positions this product projects. A fantasy point distribution for an
# offensive tackle is not a thing anybody wants, and every extra name is
# another chance to collide.
FANTASY_POSITIONS = {"QB", "RB", "WR", "TE", "K", "FB"}

# A floor, not a target. An NFL season carries roughly a thousand players at
# these positions; this is low enough never to fire on a real roster churn and
# high enough to catch nflverse changing a column name under us.
MIN_PLAYERS = 600

# PostgREST takes a batch happily. 500 keeps a request well under any body
# limit while making the whole write a handful of round trips.
CHUNK = 500


def log(**kw):
    print(json.dumps(kw, default=str), flush=True)


# ---------------------------------------------------------------------------
# Supabase, over PostgREST, with the service key. The same shape store.mjs
# uses, deliberately: one way of talking to this database, not two.
# ---------------------------------------------------------------------------
class Supabase:
    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.key = key

    def _call(self, path: str, method: str, body=None, prefer: str = ""):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("apikey", self.key)
        req.add_header("Authorization", "Bearer " + self.key)
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")
        if prefer:
            req.add_header("Prefer", prefer)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read().decode()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:400]
            # THE KEY IS NEVER IN THIS MESSAGE. It is in a header, and the
            # header is not echoed, but saying so here is what stops somebody
            # "improving" the error by printing the request.
            raise RuntimeError(
                f"supabase {method} {path} -> {e.code} {detail}") from None

    def upsert(self, table: str, rows: list, on_conflict: str):
        for i in range(0, len(rows), CHUNK):
            self._call(
                f"/{table}?on_conflict={on_conflict}", "POST", rows[i:i + CHUNK],
                prefer="resolution=merge-duplicates,return=minimal")

    def rpc(self, fn: str, args=None):
        return self._call("/rpc/" + fn, "POST", args or {})


# ---------------------------------------------------------------------------
# nflverse
# ---------------------------------------------------------------------------
def load_people(season: int):
    import nflreadpy as nfl

    df = nfl.load_players()
    want = ["gsis_id", "display_name", "position", "latest_team",
            "last_season", "pfr_id", "espn_id"]
    missing = [c for c in want if c not in df.columns]
    # NAMED, AND FATAL. A renamed column is the likeliest thing to change
    # upstream, and reading it as None would build a crosswalk with no
    # positions in it and report success.
    if missing:
        raise RuntimeError(
            "nflreadpy load_players() is missing columns: " + ", ".join(missing)
            + ". It returned: " + ", ".join(df.columns))

    rows = df.select(want).to_dicts()

    # A PLAYER WHOSE LAST SEASON IS BEFORE LAST SEASON IS NOT IN THIS PRODUCT.
    # The cut is what holds namesake collisions at zero, and it is written
    # against the season rather than as a literal year so it does not rot.
    keep = [r for r in rows
            if r.get("position") in FANTASY_POSITIONS
            and (r.get("last_season") or 0) >= season - 1]
    return rows, keep


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="do everything and write nothing")
    ap.add_argument("--season", type=int, default=int(os.environ.get("SEASON", "0")))
    args = ap.parse_args()

    season = args.season
    if not season:
        # The same rule season.mjs uses: January and February belong to the
        # season before them.
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        season = now.year - 1 if now.month <= 2 else now.year

    log(at="pipeline.start", season=season, dry_run=args.dry_run)

    all_rows, keep = load_people(season)
    log(at="nflverse.loaded", total=len(all_rows), fantasy_and_active=len(keep))

    if len(keep) < MIN_PLAYERS:
        raise RuntimeError(
            f"only {len(keep)} players survived the filter, floor is {MIN_PLAYERS}. "
            "That is a data shape change rather than a quiet week, and writing it "
            "would leave the crosswalk with holes that look exactly like players "
            "with no market.")

    # ----------------------------------------------------------------- names
    by_norm = defaultdict(list)
    players = []
    empty = []
    for r in keep:
        pid = r.get("gsis_id")
        name = r.get("display_name")
        if not pid or not name:
            continue
        n = norm_name(name)
        if not n:
            empty.append(name)
            continue
        by_norm[n].append((pid, name, r.get("position"), r.get("latest_team")))
        players.append({
            "player_id": pid,
            "full_name": name,
            "search_name": n,
            "position": r.get("position"),
            "team": r.get("latest_team"),
            "gsis_id": pid,
            "pfr_id": r.get("pfr_id"),
            "espn_id": str(r["espn_id"]) if r.get("espn_id") is not None else None,
        })

    # THE REFUSAL. Both halves reported, because "we dropped two aliases" is
    # useless without knowing which two people now silently have no quotes.
    aliases = []
    collisions = []
    for n, who in by_norm.items():
        if len(who) > 1:
            collisions.append({"norm": n, "players": who})
            continue
        aliases.append({"alias_norm": n, "player_id": who[0][0],
                        "source": "nflverse"})

    for c in collisions:
        log(at="crosswalk.collision", norm=c["norm"], players=c["players"],
            consequence="NEITHER player gets this alias. Quotes under this "
                        "spelling stay unattributed until a rule tells them apart.")
    for e in empty:
        log(at="crosswalk.empty_norm", name=e,
            consequence="normalises to nothing, so it is not an alias")

    log(at="crosswalk.built", players=len(players), aliases=len(aliases),
        collisions=len(collisions), empty=len(empty))

    if args.dry_run:
        log(at="pipeline.dry_run", wrote="nothing")
        return 0

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE must be set")

    sb = Supabase(url, key)

    # PLAYERS BEFORE ALIASES, because alias.player_id is a foreign key to
    # players. The other order fails on the first batch, loudly, which is at
    # least honest, but there is no reason to find out that way.
    sb.upsert("fantasy_players", players, "player_id")
    log(at="wrote.players", rows=len(players))
    sb.upsert("fantasy_player_aliases", aliases, "alias_norm")
    log(at="wrote.aliases", rows=len(aliases))

    got = sb.rpc("fantasy_resolve_names")
    row = (got or [{}])[0] if isinstance(got, list) else (got or {})
    log(at="resolved",
        snapshots_attached=row.get("snapshots_attached"),
        unmatched_resolved=row.get("unmatched_resolved"))

    log(at="pipeline.done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
