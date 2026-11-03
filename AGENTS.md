# MaterialHub UAE

Multi-vendor marketplace for materials in the UAE. Two audiences share one catalogue:

- **B2B / trade:** packaging and manufacturing materials sold by the roll, sheet, pack or carton: art, kraft and speciality papers, greyboard and corrugated boards, PU and bonded leather, book cloth, hinges, magnets and fittings, adhesives, foils, rigid boxes, cartons, ribbons and trims. Buyers compare suppliers, order samples, buy at quantity-break prices and request quotes for large runs.
- **B2C / retail:** decoration and craft items such as paper sample packs and swatches, decorative papers, party decor, craft kits and stationery.

Vendors (suppliers) run their listings, inventory, orders, shipments, coupons and payouts; an admin panel runs the platform. Payments go through Stripe (card), Tabby and Tamara (BNPL) and cash on delivery; vendors are paid out minus the platform commission.

## Stack

- **Backend:** ElysiaJS services with a NestJS-style structure (modules, DI in `container.ts`, lifecycle hooks). PostgreSQL 16 + PostGIS via TypeORM (migrations), Redis, BullMQ, Typesense for search.
- **Payments:** Stripe (PaymentIntents + Connect payouts), Tabby, Tamara, COD. The `payments`, `commissions`, `vendor_payouts` and `webhook_events` tables are the ledger.

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

## Rules

- Entities in `backend/libs/database/src/entities` are the schema source of truth; every schema change ships with a migration in the same PR.
- Money is stored in fils (integers). Never store card data; the payment providers hold it.
- Order creation, payment confirmation and webhook handling must stay idempotent. Inventory is reserved with `SELECT ... FOR UPDATE`.
- Seed data, copy, emails and test fixtures are MaterialHub-branded and about materials, packaging or craft; do not introduce other brand names or beauty-era copy.
- Removed on purpose (do not resurrect): reels and creators, bookings and staff scheduling, beauty quiz, gift boxes and gift cards, flash deals, affiliates, referrals.

## Roadmap (B2B features to add)

1. Trade pricing: minimum order quantity, quantity-break price tiers and unit-of-measure (sheet, roll, pack, carton) on variants.
2. Sample ordering: a sample SKU per material with capped quantity and discounted shipping.
3. Request for quotation: buyers send specs and quantities to up to three suppliers and chat on the quote.
4. Business accounts: company profile, TRN, trade credit terms and multi-user purchasing.
