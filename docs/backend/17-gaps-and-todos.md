# 17 — Known gaps & TODOs

Everything found while writing these documents that is incomplete, inconsistent, or a trap for
someone new. Nothing here was changed — this is a reading of the code as it stands on
`feat/web-collapsing-mobile-chrome` (August 2026).

Severity is my judgement of blast radius, not a triage decision.

---

## High — money or data correctness

### 1. Only Stripe refunds work

`apps/order-service/src/domain/refund/refund.service.ts:172-176` throws for every non-Stripe
gateway:

```
"Tabby refunds not implemented yet"
"Tamara refunds not implemented yet"
"Checkout.com refunds not implemented yet"
```

A customer who paid with Tamara and requests a return reaches `processRefund()` and gets a 500.
The return sits in `received` and the money never goes back. Tamara is a live, configured
provider (`config.tamara` has real URLs and a webhook), so this is reachable in production.

### 2. Tabby checkout is a stub

`apps/order-service/src/domain/checkout/payment.service.ts:142` —
`// TODO: Replace with actual Tabby API call when API key is configured`. `createTabbySession`
does not call Tabby. `POST /checkout/tabby` exists and `/checkout/bnpl-thresholds` advertises
Tabby to the storefront.

### 3. Reservation expiry (15 min) vs pending-order reaper (60 min)

Inventory reservations are created with a **15-minute** expiry
(`order-creation.service.ts:374-376`) and released by a job running **every 60 seconds**
(`reservation-expiry.job.ts`). The unpaid order itself is not cancelled until
`ORDER_PENDING_EXPIRY_MINUTES` (**60 minutes**, `config.orders`).

Between minute 15 and minute 60 the order is still `pending_payment` with its stock already
returned to the pool. A payment that confirms in that window flips the order to `confirmed` and
commits reservations that no longer hold stock — overselling with no error anywhere.

### 4. `vendor_orders.shipping_cost` and `tax_total` are hard-coded to zero

`order-creation.service.ts:237,239` (`TODO: per-vendor shipping`, `TODO: per-vendor tax`). Every
vendor sub-order stores `shipping_cost = 0` and `tax_total = 0`. Anything reading those columns
for vendor-level economics is reading zeros; the real mechanism is the
`shipping_contribution` tier, which is a different number with a different meaning.

### 5. `addDraftAdjustment` has two accepted races

`payout.service.ts` documents them explicitly and instructs future readers **not** to "fix" them
(a human ruled on it twice):

- an adjust racing an approve can submit against a stale amount;
- two concurrent adjustments each read-modify-write `adjustment_total`, so one update can be lost
  — the `vendor_payout_adjustments` ledger rows stay correct but the payout's stored total drifts.

Flagged here so it is a known state, not a surprise.

### 6. No Stripe transfer webhook

Nothing in the repo listens for Stripe transfer events. A payout that reaches `processing` with a
`gateway_reference` stays there until an admin clicks Mark Paid. A transfer that later fails or
is reversed at Stripe is invisible to the platform. `findExistingTransferForPayout` (a `list`
call at retry time) is the only reconciliation with Stripe's view of reality.

### 7. `VendorApplyData.bankAccount` is collected and discarded

`apps/vendor-service/src/domain/types.ts` declares a required `bankAccount` block on the
application payload, and `VendorService.apply()` persists documents but **never writes the bank
account**. The vendor must add one separately at `/vendors/me/bank-accounts`, and nothing in the
application flow says so. Since `PayoutService.createDraft` refuses without a primary bank
account, the failure surfaces much later, as "Vendor has no primary bank account".

---

## Medium — operational

### 8. The gateway health check always reports `"ok"`

`apps/api-gateway/src/app.ts:105` returns `status: "ok"` unconditionally, whatever the per-service
fan-out found. An uptime monitor pointed at `/health` will never alert. The fan-out also covers
only five of the seven upstreams — `cms` and `integration` are not checked.

### 9. Logging is `console.log`

`libs/plugins/src/index.ts:81` — `TODO: Replace with Winston logger`. No Winston, Sentry or
CloudWatch integration is wired. Structured JSON goes to stdout and that is all. There is no error reporting service, so a 500 in production is a line in a container log.

### 10. Frontend tests do not run in CI

The PR pipeline covers backend lint, unit tests and build only. A green check says nothing about
`apps/web`, `apps/admin-panel` or `apps/vendor-dashboard`.

### 11. `GET /notifications/stream` never delivers anything

`apps/notification-service/src/routes/notification.routes.ts:50-75`. The SSE handler opens a
`ReadableStream` that emits a heartbeat every 30 seconds and **nothing else** —
`// TODO: Redis Pub/Sub subscription will be wired in container task`. The dispatcher does
`PUBLISH notifications:<userId>`, but no subscriber exists, so real-time in-app notifications do
not work at all. Clients must poll `GET /notifications`.

### 12. Notification partition maintenance is a bare `setInterval`

`partition-maintenance.service.ts` runs on boot and every 24 h **in every replica**, not as a
BullMQ cron. The SQL functions must be idempotent (they appear to be). If the service is down
long enough, `notifications` inserts fail for want of a partition. cms-service's audit-log
equivalent *is* a proper BullMQ cron — the two are inconsistent.

### 13. Redis fallbacks silently multiply limits

`rateLimiter` falls back to an in-process `Map` when Redis is unavailable. With N replicas the
effective rate limit becomes N × the configured value, with nothing logged at the boundary. The
same shape appears in `permission-matrix.ts` (Redis down ⇒ permission changes never propagate
until restart).

### 14. No generated API reference

The gateway's Swagger spec only describes `/health` and the catch-all proxy, and no upstream
service's Swagger is reachable through the gateway — **there is no generated API reference for
the platform**.

### 15. Integration cron dependency duplication

`apps/integration-service/src/index.ts:59,83` — `TODO Phase 4: deduplicate cron deps with
container.ts`. The crons construct their own repositories and clients rather than reusing the
container's, so the two can drift.

---

## Low — quality and consistency

### 16. Postgres search adapter cannot suggest

`apps/product-service/src/domain/search/postgres-search.adapter.ts:209` — `suggest()` is
unimplemented. If that adapter is ever selected at runtime, typeahead silently returns nothing.

### 17. Suggest rejections are unlogged

`apps/product-service/src/domain/product/suggest.service.ts:28` —
`TODO: log per-bucket rejections once a logger is in scope`. A suggest returning fewer results
than expected is undebuggable.

### 18. No malware scanning on uploads

`libs/utils/src/media.service.ts:205` — `TODO: Integrate malware scanning before processing`.
Images are validated by magic bytes only. KYC documents and layout videos go through the same
path.

### 19. The bulk context-threading wart

`apps/product-service/src/bulk/catalog-import/catalog-import.job-type.ts:31` —
`TODO(cleanup): threading buffered rows through writeCtx.job.summary is gross`. It also causes
`buildValidationContext` to be called twice per job (harmless only because the dispatcher's
wrapper caches it).

### 20. Login lockout is a denial-of-service vector

`auth.service.ts` locks an account for 15 minutes after 5 failed attempts, counted on the **user
row**. There is no per-IP throttle beyond the gateway's global 100/min, so anyone who knows an
email address can keep that account locked indefinitely.

### 21. `deactivated` vendors are a dead end

`VENDOR_TRANSITIONS` gives `deactivated: []` — no admin route can reverse a self-service
deactivation. `suspended` can return to `approved`; `deactivated` cannot.

### 22. Unregistered notification types vanish

`NotificationDispatcherService.dispatch()` returns silently when `getTemplate(type)` misses.
Adding a producer without adding a template produces no error, no log, and no message.

### 23. Two encryption keys, silent failure on mix-up

`VENDOR_ENCRYPTION_KEY` (bank accounts) and `ENCRYPTION_KEY` (integration secrets, carrier
credentials, channel credentials) are different keys with the same algorithm. Decrypting with the
wrong one throws or yields garbage. order-service already constructs two `EncryptionService`
instances to cope; any new consumer must know which key its data was written with.

### 24. `bun run dev:backend` starts only seven of the eight services

The root `dev:backend` filter lists gateway, auth, product, order, vendor, notification and cms.
**integration-service is missing**, so anyone using that script gets 502s from the gateway for
`/vendor/integrations/*` and `/admin/sales-channels/*` and has no obvious reason why.
`bun run dev` (everything) is the safe command.

### 25. No root `build` / `test` / `migrate` scripts

The root `package.json` defines only the `dev*` scripts. `migrate`/`seed` live in
`backend/libs/database`; build/test/typecheck are Turborepo tasks; there is no reindex script at
all (it is an admin endpoint). See [01 — Build, test, run](01-architecture.md#build-test-run).

---

## Things that look like bugs but are not

Worth recording so nobody "fixes" them:

| Looks wrong | Why it is deliberate |
|---|---|
| `payout.service.ts` treats unrecognised Stripe errors as *indeterminate* | Fail-closed. A false "definitely failed" makes the row retryable and sends the money twice. |
| `assertClaimedSetReconciles` counts `paid` commissions | A retry of a payout whose earlier attempt already marked commissions paid is legitimate and must not be blocked. |
| `UNDELIVERY_DEMOTION_TARGETS` omits `partially_refunded` | Demoting there would forfeit the vendor's earning on items the customer kept, with no path to re-stamp `settle_after`. Proportional reversal is `CommissionReversalService`'s job. |
| `markOrderPaid` guards on `payment_status`, not `status` | A delayed webhook can arrive after fulfilment advanced the order; guarding on `status` stranded `payment_status` and skipped the order-placed emails. |
| `order_status_history.changed_by` is NULL for system actors | The column is a `uuid` FK; writing the literal `"system"` aborted the enclosing transaction. The role is preserved in `changed_by_role`. |
| The Tamara terminal-event handler does not cancel orders | The pending-order reaper owns cancellation and inventory release; doing it here would race it. |
| `payout-period.ts` implements `daily` even though it looks redundant | The admin form offers it; without it, every daily-schedule vendor was silently skipped forever. |
| `previewOriginPatterns()` returns `[]` on a bad regex | Fails closed. `cors({credentials: true})` makes allow-all a real vulnerability, and a throw at module scope restart-looped the gateway. |

---

## Suggested next steps

If someone asked me what to do first, in order:

1. **Refunds for BNPL** (#1) — a live provider with no refund path is a customer-facing money bug.
2. **Align the reservation and reaper clocks** (#3) — pick one number, or extend the reservation
   on payment-intent creation.
3. **Make `/health` mean something** (#8) — return `degraded` when any upstream is down, and cover
   all seven upstream services.
4. **Wire real logging and error reporting** (#9) — everything else is harder to diagnose without
   it.
5. **Decide about Tabby** (#2) — either finish it or take it off the storefront.
