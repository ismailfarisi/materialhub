#!/usr/bin/env bash
# Fetch staging secrets from SSM and write/update /opt/materialhub/.env.
# Idempotent. Safe to run on every deploy and on EC2 first boot.
#
# Usage: ./refresh-env-from-ssm.sh <env_file_path> <project> <environment>
# Defaults: /opt/materialhub/.env materialhub staging
set -euo pipefail

ENV_FILE="${1:-/opt/materialhub/.env}"
PROJECT="${2:-materialhub}"
ENVIRONMENT="${3:-staging}"
PREFIX="/${PROJECT}/${ENVIRONMENT}"
REGION="${AWS_REGION:-ap-south-1}"

echo "→ Fetching SSM params from ${PREFIX} in ${REGION}"

# get-parameters-by-path returns JSON. We pluck Name+Value pairs.
params_json=$(aws ssm get-parameters-by-path \
  --path "$PREFIX" \
  --recursive \
  --with-decryption \
  --region "$REGION" \
  --output json)

if [[ -z "$params_json" ]] || [[ "$(jq '.Parameters | length' <<<"$params_json")" == "0" ]]; then
  echo "❌ No SSM params found at ${PREFIX}" >&2
  exit 1
fi

# Map SSM path tail → env var name. Source of truth.
path_to_env() {
  case "$1" in
    "${PREFIX}/jwt/access-secret")            echo "JWT_ACCESS_SECRET" ;;
    "${PREFIX}/jwt/refresh-secret")           echo "JWT_REFRESH_SECRET" ;;
    "${PREFIX}/internal-service-secret")      echo "INTERNAL_SERVICE_SECRET" ;;
    "${PREFIX}/booking/ical-feed-secret")     echo "BOOKING_ICAL_FEED_SECRET" ;;
    "${PREFIX}/stripe/secret-key")            echo "STRIPE_SECRET_KEY" ;;
    "${PREFIX}/stripe/connect-webhook")       echo "STRIPE_CONNECT_WEBHOOK_SECRET" ;;
    "${PREFIX}/stripe/payment-webhook")       echo "STRIPE_WEBHOOK_SECRET" ;;
    "${PREFIX}/encryption/vendor-key")        echo "VENDOR_ENCRYPTION_KEY" ;;
    "${PREFIX}/encryption/key")               echo "ENCRYPTION_KEY" ;;
    "${PREFIX}/encryption/two-fa-key")        echo "TWO_FA_ENCRYPTION_KEY" ;;
    "${PREFIX}/cloudflare/account-id")        echo "CLOUDFLARE_STREAM_ACCOUNT_ID" ;;
    "${PREFIX}/cloudflare/api-token")         echo "CLOUDFLARE_STREAM_API_TOKEN" ;;
    "${PREFIX}/cloudflare/webhook-secret")    echo "CLOUDFLARE_STREAM_WEBHOOK_SECRET" ;;
    "${PREFIX}/db/password")                  echo "DB_PASSWORD" ;;
    "${PREFIX}/google/drive-api-key")         echo "GOOGLE_DRIVE_API_KEY" ;;
    "${PREFIX}/google/gemini-api-key")        echo "GOOGLE_GEMINI_API_KEY" ;;
    "${PREFIX}/typesense/api-key")            echo "TYPESENSE_API_KEY" ;;
    "${PREFIX}/tamara/api-token")             echo "TAMARA_API_TOKEN" ;;
    "${PREFIX}/tamara/api-base-url")          echo "TAMARA_API_BASE_URL" ;;
    "${PREFIX}/tamara/notification-token")    echo "TAMARA_NOTIFICATION_TOKEN" ;;
    "${PREFIX}/tamara/success-url")           echo "TAMARA_SUCCESS_URL" ;;
    "${PREFIX}/tamara/failure-url")           echo "TAMARA_FAILURE_URL" ;;
    "${PREFIX}/tamara/cancel-url")            echo "TAMARA_CANCEL_URL" ;;
    "${PREFIX}/tamara/notification-url")      echo "TAMARA_NOTIFICATION_URL" ;;
    "${PREFIX}/postaplus/partner-key")        echo "POSTAPLUS_PARTNER_KEY" ;;
    "${PREFIX}/postaplus/tenant")             echo "POSTAPLUS_TENANT" ;;
    "${PREFIX}/postaplus/customer")           echo "POSTAPLUS_CUSTOMER" ;;
    "${PREFIX}/postaplus/created-by")         echo "POSTAPLUS_CREATED_BY" ;;
    "${PREFIX}/postaplus/base-url")           echo "POSTAPLUS_BASE_URL" ;;
    "${PREFIX}/postaplus/shipment-type")      echo "POSTAPLUS_SHIPMENT_TYPE" ;;
    "${PREFIX}/postaplus/package-type")       echo "POSTAPLUS_PACKAGE_TYPE" ;;
    "${PREFIX}/postaplus/service")            echo "POSTAPLUS_SERVICE" ;;
    "${PREFIX}/postaplus/vehicle")            echo "POSTAPLUS_VEHICLE" ;;
    "${PREFIX}/postaplus/pickup-type")        echo "POSTAPLUS_PICKUP_TYPE" ;;
    "${PREFIX}/grafana/cloud-loki-url")        echo "GRAFANA_CLOUD_LOKI_URL" ;;
    "${PREFIX}/grafana/cloud-prometheus-url")  echo "GRAFANA_CLOUD_PROMETHEUS_REMOTE_WRITE_URL" ;;
    "${PREFIX}/grafana/cloud-username")        echo "GRAFANA_CLOUD_USERNAME" ;;
    "${PREFIX}/grafana/cloud-metrics-username") echo "GRAFANA_CLOUD_METRICS_USERNAME" ;;
    "${PREFIX}/grafana/cloud-logs-username")   echo "GRAFANA_CLOUD_LOGS_USERNAME" ;;
    "${PREFIX}/grafana/cloud-token")           echo "GRAFANA_CLOUD_TOKEN" ;;
    "${PREFIX}/rate-limit/exempt-ips")       echo "RATE_LIMIT_EXEMPT_IPS" ;;
    "${PREFIX}/sms/otp-provider")              echo "SMS_OTP_PROVIDER" ;;
    "${PREFIX}/twilio/account-sid")            echo "TWILIO_ACCOUNT_SID" ;;
    "${PREFIX}/twilio/auth-token")             echo "TWILIO_AUTH_TOKEN" ;;
    "${PREFIX}/twilio/verify-service-sid")     echo "TWILIO_VERIFY_SERVICE_SID" ;;
    # Public API base URL. Backs the newsletter unsubscribe link. Also
    # seeded into /opt/materialhub/.env by terraform user-data at first boot;
    # mapping it here makes CI the source of truth on every deploy.
    "${PREFIX}/urls/public-api-url")          echo "PUBLIC_API_URL" ;;
    # Storefront apex/www hostnames. Backs the API's prod CORS allowlist
    # and libs/config/src/index.ts's Tamara merchant-redirect allowlist —
    # both already hardcode the same values as their own in-code fallback, so
    # this SSM mapping keeps CI as the source of truth on every deploy
    # (mirrors PUBLIC_API_URL's comment above) rather than relying solely on
    # the code default.
    "${PREFIX}/urls/web-url")                 echo "WEB_URL" ;;
    "${PREFIX}/urls/web-www-url")              echo "WEB_WWW_URL" ;;
    # integration/host, /port and /service-url are left over from when the
    # integration service was its own container. The backend now runs as one
    # process and calls its modules in-process, so these values are unused
    # (config.serviceUrl.integration only needs to be a distinct origin). Kept
    # mapped so the params, still declared in terraform/production/ssm.tf,
    # don't log "unknown SSM path" on every deploy.
    "${PREFIX}/integration/host")             echo "INTEGRATION_HOST" ;;
    "${PREFIX}/integration/port")             echo "INTEGRATION_PORT" ;;
    "${PREFIX}/integration/service-url")      echo "INTEGRATION_SERVICE_URL" ;;
    "${PREFIX}/integration/feed-bucket")      echo "INTEGRATION_FEED_BUCKET" ;;
    "${PREFIX}/integration/feed-base-url")    echo "INTEGRATION_FEED_BASE_URL" ;;
    *) echo "" ;;
  esac
}

# Build a temp .env containing ONLY the SSM-managed keys.
ssm_block=$(mktemp)
filtered=$(mktemp)
trap 'rm -f "$ssm_block" "$filtered"' EXIT

echo "# ─── SSM-managed values (do not edit by hand) ───────────────" >"$ssm_block"
count=0
while IFS=$'\t' read -r name value; do
  env_name=$(path_to_env "$name")
  if [[ -z "$env_name" ]]; then
    echo "⚠  Skipping unknown SSM path: $name" >&2
    continue
  fi
  if [[ -z "$value" ]] || [[ "$value" == "PLACEHOLDER_SET_BY_CI" ]]; then
    echo "⚠  Skipping $env_name — value is placeholder" >&2
    continue
  fi
  # Escape backslash, double-quote, dollar, backtick for double-quoted output.
  # Backslash MUST be escaped first so subsequent escapes don't get re-escaped.
  # Both bash `source` and docker-compose env_file accept this format.
  escaped="${value//\\/\\\\}"
  escaped="${escaped//\"/\\\"}"
  escaped="${escaped//\$/\\\$}"
  escaped="${escaped//\`/\\\`}"
  printf '%s="%s"\n' "$env_name" "$escaped" >>"$ssm_block"
  count=$((count + 1))
done < <(jq -r '.Parameters[] | "\(.Name)\t\(.Value)"' <<<"$params_json")

echo "→ Resolved $count SSM params to env vars"

# Merge: keep all NON-SSM-managed lines from existing .env, append SSM block.
mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"

ssm_keys=$(grep -E '^[A-Z_]+=' "$ssm_block" | cut -d= -f1 | sort -u)

# Filter out previous SSM-managed keys and the marker line.
grep -v '^# ─── SSM-managed' "$ENV_FILE" \
  | awk -v keys="$ssm_keys" '
      BEGIN { split(keys, arr, "\n"); for (k in arr) drop[arr[k]] = 1 }
      /^[A-Z_]+=/ { split($0, kv, "="); if (drop[kv[1]]) next }
      { print }
    ' >"$filtered"

# Combine: kept lines + blank line + SSM block.
{
  cat "$filtered"
  echo
  cat "$ssm_block"
} >"$ENV_FILE.new"

mv "$ENV_FILE.new" "$ENV_FILE"
# 0640 root:ec2-user — root writes via sudo, ec2-user reads for docker-compose,
# world has no access. The chown is best-effort: outside EC2 the user may not
# exist, in which case we leave ownership untouched and rely on default perms.
chown root:ec2-user "$ENV_FILE" 2>/dev/null || true
chmod 640 "$ENV_FILE"

echo "✅ Wrote $count SSM-managed env vars to $ENV_FILE"
