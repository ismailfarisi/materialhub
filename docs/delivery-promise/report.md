# Workstream 5 report: delivery promise

Branch `feature/delivery-promise`, cut from `ccr-20fdbb5d-0fqyak`. No pull request opened.

## What was built

### Backend

- **Warehouse dispatch rules** (`warehouses`): `dispatch_cutoff_time` ("HH:MM", Asia/Dubai, default 14:00), `handling_days` (default 1), `working_days` (0 = Sun … 6 = Sat, default Mon–Fri, so Friday and Saturday are set per warehouse), `same_day_emirates` and `next_day_emirates`. The emirate already existed on the warehouse. The table has check constraints on the cutoff and on handling days (0–60).
- **Made-to-order override**: `products.handling_days_override` (nullable). When it is set it replaces the warehouse's handling days, and the batch uses the largest override in a supplier group.
- **Public holidays**: new `public_holidays` table (date, English and Arabic name, `is_estimate`, `is_active`). It is seeded with the 2026 and 2027 UAE dates that published lists agree on, and every row is marked as an estimate (see Open issues for the dates left out).
- **Estimator**, order-service `domain/shipping/estimate/`:
  - `delivery-estimate.ts` is a pure function with no I/O. It works in Dubai time with a fixed UTC+4 offset, since the UAE has no daylight saving.
    - Day zero is today if today is a working, non-holiday day and the time is before the cutoff. Otherwise it is the next such day.
    - Dispatch is day zero plus the handling days, counted on working days.
    - Transit is counted on carrier days (Mon–Sat by default) and skips holidays.
    - Transit comes from the same-day list (0 days), then the next-day list (1 day), then the stated days on the matching shipping rate, then a default of 1–2 days within the emirate and 2–4 days across emirates. When the buyer has chosen a method at checkout, that method's rate comes first.
    - It returns the earliest and latest dates, the dispatch date, `cutoffAt` and minutes to cutoff, `speed` (`same_day` / `next_day` / `standard`), `basis`, and `dependsOnEstimatedHoliday`.
  - `delivery-estimate.service.ts` loads the rows: the vendor's default active warehouse, the product overrides, and active rates for the vendor or platform joined to zone emirates. Holidays load once per batch and are cached for 10 minutes; any admin edit clears the cache.
  - `public-holiday.service.ts` provides admin CRUD with date validation and a one-holiday-per-date rule.
- **Routes**:
  - `GET /shipping/delivery-estimate?vendor_id|warehouse_id&emirate&product_id&method&at` is public.
  - `POST /shipping/delivery-estimate/batch` is public. It takes up to 50 supplier groups and returns one estimate per supplier. A supplier without a warehouse gets an `error` entry instead of failing the batch.
  - `GET /vendor/warehouses/delivery`, `PATCH /vendor/warehouses/:id/delivery` and `POST /vendor/warehouses/:id/delivery/preview` need `orders.fulfill` and only touch the caller's own warehouses. The preview stores nothing.
  - `GET/POST/PATCH/DELETE /admin/public-holidays` are admin only.
  - The admin `PATCH /shipping/warehouses/:id` also accepts the new fields, with the same validation.
- **Gateway**: `/admin/public-holidays` is now proxied to order-service. The JWT guard's public list (`libs/guards`) now includes the estimate GET and the batch POST. The end-to-end run found this: guests got 401 until it was added.
- **Search filter**: product-service accepts `?delivery=same_day|next_day&emirate=Dubai`. It is resolved when the query runs, from each supplier's default warehouse:
  - Same-day needs 0 handling days and the emirate on the same-day list.
  - Next-day needs 0 handling days and either list, or 1 handling day and the same-day list.
  - Products whose handling override breaks the rule are excluded.
  - This adds `vendor_id:=[…]` and `id:!=[…]` clauses, in both Typesense and the Postgres fallback. **There is no change to the Typesense schema and no reindex when a warehouse changes**, so it does not collide with stream 4's index fields. It is a capability filter ("delivers same day when ordered before the cutoff"), not a reading of the clock.

### Storefront (Swatch Book)

All of it lives in `apps/web/src/components/delivery/`:

- `delivery-promise.tsx`:
  - `DeliveryPromise` (product page panel and cart inline line) and `CheckoutDeliveryPromise`. Both render `DeliveryPromiseView`.
  - The headline reads "Get it today", "Get it tomorrow, Tue 10 Nov" or "Get it by Wed, 11 Nov". "By" always uses the **latest** date, and the earliest date is shown separately.
  - "Order within 17 h 48 m" ticks from the live clock and is shown only when the cutoff is under 24 h away.
  - A Same-day or Next-day chip in ink outline. It is not orange (One Orange Rule) and not a stock colour.
  - "Estimated delivery to {emirate}". On the product page and cart the emirate is a native select styled as inline text. Checkout uses the selected address and shows no picker.
  - A holiday note when an estimated holiday moved the date, and an honest fallback ("Delivery date is confirmed at checkout") when there is no estimate.
- `delivery-api.ts`: a micro-batcher. Every supplier group asked for in the same tick shares one `POST …/batch`, split by destination and method. It refetches every minute so a passed cutoff rolls the date forward.
- `use-delivery-emirate.ts`: resolves the destination in this order: the checkout address, then the emirate the buyer picked (stored in the preferences store as `deliveryEmirate`), then the default saved address (fetched only when signed in), then Dubai. The fallback is always visible and can be changed.
- `delivery-filter-group.tsx`: the "Delivery" filter group ("Same-day to Dubai" / "Next-day to Dubai") in the listing filters.
- Copy lives under the `delivery` namespace in `messages/{en,ar}.json`, with real Arabic.

Insertion points, one line each plus an import:

- `components/product/product-hero.tsx`: below the BNPL strip.
- `app/[locale]/cart/page.tsx`: under each supplier group's header.
- `components/checkout/shipping-section.tsx`: under the delivery method, once per supplier in the group.
- `components/product/filter-groups.tsx`: after Availability.
- `stores/preferences.ts`: `deliveryEmirate` field.

### Vendor dashboard

`Settings › Delivery Promise` (`/settings/delivery`) has:

- A warehouse picker, shown when the vendor has more than one warehouse.
- Cutoff time and handling days.
- Mon–Sun working-day toggles.
- A per-emirate Standard / Next-day / Same-day table. Each emirate is in at most one list.
- Save and discard buttons.
- A **live preview** card that calls the preview endpoint with the unsaved settings for a chosen buyer emirate. It shows the storefront wording plus the dispatch date, the transit days and where they came from.

### Admin panel

`Settings › Public Holidays` (`/settings/public-holidays`) has:

- Year tabs.
- An add form with date, English name, Arabic name and an "Estimated" switch.
- A table with weekday, a click-to-toggle Estimate/Confirmed badge, an active switch, inline edit, and delete with confirmation.

## Migrations

- `backend/libs/database/src/migrations/1793965500005-DeliveryPromise.ts`: warehouse columns and checks, `products.handling_days_override`, and the `public_holidays` table plus seed. Every statement can be re-run safely, and `down()` is included.
- Verified against Postgres 16:
  - Up, down and up again all applied, ending with 22 seeded holidays.
  - An entity-versus-database drift check shows no drift for these tables. Six pre-existing drift statements elsewhere are untouched.

## Tests

Postgres, Redis and Typesense ran via `docker compose` (`dockerd` was started in the container).

| Package | Result |
|---|---|
| order-service `bun test` | 1031 pass, 11 fail. The 11 also fail on the base commit (admin payout-adjustment, admin cancel-items and Tamara route tests). This includes 27 estimator unit tests (cutoff boundary at 13:59 and 14:00, rounding, weekends with Fri/Sat configurable, Sunday carrier days, holidays during handling and transit, estimated versus confirmed holidays, Dubai and UTC date boundary, overrides, transit sources), 14 service tests, 3 route-mounting tests and **4 integration tests against live Postgres** |
| product-service `bun test` | 403 pass, 0 fail (includes 5 delivery-filter tests) |
| libs/guards `bun test` | 64 pass, 0 fail (includes the new public-route test) |
| libs/database `bun test` | 15 pass, 0 fail |
| api-gateway `bun test` | 33 pass, 0 fail |
| web `npx vitest run` | 69 files, 416 tests, all pass (15 new) |
| vendor-dashboard | The app declares `vitest` but does not install it, so the tests ran with the workspace binary. The 5 new helper tests pass. 7 pre-existing files don't load without the app's own setup (no jsdom, path aliases, a Playwright spec) |
| admin-panel | No tests; `tsc --noEmit` is clean |
| Type checks | `tsc --noEmit` is clean for web, vendor-dashboard and admin-panel |
| Biome | Backend: no errors on changed files. Web, vendor and admin: no new errors. The web files touched still carry their 10 formatting errors from the base commit, because the repo has no web Biome config; I did not reformat them |

## Screenshots

`docs/delivery-promise/screenshots/`, taken at deviceScaleFactor 2 at 390 and 1440 px, in en and ar for storefront pages. These are real pages against the real services. The data is scratch rows in the local dev database only (two suppliers, two materials, a buyer, a vendor member, an admin, a standard and an express rate). Nothing was committed into pages or seeds.

- `pdp-{en,ar}-{390,1440}.png`: Al Quoz Board & Paper, same-day to Dubai with a countdown.
- `cart-{en,ar}-{390,1440}.png`: two suppliers, one promise each. Sharjah Leather Supply shows Wed 11 Nov because its warehouse works Mon–Fri with 1 handling day.
- `checkout-{en,ar}-{390,1440}.png`: Sharjah address with the Standard method's 2–3 day transit, per supplier.
- `search-{en,ar}-{390,1440}.png` and `search-filter-en-1440.png`: Same-day to Dubai filter on, with Sharjah Leather Supply correctly excluded.
- `vendor-delivery-settings-{390,1440}.png`, `admin-public-holidays-{390,1440}.png`: these apps are English only.

## Cross-stream touch points

- **Stream 1 (trade pricing)** and **stream 3 (business accounts)** both touch checkout. I only added the per-supplier delivery line in `shipping-section.tsx` (delivery display). Pricing and the payment-method list are untouched. In `product-hero.tsx` my change is one line below `BnplStrip`, away from the price, tier table and purchase area.
- **Stream 4 (eco catalogue)** adds Typesense fields. This stream adds no index fields: the delivery filter becomes vendor and id clauses. Both streams add a group to `filter-groups.tsx`, so the merger should expect neighbouring insertions there.
- **Stream 1 sample variants**: if samples ship from a different warehouse or with different handling, pass the sample's product id in `product_ids`; the override mechanism already covers it.
- **`messages/*.json`**: new keys only, under `delivery`.
- **`stores/preferences.ts`**: one new field, `deliveryEmirate`.
- **`libs/guards/src/jwt-auth.ts`**: two public-route lines. Other streams adding public routes will touch the same function.

## Promote to swatch

- **Inline select styled as text** (`EmiratePicker` in `delivery-promise.tsx`): a native `<select>` that reads as an underlined value with a chevron, sized to its content.
- **Speed chip**: a condensed-caps label chip with a 1 px ink outline at 25%, for states that are neither a stock colour nor the next action.

## Open issues

1. **Holidays left out of the seed** because published sources disagree: Hijri New Year 2027, Prophet's Birthday 2027 and Commemoration Day (1 Dec). Admins should add them in the holiday editor once they are announced. All seeded Islamic dates are estimates until the government confirms them.
2. **Vendor "Dispatch N days" fact on the seller block**: the existing supplier card shows a vendor-level dispatch figure (for example "2 days") that can disagree with the warehouse handling days shown in the promise. One of them should go, or the card should read from the warehouse. It is outside this stream's files.
3. **Fresh dev databases have no `role_permissions` rows**, so every vendor route answers 403 until the matrix is filled. This is pre-existing and not seeded by any migration or by `seed`. I filled it in the scratch DB only, for the screenshots.
4. **Carrier delivery days** default to Mon–Sat, as a platform constant. If couriers are integrated per vendor, carrier days and transit should come from the provider.
5. **Active filter pills**: the delivery filter changes results but does not appear as a removable pill in the active-filters strip (`filter-state.ts` lists known groups). Unchecking it in the filter group clears it. Adding a pill touches a shared listing file, so I left it for the merger.
6. **Search filter precision**: the filter judges each supplier by its default warehouse, the same choice the estimator makes. Inventory split across several warehouses per supplier is not modelled.
7. **Vendor-dashboard tests**: the app's `test` script needs `vitest` (and jsdom) added to its devDependencies before its suite can run on its own.
