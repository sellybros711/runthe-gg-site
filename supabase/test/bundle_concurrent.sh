#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# The one thing bundle_test.sql cannot ask, because it only has one session:
# what happens when two calls to runtour_redeem_unlocks() race for the same
# grant. That is not a theoretical race. The golf page calls this on sign-in AND
# on opening the shop, so a buyer who lands on /golf/ and taps the store while
# the page is still signing in fires both within the same second, and a double
# credit is real money.
#
#   bash supabase/test/bundle_concurrent.sh [dbname]
#
# It runs the same setup bundle_test.sql does, then two overlapping sessions,
# and prints " ok " lines. Assumes the database already has bundle_base.sql and
# 104_runtour_bundle_redeem.sql loaded.
#
# The claim is an "update ... where fulfilled_at is null returning", which under
# read committed makes the second caller block on the row lock the first holds,
# re-check its own WHERE against the committed row, match nothing, and credit
# nothing. This proves that rather than asserting it.
# ---------------------------------------------------------------------------
set -u
DB="${1:-bundle}"
PSQL=(psql -q -X -d "$DB" -v ON_ERROR_STOP=1 -t -A)
U='77777777-7777-7777-7777-777777777777'
FAILED=0
say() { if [ "$1" = 1 ]; then echo " ok  $2"; else echo " FAIL $2 ${3:-}"; FAILED=1; fi; }

# ---- a buyer with one unclaimed grant, and no wallet yet -------------------
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users(id) values ('$U') on conflict do nothing;
delete from public.coin_wallet where user_id = '$U';
insert into public.premium_unlocks (user_id, product, source, payload, fulfilled_at)
values ('$U', 'runtour_pack', 'comp',
        '{"checkout_session":"cs_race","coins":100000,"packs":[{"tier":"tour","n":1}]}'::jsonb, null)
on conflict (user_id, product) do update
  set payload = excluded.payload, fulfilled_at = null;
select public.become('$U');
SQL

# ---- one holds the row open while the other arrives ------------------------
# A claims inside a transaction and sits on the lock for three seconds before
# committing. B starts a second later and has to wait it out.
A_OUT=$(mktemp); B_OUT=$(mktemp)
( "${PSQL[@]}" > "$A_OUT" 2>&1 <<SQL
begin;
select 'A ' || coins from public.runtour_redeem_unlocks();
select pg_sleep(3);
commit;
SQL
) &
sleep 1
B_START=$(date +%s%N)
"${PSQL[@]}" > "$B_OUT" 2>&1 <<SQL
select 'B ' || coins from public.runtour_redeem_unlocks();
SQL
B_MS=$(( ($(date +%s%N) - B_START) / 1000000 ))
wait

A=$(grep '^A ' "$A_OUT" | awk '{print $2}')
B=$(grep '^B ' "$B_OUT" | awk '{print $2}')
PAID=$("${PSQL[@]}" -c "select coalesce((select paid_coins from public.coin_wallet where user_id='$U'),0)")
STAMPS=$("${PSQL[@]}" -c "select count(*) from public.premium_unlocks where user_id='$U' and fulfilled_at is not null")

echo '---------- two callers, one grant ----------'
say "$([ "$A" = 100000 ] && echo 1 || echo 0)" "the first caller is paid" "got '$A'"
say "$([ "$B" = 0 ] && echo 1 || echo 0)"      "the second is paid nothing" "got '$B'"
say "$([ "$B_MS" -ge 1500 ] && echo 1 || echo 0)" \
    "and it got there by WAITING on the row lock, not by reading a stale row (${B_MS}ms)" "${B_MS}ms"
say "$([ "$PAID" = 100000 ] && echo 1 || echo 0)" "the wallet holds one grant, not two" "got '$PAID'"
say "$([ "$STAMPS" = 1 ] && echo 1 || echo 0)"   "and the row is stamped once" "got '$STAMPS'"

# ---- and the same thing with no head start --------------------------------
# Eight sessions fired together at a fresh grant. Whichever wins, the total
# credited has to be exactly one grant.
"${PSQL[@]}" >/dev/null <<SQL
delete from public.coin_wallet where user_id = '$U';
update public.premium_unlocks set fulfilled_at = null where user_id = '$U' and product = 'runtour_pack';
SQL
for _ in 1 2 3 4 5 6 7 8; do
  ( "${PSQL[@]}" -c "select coins from public.runtour_redeem_unlocks()" >/dev/null 2>&1 ) &
done
wait
PAID2=$("${PSQL[@]}" -c "select coalesce((select paid_coins from public.coin_wallet where user_id='$U'),0)")
echo '---------- eight at once ----------'
say "$([ "$PAID2" = 100000 ] && echo 1 || echo 0)" "exactly one grant is credited" "got '$PAID2'"

rm -f "$A_OUT" "$B_OUT"
echo
[ "$FAILED" = 0 ] && echo 'all good' || echo 'FAILED'
exit "$FAILED"
