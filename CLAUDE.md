# MaterialHub UAE

Multi-vendor marketplace for materials in the UAE. Two audiences share one catalogue:

- **B2B / trade:** packaging and manufacturing materials sold by the roll, sheet, pack or carton: art, kraft and speciality papers, greyboard and corrugated boards, PU and bonded leather, book cloth, hinges, magnets and fittings, adhesives, foils, rigid boxes, cartons, ribbons and trims. Buyers compare suppliers, order samples, buy at quantity-break prices and request quotes for large runs.
- **B2C / retail:** decoration and craft items such as paper sample packs and swatches, decorative papers, party decor, craft kits and stationery.

Vendors (suppliers) run their listings, inventory, orders, shipments, coupons and payouts; an admin panel runs the platform. Payments go through Stripe (card), Tabby and Tamara (BNPL) and cash on delivery; vendors are paid out minus the platform commission.

## Stack

- **Runtime:** Bun 1.4 (package manager and runtime), Turborepo monorepo, TypeScript strict.
- **Backend:** ElysiaJS services with a NestJS-style structure (modules, DI in `container.ts`, lifecycle hooks). PostgreSQL 16 + PostGIS via TypeORM (migrations), Redis, BullMQ, Typesense for search.
- **Web:** Next.js 16 (React 19, Turbopack) App Router apps: `apps/web` (storefront), `apps/vendor-dashboard`, `apps/admin-panel`. Shared UI in `packages/ui`.
- **Payments:** Stripe (PaymentIntents + Connect payouts), Tabby, Tamara, COD. The `payments`, `commissions`, `vendor_payouts` and `webhook_events` tables are the ledger.
- **Cloud:** AWS (EC2 + docker compose, RDS, S3 + CloudFront, SES), Terraform in `terraform/`.
- **Lint/test:** Biome, `bun test`.

## Layout

```
backend/apps/
  api-gateway           proxy + rate limit + Swagger at /api/docs
  auth-service          JWT (15m access / 7d refresh), phone OTP, OAuth, 2FA, addresses, admin users
  product-service       categories, brands, attributes, products, variants, inventory, collections,
                        media presign, Typesense search, wishlist, recently viewed, bulk import/export
  order-service         cart, checkout, orders, vendor sub-orders, shipments, returns, refunds, disputes,
                        reviews, coupons, promotions, commissions, payouts, invoices, dashboards
  vendor-service        vendor onboarding, KYC documents, members, bank accounts, warehouses, follows
  cms-service           pages, banners, layouts and sections, section bids, header navigation,
                        settings, support tickets, audit log
  notification-service  email (SES), push (FCM), WhatsApp, in-app; BullMQ dispatch
  integration-service   vendor integrations: signed outbound webhooks, mappings, sales-channel feeds
backend/libs/           config, database (entities + migrations + seeds), dto, guards, plugins, utils,
                        bulk-jobs, integration-events, integration-mapper
apps/                   web, vendor-dashboard, admin-panel
packages/ui             shared React components
```

## Commands

```bash
bun install
cp backend/.env.example backend/.env             # then set DB_PORT/REDIS_PORT/TYPESENSE_PORT if the defaults are taken
docker compose -f backend/docker-compose.yml up -d postgres redis typesense
cd backend/libs/database && bun run migrate && bun run seed
bun run dev:local                                 # docker infra + migrate + seed + search index + all services + apps
bun run dev                                       # all services + apps (turbo), infra already running
cd backend && bunx --bun @biomejs/biome@1.9.4 check .   # lint before push
cd backend/apps/<service> && bun test             # unit tests; integration tests need a live DB
```

Default local ports: gateway 3000, auth 3001, product 3002, order 3003, vendor 3004, notification 3005, cms 3006, integration 3008; web 4000, vendor dashboard 4001, admin panel 4002.

## Rules

- Entities in `backend/libs/database/src/entities` are the schema source of truth; every schema change ships with a migration in the same PR.
- Money is stored in fils (integers). Never store card data; the payment providers hold it.
- Order creation, payment confirmation and webhook handling must stay idempotent. Inventory is reserved with `SELECT ... FOR UPDATE`.
- Seed data, copy, emails and test fixtures are MaterialHub-branded and about materials, packaging or craft; do not introduce other brand names or beauty-era copy.
- Removed on purpose (do not resurrect): reels and creators, bookings and staff scheduling, beauty quiz, gift boxes and gift cards, flash deals, affiliates, referrals.

## Design

- Design system: **Swatch Book**. `DESIGN.md` (tokens and rules, normative) and `PRODUCT.md` (users and product truth) at the repo root; components in `apps/web/src/components/swatch`; live specimen at `/en/design-system`.
- UI work follows the Impeccable skill in `.claude/skills/impeccable` (markdown only; the binary launcher is not vendored, so use its "Launcher unavailable" path: read PRODUCT.md and DESIGN.md directly, and read `reference/craft-floor.md` before UI edits).
- Storefront redesign plan, page groups and file ownership: `docs/design/storefront-redesign.md`.

## Roadmap (B2B features to add)

1. Trade pricing: minimum order quantity, quantity-break price tiers and unit-of-measure (sheet, roll, pack, carton) on variants.
2. Sample ordering: a sample SKU per material with capped quantity and discounted shipping.
3. Request for quotation: buyers send specs and quantities to up to three suppliers and chat on the quote.
4. Business accounts: company profile, TRN, trade credit terms and multi-user purchasing.
