# Workstream 2: request for quotation (RFQ), report

Branch `feature/rfq`, cut from `ccr-20fdbb5d-0fqyak`. Roadmap item 3.

## What was built

### Backend
- **Entities** (`backend/libs/database/src/entities`): `QuoteRequest`, `QuoteRequestVendor` (one row per targeted supplier, max three), `QuoteResponse` (unit price in fils, MOQ, lead time, valid-until, notes, status; a revision supersedes the previous row), `QuoteMessage` (thread per request-supplier pair), `QuoteStatusHistory`. Statuses and units are varchar + named CHECK constraints, declared on the entities so the schema builder shows no drift. Enums in `enums/quote.enums.ts`.
- **Cart**: `cart_items.quote_id` (FK to `quote_responses`, `ON DELETE SET NULL`) and `quoted_unit_price`, with a CHECK that they're set together.
- **Price resolution**: `order-service/src/domain/cart/price-resolution.ts`, `resolveUnitPrice()` with a marked **QUOTE BRANCH**: quote > tier > base. Stream 1 owns this file; keep the quote branch first when merging. `CartService` uses it in add-to-cart and stale-price detection, enforces the quote's MOQ on quantity changes, and gets `upsertQuotedLine()` (runs on the acceptance transaction) plus `syncQuotedLine()` (Redis after commit).
- **`order-service/src/domain/quote`**:
  - `quote-state-machine.ts`: pure transitions for the supplier side, request status derived from its suppliers, Dubai-calendar validity, creation and response input rules, and `assertAcceptable()`. Expired, superseded, declined or non-current quotes can't be accepted; one acceptance per request; MOQ raises the cart quantity.
  - `quote-request.service.ts`: create (the product's own supplier is always included; up to three suppliers by id or slug; suppliers must be approved), buyer list/detail/message/accept/decline/cancel, vendor inbox/detail/respond/decline/message, admin list/detail, and signed attachment URLs for parties only. Accept, respond, decline and cancel lock the rows (`FOR UPDATE`). Accept is idempotent: replaying it returns the same result and doesn't touch the cart again.
- **Routes** (`routes/quote-request.routes.ts`): `/buyer/quotes` (customer), `/vendor/quotes` (vendor membership: `orders.read` to view, `orders.fulfill` to respond, decline or message), `/admin/quotes` (admin, read-only). Gateway prefixes `/vendor/quotes` and `/admin/quotes` added (`/buyer` already proxied).
- **Attachments**: new private `quote_attachment` media type (`private/quotes/`, PDF and images, 10 MB) through the existing `/media/presign`; reads go through `MediaService.getQuoteAttachmentSignedUrl()` and only reach the buyer, a targeted supplier or admin.
- **Notifications**: `quote_request_received`, `quote_response_received`, `quote_message_received`, `quote_accepted` on the `notification-events` queue with stable event ids. Templates link per audience (`/account/quotes/<id>` or the vendor `/quotes/<id>`). The types are added to `POST_SEED_DEFAULT_IN_APP_TYPES`, so existing users get them in-app.

### Storefront (Swatch Book)
- Product page: `RequestQuoteLink` (outline, under the BNPL strip; Add to cart keeps the one orange button). One-line insertion in `product-hero.tsx`.
- Category page: `CategoryQuoteBand` after the listing, shown when the category has suppliers. One-line insertion in `c/[category-slug]/page.tsx`.
- `/account/quotes/new`: prefilled from the product (name, spec lines, unit), the product's supplier locked in, plus a supplier picker over the category's vendors (up to three in total), quantity + unit, need-by, emirate, attachments.
- `/account/quotes`: list with status filters, quote counts and best price per unit.
- `/account/quotes/[id]`: request summary, side-by-side comparison (price per unit, order quantity, total, MOQ, lead time, valid-until, listing, notes; mono and tabular; "Lowest price" and "Fastest" markers from the data), inline accept and decline confirmation, a message thread per supplier, and cancel. A table at `md` and up; one card per supplier on phones.
- "Quotes" added to the account shell nav (label from the `rfq` namespace).
- All copy is under `rfq` in `messages/en.json` and `messages/ar.json`, with Arabic plurals.

### Vendor dashboard
- `/quotes` inbox with quick status tabs and counts, a status filter and search. `/quotes/[id]` shows the spec, attachments, a respond/revise form (picker over published listings, option, AED price stored as fils, MOQ, lead time, valid-until, notes, live buyer total), earlier quotes, decline with a reason, the thread and the activity log. Buyers show only as a first name and an initial. Sidebar entry under Orders & Fulfillment.

### Admin panel
- `/quotes` list (status, search by number, title or buyer email) and `/quotes/[id]`: every supplier's current and earlier quotes, all threads and the readable status history. No actions.

## Migration
- `backend/libs/database/src/migrations/1793994893181-QuoteRequests.ts`: five tables, FKs, indexes, CHECKs, `cart_items` columns plus a partial index, the `quote_request_number_seq` sequence, and four values on both notification enums. Tested up, down and up again on Postgres 16; the schema builder then reports no RFQ drift. `down` can't remove enum values; they stay unused.

## Tests
Postgres 16 and Redis ran locally (the Docker daemon isn't available in this container, so I used the installed Postgres 16 binaries and redis-server instead of docker compose).

| Where | Result |
|---|---|
| order-service `bun test` | 1030 pass, 11 fail. The 11 also fail on the base commit (payout adjustments, admin cancel-items, Tamara optional amount) and are unrelated. New: 33 state-machine tests, 5 resolver tests, 6 Postgres integration tests (full flow, expiry, all declined, decline and re-quote, cancel, listings), 3 route-mounting tests |
| notification-service | 85 pass |
| api-gateway | 34 pass |
| libs/database, libs/utils | 15 and 89 pass |
| apps/web `npx vitest run` | 407 pass (6 new: comparison and status helpers) |
| apps/admin-panel `npx vitest run` | 103 pass (4 new) |
| apps/vendor-dashboard `bun test` (this app uses bun:test) | 52 pass (7 new) |
| Biome | No errors on new files. Edited existing files keep the format and import-order diagnostics they had on the base commit, left alone to avoid churn |
| `tsc --noEmit` | Clean in order-service, web, vendor-dashboard and admin-panel |

## Screenshots
`docs/market/rfq-screenshots/`, at 390 and 1440 px, taken with Playwright against the real Next apps and a throwaway mock API kept outside the repo. Storefront in en and ar: quote detail and comparison, list, new request (prefilled from a product), category band, product page entry. Vendor: inbox, detail with a quote, respond form. Admin: list and detail. Every page passed a check for elements extending past the viewport, which catches RTL overflow too.

## Cross-stream touch points
- **Stream 1 (trade pricing)**: `domain/cart/price-resolution.ts` and the `cart.service.ts` call sites. Merge stream 1's tier lookup into `tierPrice` and keep the quote branch first. `QUOTE_UNITS` mirrors the planned units of measure; align when stream 1 lands its UoM list.
- **Product page** (`product-hero.tsx`, shared with streams 1 and 5): one inserted line.
- **Account shell** (`account/layout.tsx`): one nav item, plus a small `rfqLabel` switch so the label comes from the `rfq` namespace.
- **Notification enums**: four new values. Other streams adding types should use `ADD VALUE IF NOT EXISTS` too.

## Open issues
- Order items don't record the quote yet. A quoted line becomes a normal order item at the quoted price; adding `quote_id` to `order_items` would give vendors and finance traceability.
- An accepted quote's price holds in the cart after its valid-until date. Validity only gates acceptance; decide whether checkout should re-check it.
- There's no expiry job: expired quotes are derived at read time (`display_state`), not written back.
- The supplier picker uses the category's Typesense vendor facet, so it's empty when search is down. A small order-service endpoint listing suppliers by category would remove that dependency.
- The vendor dashboard and admin panel are English-only, like the rest of those apps.
- Promote to swatch: the supplier picker card (`components/rfq/supplier-picker.tsx`) and the comparison "Mark" chip are general enough for the design system.
