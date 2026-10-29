#!/usr/bin/env bash
# Bulk-add staging secrets to GitHub Secrets via `gh`.
# Idempotent — re-running overwrites existing values.
# Run from repo root: ./scripts/bulk-add-github-secrets.sh
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "❌ gh CLI not installed. https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "❌ gh not authenticated. Run: gh auth login" >&2
  exit 1
fi

# Each entry: GH_SECRET_NAME|description
SECRETS=(
  "STAGING_JWT_ACCESS_SECRET|JWT access token signing secret (>=32 chars)"
  "STAGING_JWT_REFRESH_SECRET|JWT refresh token signing secret (>=32 chars)"
  "STAGING_INTERNAL_SERVICE_SECRET|Service-to-service auth header secret"
  "STAGING_STRIPE_SECRET_KEY|Stripe API secret key (sk_test_...)"
  "STAGING_STRIPE_CONNECT_WEBHOOK_SECRET|Stripe Connect webhook signing secret (whsec_...)"
  "STAGING_VENDOR_ENCRYPTION_KEY|Vendor bank account encryption key (64-char hex)"
  "STAGING_ENCRYPTION_KEY|Generic encryption key for shipping creds etc (64-char hex)"
  "STAGING_TWO_FA_ENCRYPTION_KEY|2FA TOTP secret encryption key (32-char hex)"
  "STAGING_CLOUDFLARE_STREAM_ACCOUNT_ID|Cloudflare account ID for Stream API"
  "STAGING_CLOUDFLARE_STREAM_API_TOKEN|Cloudflare API token (Stream:Edit scope)"
  "STAGING_CLOUDFLARE_STREAM_WEBHOOK_SECRET|Cloudflare Stream webhook HMAC secret"
  "STAGING_DB_PASSWORD|Postgres password for the staging instance"
  "STAGING_TYPESENSE_API_KEY|Typesense admin API key"
)

read -r -p "Mode: (s)et only missing, (o)verwrite all, (q)uit? [s] " mode
mode=${mode:-s}
[[ "$mode" == "q" ]] && exit 0

existing=$(gh secret list --json name --jq '.[].name' || true)

for entry in "${SECRETS[@]}"; do
  name="${entry%%|*}"
  desc="${entry#*|}"

  if [[ "$mode" == "s" ]] && grep -qx "$name" <<<"$existing"; then
    echo "⏭  $name already set — skipping"
    continue
  fi

  echo
  echo "🔑 $name"
  echo "   $desc"
  read -r -s -p "   value: " value
  echo
  if [[ -z "$value" ]]; then
    echo "   (empty — skipped)"
    continue
  fi
  printf '%s' "$value" | gh secret set "$name"
  echo "   ✅ set"
done

echo
echo "Done. Verify at: $(gh repo view --json url --jq .url)/settings/secrets/actions"
