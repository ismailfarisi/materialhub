# MaterialHub UAE — security model

Threat model for `ismailfarisi/materialhub`, built from the code and `docs/backend/*` plus the owner's answers (marked **[user]**). Security scans cover `backend/` and `terraform/`; the Next.js apps in `apps/` are not scanned yet.

## System overview and trust boundaries

One Bun/ElysiaJS process (`backend/apps/api`, :3000, one Docker image) mounts seven modules in-process (auth, product, order, vendor, notification, cms, integration). Shared PostgreSQL 16 (RDS), Redis (ElastiCache), BullMQ, Typesense, S3 media. Deployed by Terraform (`terraform/production`) to a single EC2 host behind Caddy (only 80/443 public); RDS and Redis accept only the app host's security group; RDS is encrypted, not public, deletion-protected; secrets live in SSM SecureString (KMS) and are written by CI.

Trust boundaries:
1. Internet → API (Caddy → :3000): every public, customer, vendor and admin request.
2. Payment/channel providers → `/webhooks/*`, `/integrations/inbound/:vendor/:source` (signature/token verified).
3. Module → module: `/internal/*` via `serviceFetch`, guarded by `internalServiceAuth` (HS256 JWT, `INTERNAL_SERVICE_SECRET`, allowed `iss`) or `internalAuth` (shared secret header). Never routed publicly by the gateway's `resolveUpstream`.
4. API → third parties (Stripe, Tabby, Tamara, shipping providers, sales channels, WhatsApp/Twilio, Cloudflare, Google Drive) with platform or vendor-supplied credentials.
5. CI/CD (`.github/workflows`, `terraform/*/cicd.tf`) → AWS (ECR, SSM, EC2).

## Components

| Component | Code |
|---|---|
| API gateway | `backend/apps/api`, `backend/libs/plugins` (CORS, rate limiter, error handler), `backend/libs/guards/src/jwt-auth.ts` public-route rules |
| Auth | `backend/apps/auth-service`, `backend/libs/guards` (JWT, token version, roles, vendor membership, permission matrix) |
| Catalogue & bulk | `backend/apps/product-service` (catalogue, search, inventory, media, `bulk/` CSV/XLSX imports, image fetch), `backend/libs/bulk-jobs` |
| Orders & payments | `backend/apps/order-service` (cart, checkout, Stripe/Tabby/Tamara/COD, webhooks, refunds, returns, commissions, payouts, shipping) |
| Vendors | `backend/apps/vendor-service` (applications, KYC, members/invites, bank accounts, Stripe Connect) |
| Integrations | `backend/apps/integration-service` (vendor inbound webhooks, sales channels, channel credentials, mappings, replay) |
| CMS & notifications | `backend/apps/cms-service`, `backend/apps/notification-service` (pages, settings, support, Slack/WhatsApp webhooks, newsletter, email) |
| Infrastructure | `terraform/`, `backend/docker-compose*.yml`, `backend/apps/api/Dockerfile`, `backend/libs/database` migrations |

## Entry points and who can reach them

- Public (no token): catalogue reads, categories, brands, collections, vendor public profiles, layouts/pages/navigation, `/checkout/bnpl-thresholds`, invite lookup, all `/webhooks/*`, `POST /integrations/inbound/:x/:y`, `/media/product/*`, `/api/docs`.
- Optional auth: cart (guest via `x-guest-session`), newsletter, support tickets.
- Customer: account, addresses, orders, checkout, returns, disputes, reviews, quote requests, business accounts, 2FA.
- Vendor members (`vm` claim + `X-Active-Vendor-Id`, permission matrix: owner/manager/staff/viewer): listings, inventory, bulk jobs, fulfilment, refunds, coupons, payouts, bank accounts, team, integrations.
- Admin / super_admin (`requireRole`): payouts and adjustments (incl. bank reveal), role permissions, users, businesses, shipping config, payment methods, CMS, pending writes, channels.

## Accounts and attackers that matter

**[user]** Anyone on the internet can sign up as a customer (email, Google, Apple). Vendors apply and need admin approval. Admins are staff only.

**[user]** Nothing is out of scope: every attacker below matters.

- Anonymous internet attacker (public routes, webhooks, inbound integration endpoints, auth flows).
- Signed-up customer (IDOR on other customers' orders/addresses/PII, price/coupon/checkout manipulation, guest-cart abuse).
- Approved vendor member, including low-privilege staff/viewer (cross-vendor access, privilege escalation within a vendor, payout/commission manipulation, SSRF via bulk image fetch or channel URLs, malicious CSV/XLSX).
- Forged webhook / provider callback sender (Stripe, Tamara, Tabby, shipping, WhatsApp, Slack, vendor inbound).
- Compromised admin or insider; CI/supply-chain attacker.

## Assets

**[user]** All of these matter equally:
- Payments, commissions and vendor payouts — the `payments`, `commissions`, `vendor_payouts`, `vendor_payout_adjustments`, `webhook_events` ledger and Stripe Connect transfers. Money is integer fils.
- Vendor bank accounts and KYC documents (encrypted via `libs/utils/src/encryption.service.ts`; admin bank-reveal route).
- Customer PII and addresses.
- Admin panel / super_admin accounts.
- Vendor integration and sales-channel credentials (`integration-service/src/domain/channels/credentials.ts`).
- Also: JWT/internal/encryption secrets (SSM), inventory integrity.

## Existing controls

- Access JWT 15 min HS256; refresh token opaque, only hash stored; `token_version` revocation on role change, vendor approval, password reset, suspension.
- App-scoped cookies from `X-Client-App`; cookie domain from `Origin`.
- Production CORS allowlist with `credentials: true`; optional preview-origin regex fails closed (staging only).
- Unknown paths 404 before `jwtAuth`; `/internal/*` not routed publicly.
- Rate limit 100/60 s per IP anonymous, 1000/60 s per user (Redis, in-process fallback).
- Stripe webhook verified on raw body; Tamara token verified before any `webhook_events` write; inbound integrations go through `authority-gate.ts` and `idempotency.ts`.
- Idempotent order creation/payment confirmation/webhooks; inventory reserved with `SELECT … FOR UPDATE`.
- 500s never leak internals. No card data stored.
- Infra: only 80/443 public; DB/Redis SG-restricted; RDS encrypted; SSM + KMS with rotation.

## Out of scope / accepted risk

**[user]** Nothing is ruled out or accepted.

## Open questions

- Is MFA enforced for admin/super_admin accounts?
- Who can run `terraform apply` and what IAM does CI hold (`terraform/*/cicd.tf`)?
- Is the netcup staging stack (`docker-compose.netcup.yml`) reachable from the internet with production-like data?
