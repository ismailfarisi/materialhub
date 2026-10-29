# Sales Channels — Setup & Operations Runbook

> **Audience:** Ops engineer onboarding a sales channel for the first time, or recovering from an incident. Sections are grouped by channel — read the section for your channel.

**Channel scope:** All three channels are live. Provisioning + credentials + ops sections are grouped per channel:

| Channel | Sections |
|---|---|
| Google Merchant | §1–§19 (provisioning, credentials, smoke test, conversion tracking) |
| Meta Catalog | §17.x (inline in the Meta sub-sections) |
| TikTok | §20–§22 (provisioning, env, smoke test) |

Cross-channel ops live in §23 ("Operating the dashboard"). Retention sweep is documented in §22.x.

**Pre-reqs:**
- AWS credentials with rights to apply the production Terraform module and write SSM parameters in `ap-south-1`.
- A super-admin or admin JWT against the production API (see step 3 for the login flow).
- A Google Merchant Center account already verified for `materialhubuae.com` / `materialhubuae.com`, plus a Google Cloud project under the same organisation.
- The merchant ID, visible in the GMC top-right corner once you sign in.

---

## 1. One-time AWS provisioning

Apply the Terraform that creates the feed bucket, CloudFront distribution, ACM cert, IAM policy update, SSM static params, and Route 53 alias.

```bash
cd terraform/production
terraform init
terraform plan      # review: S3 bucket, ACM cert (us-east-1), CloudFront, R53 A-alias, IAM diff
terraform apply
```

> **Cert validation latency.** The ACM cert is in `us-east-1` (CloudFront requirement) and validates via DNS. Apply will pause on `aws_acm_certificate_validation.channel_feeds` for several minutes — that is normal. Do not cancel.

**Post-apply verification:**

```bash
# DNS should resolve to the CloudFront distribution
nslookup feeds.materialhubuae.com

# Empty bucket: HEAD returns 403 (AccessDenied) — that is the expected pre-feed state
curl -I https://feeds.materialhubuae.com/

# Optional — confirm Terraform outputs
terraform output feed_bucket_name        # materialhub-channel-feeds-prod
terraform output feed_cloudfront_domain  # dXXXXX.cloudfront.net
terraform output feed_cloudfront_id      # E2XXXXXXXX (used for invalidations)
```

After this step the bucket exists, the CDN serves it on `feeds.materialhubuae.com`, and the EC2 task role can write objects.

---

## 2. Google service-account setup

The integration-service authenticates to the Google Content API for Shopping using a **service account** issued from the same Google Cloud project that owns the Merchant Center.

1. Open <https://console.cloud.google.com/> → create or select a GCP project (any name; "materialhub-prod" works).
2. **APIs & Services → Library** → search "Content API for Shopping" → **Enable**.
3. **IAM & Admin → Service accounts → Create service account**
   - Name: `materialhub-merchant-feeds`
   - Skip the "Grant this service account access to project" step.
4. Open the new service account → **Keys → Add key → Create new key → JSON**. A JSON file downloads (`*.json`). **Treat as a secret** — anyone with this file can mutate the feed in your stead.
5. Link the service account in Google Merchant Center:
   - Sign in to <https://merchants.google.com>.
   - **Settings (gear) → Account access (Users) → Add user**.
   - Email: paste the service account's `client_email` (looks like `materialhub-merchant-feeds@<gcp-project>.iam.gserviceaccount.com`).
   - Access type: **Standard**.
   - Save. There is no email confirmation step for service accounts; the link is immediate.
6. Note the **merchant ID** (top-right corner of GMC, 10-digit number). You will need it in the next two steps.

The downloaded JSON shape looks like:

```json
{
  "type": "service_account",
  "project_id": "materialhub-prod",
  "private_key_id": "…",
  "private_key": "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n",
  "client_email": "materialhub-merchant-feeds@materialhub-prod.iam.gserviceaccount.com",
  "client_id": "…",
  "auth_uri": "…",
  "token_uri": "…",
  "auth_provider_x509_cert_url": "…",
  "client_x509_cert_url": "…"
}
```

Only `client_email` and `private_key` are actually used by `google.adapter.ts`, but keep the whole blob for traceability.

---

## 3. Encrypt + upload credentials via the admin API

The Phase 0 admin route AES-256-encrypts the credentials JSON before storing it in `sales_channels.credentials_encrypted`. The endpoint never returns the secret on read.

**Step 3a — get an admin JWT** by hitting auth-service `/auth/login`:

```bash
ADMIN_TOKEN=$(curl -s -X POST https://api.materialhubuae.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<admin-email>","password":"<admin-password>"}' \
  | jq -r '.data.accessToken')
```

> If the admin account has 2FA, you must also complete `POST /auth/2fa/login-verify`. See the auth-service code for the flow.

**Step 3b — submit the credentials**. The endpoint is `PUT /admin/sales-channels/google_merchant/credentials`:

```bash
# Compose the body. Use jq to safely embed the downloaded service-account JSON.
SA_JSON=$(cat ./materialhub-merchant-feeds-key.json)
BODY=$(jq -n --argjson sa "$SA_JSON" '{
  credentials: {
    merchantId: "1234567890",
    serviceAccount: $sa
  }
}')

curl -X PUT https://api.materialhubuae.com/admin/sales-channels/google_merchant/credentials \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

Expected response:

```json
{ "statusCode": 200, "data": { "has_credentials": true }, "timestamp": "…" }
```

> **Gateway proxy note.** The api-gateway proxy table in `backend/apps/api-gateway/src/proxy.ts` routes `/admin/sales-channels` to the integration-service. All react-query hooks from the admin dashboard go through the gateway as expected.

---

## 4. Upload the Google merchant ID to SSM

The merchant ID is **not** Terraformed (a placeholder would clobber the live value on every `terraform apply`). Set it manually after the GMC account is linked:

```bash
aws ssm put-parameter \
  --name "/materialhub/production/channels/google-merchant-id" \
  --value "1234567890" \
  --type String \
  --region ap-south-1 \
  --overwrite
```

> **Today this parameter is not read by the integration-service** — the merchant ID lives inside the encrypted credentials blob and the adapter pulls it from there. We still record it in SSM so the admin dashboard (see §23) and any future split-out tooling have a single source of truth.

---

## 5. Enable the channel

```bash
curl -X PATCH https://api.materialhubuae.com/admin/sales-channels/google_merchant \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"is_enabled": true}'
```

Optional: also flip `delta_enabled` on (default `true`; verify in the response).

---

## 6. Trigger the first feed-build manually (optional)

Two options today:

- **Wait for the cron.** It fires every 2 hours on the hour: `00:00`, `02:00`, `04:00`, … UTC. If you just enabled the channel at `15:32`, the first run happens at `16:00`.
- **Inject a one-off job via the BullMQ board** (or click Rebuild on the /sales-channels card — see §23.2).

**Post-run verification:**

```bash
# Channel record should now expose the feed
curl -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  https://api.materialhubuae.com/admin/sales-channels/google_merchant | jq '.data | {last_full_feed_at,last_full_feed_status,feed_url}'
# Expected: last_full_feed_status = "success", feed_url populated.

# Listings row count
psql "$DATABASE_URL" -c "
  SELECT count(*) FROM channel_listings cl
  JOIN sales_channels sc ON sc.id = cl.channel_id
  WHERE sc.code = 'google_merchant' AND cl.deleted_at IS NULL;"

# Eyeball the XML
curl -s https://feeds.materialhubuae.com/google_merchant/feed.xml | head -40
```

If `last_full_feed_status = "failed"`, read the latest `channel_feed_runs` row for the error message:

```sql
SELECT status, error_message, item_count, file_url, started_at, finished_at
FROM channel_feed_runs
WHERE channel_id = (SELECT id FROM sales_channels WHERE code = 'google_merchant')
ORDER BY started_at DESC LIMIT 5;
```

---

## 7. Register the feed in Google Merchant Center

1. Sign in to <https://merchants.google.com>.
2. **Products → Feeds → Add primary feed** (the blue `+` button).
3. **Country of sale:** United Arab Emirates. **Language:** English. **Currency:** AED.
4. **Destinations:** at minimum check **Shopping ads**.
5. **Name:** `materialhub-google-feed`.
6. **Input method:** **Scheduled fetch**.
7. **File URL:** `https://feeds.materialhubuae.com/google_merchant/feed.xml`
8. **Frequency:** every 2 hours. **Time zone:** UTC (matches our cron).
9. Save. Google immediately attempts a first fetch; diagnostics can take **several hours** to populate item-level approval status.

---

## 8. Smoke-test deltas

Once the full feed is registered and Google has processed it at least once, deltas should keep individual products in sync within minutes.

1. Edit a product in the admin panel — change the price or set it to out-of-stock.
2. Within 5 minutes the delta-scan cron will detect the hash change and enqueue a push.
3. Check `channel_deliveries`:

```sql
SELECT id, kind, event_name, status, latency_ms, created_at, error_message
FROM channel_deliveries
WHERE channel_id = (SELECT id FROM sales_channels WHERE code = 'google_merchant')
ORDER BY created_at DESC LIMIT 10;
```

Expect a fresh row with `kind = 'delta'`, `event_name = 'product.upsert'` (or `'product.delete'` for soft-deletes / out-of-stock removals), `status = 'success'`, and low `latency_ms` (typically 200-800 ms).

4. Cross-check in GMC: **Products → All products** → find your SKU → the updated price should be reflected within a few minutes.

---

## 9. Observability

Every cron and worker emits structured JSON to stdout (captured by CloudWatch Logs under the integration-service log group).

**Greppable log events:**

| Event | When | Notable fields |
|---|---|---|
| `feed-build.started` | Full-feed cron fires | `channel`, `runId`, `trigger` |
| `feed-build.success` | Full-feed cron finishes OK | `channel`, `runId`, `itemCount`, `excludedCount`, `errorCount`, `fileUrl`, `fileSizeBytes` |
| `feed-build.failed` | Full-feed cron throws | `channel`, `runId`, `error` |
| `delta-scan.enqueued` | Delta scan finishes a sweep | `channel`, `upserts`, `deletes` |
| `delta-push.success` | Delta job pushes one item OK | `channel`, `offerId`, `kind`, `latencyMs` |
| `delta-push.failed` | Delta job throws | `channel`, `offerId`, `error` |
| `channel.circuit-breaker.tripped` | Failure threshold exceeded | `channel`, `degradedUntil` |

**Recommended CloudWatch alarms (set these up once):**

- **Feed CDN error rate:** CloudFront `4xxErrorRate > 5%` for 15 minutes on the feed distribution (Google retrying against a missing/bad object is the most common silent failure).
- **Feed staleness:** custom metric / log filter — alert if `feed-build.success` for `channel=google_merchant` is missing for > 6 hours (3 missed crons in a row).
- **Circuit breaker tripped:** filter pattern `channel.circuit-breaker.tripped` → SNS topic.

---

## 10. Recovery procedures

### Circuit breaker tripped (deltas paused)

The dispatcher trips the breaker when a channel exceeds the failure threshold inside the rolling window. Symptom: `delta-push` jobs stop dispatching and write `status = 'skipped'` deliveries with `error_message = 'circuit-breaker-open'`.

After fixing the root cause (e.g. invalid credentials, GMC account suspended, network ACL change):

```sql
UPDATE sales_channels
SET degraded_until = NULL
WHERE code = 'google_merchant';
```

The next scan/push cycle will resume normally. Do **not** clear the field without addressing the underlying failure — the breaker will trip again on the next push.

### Disable the channel temporarily

```bash
curl -X PATCH https://api.materialhubuae.com/admin/sales-channels/google_merchant \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"is_enabled": false}'
```

Effect: the full-feed cron exits with `status = 'skipped'`; the delta worker writes a `status = 'skipped'` delivery row per pending job (so the audit trail stays complete). Re-enable by PATCHing `true`.

### Force a full rebuild after a serializer change

The next 2-hour cron will pick it up automatically. If you cannot wait, click Rebuild on the /sales-channels admin card (see §23.2).

### Roll back a bad feed file

The S3 bucket has versioning enabled. To restore a prior version:

```bash
# List all versions of the Google feed
aws s3api list-object-versions \
  --bucket materialhub-channel-feeds-prod \
  --prefix google_merchant/ \
  --region ap-south-1

# Copy a prior version onto the current key (becomes the new latest)
aws s3api copy-object \
  --bucket materialhub-channel-feeds-prod \
  --copy-source "materialhub-channel-feeds-prod/google_merchant/feed.xml?versionId=<PRIOR_VERSION_ID>" \
  --key google_merchant/feed.xml \
  --region ap-south-1

# Invalidate CloudFront so Google's next fetch sees the restored file
aws cloudfront create-invalidation \
  --distribution-id $(cd terraform/production && terraform output -raw feed_cloudfront_id) \
  --paths "/google_merchant/feed.xml"
```

---

## 11. Bootstrap reference — BullMQ artifacts in integration-service

For ops triage and future code changes, the integration-service bootstraps **7 BullMQ artifacts** as of Phase 1b. All queues use unique names; all scheduled crons use unique `jobId`s so re-bootstrapping after a deploy is idempotent.

| Artifact | File | Queue name | Schedule | jobId |
|---|---|---|---|---|
| Retention delete (cron) | `domain/retention/retention-delete.cron.ts` | `integration-retention-delete-cron` | `0 3 1 * *` (monthly, 1st @ 03:00 UTC) | — (no jobId; queue isolation is enough) |
| PII scrub (cron) | `domain/retention/scrub-pii.cron.ts` | `integration-scrub-pii-cron` | `0 4 * * *` (daily @ 04:00 UTC) | — |
| Dispatcher worker (event) | `domain/dispatcher/dispatcher.worker.ts` | `integration-events` | event-driven | n/a |
| Feed-build (cron) | `domain/channels/feed/feed-build.cron.ts` | `channel-feed-build` | `0 */2 * * *` (every 2h) | `feed-build:cron:google_merchant` |
| Delta-scan (cron) | `domain/channels/delta/delta-scan.cron.ts` | `channel-delta-scan` | `*/5 * * * *` (every 5 min) | `delta-scan:cron:google_merchant` |
| Delta-push (event) | `domain/channels/delta/delta.worker.ts` | `channel-delta-push` | enqueued by delta-scan | n/a |
| **Conversion worker (event, Phase 1b)** | `domain/channels/conversions/conversion.worker.ts` | `channel-conversion-events` | event-driven (from `order-service::publishOrderPaidForChannels`) | n/a |

Bootstrap order (`backend/apps/integration-service/src/index.ts`):

1. `import "./container.ts"` — constructs the dispatcher worker on `integration-events` as a side effect.
2. Retention-delete: queue → worker → `scheduleRetentionDeleteCron`.
3. Scrub-PII: queue → worker → `scheduleScrubPiiCron`.
4. Feed-build: queue → worker (with repo + service deps) → `scheduleFeedBuildCron`.
5. Delta-scan + delta-push: both queues → dedicated Redis client for the breaker ZSET → both workers → `scheduleDeltaScanCron` last.
6. Conversion worker: `createConversionWorker({ orderRepo, userRepo, salesChannelRepo, channelDeliveryRepo, encryption, googleAdsAdapter, metaAdapter })`. No scheduler call — event-driven; BullMQ delivers each `order.paid` job as `order-service` publishes it. The adapter is selected per delivery based on `sales_channels.code` (`google_merchant` → Google Ads, `meta_catalog` → Meta CAPI).

All workers are held in `_`-prefixed variables (side-effect-only), preventing the Bun TypeScript linter from flagging them as unused while keeping them off the module's exported surface.

---

## 12. Setting up Google Ads server-side conversions (Phase 1b)

Phase 1b adds **server-side Enhanced Conversions Adjustment** uploads on top of the browser-side `gtag.js` pixel. The browser fires `purchase` + `conversion` with a UUID `event_id` and `transaction_id = order.id`; the integration-service then re-uploads the same `transaction_id` with hashed PII from the server. Google dedupes the two against each other and boosts match quality from ~40% to ~70%.

### A. Create / link your Google Ads account

Sign in to <https://ads.google.com>. The **customer ID** is in the top-right corner formatted as `123-456-7890` — **strip the dashes** for the API (`1234567890`). If you operate under a manager (MCC) account, also note that MCC's customer ID; you will pass it as `loginCustomerId`.

### B. Apply for a Google Ads API developer token

**Tools & Settings → Setup → API Center → Apply for access**. The application asks for company / use-case detail; approval typically lands in 1–2 business days. Once approved you get:

- A **test mode** token (works immediately against test accounts) — use this for development against a test customer ID.
- A **standard / basic / production** token after the review — required to upload conversions on a live customer ID.

### C. Create a conversion action with Enhanced Conversions for Web

**Tools → Conversions → New conversion action → Website → "Purchase"**. After it's created, open the action:

1. Note the **conversion action ID** (numeric, e.g. `9876543210` — visible in the URL or via the Google Ads API).
2. **Enhanced Conversions** (per-action toggle, under "Settings" or "Customer data terms") → **Turn on** → accept the customer data terms → select **API** as the implementation method (not "Google tag" — we want the server-side adjustment path).

### D. OAuth2 client in Google Cloud Console

You can re-use the same GCP project as the Merchant Center service account (preferred — keeps secrets co-located).

**APIs & Services → Credentials → Create credentials → OAuth client ID → Web application** (or Desktop — both work for offline refresh-token flows). Note:

- `clientId` (e.g. `12345.apps.googleusercontent.com`)
- `clientSecret` (e.g. `GOCSPX-...`)

Also enable the **Google Ads API** under **APIs & Services → Library** on this project.

### E. Mint a refresh token via the OAuth2 Playground

1. Open <https://developers.google.com/oauthplayground>.
2. Click the gear icon (top-right) → check **Use your own OAuth credentials** → paste your `clientId` + `clientSecret`.
3. In step 1's scope input box, paste exactly: `https://www.googleapis.com/auth/adwords`. Click **Authorize APIs**.
4. Sign in with a Google account that has access to the Google Ads customer.
5. In step 2, click **Exchange authorization code for tokens**. Copy the **refresh_token** (starts with `1//`). This token is long-lived — store it in the encrypted credentials blob, not in plaintext.

### F. Upload the extended credentials blob via the admin API

Re-use the same `PUT /admin/sales-channels/google_merchant/credentials` endpoint from §3. The JSON now nests **both** the Phase 1a Merchant Center creds and the new Google Ads creds:

```bash
BODY=$(jq -n --argjson sa "$(cat ./materialhub-merchant-feeds-key.json)" '{
  credentials: {
    merchantCenter: {
      merchantId: "1234567890",
      serviceAccount: $sa
    },
    googleAds: {
      developerToken: "abc123_dev_token",
      customerId: "1234567890",
      loginCustomerId: "9876543210",
      conversionActionId: "999111222",
      oauthClient: {
        clientId: "12345.apps.googleusercontent.com",
        clientSecret: "GOCSPX-...",
        refreshToken: "1//..."
      }
    }
  }
}')

curl -X PUT https://api.materialhubuae.com/admin/sales-channels/google_merchant/credentials \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

> **Backward compatibility.** Phase 1a legacy flat creds (`{ merchantId, serviceAccount }` at the top level) continue to be accepted by the read helper (`readGoogleChannelCredentials`) and are promoted internally to `{ merchantCenter: {...}, googleAds: null }`. The conversion worker silently skips any channel whose `googleAds` section is absent, so the Phase 1a feed path keeps working unchanged until ops re-uploads with the nested blob. Omit `loginCustomerId` if you're not behind a manager account.

---

## 13. apps/web environment variables (Phase 1b)

The browser pixel needs two `NEXT_PUBLIC_*` env vars baked into the Next.js build:

- `NEXT_PUBLIC_GOOGLE_GTAG_ID` — your gtag ID. Use `AW-NNNNNNN` for an Ads-only setup, or `G-XXXXXXX` for a combined GA4 + Ads setup (gtag handles both from the same snippet).
- `NEXT_PUBLIC_GOOGLE_CONVERSION_ID` — full conversion target in the form `AW-NNNNNNN/CONV_LABEL`. The `CONV_LABEL` is shown under the conversion action's **Tag setup → Use Google tag manager** view.

Add both to **Vercel project settings → Environment Variables** for the `apps/web` project. Set them on **Production** and **Preview** scopes; leave **Development** unset so local `next dev` doesn't fire fake conversions to Google.

> If either var is missing at build time, the tag loader silently no-ops (no `<Script>` is injected) — the consent banner still appears but no pixel fires. This is intentional: it lets you ship preview deploys without leaking events.

---

## 14. Smoke testing the full conversion loop (post-merge)

Walk this checklist end-to-end against the production (or staging) build with a real test order:

1. Open `apps/web` in an **incognito window** so the `materialhub_consent` cookie is unset. The consent banner appears at the bottom of the page. Click **Accept**.
2. Navigate to any PDP. Open **DevTools → Network**, filter `collect?v=2` (Google's gtag beacon endpoint). Expect a `view_item` event with `event_id`, `currency`, `value`, and an `items[0]` block.
3. Click **Add to cart** on the PurchasePanel. Expect an `add_to_cart` event.
4. Open the cart slideover and **Begin checkout**. Expect a `begin_checkout` event before the page transitions.
5. Complete the order with a test card (see the Stripe runbook for test card numbers).
6. On the order confirmation page (`/account/orders/[id]`) expect **two** events with matching `transaction_id`:
   - `purchase` (standard GA4 event)
   - `conversion` (Ads-specific; the `send_to` field matches `NEXT_PUBLIC_GOOGLE_CONVERSION_ID`)
7. Verify the server-side leg landed:

   ```sql
   SELECT id, channel_id, kind, event_name, status, dedup_event_id, latency_ms, error_message, created_at
   FROM channel_deliveries
   WHERE kind = 'conversion'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

   Expect one row per enabled channel that has `googleAds` creds (Phase 1b — just `google_merchant`). Required: `status = 'success'`, `dedup_event_id = <order_id>` (matches the browser `transaction_id`), `latency_ms` typically 200–800 ms.

8. **Google Ads dashboard verification (~24h lag):** **Tools → Conversions → <your action> → Diagnostics**. Look for the **Enhanced conversions** card. After ~24 hours of accumulated traffic, expect "matched conversions" to appear with a recent `Last received` timestamp. The match-quality score (% of conversions with at least one user identifier) should be > 60% — anything lower usually points to guest orders without email/phone capture.

---

## 15. Recovery (Phase 1b additions)

### Browser pixel not firing

Check, in order:

1. `NEXT_PUBLIC_GOOGLE_GTAG_ID` is present in the Vercel env for the deployed scope (re-deploy if you just set it — `NEXT_PUBLIC_*` is baked at build time, not read at runtime).
2. The `materialhub_consent` cookie is `accepted` (DevTools → Application → Cookies). If it's missing or `rejected`, the `<TagLoader>` returns `null` and no `<Script>` is injected.
3. The `<TagLoader>` component is mounted — inspect the page source for the `<script src="https://www.googletagmanager.com/gtag/js?...">` tag and the inline init script.
4. DevTools Console — gtag throwing an error usually means a malformed `NEXT_PUBLIC_GOOGLE_CONVERSION_ID` (must be `AW-NNNNNNN/CONV_LABEL`, not just the `AW-NNNNNNN` prefix).

### Adapter throws `google_ads_no_user_identifiers`

The order has neither `user.email` nor `user.phone`. This shouldn't happen for normal accounts (`users.email` is required at signup), so investigate the specific order:

```sql
SELECT o.id, o.payment_status, u.id AS user_id, u.email, u.phone
FROM orders o
LEFT JOIN users u ON u.id = o.user_id
WHERE o.id = '<order-id>';
```

If `email` and `phone` are both `NULL` on a real user row, the data is corrupt — escalate to backend on-call. If it's a guest checkout pathway (none today, but reserved for the future), the worker will currently throw and BullMQ will retry up to 5 times before parking the job in the failed set.

### `googleAds` credentials missing

The conversion worker silently skips channels whose decrypted credentials blob has `googleAds: null` (the legacy-flat path always returns null). Symptoms:

- No new rows appear in `channel_deliveries` with `kind = 'conversion'` after orders complete.
- No errors are logged (this is by design — the legacy Phase 1a feed path must keep working untouched).

Fix: re-upload the nested credentials blob per §12.F.

### Conversion worker stuck / not consuming

```bash
# Inspect queue depth and any active jobs (via redis-cli against the integration-service Redis):
redis-cli -h <integration-redis-host> KEYS "bull:channel-conversion-events:*" | head -20
redis-cli -h <integration-redis-host> LLEN "bull:channel-conversion-events:wait"
redis-cli -h <integration-redis-host> LLEN "bull:channel-conversion-events:active"
```

If `wait` is growing but `active` is 0, the worker is not consuming — check that the integration-service ECS task is running and that `index.ts` reached the `_conversionWorker` construction line (search CloudWatch for the `[integration-service] running at ...` bootstrap log).

---

## 16. Known constraints (deferred to later phases)

- **Phase 1a is Google-only for feeds.** Meta (Phase 2) and TikTok (Phase 3) serializers/adapters are not implemented. Their `sales_channels` rows exist but are disabled.
- **Phase 1b is Google-only for conversions.** The conversion worker is shaped as a channel registry so Phase 2/3 only add one branch in the per-channel switch + a new adapter; until then, only `google_merchant` channels with `googleAds` creds are dispatched to.
- **English-only, AED-only feed.** Multi-locale feeds are explicitly out of scope per the design spec §13.
- **GCLID is not transported from browser to server.** Phase 1b captures GCLID into sessionStorage (90-day TTL) and the browser pixel includes it in the `purchase` event, but the conversion worker currently sends `gclid: null` because we don't plumb it through the checkout → order record. Enhanced Conversions still works against hashed email + phone alone (~70% match quality without GCLID; ~80% with). Adding GCLID is a small follow-up: add an `orders.gclid` column, capture from sessionStorage on order placement, surface to the worker.

---

## 17. Meta channel bootstrap (Phase 2)

Phase 2 adds Meta (Facebook + Instagram) alongside Google. The data flow is identical: a daily-rebuild XML feed on S3/CloudFront ingested by Meta Commerce Manager + Catalog Batch API deltas for real-time updates + Pixel browser events + Conversions API server-side `Purchase`.

### 17.1 Commerce Manager setup

1. Open [Business Manager](https://business.facebook.com) for the MaterialHub business account.
2. **Business Settings → Catalogs → + Add → Create a new catalog.** Vertical: **E-commerce**. Owner: the MaterialHub business.
3. **Business Settings → Pixels → + Add.** Name the pixel "MaterialHub Web Pixel" (or use the existing one if already set up). Note the **Pixel ID**.
4. **Commerce Manager → your catalog → Settings → Conversions Source.** Pair the catalog with the Pixel from step 3 so browser + server events match the catalog's content IDs.
5. **Commerce Manager → your catalog → Data Sources → Add Items → Use a data feed.** Choose **Scheduled feed (URL)**. Submit the CloudFront URL `https://feeds.materialhubuae.com/meta_catalog/feed.xml` (matches the `INTEGRATION_FEED_BASE_URL` env var). Frequency: **Daily** at a UAE-morning UTC hour (e.g. 02:00 UTC ≈ 06:00 GST).
6. Note the **Catalog ID** and **Business ID**.

### 17.2 System User access token

A System User token authenticates the Catalog Batch API + CAPI calls. It is long-lived and does not expire on user logout.

1. **Business Settings → Users → System Users → + Add.** Name: `materialhub-integrations`. Role: **Admin**.
2. **Add Assets:** assign the catalog (Full Control) and the pixel (Full Control).
3. **Generate New Token** → select the app (any app under the business; create a placeholder app if needed). Permissions: `catalog_management`, `ads_management`, `business_management`. Expiration: **Never**.
4. Copy the token **immediately** — it is shown once.

### 17.3 Upload credentials

```bash
# Replace <PIXEL_ID>, <CATALOG_ID>, <BUSINESS_ID>, <ACCESS_TOKEN> with the values
# captured in 17.1 + 17.2. test_event_code is optional — set it on staging.
curl -X PUT https://api.materialhubuae.com/admin/sales-channels/meta_catalog/credentials \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "credentials": {
      "pixelId": "<PIXEL_ID>",
      "catalogId": "<CATALOG_ID>",
      "businessId": "<BUSINESS_ID>",
      "accessToken": "<ACCESS_TOKEN>"
    }
  }'
```

The blob is AES-256-encrypted at rest by `EncryptionService`. The credentials never appear in API responses (only `has_credentials: boolean`).

### 17.4 Enable the channel

```bash
curl -X PATCH https://api.materialhubuae.com/admin/sales-channels/meta_catalog \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"is_enabled": true}'
```

The next feed-build cron tick (every 2h) will produce `meta_catalog/feed.xml` and upload to S3. The delta-scan cron (every 5min) starts queueing per-item pushes to the Catalog Batch API.

---

## 18. apps/web env vars (Phase 2)

Set in Vercel (Production + Preview + Development):

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_META_PIXEL_ID` | The Pixel ID from §17.1 step 3 | Public — baked into the client bundle. When unset, the Meta Pixel is not loaded and no Meta browser events fire (graceful degradation). |

The Phase 1b Google env vars (`NEXT_PUBLIC_GOOGLE_GTAG_ID`, `NEXT_PUBLIC_GOOGLE_CONVERSION_ID`) remain unchanged.

---

## 19. Meta smoke test (Phase 2)

After §17 + §18:

1. **Install Meta Pixel Helper** Chrome extension and open materialhubuae.com.
2. **Accept the consent banner.** Pixel Helper should show **MaterialHub Web Pixel** loaded with the correct Pixel ID. If Advanced Matching is sent (only for logged-in users), Pixel Helper shows the AM badge with field count.
3. **Browse:** visit homepage → product detail → add-to-cart → checkout. Pixel Helper should record `PageView` → `ViewContent` → `AddToCart` → `InitiateCheckout` events with each route change.
4. **Place a test order:**
   - On staging, set `testEventCode` on the Meta credentials before this step (re-upload the credentials JSON with `"testEventCode": "TEST12345"`) so the CAPI event lands under Events Manager → Test Events instead of polluting Production diagnostics.
   - Complete checkout. The browser fires `Purchase` with `eventID = <order.id>`.
   - The server-side `order.paid` event fires within ~5s; the integration-service conversion worker calls Meta CAPI with `event_id = <order.id>`.
5. **Verify in Events Manager:**
   - **Test Events tab:** both browser + server `Purchase` events should appear with the **Deduplicated** badge (Meta joined them by `(pixel_id, event_id)`).
   - **Diagnostics tab:** no errors. The Pixel and CAPI deduplication rate should approach 100%.
6. **Verify in the database:**
   ```sql
   SELECT id, channel_id, kind, event_name, status, dedup_event_id, attempt, created_at
     FROM channel_deliveries
    WHERE kind = 'conversion'
      AND order_id = '<order-id>'
    ORDER BY created_at DESC;
   ```
   Expect: rows per enabled+credentialed channel (Google + Meta if both are live). Status `success`, `dedup_event_id` = order id.
7. **Verify the feed file exists** at `https://feeds.materialhubuae.com/meta_catalog/feed.xml`. Browser should render the XML. CDN cache: `Cache-Control: max-age=300`.
8. **Verify Commerce Manager catalog diagnostics** show 0 errors / 0 disapprovals within ~6h of the first feed upload (Meta's ingestion is asynchronous).

---

## 20. TikTok Business Center + Catalog Manager + System User access token

TikTok activation requires three artifacts: a Catalog (in Catalog Manager), a Pixel (in Pixel & Events Manager), and a long-lived System User access token bound to a Business Center scope.

1. **Catalog Manager → Add data source → Choose "XML data feed"** — paste the S3 feed URL. The URL lives on the `sales_channels.feed_url` column after the first successful `feed-build` run for the tiktok channel.
2. **Schedule** — TikTok recommends every 6h; pick the lowest cadence that keeps your prices in sync.
3. **Pixel & Events Manager → Web Events → Create Pixel** — get the 24-char `pixel_code` (e.g. `CK2XXXXXXXXXXXXXXXXXXXXX`).
4. **Connect Pixel ↔ Catalog** so dynamic product ads work.
5. **Business Center → System Users → Create System User** with `Pixel & Events Manager` and `Catalog Manager` scopes.
6. **Generate access token** for the System User. Long-lived; rotate annually or after an incident.

## 21. Environment variable

`NEXT_PUBLIC_TIKTOK_PIXEL_CODE` — set this in Vercel (Production + Preview + Development). When unset, the browser-side TikTok Pixel does not load (the server side still requires uploaded credentials separately).

## 22. Smoke verification

After steps in §20 + §21 + uploading creds via `PUT /admin/sales-channels/tiktok/credentials` with body:

```json
{
  "credentials": {
    "pixelCode": "<TIKTOK_PIXEL_CODE>",
    "catalogId": "<TIKTOK_CATALOG_ID>",
    "accessToken": "<TIKTOK_ACCESS_TOKEN>",
    "testEventCode": "<TIKTOK_TEST_EVENT_CODE>"
  }
}
```

…and flipping `is_enabled = true`:

1. **TikTok Pixel Helper** (Chrome extension) on the storefront — confirms all 5 events fire (`PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `CompletePayment`) with the right pixel_code.
2. **Events Manager → Test Events tab** (with `testEventCode` set in creds) — both browser-fired and server-fired `CompletePayment` should appear, joined by `event_id` (the order id). Server-fired event should have `Server` source.
3. **`channel_deliveries` row** — query: `SELECT status, dedup_event_id, response_status, latency_ms FROM channel_deliveries WHERE channel_id = '<tiktok channel id>' ORDER BY created_at DESC LIMIT 5;` — most-recent row should be `success`, `dedup_event_id = order.id`, `response_status = 200`, latency under 1000ms in steady state.
4. **Catalog Manager → Catalog → Diagnostics** — 0 errors after the next 2h feed-build cron tick (or trigger a manual rebuild). Feed URL should be reachable from TikTok's crawler.
5. **Strip `testEventCode`** from creds once smoke verification is complete: `PUT /admin/sales-channels/tiktok/credentials` with the same payload minus `testEventCode`.

### 22.x Retention sweep

Hard-delete retention runs monthly via the integration-service BullMQ cron (`0 3 1 * *` UTC). It sweeps three tables:

| Table | What it stores |
|---|---|
| `vendor_integration_deliveries` | Per-call audit for vendor advisory-write pushes |
| `channel_deliveries` | Per-call audit for outbound channel pushes (conversions, deltas) |
| `channel_feed_runs` | One row per feed-build run (cron or manual) |

All three are governed by the `data_retention_integration_total_days` site setting (default 365 days). To change retention:

```sql
UPDATE site_settings
SET value = '180'
WHERE key = 'data_retention_integration_total_days';
```

Next monthly run picks up the new value automatically. The structured log line for verification:

```json
{"evt":"retention-delete.swept","cutoff":"...","vendor_integration_deliveries":N,"channel_deliveries":N,"channel_feed_runs":N}
```

## 23. Operating the dashboard

Once at least one channel has credentials and `is_enabled = true`, ops can monitor + intervene from the admin panel at **`/sales-channels`** (navigate via the "Sales Channels" entry in the sidebar, between Settings and Audit Log).

### 23.1 What the cards show

Each card represents one channel and surfaces these signals:

- **Enable toggle (top right).** Flip off to disable; a confirm dialog appears since disabling stops feed builds and conversion uploads. Flip on writes through immediately.
- **Last feed run.** Status pill (success / failed / skipped) + relative time (e.g. "2h ago"). Skipped means the cron picked up the channel but it was disabled at run time.
- **24h deliveries.** Success percentage across the last 24h of `channel_deliveries` rows. Renders "—" if there were zero deliveries (don't read this as 100%; it means no traffic).
- **Credentials.** "✓ set" if `credentials_encrypted` is populated; "— not set" otherwise. Channels with no credentials skip silently in the conversion worker.
- **Feed URL.** S3/CloudFront URL of the most recent successful feed (the one Google / Meta / TikTok ingest from).
- **Degraded banner.** Red banner across the top when `degraded_until` is in the future. Set by the conversion worker on repeated failures (circuit breaker). Indicates ops should investigate before clearing.

### 23.2 Rebuild now

Click **Rebuild** to enqueue a `trigger: "manual"` job onto the existing feed-build queue. The button is disabled if the channel is disabled or a rebuild is mid-flight. The new run row appears in the expanded table within ~2 seconds (post-toast invalidation).

When to use Rebuild:

- **After a failed cron run.** You've identified the root cause (e.g. a flaky GMC API) and want to retry without waiting up to 2h for the next cron tick.
- **Post-credential rotation.** You've just uploaded new creds via `PUT /admin/sales-channels/:code/credentials` and want immediate confirmation they work.
- **Post-Terraform apply.** A fresh S3 bucket / CloudFront distribution needs at least one file to validate the path.

### 23.3 Reading the expanded tables

Click "Show recent runs & deliveries" on any card to lazy-load two compact tables.

**Recent feed runs** shows status, trigger (cron / manual), item count, file size. Click a failed row to expand and see `error_message` inline (full stack trace).

**Recent deliveries** shows event name (Purchase, etc.), order id, status, latency. Click a failed row to expand and see the error from the channel adapter (e.g. Google Ads API rejection, Meta CAPI 400).

### 23.4 What a "failed" row means

For runs: the `feed-build.cron.ts` worker caught an exception and wrote a `failed` row. The error_message is the full stack at the point the worker caught it.

For deliveries: the adapter's `uploadConversion` / `pushBatch` rejected with a 4xx/5xx or a network error. The row's `attempt` column shows which BullMQ retry it was on; circuit-breaker logic in `delta.worker.ts` will eventually halt further attempts and write `skipped` rows instead.
