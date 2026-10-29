#!/usr/bin/env bash
#
# Register (or re-register) the Cloudflare Stream webhook endpoint for an account
# and print the HMAC secret from the response.
#
# Cloudflare Stream allows ONE webhook URL + ONE secret per entire account,
# managed only via the API. There is no dashboard UI. The secret is revealed
# exactly once in the PUT response and cannot be queried later.
#
# Usage:
#   scripts/register-cloudflare-stream-webhook.sh <account_id> <api_token> <url>
#
# Example:
#   scripts/register-cloudflare-stream-webhook.sh \
#     abc123def456 \
#     eyJhbGciOi... \
#     https://api.stage.materialhubuae.com/reels/webhooks/cloudflare-stream
#
# Requires: curl, jq (for pretty output). If jq isn't installed the raw JSON
# is printed so you can grep the secret manually.
#
# Save the resulting secret to:
#   - terraform/staging/terraform.tfvars (cloudflare_stream_webhook_secret)
#   - the running EC2's /opt/materialhub/.env (CLOUDFLARE_STREAM_WEBHOOK_SECRET)
# and restart reels-service to pick it up.

set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <account_id> <api_token> <notification_url>" >&2
  echo "" >&2
  echo "The notification URL must be publicly reachable before you run this —" >&2
  echo "it's where Cloudflare will POST video.ready and video.error events." >&2
  echo "For MaterialHub staging this is:" >&2
  echo "  https://api.stage.materialhubuae.com/reels/webhooks/cloudflare-stream" >&2
  exit 1
fi

ACCOUNT_ID="$1"
API_TOKEN="$2"
NOTIFICATION_URL="$3"

echo "Registering Cloudflare Stream webhook:"
echo "  account:  ${ACCOUNT_ID}"
echo "  url:      ${NOTIFICATION_URL}"
echo ""

RESPONSE=$(curl --silent --show-error \
  --request PUT \
  --url "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/webhook" \
  --header "Authorization: Bearer ${API_TOKEN}" \
  --header "Content-Type: application/json" \
  --data "{\"notificationUrl\": \"${NOTIFICATION_URL}\"}")

if command -v jq > /dev/null 2>&1; then
  # Pretty output with jq
  SUCCESS=$(printf '%s' "${RESPONSE}" | jq -r '.success')
  if [[ "${SUCCESS}" != "true" ]]; then
    echo "Cloudflare API rejected the request:" >&2
    printf '%s' "${RESPONSE}" | jq . >&2
    exit 2
  fi

  SECRET=$(printf '%s' "${RESPONSE}" | jq -r '.result.secret')
  MODIFIED=$(printf '%s' "${RESPONSE}" | jq -r '.result.modified')
  URL_CONFIRMED=$(printf '%s' "${RESPONSE}" | jq -r '.result.notificationUrl')

  echo "✓ Webhook registered"
  echo "  notificationUrl: ${URL_CONFIRMED}"
  echo "  modified:        ${MODIFIED}"
  echo ""
  echo "CLOUDFLARE_STREAM_WEBHOOK_SECRET=${SECRET}"
  echo ""
  echo "Save this secret to terraform.tfvars and the running instance's .env."
  echo "Cloudflare will NOT show it again. Losing it means re-running this script"
  echo "to roll a new secret, which changes the value everywhere."
else
  # No jq — dump raw JSON and let the user grep
  echo "jq not installed. Raw response:"
  echo ""
  printf '%s\n' "${RESPONSE}"
  echo ""
  echo "Look for the 'secret' field in result.secret and copy it manually."
fi
