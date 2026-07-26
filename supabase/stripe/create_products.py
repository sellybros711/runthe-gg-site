#!/usr/bin/env python3
"""
Create (idempotently) the RunThe.gg Stripe Products + Prices used by the store.

WHY THIS SCRIPT: the coin packs and extra-spin products must exist in your Stripe
account with STABLE `lookup_key`s. All backend code (stripe_catalog + the Edge
Functions) references those lookup_keys, never the auto-generated price IDs, so
this script is the one place amounts/grants are defined for Stripe's side.

USAGE (run from your own machine or Stripe-allowed shell — Stripe's API is
blocked from the Claude Code sandbox):

    export STRIPE_KEY=sk_test_...        # test key first; swap for live later
    python3 supabase/stripe/create_products.py

Re-running is safe: a lookup_key that already exists is left untouched.
Keep the amounts here in sync with supabase/53_stripe_payments.sql (stripe_catalog).
"""
import os, sys, json, urllib.request, urllib.parse, urllib.error

KEY = os.environ.get("STRIPE_KEY")
if not KEY:
    sys.exit("Set STRIPE_KEY (sk_test_… or sk_live_…) in your environment first.")
BASE = "https://api.stripe.com/v1"

# (lookup_key, display name, unit_amount cents, grant_kind, grant_amount, description)
CATALOG = [
    ("coins_100",   "100 Coins",           99,   "coins", 100,  "Starter coin pack"),
    ("coins_600",   "600 Coins",           499,  "coins", 600,  "Popular coin pack (+20% bonus)"),
    ("coins_1300",  "1,300 Coins",         999,  "coins", 1300, "Value coin pack (+30% bonus)"),
    ("coins_2800",  "2,800 Coins",         1999, "coins", 2800, "Mega coin pack (+40% bonus)"),
    ("spin_1",      "1 Extra Daily Spin",  49,   "spins", 1,    "One extra Daily Challenge spin"),
    ("spin_5",      "5 Extra Daily Spins", 199,  "spins", 5,    "Five extra Daily Challenge spins"),
]


def api(method, path, params=None):
    data = urllib.parse.urlencode(params, doseq=True).encode() if params is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + KEY)
    if data is not None:
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit("Stripe API error %s: %s" % (e.code, e.read().decode()))


def find_price(lookup_key):
    res = api("GET", "/prices?lookup_keys[]=%s&limit=1" % urllib.parse.quote(lookup_key))
    d = res.get("data", [])
    return d[0] if d else None


def main():
    live = KEY.startswith("sk_live_")
    print("Mode: %s" % ("LIVE ⚠️" if live else "test"))
    out = {}
    for lk, name, amount, kind, grant, desc in CATALOG:
        existing = find_price(lk)
        if existing:
            print("• %-12s exists → %s" % (lk, existing["id"]))
            out[lk] = existing["id"]
            continue
        prod = api("POST", "/products", {
            "name": "RunThe.gg – " + name,
            "description": desc,
            "metadata[grant_kind]": kind,
            "metadata[grant_amount]": grant,
        })
        price = api("POST", "/prices", {
            "product": prod["id"],
            "unit_amount": amount,
            "currency": "usd",
            "lookup_key": lk,
            "nickname": name,
            "metadata[grant_kind]": kind,
            "metadata[grant_amount]": grant,
        })
        print("• %-12s created → %s" % (lk, price["id"]))
        out[lk] = price["id"]
    print("\nDone. lookup_key → price_id:")
    print(json.dumps(out, indent=2))
    print("\nNext: confirm supabase/53_stripe_payments.sql amounts match, then set the "
          "webhook secret and deploy the Edge Functions (see supabase/stripe/STRIPE_SETUP.md).")


if __name__ == "__main__":
    main()
