# MaterialHub Backend Documentation

Engineering documentation for the MaterialHub backend — a Bun/ElysiaJS microservice monorepo
serving a multi-vendor UAE marketplace (catalogue + services/bookings + short-form video
commerce).

This set is written for **an engineer who has just been given the repo**. It documents what
the code does *today*, names the files and classes that do it, and flags gaps where the
implementation is incomplete. It is not a specification — where reality and the sprint specs
disagree, these documents describe reality.

## Reading order

If you are new, read 01 → 02 → the service you are about to touch → 16.

| # | Document | What it covers |
|---|---|---|
| 01 | [Architecture](01-architecture.md) | Monorepo layout, the 10 services, ports, request lifecycle, the container/DI pattern, code conventions |
| 02 | [Cross-cutting concerns](02-cross-cutting.md) | Auth guards, permissions, error model, rate limiting, logging, config, caching, the queue/worker inventory, audit, encryption, media |
| 03 | [api-gateway](03-api-gateway.md) | Prefix routing table, proxying, health aggregation, CORS |
| 04 | [auth-service](04-auth-service.md) | Register/login, JWT + refresh rotation, OAuth, phone OTP, 2FA, sessions, addresses, referrals, admin user management |
| 05 | [product-service](05-product-service.md) | Catalogue, categories, brands, attributes, variants, inventory, search/Typesense, media, flash deals, collections, gifting, service offerings |
| 06 | [Bulk jobs](06-bulk-jobs.md) | The generic bulk import/export engine, job types, image fetch, revert, templates |
| 07 | [Cart & checkout](07-cart-and-checkout.md) | Cart storage, quote, checkout, coupons, payment providers, webhooks, order creation |
| 08 | [Orders & fulfilment](08-orders-and-fulfilment.md) | Order state machines, vendor orders, shipments/carriers, returns, disputes, reviews, gift fulfilment |
| 09 | [Money: commissions & payouts](09-commissions-and-payouts.md) | Commission snapshotting, settlement, payout drafts, rails, transfers, reversals, adjustments |
| 10 | [vendor-service](10-vendor-service.md) | Vendor onboarding/KYC, members & permissions, bank accounts, Stripe Connect, affiliates |
| 11 | [integration-service](11-integration-service.md) | Vendor webhooks in/out, mapping DSL, authority gate, pending writes, sales channels & feeds |
| 12 | [cms-service](12-cms-service.md) | Pages, banners, layouts & sections, vendor storefront layouts, navigation, bids, settings, support/Slack, audit log |
| 13 | [reels-service](13-reels-service.md) | Upload/moderation, feed & ranking, social graph, product tagging & attribution, creator commissions, licensing/escrow |
| 14 | [booking-service](14-booking-service.md) | Availability engine, holds, booking lifecycle, payment modes, calendars/iCal, staff, reviews |
| 15 | [notification-service](15-notification-service.md) | Event → dispatch pipeline, channels (in-app/email/push/WhatsApp), preferences, newsletter |
| 16 | [Cross-service flows](16-cross-service-flows.md) | End-to-end sequences that span services, with diagrams |
| 17 | [Known gaps & TODOs](17-gaps-and-todos.md) | Everything found that is incomplete, inconsistent, or a trap |

## Related documentation

- `db-design/` — the database schema mirror (tables, enums, indexes, partitioning). It is
  documentation *of* `backend/libs/database/src/entities/*.entity.ts`, which is the source of
  truth. Keeping it in sync is mandatory — see the root `CLAUDE.md`.
- `sprints/` — the sprint backlog these features were built from.
- `docs/runbooks/` — operational runbooks.

## Conventions used in these documents

- File paths are repo-relative from `backend/` unless stated otherwise (e.g.
  `apps/order-service/src/domain/checkout/checkout.service.ts`).
- Diagrams are Mermaid and render on GitHub.
- **Gap** callouts mark places where the code is knowingly incomplete or surprising.
- Money is always in **fils** (1 AED = 100 fils) unless a field name says otherwise.
