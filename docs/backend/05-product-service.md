# 05 — product-service

Port **3002**. The largest service by file count (~260 TS files). Owns the catalogue and
everything derived from it: categories, brands, attributes, products, variants, inventory,
media, search indexing, flash deals, collections, gifting, personalisation, and the bulk-jobs
engine (documented separately in [06](06-bulk-jobs.md)).

## Domain map

```
apps/product-service/src/domain/
├── category/          tree, cache, descendant SQL
├── brand/             brands + spotlight
├── attribute/         attributes, values, category↔attribute links
├── product/           product CRUD, variants, groups, bundles, relations, Q&A, AI enhance, suggest
├── inventory/         stock, movements, reservations, low-stock alerts
├── media/             image processing, video transcode, AI enhance, layout videos
├── search/            SearchService interface + Typesense & Postgres adapters, sync/reindex jobs
├── service-search/    the parallel index for service_offerings (bookings)
├── flash-deal/        time-boxed deals, caps, index effects
├── collection/        manual + dynamic collections, membership refresh
├── gifting/           gift occasions, styles, boxes
├── service-offering/  bookable services owned here, consumed by booking-service
├── recommendation/, recently-viewed/, recent-search/, saved-search/, wishlist/
```

## Endpoints

### Public catalogue (no auth)

| Method | Path | Notes |
|---|---|---|
| GET | `/products` | search/list with filters, facets, cursor pagination |
| GET | `/products/suggest` | typeahead — products, categories, queries |
| GET | `/products/flash-deals` | active deals |
| GET | `/products/by-slug/:slug` · `/group` · `/media` | PDP |
| GET | `/products/:id` · `/:id/questions` · `/:id/recommendations` | PDP rails |
| GET | `/categories/tree` · `/categories/:slug` · `/categories/by-id/:id/attributes` | |
| GET | `/brands` · `/brands/spotlight` · `/brands/:slug` | |
| GET | `/collections/:slug` | |
| GET | `/attributes` · `/attributes/:id/values` | |
| GET | `/gift/occasions[/:slug]` · `/gift/boxes[/:slug]` | |
| GET | `/services/:slug` | service-offering PDP (availability comes from booking-service) |
| GET | `/search/trending` | |
| GET | `/media/product/:productId` | |

### Vendor

| Method | Path | Guard |
|---|---|---|
| GET | `/products/mine` | `products.read` |
| POST/PATCH/DELETE | `/products[/:id]` | `products.write` |
| PATCH | `/products/:id/publish` | `products.publish` |
| POST | `/products/bulk-action` | `products.write` |
| POST/PATCH/DELETE | `/products/:id/images…`, `/videos…`, `/variants…`, `/relations…`, `/bundle` | `products.write` |
| POST | `/products/:id/images/:imageId/enhance[/accept|/reject]`, `/revert` | AI image enhancement |
| POST | `/products/:id/questions/:questionId/answer` | |
| GET/POST | `/inventory`, `/inventory/restock`, `/inventory/adjust`, `/inventory/movements`, `/inventory/low-stock` | `inventory.write` |
| CRUD | `/vendor/flash-deals[/:id]` | |
| CRUD | `/vendor/product-groups[/:id]`, `/members` | |
| CRUD | `/vendor/services[/:id]` | service offerings |
| POST | `/media/presign`, `/media/process`, `/media/process-asset` | |

### Admin

`/admin/products…` mirrors the vendor product surface plus `approve`, `reject`, `publish`,
`unpublish`, `feature`, `bulk-action`, `inventory/restock`, `inventory/adjust`, and
`ai-enhance-content`. Also `/admin/categories`, `/admin/brands`, `/admin/attributes`,
`/admin/collections`, `/admin/gift/*`, `/admin/flash-deals`, `/admin/service-offerings/:id/(approve|reject)`,
`/admin/search/reindex[/:jobId]`, `/admin/settings/ai/image-enhance`,
`/admin/settings/ai/product-content`.

### Internal (`internalServiceAuth`)

| Method | Path | Caller |
|---|---|---|
| POST | `/internal/inventory/adjust` | integration-service (vendor webhook `inventory_adjust`) |
| POST | `/internal/products/:id/patch` | integration-service (price/attribute updates) |
| GET | `/internal/flash-deals` | order-service (cart/checkout deal state) |
| GET | `/internal/products/by-vendor` · `/by-permission` | reels-service (taggable products) |

## Product lifecycle

```mermaid
stateDiagram-v2
    [*] --> draft: vendor creates
    draft --> pending_review: submit
    pending_review --> approved: admin approve
    pending_review --> rejected: admin reject (reason)
    rejected --> pending_review: vendor resubmits
    approved --> published: publish
    published --> approved: unpublish
    published --> archived: delete (soft)
```

Both a vendor path (`ProductService.create/update/publish`) and an admin path
(`adminCreate/adminUpdate/adminApprove/adminReject/adminPublish/adminUnpublish/adminToggleFeature`)
exist, with separate route files (`product.routes.ts` vs `admin-product.routes.ts`) sharing one
service class. Admin methods skip the vendor-ownership check; that is the only real difference.

Every mutation that changes anything the search index holds calls `reindexProduct(productId)`,
which enqueues onto `search-sync`.

## Search

`SearchService` (`domain/search/search.interface.ts`) is an interface with two implementations:

| Adapter | File | Used when |
|---|---|---|
| Typesense | `typesense-search.adapter.ts` | the default |
| Postgres | `postgres-search.adapter.ts` | fallback / local dev without Typesense |

The `products` Typesense collection (`typesense.collection.ts`) is denormalised: name,
description, category/brand/vendor names + ids + slugs, `price_min`/`price_max`, tags,
`rating_avg`, `in_stock`, a flattened `attributes` string array for faceting, SKUs, images,
status, `created_at`, and product-group fields (`group_id`, `group_listing_mode`,
`is_group_primary`, `group_swatches`, `group_from_price`). Default sort is `price_min`;
`token_separators: ["-", "/"]` so SKU-like tokens split sensibly.

`ProductFilters` supports query, category (id/slug/path), brand, vendor, price band, rating,
tags, SKUs, `inStock`, cursor pagination and four sorts (`relevance`, `price_asc`, `price_desc`,
`newest`, `rating`), plus four attribute filter kinds — `checkbox`, `radio`, `range`, `toggle`
(`filter-param-parser.ts` turns query strings into these).

### Index maintenance

```mermaid
flowchart LR
    W[product write / flash deal change] -->|enqueueSearchSync| Q[search-sync queue]
    Q --> WK[worker]
    WK -->|upsert_by_product_id| RL[re-load product + active deal fresh]
    RL --> TS[(Typesense)]
    ADM[POST /admin/search/reindex] --> RQ[search-reindex queue] --> FULL[full rebuild]
    SR[service offering write] --> SSQ[service-search-sync] --> TS2[(service_offerings collection)]
    CRON["cron 15 3 * * * Asia/Dubai"] --> REC[service-search-reconcile]
```

`search-sync` accepts three payloads: `upsert` (full product passed inline), `upsert_by_product_id`
(worker re-loads — used for flash deals, including **delayed** jobs fired at `expires_at` so the
index flips the moment a deal ends), and `delete`. Jobs retry three times with exponential
backoff.

Service offerings have their own collection and their own reconcile cron, because bookable
services carry vendor service areas and rating aggregates that drift.

## Inventory

Tables: `inventory` (per product/variant/vendor), `inventory_movements` (append-only ledger),
`inventory_reservations`.

```
quantity_available = quantity_on_hand - quantity_reserved   -- GENERATED ALWAYS column
```

`InventoryService`:

| Method | Purpose |
|---|---|
| `restock(...)` | add stock, write a movement |
| `adjust(...)` | signed correction, write a movement |
| `adjustIdempotent({...})` | the **integration** entry point — deduped by an external key so a redelivered vendor webhook does not double-adjust |
| `listForVendor`, `getMovements`, `getLowStock` | reads |

### Reservations

Order creation (in **order-service**) takes a `SELECT … FOR UPDATE` on the inventory row,
increments `quantity_reserved`, and inserts an `inventory_reservations` row with a **15-minute**
expiry and `status='active'`. Payment capture flips it to `committed`.

`ReservationExpiryJob` (`domain/inventory/jobs/reservation-expiry.job.ts`) runs **every 60 s**
and calls `InventoryReservationService.releaseExpired()`, returning stock from reservations that
were never committed.

> Note the two independent clocks: reservations expire after **15 minutes**, but the
> pending-order reaper (order-service) cancels the unpaid order after
> `ORDER_PENDING_EXPIRY_MINUTES` (**60 minutes** by default). Between those two points the order
> still exists as `pending_payment` while its stock has already been released — a late payment
> can therefore confirm an order whose stock is gone.

`low-stock-alerts` fires when a write drops availability below the vendor's threshold
(`config.bullmq.lowStockThresholdDefault`, 10).

## Flash deals

`domain/flash-deal/` — a deal binds a product (or a product-wide rule) to a `deal_price` for a
window (`starts_at` … `expires_at`) with an optional `quantity_limit`.

- `validation.ts` and `builder.ts` are pure; `flash-deal.service.ts` does CRUD.
- `effects.ts` schedules index updates, including a delayed `search-sync` job at `expires_at`.
- Cap enforcement happens at **order creation** in order-service:
  `FlashDealApplicator.validateAndIncrement(manager, dealId, qty)` takes `SELECT … FOR UPDATE`
  on the deal row inside the order transaction and throws `DealSoldOutError` (→ 409) if the cap
  would be exceeded. Cart display re-reads deals every `getCart`, and a change surfaces as a
  `deal_ended` / `deal_updated` notification which checkout turns into a
  `409 deal_state_changed`.

Both admin (`/admin/flash-deals`) and vendor (`/vendor/flash-deals`) can manage deals; the bulk
engine has dedicated `flash-deal-import` and `flash-deal-delete` job types with a revert path.

## Collections

Two kinds, both in `domain/collection/`:

- **Manual** — explicit `product_collection_members` rows, ordered (`collection-order.ts`),
  managed through `/admin/collections/:id/items` (+ `reorder`, `resolve-skus`).
- **Dynamic** — a rule resolved by `collection-resolver.service.ts`, refreshed hourly by the
  `collection-membership-refresh` cron (`0 * * * *`).

`GET /admin/collections/:id/preview` renders what a rule would select before saving it.

## Media

`domain/media/` + `libs/utils/src/media.service.ts`.

```mermaid
sequenceDiagram
    participant C as Client
    participant P as product-service
    participant S3 as S3
    C->>P: POST /media/presign {assetType, contentType, size}
    P-->>C: presigned PUT url + key
    C->>S3: PUT file
    C->>P: POST /media/process {key, …}
    P->>S3: GetObject
    P->>P: magic-byte validation → sharp → thumb/card/medium/large
    P->>S3: PutObject × 4
    P-->>C: variant urls (CloudFront)
```

- Videos: `POST /products/:id/videos/presign` → `/process` → the `media-video` queue
  (`video-transcode.worker.ts`, args in `transcode-args.ts`).
- Layout videos (CMS hero backgrounds) have their own presign/process/delete routes under
  `/media/videos/layout`.
- KYC documents get signed read URLs at `GET /media/kyc/:key/signed-url` — vendor-service stores
  the key, product-service owns the S3 plumbing.
- **AI image enhance** (`ai-enhance.service.ts`, Gemini): enhance → the result is staged, then
  `accept` / `reject` / `revert`. Per-vendor usage is metered in
  `vendor-ai-usage.repository.ts`; settings at `/admin/settings/ai/image-enhance`.
- **AI content enhance** (`product-ai-enhance.service.ts`) generates product copy;
  settings at `/admin/settings/ai/product-content`.

## Personalisation & discovery

| Feature | Files | Storage |
|---|---|---|
| Wishlist | `wishlist/` | `wishlists`; `POST /wishlist/merge` folds a guest list in at login |
| Recently viewed | `recently-viewed/` | table + daily purge cron (`0 3 * * *`) |
| Recent searches | `recent-search/` | per-user list, `/me/recent-searches` |
| Saved searches | `saved-search/` | + `saved-search-notify` cron every 6 h that emails new matches |
| Trending searches | `search/trending.service.ts` | public, unauthenticated |
| Recommendations | `recommendation/` | PDP rails and `/recommendations` |

## Service offerings

`service_offerings` are owned here (catalogue-shaped: slug, media, price, category) but consumed
by booking-service, which owns staff, availability and bookings. The split:

- Vendor CRUD: `POST/GET/PATCH /vendor/services[/:id]`
- Admin approval: `/admin/service-offerings/:id/(approve|reject)`
- Public PDP: `GET /services/:slug`, `GET /services/by-id/:id`
- **Availability**: `GET /services/:slug/availability` → routed by the gateway to
  **booking-service** via an explicit regex exception.

## Gifting

`domain/gifting/` — `gift_occasions`, `gift_box_styles`, `gift_boxes` (a curated bundle of
component products plus packaging price and an optional bundle discount). Admin CRUD under
`/admin/gift/*`, public reads under `/gift/*`. The cart, order and hub-fulfilment side lives in
order-service ([07](07-cart-and-checkout.md), [08](08-orders-and-fulfilment.md)).

## Gaps

- `postgres-search.adapter.ts:209` — `suggest()` is unimplemented in the Postgres adapter, so
  typeahead silently returns nothing if that adapter is selected.
- `suggest.service.ts:28` — per-bucket rejections are not logged, so a suggest returning fewer
  results than expected is undebuggable.
- The reservation-expiry (15 min) / pending-order-reaper (60 min) mismatch described above.
