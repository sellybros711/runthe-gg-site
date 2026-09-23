#!/usr/bin/env python3
"""
Enrich priced_players_v2.csv with:
  1. Hitter positions     (from Lahman Appearances via pybaseball)
  2. Real closer flags    (from Lahman Pitching saves, via pybaseball)
  3. fWAR blend           (from FanGraphs via pybaseball, optional)

Usage:
  python3 build_positions.py

Reads:  war_daily_bat.txt, war_daily_pitch.txt (in ./data or same dir as script)
        + downloads Lahman tables via pybaseball
Writes: ../../data/priced_players_v2_enriched.json
        (drop this into baseball/data/ and it becomes the new player pool)

If FanGraphs is blocked (403), fWAR blend is skipped — positions and closers
still work fine.
"""
import os, sys, json
import pandas as pd
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")

# ---- constants (locked, must match engine.js) ----
COEF, EXPONENT, FLOOR = 1.5, 1.6, 1.0
ANCHOR_IP = 210.0
POOL_MIN_YEAR, POOL_MAX_YEAR = 1901, 2025
ELIG_GAMES = 10        # min games at a position to count as eligible
CLOSER_MIN_SV = 20     # saves threshold for closer flag
SP_GS_RATIO = 0.5      # GS/G ratio threshold for starter classification
W_BLEND = 0.5          # rWAR = W_BLEND*bWAR + (1-W_BLEND)*fWAR

def price(war_value):
    return round(max(FLOOR, COEF * (max(float(war_value), 0.0) ** EXPONENT)), 1)

def col(df, *candidates):
    lo = {x.lower(): x for x in df.columns}
    for c in candidates:
        if c.lower() in lo:
            return lo[c.lower()]
    raise KeyError(f"None of {candidates} found in columns: {list(df.columns)[:20]}")

# ---- Step 1: Load bWAR data ----
print("Step 1: Loading bWAR data...")
bat_path = os.path.join(DATA_DIR, "war_daily_bat.txt")
pit_path = os.path.join(DATA_DIR, "war_daily_pitch.txt")

if not os.path.exists(bat_path) or not os.path.exists(pit_path):
    print(f"ERROR: Need {bat_path} and {pit_path}")
    print("Run fetch_inputs.py first, or download from baseball-reference.com/data/")
    sys.exit(1)

b = pd.read_csv(bat_path, low_memory=False)
p = pd.read_csv(pit_path, low_memory=False)
print(f"  Batters: {len(b)} rows, Pitchers: {len(p)} rows")

# Build batter frame (position players only)
b = b[b[col(b, "pitcher")].astype(str).str.upper().eq("N")].copy()
bat = pd.DataFrame({
    "bbref_id": b[col(b, "player_ID")].astype(str),
    "name": b[col(b, "name_common")].astype(str),
    "season": pd.to_numeric(b[col(b, "year_ID")], errors="coerce"),
    "team": b[col(b, "team_ID")].astype(str),
    "bwar": pd.to_numeric(b[col(b, "WAR")], errors="coerce"),
    "role": "bat",
    "ip": np.nan,
})

# Build pitcher frame
pit = pd.DataFrame({
    "bbref_id": p[col(p, "player_ID")].astype(str),
    "name": p[col(p, "name_common")].astype(str),
    "season": pd.to_numeric(p[col(p, "year_ID")], errors="coerce"),
    "team": p[col(p, "team_ID")].astype(str),
    "bwar": pd.to_numeric(p[col(p, "WAR")], errors="coerce"),
    "role": "pitch",
    "ip_start": pd.to_numeric(p[col(p, "IPouts_start")], errors="coerce").fillna(0),
    "ip_relief": pd.to_numeric(p[col(p, "IPouts_relief")], errors="coerce").fillna(0),
})

# Aggregate multi-stint seasons
#
# A TRADED PLAYER HAS NO DRAFTABLE ROW AT ALL, WHICH IS 2,939 SEASONS. Collapsing
# his stints to one row labelled TOT is correct arithmetic and makes him
# unreachable, because three separate filters keep TOT off every board: a man who
# changed clubs in July is simply not on either club's wheel. Rickey Henderson's
# 1989, Tom Seaver's 1977 and Bartolo Colon's 2002 are all missing, 33 of them at
# 6.0 WAR or better, 6.6% of the pool.
#
# SPLITTING IS OPT-IN AND DEFAULTS OFF, and that is deliberate rather than timid.
# The price curve is CONVEX (price = 1.5 * war ** 1.6), so half the WAR costs far
# less than half the price: splitting a season into two stints makes a great
# player's half-year the best value on the board, and the draft economy this game
# is balanced around would move. That is a measurement (re-run the cap sweep in
# scripts and compare the best-available against budget-bot gap), and the
# measurement cannot be made until a build has actually produced the split pool.
#
# So --split-stints exists, nothing runs it by default, and today's pool is
# reproduced byte for byte without it. Do not turn it on and ship in one step.
def combine(df, extra=None, split=False):
    agg = {"bwar": "sum", "name": "first", "role": "first"}
    if extra:
        for c in extra:
            agg[c] = "sum"
    if "ip" in df.columns and not extra:
        agg["ip"] = "first"
    clean = df.dropna(subset=["season", "bwar"])
    if split:
        # One row per club, so each board offers what he did THERE.
        return clean.groupby(["bbref_id", "season", "team"], as_index=False).agg(agg)
    return (clean.groupby(["bbref_id", "season"], as_index=False)
              .agg({**agg, "team": lambda s: "TOT" if s.nunique() > 1 else s.iloc[0]}))

SPLIT_STINTS = "--split-stints" in sys.argv
if SPLIT_STINTS:
    print("  --split-stints: one row per club. THE DRAFT ECONOMY MOVES, see combine().")
bat = combine(bat, split=SPLIT_STINTS)
pit = combine(pit, extra=["ip_start", "ip_relief"], split=SPLIT_STINTS)
pit["ip"] = (pit["ip_start"] + pit["ip_relief"]) / 3.0

# Pitcher classification
tot_outs = (pit["ip_start"] + pit["ip_relief"]).replace(0, np.nan)
start_share = pit["ip_start"] / tot_outs
pit["eligible_pos"] = np.where(start_share >= SP_GS_RATIO, "SP", "RP;CL")
pit["primary_pos"] = np.where(start_share >= SP_GS_RATIO, "SP", "RP")
pit["is_closer_proxy"] = (start_share.fillna(0) < 0.10)  # fallback, overridden by Lahman saves

bat["eligible_pos"] = ""
bat["primary_pos"] = ""
bat["is_closer_proxy"] = False

# Starter innings normalization
is_starter = pit["eligible_pos"].eq("SP") & (pit["ip"] > 0)
factor = np.where(is_starter, np.minimum(1.0, ANCHOR_IP / pit["ip"].where(pit["ip"] > 0, np.nan)), 1.0)
pit["war_value"] = pit["bwar"] * factor
bat["war_value"] = bat["bwar"]

df = pd.concat([bat, pit], ignore_index=True, sort=False)
df = df[(df["season"] >= POOL_MIN_YEAR) & (df["season"] <= POOL_MAX_YEAR)].copy()
df["season"] = df["season"].astype(int)
df["war_raw"] = df["bwar"]
df["price_m"] = df["war_value"].map(price)
print(f"  Combined: {len(df)} player-seasons")

# ---- Step 2: Lahman positions (Appearances table) ----
print("\nStep 2: Loading Lahman Appearances for hitter positions...")
POS_COLS = {
    "C": "G_c", "1B": "G_1b", "2B": "G_2b", "3B": "G_3b", "SS": "G_ss",
    "LF": "G_lf", "CF": "G_cf", "RF": "G_rf", "OF": "G_of", "DH": "G_dh",
}

def load_lahman_table(name):
    """A Lahman table, off disk if the fetch got it, from the archive if not."""
    local = os.path.join(DATA_DIR, name)
    if os.path.exists(local):
        print(f"  Reading {name} from disk...")
        return pd.read_csv(local, low_memory=False, encoding="utf-8-sig")
    # THE FALLBACK USED TO BE `pybaseball.lahman`, WHICH IS TWO BROKEN THINGS.
    # It asks for a branch the Chadwick Bureau renamed, so the download answers
    # with a 404 page and ZipFile reports "File is not a zip file"; and it has
    # no `teams` function any more, so `getattr` raised on Teams.csv. Both
    # arrived here as an exception the step below swallowed. lahman.py reads
    # the archive itself and says which ref answered.
    import lahman
    print(f"  {name} was not fetched, reading the archive...")
    return lahman.table(name)

try:
    A = load_lahman_table("Appearances.csv")
    print(f"  Got {len(A)} appearance rows")

    P = load_lahman_table("People.csv")
    print(f"  Got {len(P)} people rows")

    # Map Lahman playerID -> bbrefID
    id_map = P.set_index("playerID")["bbrefID"].dropna().to_dict()
    A["bbref_id"] = A["playerID"].map(id_map)
    A["season"] = A["yearID"]
    A = A.dropna(subset=["bbref_id"])

    # Build position eligibility per player-season
    pos_data = {}
    for _, r in A.iterrows():
        key = (r["bbref_id"], int(r["season"]))
        elig = []
        fielding = {}
        for pos, gcol in POS_COLS.items():
            if gcol in A.columns and pd.notna(r.get(gcol)) and r.get(gcol, 0) >= ELIG_GAMES:
                elig.append(pos)
                if pos != "DH":
                    fielding[pos] = r.get(gcol, 0)
        if elig:
            primary = max(fielding, key=fielding.get) if fielding else elig[0]
            pos_data[key] = (primary, ";".join(sorted(elig)))

    # Apply to batters
    applied = 0
    for idx, row in df.iterrows():
        if row["role"] != "bat":
            continue
        key = (row["bbref_id"], int(row["season"]))
        if key in pos_data:
            df.at[idx, "primary_pos"] = pos_data[key][0]
            df.at[idx, "eligible_pos"] = pos_data[key][1]
            applied += 1

    total_batters = (df["role"] == "bat").sum()
    share = applied / max(1, total_batters)
    print(f"  Applied positions to {applied}/{total_batters} batters ({100*share:.1f}%)")

    # AND AN EXCEPTION IS NOT THE ONLY WAY THIS ENDS UP EMPTY. A People table
    # whose bbrefID column arrives blank, or an Appearances table joined against
    # the wrong id, produces a clean run that applies a position to nobody:
    # `applied > 0` was the whole test, so zero was the one value it caught and
    # 4% would have passed.
    #
    # POS_FLOOR IS A CATASTROPHE FLOOR AND NOT A QUALITY ONE. The shipped pool
    # carries a position on 99.4% of its batters, but that is measured AFTER the
    # playing-time floor, and this frame is the whole of Baseball-Reference, so
    # the honest figure here is lower and is not a number to guess at. What
    # holds the real coverage is pool_shape.py, which compares the built pool
    # against the one that ships. This is here to catch the join collapsing.
    POS_FLOOR = 0.50
    if share < POS_FLOOR and "--allow-no-positions" not in sys.argv:
        sys.exit(
            f"FATAL: positions reached {100*share:.1f}% of batters, under "
            f"{100*POS_FLOOR:.0f}%.\n"
            "  The join has collapsed rather than the data being thin. Check "
            "that People.csv\n  carries bbrefID, or pass --allow-no-positions."
        )
    HAS_POSITIONS = applied > 0

except Exception as e:
    # THIS USED TO BE A WARNING AND THE BUILD CARRIED ON. It produced a pool
    # with 60,208 batters and a position on none of them, which is not a worse
    # pool but an unusable one: every slot in the draft is a position, so a
    # roster cannot be filled at all. The workflow then committed it, because
    # the step above it had printed a warning and exited zero.
    #
    # The dangerous thing is opt in now. --allow-no-positions is there for
    # somebody rebuilding the price curve on a machine that cannot reach the
    # archive, which is a real thing to want and is not a thing to ship.
    print(f"  ERROR: Could not load Lahman Appearances: {e}")
    if "--allow-no-positions" not in sys.argv:
        sys.exit(
            "FATAL: no positions, so nothing could fill a draft slot.\n"
            "  Run baseball/pipeline/check_lahman.py to read the archive, or\n"
            "  pass --allow-no-positions to build a pool that cannot be played."
        )
    print("  --allow-no-positions: hitter positions will remain blank.")
    HAS_POSITIONS = False

# ---- Step 3: Real closer detection (Lahman Pitching saves) ----
print("\nStep 3: Loading Lahman Pitching for real closer flags...")
try:
    Pitch = load_lahman_table("Pitching.csv")
    print(f"  Got {len(Pitch)} pitching rows")

    # Map playerID -> bbrefID (reuse from Step 2 if available)
    if 'id_map' not in dir() or not id_map:
        P = load_lahman_table("People.csv")
        id_map = P.set_index("playerID")["bbrefID"].dropna().to_dict()

    Pitch["bbref_id"] = Pitch["playerID"].map(id_map)
    Pitch = Pitch.dropna(subset=["bbref_id"])

    # Aggregate saves per player-season (multi-team)
    saves = (Pitch.groupby(["bbref_id", "yearID"])
                  .agg({"SV": "sum"}).reset_index()
                  .rename(columns={"yearID": "season"}))
    saves_map = {}
    for _, r in saves.iterrows():
        if pd.notna(r["SV"]) and r["SV"] >= CLOSER_MIN_SV:
            saves_map[(r["bbref_id"], int(r["season"]))] = True

    # Override closer flag for pitchers with real saves data
    updated = 0
    for idx, row in df.iterrows():
        if row["role"] != "pitch":
            continue
        key = (row["bbref_id"], int(row["season"]))
        if key in saves_map:
            df.at[idx, "is_closer_proxy"] = True
            if "CL" not in str(df.at[idx, "eligible_pos"]):
                df.at[idx, "eligible_pos"] = "RP;CL"
            updated += 1
        elif row["eligible_pos"] == "RP;CL":
            # Was flagged by innings heuristic but doesn't have saves — keep as RP;CL
            # since they're still relievers who could close
            pass

    print(f"  Found {len(saves_map)} player-seasons with {CLOSER_MIN_SV}+ saves")
    print(f"  Updated {updated} pitcher rows with real closer flags")

except Exception as e:
    # "CLOSER FLAGS REMAIN INNINGS-BASED" READS LIKE A FALLBACK AND IS NOT ONE.
    # The heuristic guesses a closer off innings alone, and measured against the
    # real saves column it calls 22,019 player-seasons a closer where the saves
    # say 905. `closerSavePct` reads the CL slot by name, so a pool built this
    # way hands a quarter of every bullpen the save rate of a genuine closer.
    # That is not a coarser pool, it is a different game, and it shipped as a
    # warning under a green step.
    print(f"  ERROR: Could not load Lahman Pitching: {e}")
    if "--allow-innings-closers" not in sys.argv:
        sys.exit(
            "FATAL: no saves, so every closer flag would be a guess off innings.\n"
            "  Measured against the real column that is 22,019 closers against 905.\n"
            "  Pass --allow-innings-closers only if you know what that does to the pool."
        )
    print("  --allow-innings-closers: closer flags remain innings-based.")

# ---- Step 4: fWAR blend (optional) ----
print("\nStep 4: Attempting fWAR blend from FanGraphs...")
try:
    from pybaseball import batting_stats, pitching_stats
    import re

    def norm_name(s):
        if not isinstance(s, str): return ""
        s = s.strip().lower()
        for a, b in [("á","a"),("é","e"),("í","i"),("ó","o"),("ú","u"),("ñ","n"),("ü","u")]:
            s = s.replace(a, b)
        s = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", s)
        s = re.sub(r"[^a-z ]", "", s)
        return " ".join(s.split())

    print("  Fetching FanGraphs batting stats (this may take a few minutes)...")
    fg_bat = batting_stats(POOL_MIN_YEAR, POOL_MAX_YEAR, qual=0)
    print(f"  Got {len(fg_bat)} FG batting rows")

    print("  Fetching FanGraphs pitching stats...")
    fg_pit = pitching_stats(POOL_MIN_YEAR, POOL_MAX_YEAR, qual=0)
    print(f"  Got {len(fg_pit)} FG pitching rows")

    # Build fWAR lookup by normalized name + season
    fwar_map = {}
    for fdf in [fg_bat, fg_pit]:
        name_col = "Name" if "Name" in fdf.columns else col(fdf, "Name", "name")
        season_col = "Season" if "Season" in fdf.columns else col(fdf, "Season", "season")
        war_col = "WAR" if "WAR" in fdf.columns else col(fdf, "WAR", "war")
        for _, r in fdf.iterrows():
            key = (norm_name(str(r[name_col])), int(r[season_col]))
            fwar_map[key] = float(r[war_col]) if pd.notna(r[war_col]) else 0.0

    # Blend
    matched = 0
    for idx, row in df.iterrows():
        key = (norm_name(row["name"]), int(row["season"]))
        if key in fwar_map:
            fwar = fwar_map[key]
            blended = W_BLEND * row["bwar"] + (1 - W_BLEND) * fwar
            # Re-apply starter normalization for pitchers
            if row["role"] == "pitch" and row.get("eligible_pos") == "SP" and row.get("ip", 0) > 0:
                f = min(1.0, ANCHOR_IP / row["ip"])
                blended = blended * f
            df.at[idx, "war_value"] = blended
            df.at[idx, "price_m"] = price(blended)
            matched += 1

    print(f"  Blended fWAR for {matched}/{len(df)} player-seasons ({100*matched/len(df):.1f}%)")

except Exception as e:
    # THIS except IS WHY THE RUNBOOK LIED FOR MONTHS. FanGraphs answers 403, the
    # blend is skipped, the build prints a friendly note and carries on, and the
    # only record of which source actually won was a markdown file somebody wrote
    # by hand from what the code was SUPPOSED to do. Nothing failed, so nobody
    # looked: a bWAR-only pool is a perfectly good pool. The symptom was a document
    # describing a number the game does not have, which is the dangerous direction.
    #
    # It still fails soft, because a pool is better than no pool. What changed is
    # that the build now RECORDS what it did, in a file it writes itself, so the
    # claim and the data cannot drift again. And --require-fwar is there for the
    # run that means to have it: asking for a blend and silently not getting one is
    # the exact shape of this bug.
    WAR_SOURCE = "bwar"
    WAR_SOURCE_WHY = f"fWAR blend skipped: {e}"
    print(f"  Skipping fWAR blend: {e}")
    if "--require-fwar" in sys.argv:
        sys.exit("FATAL: --require-fwar was given and the blend did not run.")
    print("  Prices are bWAR-only. Recorded in provenance.json.")
else:
    WAR_SOURCE = "blend-50-50"
    WAR_SOURCE_WHY = f"fWAR blended for {matched}/{len(df)} rows"

# ---- Step 5: Output ----
print("\nStep 5: Writing output...")

# WHAT THIS BUILD ACTUALLY DID, written by the build. DATA_RUNBOOK.md described a
# 50/50 FanGraphs blend that never ran, for months, because the only record of
# which source won was prose somebody wrote from what the code was meant to do.
# A machine-written file cannot drift from the data beside it.
prov = {
    "war_source": WAR_SOURCE,
    "war_source_note": WAR_SOURCE_WHY,
    "split_stints": SPLIT_STINTS,
    "anchor_ip": ANCHOR_IP,
    "rows": int(len(df)),
    "seasons": [int(df["season"].min()), int(df["season"].max())],
}
prov_path = os.path.join(SCRIPT_DIR, "provenance.json")
with open(prov_path, "w") as fh:
    json.dump(prov, fh, indent=2)
    fh.write("\n")
print(f"  Wrote {prov_path}: {prov['war_source']}, {prov['rows']} rows")

out_cols = ["bbref_id", "name", "season", "team", "role", "primary_pos",
            "eligible_pos", "is_closer_proxy", "ip", "war_raw", "war_value", "price_m"]
result = df[out_cols].sort_values("price_m", ascending=False)

# Write enriched CSV
out_csv = os.path.join(SCRIPT_DIR, "priced_players_enriched.csv")
result.to_csv(out_csv, index=False)
print(f"  Wrote {out_csv} ({len(result)} rows)")

# Write enriched JSON
out_json = os.path.join(SCRIPT_DIR, "priced_players_enriched.json")
result.to_json(out_json, orient="records")
print(f"  Wrote {out_json}")

# Summary
print("\n" + "=" * 60)
batters = result[result["role"] == "bat"]
has_pos = batters[batters["eligible_pos"].astype(str).str.len() > 0]
closers = result[result["is_closer_proxy"] == True]
print(f"Total player-seasons: {len(result)}")
print(f"Batters with positions: {len(has_pos)}/{len(batters)} ({100*len(has_pos)/max(1,len(batters)):.1f}%)")
print(f"Closers (saves-based): {len(closers)}")
print(f"\nTop 10 by price:")
print(result.head(10)[["name", "season", "team", "role", "primary_pos", "eligible_pos", "price_m"]].to_string(index=False))

if HAS_POSITIONS:
    print(f"\nPositions are populated! Copy the output to your repo:")
    print(f"  cp {out_json} baseball/data/priced_players_v2.json")
    print(f"  Then push and I'll rebuild players.json with positions enabled.")
print("=" * 60)
