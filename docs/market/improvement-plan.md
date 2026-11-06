# Improvement plan from the November 2026 market study

Source: `docs/market/market-study-2026-11.md`. Five workstreams, each run by its own session on its own branch, cut from `ccr-20fdbb5d-0fqyak` (the same commit as `main`). The design-system owner merges them.

## Rules for every workstream

- Read `/CLAUDE.md`, `/PRODUCT.md`, `/DESIGN.md`, this file and the market study first.
- Backend: entities in `backend/libs/database/src/entities` are the source of truth. Every schema change ships with a TypeORM migration in `backend/libs/database/src/migrations`, named with a timestamp so the five streams don't collide. Money is integer fils. Order creation, payment confirmation and webhooks stay idempotent; inventory is reserved with `SELECT ... FOR UPDATE`.
- UI: Swatch Book (`DESIGN.md`, `apps/web/src/components/swatch`). Follow Impeccable (`.claude/skills/impeccable`, launcher-unavailable path; read `reference/craft-floor.md` before UI edits). Every screen works at 390px and 1440px, and in Arabic (RTL).
- Tests: `bun test` in each changed backend service (unit tests; integration tests need Postgres. Start it with `docker compose -f backend/docker-compose.yml up -d postgres redis typesense` if Docker is available, otherwise say so). Run `npx vitest run` in each changed app, and Biome on changed files with no new errors.
- New text in `apps/web/src/messages/{en,ar}.json` goes under your workstream's namespace only (`trade`, `rfq`, `business`, `eco`, `delivery`). Arabic text must be real Arabic, not English.
- Don't edit `apps/web/src/components/swatch/**`, `globals.css`, `tailwind.config.ts` or `DESIGN.md`. If you need a new primitive, build it in your own folder and list it under "Promote to swatch".
- Never show a feature as working when it isn't. No invented data in seeds beyond MaterialHub materials fixtures.
- Commit and push to your branch. Do not open a pull request. Finish with a report: what was built (backend, vendor dashboard, admin, storefront), migrations added, tests run and their results, screenshots, cross-stream touch points, and open issues.

## Workstreams

| # | Branch | Scope | Main files |
|---|---|---|---|
| 1 | `feature/trade-pricing` | Roadmap 1 and 2. Unit of measure, minimum order, order increments (pack multiples) and quantity-break tiers on variants; sample variants with a capped quantity and a sample-shipping rate. Pricing resolution in the cart and checkout quote. Vendor product form; tier table and "Order a sample" on the product page; cart enforcement. | `product-variant.entity.ts` and a new `variant-price-tier` entity; product-service variants; order-service `domain/cart`, `domain/checkout` (pricing only); vendor-dashboard product pages; storefront product page purchase area, cart line, `PriceTag` usage |
| 2 | `feature/rfq` | Roadmap 3. A buyer sends specs, quantity, unit and need-by date to up to three suppliers; suppliers reply with price, lead time, validity and notes; there's a message thread per quote; accepting converts the quote into cart lines at the quoted price. | New entities (`quote_request`, `quote_request_vendor`, `quote_response`, `quote_message`); new order-service `domain/quote` and routes; notifications; vendor-dashboard quotes inbox; storefront "Request a quote" from product and category pages and `/account/quotes`; admin read-only view |
| 3 | `feature/business-accounts` | Roadmap 4 plus e-invoicing readiness. Company profile (legal name, TRN, trade licence, billing address); members with buyer, approver and admin roles; vendor TRN; VAT tax invoices with both TRNs per vendor sub-order; a Peppol-ready invoice record and UBL 2.1 (PINT AE) XML export with no ASP connection yet; net terms (net 30/60) for admin-approved accounts with a credit limit, due dates and admin "mark paid". | New `business_account`, `business_member` and credit entities; auth-service; vendor-service (vendor TRN); order-service `domain/invoice` and a new net-terms payment method in checkout; storefront `/account/business`; admin business-accounts pages |
| 4 | `feature/eco-catalogue` | Plastic-ban substitution. Compliance attributes (material composition, recyclable, compostable, plastic-free, FSC/PEFC, a "plastic-ban ready" vendor declaration with optional certificate upload), seeded on packaging categories; a food-service paper packaging subcategory in seeds; storefront filters, a badge on product cards and the product page, and a CMS-ready "Plastic-ban ready" collection; admin review of declarations. | Seeds and attribute setup in `backend/libs/database/src/seeds`; product-service attribute and declaration fields; Typesense index fields; storefront filter and badge components in your own folder; admin catalogue review page |
| 5 | `feature/delivery-promise` | A delivery promise. Per-warehouse emirate, dispatch cutoff time and handling days, with same-day and next-day eligibility by emirate; a delivery-estimate API per supplier and destination emirate (Asia/Dubai time, Friday and Saturday handling configurable); "Get it by …" on the product page, cart and checkout per supplier; same-day and next-day filter on search. | vendor-service warehouses; a new order-service `domain/shipping/estimate`; vendor-dashboard warehouse settings; storefront `delivery-promise.tsx` (your own component, inserted with a one-line change in the product hero, cart and checkout) |

## Known overlaps (the merger resolves these)

- 1 and 2 both touch cart pricing. Price resolution order is **quote > tier > base price**. Stream 1 owns the resolver function; stream 2 adds `quote_id` and `quoted_unit_price` to `cart_items` in its own migration, plus a small, clearly marked branch in the resolver.
- 1, 3 and 5 all touch checkout. Stream 1 changes pricing only, stream 3 the payment method list only, and stream 5 the delivery display only.
- 1 and 5 both touch the product page purchase area. Keep your additions in your own components with minimal insertion points.
