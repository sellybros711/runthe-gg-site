#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# The preflight at the top of 104_runtour_bundle_redeem.sql, driven on purpose.
#
#   bash supabase/test/bundle_preflight.sh [dbprefix]
#
# This matters more than it looks. The Run The Tour store migrations are not in
# this repository: coin_wallet and runtour_wallet() are live in the database and
# what 104 knows about their shape is what golf/index.html reads back out of
# them. The preflight is the whole answer to "what if that is wrong", so it has
# to do two things and both are tested here:
#
#   say something USEFUL, naming the columns the table actually has, and
#   leave NOTHING BEHIND, so a rejected database does not end up holding a
#   function that will fail at runtime for a real buyer.
#
# The second one is not hypothetical. Before 104 was wrapped in a transaction,
# psql read the preflight's exception, carried on to the next statement, and
# created the function anyway.
#
# Each case builds its own scratch database and drops it again.
# ---------------------------------------------------------------------------
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="$HERE/bundle_base.sql"
MIG="$HERE/../104_runtour_bundle_redeem.sql"
PREFIX="${1:-bundlepre}"
FAILED=0
say() { if [ "$1" = 1 ]; then echo " ok  $2"; else echo " FAIL $2 ${3:-}"; FAILED=1; fi; }

# build a database, break the wallet with $1, run the migration, report
attempt() {
  local db="$PREFIX$2" break_sql="$1"
  dropdb --if-exists "$db" 2>/dev/null
  createdb "$db"
  psql -q -X -d "$db" -f "$BASE" >/dev/null 2>&1
  [ -n "$break_sql" ] && psql -q -X -d "$db" -c "$break_sql" >/dev/null 2>&1
  OUT=$(psql -q -X -d "$db" -f "$MIG" 2>&1)
  MADE=$(psql -q -X -At -d "$db" -c "select count(*) from pg_proc where proname='runtour_redeem_unlocks'")
  dropdb --if-exists "$db" 2>/dev/null
}

echo '---------- a wallet shaped the way the client says it is ----------'
attempt "" 0
say "$([ -z "$(echo "$OUT" | grep -i error)" ] && echo 1 || echo 0)" "applies cleanly" "$OUT"
say "$([ "$MADE" = 1 ] && echo 1 || echo 0)" "and the function is there"

echo '---------- a column named something else ----------'
attempt "alter table public.coin_wallet rename column lifetime_granted to granted_lifetime" 1
say "$(echo "$OUT" | grep -q 'is missing lifetime_granted' && echo 1 || echo 0)" "it says which column it wanted"
say "$(echo "$OUT" | grep -q 'granted_lifetime' && echo 1 || echo 0)" \
    "and prints the ones the table really has, so the fix is one line" "$OUT"
say "$([ "$MADE" = 0 ] && echo 1 || echo 0)" "and nothing is left behind" "function count $MADE"

echo '---------- no wallet table at all ----------'
attempt "drop table public.coin_wallet cascade" 2
say "$(echo "$OUT" | grep -q 'coin_wallet does not exist' && echo 1 || echo 0)" "it says so plainly"
say "$([ "$MADE" = 0 ] && echo 1 || echo 0)" "and creates nothing"

echo '---------- 101 has not been run ----------'
attempt "drop table public.premium_unlocks cascade" 3
say "$(echo "$OUT" | grep -q '101_premium_bundles' && echo 1 || echo 0)" "it names the migration to run first" "$OUT"
say "$([ "$MADE" = 0 ] && echo 1 || echo 0)" "and creates nothing"

echo '---------- a wallet column a bare insert could not fill ----------'
# a buyer who has never bought coins has no wallet row, so the credit inserts one
attempt "alter table public.coin_wallet add column region text not null" 4
say "$(echo "$OUT" | grep -q 'NOT NULL with no default' && echo 1 || echo 0)" \
    "it refuses rather than shipping an insert that fails for the first buyer" "$OUT"
say "$([ "$MADE" = 0 ] && echo 1 || echo 0)" "and creates nothing"

echo '---------- running it twice ----------'
DB="${PREFIX}re"
dropdb --if-exists "$DB" 2>/dev/null; createdb "$DB"
psql -q -X -d "$DB" -f "$BASE" >/dev/null 2>&1
psql -q -X -d "$DB" -f "$MIG" >/dev/null 2>&1
OUT2=$(psql -q -X -d "$DB" -f "$MIG" 2>&1)
dropdb --if-exists "$DB" 2>/dev/null
say "$([ -z "$(echo "$OUT2" | grep -i error)" ] && echo 1 || echo 0)" "is safe, like every other migration here" "$OUT2"

echo
[ "$FAILED" = 0 ] && echo 'all good' || echo 'FAILED'
exit "$FAILED"
