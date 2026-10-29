#!/usr/bin/env bash
# Tests for scripts/write-frontend-env.sh. Run: bash scripts/write-frontend-env.test.sh
set -uo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/write-frontend-env.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAILS=0

fail() { echo "FAIL: $*"; FAILS=$((FAILS + 1)); }

# Run the script with a clean env plus the given VAR=value pairs.
run() {
  local app="$1"; shift
  env -i PATH="$PATH" "$@" bash "$SCRIPT" "$app" "$TMP/out.env" >"$TMP/stdout" 2>"$TMP/stderr"
}

ALL=(PUBLIC_API_URL=https://api.materialhubuae.com WEB_URL=https://materialhubuae.com
  STRIPE_PK=pk_live_x GTAG_ID=G-1 CONVERSION_ID=AW-1 META_PIXEL_ID=123
  TIKTOK_PIXEL_CODE=TT1 TEAM_MGMT=true)

# 1. web: required Stripe key left as placeholder → exit 1 naming the secret
rm -f "$TMP/out.env"
run web PUBLIC_API_URL=https://api.materialhubuae.com WEB_URL=https://materialhubuae.com STRIPE_PK=CHANGE_ME
code=$?
[[ $code -eq 1 ]] || fail "1: expected exit 1, got $code"
grep -q "PROD_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" "$TMP/stdout" "$TMP/stderr" || fail "1: missing secret name in output"

# 1b. web: required API URL unset → exit 1 naming PROD_PUBLIC_API_URL
run web WEB_URL=https://materialhubuae.com STRIPE_PK=pk_live_x
code=$?
[[ $code -eq 1 ]] || fail "1b: expected exit 1, got $code"
grep -q "PROD_PUBLIC_API_URL" "$TMP/stdout" "$TMP/stderr" || fail "1b: missing secret name in output"

# 2. web: optional placeholder is omitted, required values written
run web "${ALL[@]}" GTAG_ID=CHANGE_ME
code=$?
[[ $code -eq 0 ]] || fail "2: expected exit 0, got $code ($(cat "$TMP/stderr"))"
grep -qx "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_x" "$TMP/out.env" || fail "2: stripe key not written"
grep -qx "NEXT_PUBLIC_API_URL=https://api.materialhubuae.com" "$TMP/out.env" || fail "2: api url not written"
grep -qx "NEXT_PUBLIC_SITE_URL=https://materialhubuae.com" "$TMP/out.env" || fail "2: site url not written"
grep -qx "NEXT_PUBLIC_META_PIXEL_ID=123" "$TMP/out.env" || fail "2: meta pixel not written"
grep -q "NEXT_PUBLIC_GOOGLE_GTAG_ID" "$TMP/out.env" && fail "2: placeholder gtag should be omitted"

# 3. vendor-dashboard: no Stripe requirement, API + web URL written
run vendor-dashboard PUBLIC_API_URL=https://api.materialhubuae.com WEB_URL=https://materialhubuae.com
code=$?
[[ $code -eq 0 ]] || fail "3: expected exit 0, got $code ($(cat "$TMP/stderr"))"
grep -qx "NEXT_PUBLIC_API_URL=https://api.materialhubuae.com" "$TMP/out.env" || fail "3: api url not written"
grep -qx "NEXT_PUBLIC_WEB_URL=https://materialhubuae.com" "$TMP/out.env" || fail "3: web url not written"
grep -q "STRIPE" "$TMP/out.env" && fail "3: vendor env must not contain Stripe"
grep -q "TEAM_MANAGEMENT" "$TMP/out.env" && fail "3: unset optional flag should be omitted"

# 4. admin-panel: API base URL mirrors API URL
run admin-panel "${ALL[@]}"
code=$?
[[ $code -eq 0 ]] || fail "4: expected exit 0, got $code ($(cat "$TMP/stderr"))"
grep -qx "NEXT_PUBLIC_API_BASE_URL=https://api.materialhubuae.com" "$TMP/out.env" || fail "4: api base url not written"
grep -qx "NEXT_PUBLIC_TEAM_MANAGEMENT_ENABLED=true" "$TMP/out.env" || fail "4: team flag not written"

# 5. unknown app → exit 2
run storefront "${ALL[@]}"
code=$?
[[ $code -eq 2 ]] || fail "5: expected exit 2, got $code"

if [[ $FAILS -eq 0 ]]; then
  echo "all passed"
else
  echo "$FAILS failure(s)"
  exit 1
fi
