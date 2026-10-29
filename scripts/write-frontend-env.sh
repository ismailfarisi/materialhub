#!/usr/bin/env bash
# Write apps/<app>/.env.production for a prod frontend image build.
# NEXT_PUBLIC_* values are inlined by `next build`, so they must exist at
# build time (deploy-prod.yml → build-frontend).
#
# Usage: scripts/write-frontend-env.sh <web|vendor-dashboard|admin-panel> <out-file>
# Inputs (env, from GitHub Secrets): PUBLIC_API_URL, WEB_URL, STRIPE_PK,
#   GTAG_ID, CONVERSION_ID, META_PIXEL_ID, TIKTOK_PIXEL_CODE, TEAM_MGMT
#
# A value of CHANGE_ME (the placeholder the secrets were created with) counts
# as unset. Missing required values fail the build; missing optional values are
# omitted so the app's own default applies.
set -euo pipefail

APP="${1:?usage: write-frontend-env.sh <app> <out-file>}"
OUT="${2:?usage: write-frontend-env.sh <app> <out-file>}"

# ENV_NAME|SOURCE_VAR|GITHUB_SECRET|required-or-optional
case "$APP" in
  web)
    VARS=(
      "NEXT_PUBLIC_API_URL|PUBLIC_API_URL|PROD_PUBLIC_API_URL|required"
      "NEXT_PUBLIC_SITE_URL|WEB_URL|PROD_WEB_URL|required"
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY|STRIPE_PK|PROD_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY|required"
      "NEXT_PUBLIC_GOOGLE_GTAG_ID|GTAG_ID|PROD_NEXT_PUBLIC_GOOGLE_GTAG_ID|optional"
      "NEXT_PUBLIC_GOOGLE_CONVERSION_ID|CONVERSION_ID|PROD_NEXT_PUBLIC_GOOGLE_CONVERSION_ID|optional"
      "NEXT_PUBLIC_META_PIXEL_ID|META_PIXEL_ID|PROD_NEXT_PUBLIC_META_PIXEL_ID|optional"
      "NEXT_PUBLIC_TIKTOK_PIXEL_CODE|TIKTOK_PIXEL_CODE|PROD_NEXT_PUBLIC_TIKTOK_PIXEL_CODE|optional"
    )
    ;;
  vendor-dashboard)
    VARS=(
      "NEXT_PUBLIC_API_URL|PUBLIC_API_URL|PROD_PUBLIC_API_URL|required"
      "NEXT_PUBLIC_WEB_URL|WEB_URL|PROD_WEB_URL|required"
      "NEXT_PUBLIC_TEAM_MANAGEMENT_ENABLED|TEAM_MGMT|PROD_NEXT_PUBLIC_TEAM_MANAGEMENT_ENABLED|optional"
    )
    ;;
  admin-panel)
    VARS=(
      "NEXT_PUBLIC_API_URL|PUBLIC_API_URL|PROD_PUBLIC_API_URL|required"
      "NEXT_PUBLIC_API_BASE_URL|PUBLIC_API_URL|PROD_PUBLIC_API_URL|required"
      "NEXT_PUBLIC_WEB_URL|WEB_URL|PROD_WEB_URL|required"
      "NEXT_PUBLIC_TEAM_MANAGEMENT_ENABLED|TEAM_MGMT|PROD_NEXT_PUBLIC_TEAM_MANAGEMENT_ENABLED|optional"
    )
    ;;
  *)
    echo "::error::Unknown frontend app '$APP' (expected web, vendor-dashboard or admin-panel)" >&2
    exit 2
    ;;
esac

missing=()
lines=()
for entry in "${VARS[@]}"; do
  IFS='|' read -r env_name source_var secret_name requirement <<<"$entry"
  value="${!source_var:-}"
  if [[ -z "$value" || "$value" == "CHANGE_ME" ]]; then
    if [[ "$requirement" == "required" ]]; then
      missing+=("$secret_name")
    else
      echo "  - $env_name: optional secret $secret_name unset, omitted"
    fi
    continue
  fi
  lines+=("$env_name=$value")
done

if [[ ${#missing[@]} -gt 0 ]]; then
  for secret_name in "${missing[@]}"; do
    echo "::error::Missing required secret $secret_name (unset or still CHANGE_ME) for $APP" >&2
  done
  exit 1
fi

printf '%s\n' "${lines[@]}" >"$OUT"
echo "✓ Wrote ${#lines[@]} build-time vars for $APP to $OUT"
