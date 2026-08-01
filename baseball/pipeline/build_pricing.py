#!/usr/bin/env python3
"""
MLB Draft Game — pricing dataset builder
=========================================
Turns raw bWAR + fWAR + Lahman inputs into a priced player-season table for the
draft. Locked design constants:

    rWAR  = w*bWAR + (1-w)*fWAR      (w = 0.5)
    price = max($1M, 1.5 * max(rWAR,0)^1.6)   ($M)
    pool  = seasons 1901+

INPUTS (place in --data-dir, defaults to ./data):
  war_daily_bat.txt    bref bulk bWAR, batters   (key cols: player_ID, year_ID, team_ID, name_common, WAR)
  war_daily_pitch.txt  bref bulk bWAR, pitchers  (key cols: player_ID, year_ID, team_ID, name_common, WAR, G, GS)
  fg_bat.csv           FanGraphs batting, incl fWAR (cols: Season, Name, Team, WAR)
  fg_pitch.csv         FanGraphs pitching, incl fWAR (cols: Season, Name, Team, WAR, G, GS, SV)
  Appearances.csv      Lahman, optional — position eligibility (playerID, yearID, G_c, G_1b ... G_of, ...)
  People.csv           Lahman, optional — maps playerID -> bbrefID (to join Appearances to the bref spine)
  Teams.csv            Lahman, optional — decade benchmarks (yearID, W, L)

OUTPUTS (--out-dir, default ./out):
  priced_players.csv / .json   one row per player-season, priced
  decade_benchmarks.csv        best real team win% per decade (for Era mode)
  coverage_report.txt          row counts, fWAR match rate, unmatched samples

See DATA_RUNBOOK.md for how to fetch the inputs on a machine without a network allowlist.
"""
import argparse, json, os, re, sys
import pandas as pd
import numpy as np

# ---- locked constants ---------------------------------------------------
W_BLEND   = 0.5     # rWAR weight on bWAR (fWAR gets 1-w)
COEF      = 1.5     # price coefficient
EXPONENT  = 1.6     # price exponent  (calibrated so a ~60-rWAR roster ~= $245M cap)
PRICE_FLOOR_M = 1.0
POOL_MIN_YEAR = 1901
ELIG_GAMES   = 10   # min games at a position to be draft-eligible there
CLOSER_MIN_SV = 20  # saves threshold to flag a reliever as a closer option
SP_GS_RATIO  = 0.5  # GS/G >= this => starter-eligible

# ---- helpers ------------------------------------------------------------
def norm_name(s):
    """Normalize a name for cross-source joins: strip accents, punctuation, case, suffixes."""
    if not isinstance(s, str): return ""
    s = s.strip().lower()
    for a,b in [("á","a"),("é","e"),("í","i"),("ó","o"),("ú","u"),("ñ","n"),("ü","u")]:
        s = s.replace(a,b)
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?","",s)
    s = re.sub(r"[^a-z ]","",s)
    return re.sub(r"\s+"," ",s).strip()

def price_from_rwar(rwar):
    r = max(float(rwar), 0.0)
    return round(max(PRICE_FLOOR_M, COEF * (r ** EXPONENT)), 1)

def read_csv_flexible(path):
    """bref war_daily files are comma-separated .txt with a header row."""
    return pd.read_csv(path, low_memory=False)

def pick(df, *cands):
    """Return the first column present among candidates (case-insensitive)."""
    lower = {c.lower(): c for c in df.columns}
    for c in cands:
        if c.lower() in lower: return lower[c.lower()]
    raise KeyError(f"none of {cands} in columns {list(df.columns)[:12]}...")

# ---- load bref bWAR spine ----------------------------------------------
def load_bwar(data_dir):
    frames = []
    for fn, role in [("war_daily_bat.txt","bat"), ("war_daily_pitch.txt","pitch")]:
        p = os.path.join(data_dir, fn)
        if not os.path.exists(p):
            print(f"[warn] missing {fn}; skipping {role} spine", file=sys.stderr); continue
        df = read_csv_flexible(p)
        out = pd.DataFrame({
            "bbref_id": df[pick(df,"player_ID","playerID")].astype(str),
            "name":     df[pick(df,"name_common","Name")].astype(str),
            "season":   pd.to_numeric(df[pick(df,"year_ID","yearID","Season")], errors="coerce"),
            "team":     df[pick(df,"team_ID","teamID","Team")].astype(str),
            "bwar":     pd.to_numeric(df[pick(df,"WAR")], errors="coerce"),
            "role":     role,
        })
        # starter/closer signals for pitchers
        if role == "pitch":
            g  = pd.to_numeric(df[pick(df,"G")], errors="coerce")  if any(c.lower()=="g"  for c in df.columns) else np.nan
            gs = pd.to_numeric(df[pick(df,"GS")], errors="coerce") if any(c.lower()=="gs" for c in df.columns) else np.nan
            sv = pd.to_numeric(df[pick(df,"SV")], errors="coerce") if any(c.lower()=="sv" for c in df.columns) else np.nan
            out["G"], out["GS"], out["SV"] = g, gs, sv
        frames.append(out)
    if not frames:
        sys.exit("FATAL: no bref war_daily inputs found. See DATA_RUNBOOK.md.")
    spine = pd.concat(frames, ignore_index=True)
    # collapse mid-season stints to one season row (sum WAR, take max team by exposure not tracked -> 'TOT')
    agg = {"bwar":"sum","name":"first","role":"first"}
    for c in ["G","GS","SV"]:
        if c in spine.columns: agg[c] = "sum"
    spine = (spine.dropna(subset=["season"])
                  .groupby(["bbref_id","season"], as_index=False)
                  .agg({**agg, "team": lambda s: "TOT" if s.nunique()>1 else s.iloc[0]}))
    spine["season"] = spine["season"].astype(int)
    return spine

# ---- load FanGraphs fWAR -----------------------------------------------
def load_fwar(data_dir):
    frames = []
    for fn in ["fg_bat.csv","fg_pitch.csv"]:
        p = os.path.join(data_dir, fn)
        if not os.path.exists(p):
            print(f"[warn] missing {fn}; fWAR from it will be absent", file=sys.stderr); continue
        df = pd.read_csv(p, low_memory=False)
        frames.append(pd.DataFrame({
            "name":   df[pick(df,"Name")].astype(str),
            "season": pd.to_numeric(df[pick(df,"Season","year")], errors="coerce"),
            "fwar":   pd.to_numeric(df[pick(df,"WAR")], errors="coerce"),
        }))
    if not frames:
        return pd.DataFrame(columns=["nkey","season","fwar"])
    fg = pd.concat(frames, ignore_index=True).dropna(subset=["season"])
    fg["season"] = fg["season"].astype(int)
    fg["nkey"] = fg["name"].map(norm_name)
    # a player can appear in both bat+pitch (rare two-way); sum fWAR on the join key
    return fg.groupby(["nkey","season"], as_index=False)["fwar"].sum()

# ---- position eligibility (Lahman Appearances) --------------------------
POS_COLS = {"C":"G_c","1B":"G_1b","2B":"G_2b","3B":"G_3b","SS":"G_ss",
            "LF":"G_lf","CF":"G_cf","RF":"G_rf","DH":"G_dh"}
def load_eligibility(data_dir):
    ap = os.path.join(data_dir,"Appearances.csv"); pe = os.path.join(data_dir,"People.csv")
    if not (os.path.exists(ap) and os.path.exists(pe)):
        print("[warn] Appearances.csv/People.csv missing; positions left blank", file=sys.stderr)
        return None
    A = pd.read_csv(ap, low_memory=False); P = pd.read_csv(pe, low_memory=False)
    P = P[[pick(P,"playerID"), pick(P,"bbrefID")]].rename(columns={pick(P,"playerID"):"playerID", pick(P,"bbrefID"):"bbref_id"})
    A = A.merge(P, on="playerID", how="left")
    rows = []
    for _,r in A.iterrows():
        elig = [pos for pos,col in POS_COLS.items() if col in A.columns and pd.notna(r.get(col)) and r.get(col,0) >= ELIG_GAMES]
        # primary = position with most games (exclude DH from "primary fielding")
        fielding = {pos:r.get(col,0) for pos,col in POS_COLS.items() if pos!="DH" and col in A.columns}
        primary = max(fielding, key=fielding.get) if fielding and max(fielding.values())>0 else ("DH" if "DH" in elig else "")
        rows.append((r.get("bbref_id"), r.get(pick(A,"yearID")), ";".join(elig), primary))
    E = pd.DataFrame(rows, columns=["bbref_id","season","eligible_pos","primary_pos"]).dropna(subset=["bbref_id"])
    E["season"] = pd.to_numeric(E["season"], errors="coerce").astype("Int64")
    return E

# ---- decade benchmarks (Lahman Teams) -----------------------------------
def build_decade_benchmarks(data_dir, out_dir):
    p = os.path.join(data_dir,"Teams.csv")
    if not os.path.exists(p):
        print("[warn] Teams.csv missing; decade benchmarks skipped", file=sys.stderr); return
    T = pd.read_csv(p, low_memory=False)
    y = pick(T,"yearID"); w = pick(T,"W"); l = pick(T,"L")
    T = T[pd.to_numeric(T[y],errors="coerce") >= POOL_MIN_YEAR].copy()
    T["winpct"] = T[w] / (T[w] + T[l])
    T["decade"] = (T[y]//10*10).astype(int)
    idx = T.groupby("decade")["winpct"].idxmax()
    best = T.loc[idx, [ "decade", pick(T,"name","teamID"), y, w, l, "winpct"]].copy()
    best.columns = ["decade","team","year","W","L","winpct"]
    best["winpct"] = best["winpct"].round(3)
    best["proj_wins_162"] = (best["winpct"]*162).round(1)
    best.sort_values("decade").to_csv(os.path.join(out_dir,"decade_benchmarks.csv"), index=False)
    print(f"[ok] decade_benchmarks.csv  ({len(best)} decades)")

# ---- pitcher role -------------------------------------------------------
def pitcher_role(row):
    g, gs, sv = row.get("G"), row.get("GS"), row.get("SV")
    is_closer = bool(pd.notna(sv) and sv >= CLOSER_MIN_SV)
    starter   = bool(pd.notna(gs) and pd.notna(g) and g>0 and (gs/g) >= SP_GS_RATIO)
    slots = []
    if starter: slots.append("SP")
    if is_closer or (pd.notna(gs) and pd.notna(g) and g>0 and gs==0): slots.append("CL")
    if not slots: slots.append("RP")
    return ";".join(slots), is_closer

# ---- main ---------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="data")
    ap.add_argument("--out-dir",  default="out")
    a = ap.parse_args()
    os.makedirs(a.out_dir, exist_ok=True)

    spine = load_bwar(a.data_dir)
    spine = spine[spine["season"] >= POOL_MIN_YEAR].copy()
    spine["nkey"] = spine["name"].map(norm_name)

    fwar = load_fwar(a.data_dir)
    merged = spine.merge(fwar, on=["nkey","season"], how="left")

    matched = merged["fwar"].notna().mean() if len(merged) else 0.0
    # rWAR: blend when both present; fall back to bWAR when fWAR missing
    both = merged["fwar"].notna()
    merged["rwar"] = np.where(both,
                              W_BLEND*merged["bwar"] + (1-W_BLEND)*merged["fwar"],
                              merged["bwar"])
    merged["rwar_source"] = np.where(both, "blend", "bwar_only")
    merged["price_m"] = merged["rwar"].map(price_from_rwar)

    # positions
    for c in ["eligible_pos","primary_pos"]:
        merged[c] = ""
    is_pitch = merged["role"].eq("pitch")
    roles = merged[is_pitch].apply(pitcher_role, axis=1, result_type="expand")
    if len(roles):
        merged.loc[is_pitch,"eligible_pos"] = roles[0].values
        merged.loc[is_pitch,"is_closer"] = roles[1].values
    merged["is_closer"] = merged.get("is_closer", pd.Series(False, index=merged.index)).fillna(False)

    E = load_eligibility(a.data_dir)
    if E is not None:
        merged = merged.merge(E, on=["bbref_id","season"], how="left", suffixes=("","_lah"))
        for c in ["eligible_pos","primary_pos"]:
            merged[c] = merged[c+"_lah"].where(merged[c+"_lah"].notna() & (merged[c+"_lah"]!=""), merged[c])
            merged.drop(columns=[c+"_lah"], inplace=True)

    cols = ["bbref_id","name","season","team","role","primary_pos","eligible_pos",
            "is_closer","bwar","fwar","rwar","rwar_source","price_m"]
    out = merged[[c for c in cols if c in merged.columns]].sort_values(["price_m"], ascending=False)
    out.to_csv(os.path.join(a.out_dir,"priced_players.csv"), index=False)
    out.to_json(os.path.join(a.out_dir,"priced_players.json"), orient="records")

    build_decade_benchmarks(a.data_dir, a.out_dir)

    with open(os.path.join(a.out_dir,"coverage_report.txt"),"w") as f:
        f.write(f"player-seasons (1901+): {len(out)}\n")
        f.write(f"fWAR match rate: {matched:.1%}\n")
        f.write(f"blended rows: {int(both.sum())} | bWAR-only rows: {int((~both).sum())}\n")
        f.write(f"price range: ${out['price_m'].min():.1f}M - ${out['price_m'].max():.1f}M\n")
        if (~both).any():
            f.write("\nsample unmatched (no fWAR join) — check name normalization:\n")
            f.write(merged.loc[~both,["name","season","team"]].head(15).to_string(index=False))
    print(f"[ok] priced_players.csv  ({len(out)} rows)  fWAR match {matched:.1%}")
    print(out.head(12).to_string(index=False))

if __name__ == "__main__":
    main()
