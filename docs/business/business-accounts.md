# Business accounts, VAT tax invoices and net terms

Workstream 3 of the November 2026 improvement plan (roadmap item 4). This file is the
contract between the backend and the storefront, admin panel and vendor dashboard.

All money is integer **fils** (AED × 100). Every response uses the usual envelope
`{ statusCode, data, timestamp }`. List responses put `{ items, total, page, limit }`
(and sometimes `summary`) in `data`. Paths are gateway paths.

## Concepts

- **Business account**: a company buying on MaterialHub. One user belongs to at most one
  business (one active membership). The user who creates it becomes its `admin`.
- **Roles**:
  - `admin`: edits the company profile, manages members, sets the approval limit, applies
    for net terms, approves orders, buys.
  - `approver`: approves or rejects orders from buyers, buys.
  - `buyer`: buys. Orders above the approval limit need sign-off first.
- **Approval limit** (`approval_threshold_fils`, null = off). It is compared with the goods total (cart subtotal minus coupon discount, VAT included, before delivery). The flow, stated plainly:
  1. A `buyer` whose cart total is above the limit can't place the order. Checkout answers
     `403 APPROVAL_REQUIRED`.
  2. The buyer sends the cart for approval (`POST /checkout/approvals`). This snapshots the
     cart (items, quantities, prices, total).
  3. An `approver` or `admin` approves or rejects it.
  4. The approval is valid for 72 hours for **exactly that cart**. If the cart changes, it
     no longer matches and the buyer must ask again. Placing the order uses the approval
     up (`used`).
  Admins and approvers never need approval for their own orders.
- **Verification**: `pending` → `verified` | `rejected`, set by a platform admin after
  checking the trade licence and the TRN. Editing the licence or the TRN sets it back to
  `pending`.
- **TRN**: 15 digits (UAE Federal Tax Authority). The first 10 digits are the TIN. The
  Peppol participant ID is derived as `0235:<TIN>` (see "Unverified" below). A business
  that is not VAT-registered has no TRN.
- **Net terms**: a verified business applies (`net_30` or `net_60` and a requested limit).
  A platform admin approves it with a credit limit. At checkout "Pay on invoice" is offered
  only when:
  - the business is verified,
  - net terms are `approved`,
  - the order total is at most `credit_limit - outstanding`, and
  - the business has no overdue invoice.
  The order is confirmed straight away with payment due on `confirmed_at + 30/60 days`.
  The credit used goes up by the order total. A platform admin marks the receivable paid,
  which frees the credit. **Vendor payouts for a net-terms order wait until it is paid**:
  commissions stay `held` and the settlement job skips them until the order's payment is
  captured.
- **Tax invoices**: one VAT tax invoice per vendor sub-order (seller = vendor, with the
  vendor's TRN), plus one platform invoice for shipping and the COD surcharge when they
  are non-zero (seller = MaterialHub, `PLATFORM_TRN`). An order-level coupon discount is
  shared across the vendor invoices in proportion to their subtotals. Together the
  invoices add up to the order grand total. Numbers come from a per-seller, per-year
  sequence: `INV-<SELLER8>-<YYYY>-<NNNNNN>`.

## Storefront API (customer JWT)

### Business account (auth-service)

| Method | Path | Who | Body / notes |
|---|---|---|---|
| GET | `/auth/me/business` | any user | `{ account, membership, credit, invites }`, each nullable or empty |
| POST | `/auth/me/business` | user with no business | `BusinessInput`; creates the account with the caller as `admin` |
| PATCH | `/auth/me/business` | admin | partial `BusinessInput` plus `approval_threshold_fils` (number or null) |
| GET | `/auth/me/business/members` | any member | `Member[]` |
| POST | `/auth/me/business/members` | admin | `{ email, role }`; invites by email |
| PATCH | `/auth/me/business/members/:id` | admin | `{ role }` |
| DELETE | `/auth/me/business/members/:id` | admin | removes the member or cancels the invite (you can't remove the last admin) |
| POST | `/auth/me/business/invites/:id/accept` | invited user (email must match) | |
| POST | `/auth/me/business/invites/:id/decline` | invited user | |
| POST | `/auth/me/business/net-terms` | admin of a verified business | `{ terms: "net_30" \| "net_60", requested_limit_fils, note? }` |

The licence document is uploaded with the existing presign flow:
`POST /media/presign { asset_type: "business_licence", filename, content_type }` returns
`{ uploadUrl, key }`. PUT the file to `uploadUrl`, then send `trade_licence_document_key: key`.
Allowed types are PDF, JPEG and PNG up to 10 MB. The key must sit under
`private/business/<your user id>/`.

```ts
BusinessInput = {
  legal_name: string;              // as on the trade licence
  trade_name?: string | null;
  trade_licence_number: string;
  trade_licence_issuer?: string | null;   // e.g. "Dubai DET"
  trade_licence_expiry: string;    // YYYY-MM-DD, must be in the future
  trade_licence_document_key?: string | null;
  vat_registered: boolean;
  trn?: string | null;             // required when vat_registered; 15 digits
  billing_address: { line1: string; line2?: string; city: string; emirate: string; po_box?: string; country_code: "AE" };
}

BusinessAccount = BusinessInput & {
  id: string;
  has_licence_document: boolean;
  peppol_participant_id: string | null;   // "0235:1002345678"
  verification_status: "pending" | "verified" | "rejected";
  rejection_reason: string | null;
  verified_at: string | null;
  approval_threshold_fils: number | null;
  created_at: string;
}

Membership = { id: string; role: "admin" | "approver" | "buyer"; status: "active" }
Member = { id; user_id: string | null; email; name: string | null; role; status: "invited" | "active"; invited_at; joined_at: string | null }
Invite = { id; business_account_id; legal_name; role; invited_at }

CreditAccount = {
  status: "applied" | "approved" | "rejected" | "suspended";
  terms: "net_30" | "net_60";
  requested_limit_fils: number | null;
  credit_limit_fils: number;
  outstanding_fils: number;
  available_fils: number;          // max(0, limit - outstanding)
  overdue_count: number;
  overdue_fils: number;
  applied_at: string; decided_at: string | null; decision_note: string | null;
}
```

Validation errors are `400` with a `code`: `TRN_INVALID`, `TRN_REQUIRED`,
`LICENCE_EXPIRED`, `LICENCE_KEY_INVALID`, `ALREADY_IN_BUSINESS`, `LAST_ADMIN`,
`NOT_VERIFIED`, `TERMS_ALREADY_ACTIVE`. Permission errors are `403 BUSINESS_ROLE_REQUIRED`.

### Order approvals (order-service)

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/checkout/approvals` | member | `{ note? }`; snapshots the caller's current cart |
| GET | `/checkout/approvals?status=pending` | member | admin and approver see every request in the business, a buyer only their own |
| POST | `/checkout/approvals/:id/approve` | admin, approver | `{ note? }` |
| POST | `/checkout/approvals/:id/reject` | admin, approver | `{ note? }` |
| POST | `/checkout/approvals/:id/cancel` | requester | |

```ts
Approval = {
  id; status: "pending" | "approved" | "rejected" | "used" | "expired" | "cancelled";
  amount_fils: number; currency: "AED"; item_count: number;
  items: { product_name: string; variant_name: string | null; vendor_name: string | null; quantity: number; unit_price_fils: number; line_total_fils: number }[];
  note: string | null;
  requested_by: { id; name: string | null; email };
  decided_by: { id; name: string | null; email } | null;
  decision_note: string | null;
  created_at; decided_at: string | null; expires_at: string | null;
  order_id: string | null; order_number: string | null;
  can_decide: boolean;            // the caller may approve or reject it
}
```

### Checkout changes (order-service)

- `GET /checkout/quote` lists `{ id: "net_terms", available, reason_key, reason_params,
  max_amount_fils }` in `payment_methods` when the caller's business has approved net terms.
  `reason_key` is `payment.net_terms.over_credit` (params `available`: money),
  `payment.net_terms.overdue` or `payment.net_terms.not_verified`.
- The quote has a new optional `business` block:
  `{ legal_name, trn, billing_address, role, verification_status, approval_threshold_fils, terms: "net_30" | "net_60" | null, approval_required: boolean, approval: { id, status } | null, net_terms: { terms, status, credit_limit_fils, available_fils } | null }`.
  The checkout billing step shows it (legal name and TRN on the invoice).
- `POST /checkout/initiate` with `payment_method: "net_terms"` re-runs the credit check.
  For business members the server always snapshots the buyer's legal name, TRN and billing
  address from the account; client values are ignored. A buyer over the limit without a
  matching approval gets `403 { code: "APPROVAL_REQUIRED" }`.
- `POST /checkout/net-terms { order_id }` confirms the order on terms. It is idempotent:
  a second call returns the same result. It returns
  `{ status: "confirmed", payment_due_at, terms, order_id }`. The same happens through
  `POST /checkout/payment-intent` with `payment_method: "net_terms"`.

### Invoices (order-service)

| Method | Path | Notes |
|---|---|---|
| GET | `/invoices?page=&limit=&status=unpaid\|paid\|overdue` | the caller's own invoices; business admins and approvers see every invoice in the business |
| GET | `/invoices/:id/pdf` | `{ url }`, a signed URL for the tax invoice PDF |
| GET | `/invoices/:id/xml` | `application/xml` UBL 2.1 (PINT AE draft), sent as an attachment |

```ts
InvoiceRow = {
  id; invoice_number; kind: "vendor" | "platform";
  order_id; order_number;
  seller_name; seller_trn: string | null; buyer_name: string | null; buyer_trn: string | null;
  issue_date: string; due_date: string | null;
  payment_terms: "immediate" | "net_30" | "net_60";
  payment_status: "paid" | "unpaid" | "void";
  is_overdue: boolean;
  taxable_fils: number; vat_fils: number; total_fils: number;   // total = payable
  currency: "AED";
  einvoice_status: "not_applicable" | "ready" | "submitted" | "accepted" | "rejected";
}
```

The existing order receipt (`GET /orders/:id/invoice.pdf`) still works. It now prints the
platform TRN, each vendor's TRN, and the buyer's legal name and TRN.

## Admin API (admin JWT)

### Business accounts (auth-service)

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/business-accounts?status=&net_terms=&q=&page=&limit=` | `AdminBusinessRow[]` |
| GET | `/admin/business-accounts/:id` | row plus `members: Member[]` |
| GET | `/admin/business-accounts/:id/licence` | `{ url }`, signed for 5 minutes |
| POST | `/admin/business-accounts/:id/verification` | `{ decision: "verified" \| "rejected", reason? }` (a reason is required when rejecting) |
| POST | `/admin/business-accounts/:id/net-terms` | `{ decision: "approved" \| "rejected" \| "suspended", terms?, credit_limit_fils?, note? }`. Approving needs a verified business and a limit > 0. It works from any state, so an approved account can be re-approved with new terms, and admins may grant terms without an application. |

```ts
AdminBusinessRow = BusinessAccount & {
  trn_format_valid: boolean;
  licence_expired: boolean;
  member_count: number;
  owner: { id; email; name: string | null } | null;
  credit: CreditAccount | null;
}
```

### Receivables (order-service)

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/receivables?status=due\|overdue\|paid\|all&page=&limit=&q=` | `Receivable[]` and `summary` |
| POST | `/admin/receivables/:orderId/mark-paid` | `{ reference: string, paid_at?: YYYY-MM-DD }`; idempotent |
| GET | `/admin/receivables/invoices/:id/xml` | the UBL XML for any invoice |
| GET | `/admin/receivables/invoices/:id/pdf` | `{ url }` |

```ts
Receivable = {
  order_id; order_number; business_account_id; legal_name; trn: string | null;
  terms: "net_30" | "net_60"; amount_fils: number;
  confirmed_at: string; due_at: string;
  status: "due" | "overdue" | "paid"; days_overdue: number;
  paid_at: string | null; payment_reference: string | null;
  invoices: { id; invoice_number; seller_name; total_fils }[];
}
summary = { due_count; due_fils; overdue_count; overdue_fils; paid_count; paid_fils }
```

### Vendor TRN (vendor-service)

- `GET /vendors/me` and the admin vendor list and detail return `trn`, `trn_verified_at`
  and `trn_format_valid`.
- `PATCH /vendors/me/tax { trn: string | null }` (vendor dashboard, `vendor.profile.write`).
  Changing it clears `trn_verified_at`.
- `POST /admin/vendors/:id/trn-verification { verified: boolean }`.
- The admin vendor PATCH accepts `trn`.

## Ledger rules

- `payments`: a net-terms order gets one row with `payment_method = net_terms` and
  `gateway = net_terms`. It is `authorized` at confirmation and `captured` when marked paid.
  `orders.payment_status` follows it: `authorized` → `captured`.
- `commissions`: created `held` at order time as usual, and stamped `settle_after` on
  delivery as usual. The settlement job does not promote a commission whose order is on
  net terms and not yet `captured`, so `vendor_payouts` never includes it before the buyer
  pays.
- Credit: `business_credit_accounts.outstanding_fils` goes up inside the confirmation
  transaction (`SELECT … FOR UPDATE` on the credit row), goes down on mark-paid, and goes
  down when an unpaid net-terms order is cancelled.

## E-invoicing readiness (no ASP connected)

- `tax_invoices` holds the structured invoice: parties, lines, VAT breakdown, totals,
  dates, terms and status. The UBL XML is generated from it deterministically.
- `EInvoiceTransmitter` is the interface to an Accredited Service Provider.
  `NoopEInvoiceTransmitter` is the default: it leaves invoices `ready` and records that no
  ASP is configured.
- See `backend/apps/order-service/src/domain/invoice/einvoice/ubl.ts` for the field
  mapping. Every field we could not verify against the published PINT AE specification is
  marked `UNVERIFIED` there.
