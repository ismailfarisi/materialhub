# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MaterialHub** — Multi-vendor ecommerce marketplace targeting the UAE market. Built as an ElysiaJS (Bun) monorepo with Next.js 14 web frontend, Flutter mobile app, and PostgreSQL database.

Planning documents:
- `db-design/` — Database schema documentation (107 tables, 34 enums), split by domain. **Mirror, not source** — the source of truth is `backend/libs/database/src/entities/*.entity.ts` and `backend/libs/database/src/enums/*.ts`.
- `sprints/` — Sprint backlog (10 sprints, 214 story points), one file per sprint
- `scrum-tracker.csv` — Scrum board tracker

### Keeping db-design in sync (REQUIRED)

`db-design/` is documentation, not the schema itself. Whenever you touch a TypeORM entity or migration in `backend/libs/database/src/`, update the matching doc in the **same PR**:

| If you change… | Update… |
|---|---|
| A column on an existing entity | The table block in the relevant `db-design/0X-*.md` (e.g. add a column row, update a CHECK note) |
| Add a new entity / table | (a) Add a section in the matching domain file, (b) append a row to `db-design/11-table-reference.md`, (c) bump the table count in `db-design/01-overview.md` and `db-design/README.md` |
| Add or change an enum in `enums/*.ts` | The corresponding section of `db-design/02-enums.md` |
| Add a brand-new subsystem (like reels, layouts) | Create a new numbered domain file (`db-design/NN-*.md`) and link it from `db-design/README.md` |
| Drop / rename a table | Remove the table block, drop the row from `11-table-reference.md`, update counts |

Verify the entity count after the change: `ls backend/libs/database/src/entities/*.entity.ts | wc -l` — that number must equal the total in `db-design/01-overview.md` and `db-design/11-table-reference.md`.

## Tech Stack

- **Runtime:** Bun (package manager and runtime)
- **Backend:** ElysiaJS monorepo (Turborepo), TypeScript strict mode, NestJS-like architecture (plugins as modules, derive for DI, lifecycle hooks)
- **Database:** PostgreSQL with TypeORM (migrations-based), soft deletes on all tables
- **Cache/Sessions:** Redis (cart stored as Redis hash, 30d TTL)
- **Search:** Typesense (typo-tolerant, faceted search)
- **Job Queue:** BullMQ
- **Web Frontend:** Next.js 14 (App Router), React 18, Axios, React Hook Form, Recharts
- **Mobile:** Flutter (Dart), cross-platform iOS + Android
- **Payments:** Stripe Connect (primary), Tabby & Tamara (BNPL), Checkout.com
- **Cloud:** AWS (ECS, RDS, S3 + CloudFront, SES, ECR)
- **Auth:** JWT (15min access / 7d refresh with rotation) + OAuth2 (Google, Apple) + optional TOTP 2FA
- **Monitoring:** Winston (structured JSON), Sentry, CloudWatch
- **Key ElysiaJS Plugins:** `@elysiajs/swagger` (OpenAPI docs), `@elysiajs/jwt` (auth), `@elysiajs/cors`, `@elysiajs/bearer`, custom rate-limiter plugin (Redis-backed)

## Pre-Push Checklist

Before running `git push`, always run the lint check first:

```bash
cd backend && bunx --bun @biomejs/biome@1.9.4 check .
```

Fix any errors before pushing. Warnings are allowed; errors will fail CI.

## Expected Commands

```bash
docker compose up          # Local dev: all services + Postgres + Redis
bun run dev                # Dev mode (all services with hot reload)
bun run build              # Build all services
bun run lint               # Biome across monorepo
bun run test               # Bun test runner
bun run test:e2e           # Integration tests
bun run migrate            # TypeORM migrations
bun run seed               # Seed DB with test data
bun run search:reindex     # Typesense full reindex

# Mobile (Flutter)
flutter run                # Run on connected device/emulator
flutter build apk          # Android release build
flutter build ios          # iOS release build
flutter test               # Run Flutter tests
```

## Architecture

### Backend Services (Microservices)
- `api-gateway` — ElysiaJS entry point, HTTP proxy/message bus routing, rate limiting (custom Redis plugin), Swagger at `/api/docs` via `@elysiajs/swagger`
- `auth-service` — JWT (`@elysiajs/jwt`), OAuth2, 2FA, password reset, account lock after 5 failed attempts
- `product-service` — Catalog, search, variants, inventory management
- `order-service` — Orders, checkout, multi-vendor order splitting
- `vendor-service` — Vendor onboarding, profiles, KYC, payouts via Stripe Connect
- `notification-service` — Email (AWS SES), push (FCM), in-app notifications

### Shared Libraries
- `/libs/dto` — Data Transfer Objects (Elysia type-safe schemas with `t` from `@sinclair/typebox`)
- `/libs/guards` — Auth guards & role-based access middleware (super_admin, admin, vendor, customer, guest) via Elysia `derive` + `beforeHandle`
- `/libs/plugins` — Reusable Elysia plugins (auth, rate-limit, cache, logging)
- `/libs/utils` — Helper functions
- `/libs/config` — Configuration management
- `/libs/database` — TypeORM setup, migrations

### Frontend Apps
- `/apps/web` — Next.js 14 storefront (SSR for auth pages, ISR 30min for catalog, static for sitemaps)
- `/apps/vendor-dashboard` — Next.js vendor portal
- `/apps/admin-panel` — Next.js admin dashboard
- `/apps/mobile` — Flutter app (iOS + Android)

## Key Design Decisions

### Multi-Vendor Order Flow
One master order splits into vendor sub-orders (`vendor_orders` table), each with independent status lifecycle, shipments, and tracking. Commission is calculated and snapshotted at order time.

### Checkout Flow
1. `POST /checkout/initiate` — Validate cart, calculate fees
2. `POST /checkout/apply-coupon` — Validate & apply discount
3. `POST /checkout/payment-intent` — Create Stripe PaymentIntent
4. Webhook `payment_intent.succeeded` — Create orders, split by vendor, lock inventory via `SELECT FOR UPDATE`

### Database Patterns
- All prices stored in fils (smallest currency unit); AED base with `price_overrides` JSONB for other currencies
- Soft deletes (`deleted_at`) on every table with partial unique indexes
- `tsvector` + GIN index for full-text search, auto-updated via DB trigger
- CLIP embedding column on `product_images` for visual search
- `GENERATED ALWAYS` columns (e.g., `quantity_available = quantity_on_hand - quantity_reserved`)
- Order items snapshot product price at purchase time
- Vendor bank account numbers encrypted at rest

### Caching Strategy (Cache-Aside)
Product listing: 5min, product detail: 10min, category tree: 1hr, vendor profile: 30min. Cart actions and product updates invalidate related cache keys.

### UAE-Specific
- VAT: 5% default, configurable per product/vendor
- Localization: Arabic, English, Hindi, Urdu, Malayalam (translation tables)
- BNPL: Tabby and Tamara as first-class payment methods
- Hyperlocal delivery: geo coords on addresses, `area_id` for zone-based routing

## CI/CD (GitHub Actions)
- PR: Biome lint + unit tests + build check (affected services only)
- Merge to `main`: build Docker images → push to ECR → deploy to staging ECS
- Tag `v*.*.*`: deploy to production ECS
- Secrets via GitHub Secrets + AWS SSM Parameter Store
