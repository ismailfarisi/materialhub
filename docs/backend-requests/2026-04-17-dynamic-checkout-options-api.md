# Dynamic Payment Methods & Shipping Options API

**Status:** Agreed design v4 — 2026-04-17 (post-TypeORM verification)
**Original request from:** Frontend Team
**Priority:** High — blocks checkout improvements

**Context:** Single-page checkout is shipped. Payment methods (Card/COD/Tabby/Tamara) and shipping methods (Standard/Express/Same Day) are currently hardcoded on the frontend. Backend will drive availability and pricing based on cart contents, vendor rules, and delivery address.

v4 reconciles the spec against actual TypeORM entities at `backend/libs/database/src/entities/`. Items requiring product/legal decisions are in §10.

---

## 1. Agreed Decisions

1. **New endpoint, not an extension of `/checkout/initiate`.** `/initiate` is a write/reserve op; quote is an idempotent read.
2. **`GET /checkout/quote?address_id=...`** — cart is resolved server-side via session.
3. **Rule precedence: `product > vendor > category > zone > platform`.** Explicit deny wins at every level.
4. **BNPL (Tabby/Tamara) default gate is cart-total.** Schema supports category-scope deny for merchant-compliance extension (open item O1). Product-scope and vendor-scope are schema-forbidden for BNPL (§5.1 CHECK constraint).
5. **Shipping uses "delivery groups,"** clustered by identical available-method sets + zone.
6. **Payment method is order-level** (single choice for whole cart).
7. **`reason_key` is an i18n key; `reason_params` are typed.** No English strings in the API.
8. **Response includes a stateless HMAC `quote_token`.** Bound to cart_hash, address_id, user_id, rules_epoch, fx_snapshot_at, issued_at.
9. **Disabled methods are shown with a reason, not hidden.**
10. **Stock is not reserved at `/quote` time.** `/quote` is side-effect free — no promotion counter increments, no stock locks, no audit rows beyond rate-limit counters.
11. **Auto-switch on availability loss is cost-aware.** New default cheaper or equivalent → auto-switch + toast. More expensive → modal requiring explicit re-selection (UAE Consumer Protection Law 15/2020).
12. **Saved payment instruments are served by a separate endpoint** (`GET /checkout/payment-instruments`, §2.7). Different cache lifetime, reduces PII churn.
13. **Surcharges are NOT selection-dependent.** Surcharge for a payment method is fixed for the whole quote; it does not vary by shipping method. Shipping price varies by shipping method but not by payment.
14. **Unknown `id` values MUST be ignored by clients.** Forward compatibility for mobile binaries that can't hot-update.

---

## 2. API Contract (v1)

### 2.0 Terminology & References

All opaque identifiers in the response map to concrete sources. **API vocabulary is deliberately distinct from the DB `PaymentMethod` enum** (`backend/libs/database/src/enums/payment.enums.ts`). See the mapping table below.

| Field | Type | Source | Notes |
|---|---|---|---|
| `payment_methods[].id` | string | API-level vocabulary, **not** the DB `PaymentMethod` enum | Current values: `card`, `cod`, `tabby`, `tamara`. Unknown values MUST be ignored by clients. |
| `shipping.groups[].methods[].id` | string | `shipping_rates.method` varchar vocabulary (`shipping-rate.entity.ts:36`) | Current values: `standard`, `express`, `same_day`, `pickup`. |
| `shipping.groups[].group_id` | string | Synthetic per-response (e.g. `g1`, `g2`) | Stable within one response; regenerated on each `/quote`. |
| `shipping.groups[].items[].vendor_id` | uuid | `vendors.id` | For frontend debugging / display; not required for selection logic. |
| `shipping.groups[].items[].item_ids[]` | uuid[] | `cart_items.id` (`cart-item.entity.ts:20-22`) | Line items in the cart (table is `cart_items`; parent table is `carts`, plural). |
| `shipping.groups[].methods[].pickup_location_id` | uuid | `warehouses.id` (`warehouse.entity.ts:17-18`) | Present only when `method.id = "pickup"`. Frontend fetches display info via existing `GET /warehouses/:id`. |
| `compatibility` keys | string | matches `payment_methods[].id` | |
| `compatibility` values | string[] | matches shipping method ids | |
| All `*_fils` fields | bigint | 1/100 AED (MaterialHub's smallest currency unit, per `CLAUDE.md`) | Note: existing `shipping_rates.base_cost` / `free_above` / `per_kg_cost` are `integer` (int32) in the DB. Values fit safely for realistic AED ranges; response aggregation is widened to bigint. |
| All `*_key` fields | string | Registered reason key (see §10 O4 `reason_keys.json`) | Dot-namespaced; frontend resolves via ICU MessageFormat. |
| `*_bps` | integer | Basis points (1% = 100 bps) | `vat_rate_bps` derives from `tax_rates.rate` (numeric 5,2 percent) × 100. |

### 2.0.1 API → DB `PaymentMethod` mapping

The API payment vocabulary is a presentation-layer abstraction. The DB enum `PaymentMethod` (in `enums/payment.enums.ts`) has: `credit_card`, `debit_card`, `paypal`, `stripe`, `bank_transfer`, `cash_on_delivery`, `wallet`, `crypto`, `tabby`, `tamara`.

| API id | Maps to DB `PaymentMethod` | Notes |
|---|---|---|
| `card` | `credit_card` \| `debit_card` | Unified at the quote layer. The actual `payments.payment_method` written at `/checkout/initiate` is selected by the card's BIN/funding info from the PSP. |
| `cod` | `cash_on_delivery` | 1:1 translation. |
| `tabby` | `tabby` | 1:1. |
| `tamara` | `tamara` | 1:1. |
| *(not exposed)* | `paypal`, `stripe`, `bank_transfer`, `wallet`, `crypto` | Out of scope for v1 checkout UI; see §9. |

**Implication for rule storage.** `payment_method_rules.method` is a `varchar(32)` using the API vocabulary above, **not** the DB enum type. Decoupling lets the API vocabulary evolve without ALTER TYPE migrations on the existing enum, and avoids seeding duplicate rules against two synonyms for cards.

### 2.1 Request

```
GET /checkout/quote[?address_id=<uuid>]
Authorization: Bearer <access_token>
If-None-Match: <etag>      (optional)
Accept-Language: ar-AE,en  (informational; does not affect reason_key)
```

Cart resolved from the Redis session bound to the token. No body.

- `address_id` omitted → partial quote: `payment_methods[]` populated; `shipping = null`; `requires_address: true`; `totals.shipping_fils` omitted.
- `address_id` present → full quote.

Rate limit: **10 requests / minute / user** (prevents client bugs from DoS-ing provider eligibility APIs).

### 2.2 Response (200)

```jsonc
{
  "schema_version": 1,
  "quote_token": "q_01HYXY....abc123",     // opaque; send back on /checkout/initiate
  "issued_at": "2026-04-17T12:00:00Z",     // top-level mirror of the token's timestamp component; used for race-drop logic in §4.2
  "expires_at": "2026-04-17T12:05:00Z",    // issued_at + 300s (P1; tunable via config)
  "currency": "AED",
  "requires_address": false,

  "fx_snapshot": {
    "base": "AED",
    "rate": 1.0,
    "captured_at": "2026-04-17T12:00:00Z"
  },

  "totals": {
    // Computed against server-default selections (cheapest shipping per group,
    // first available payment method). Frontend computes selection deltas locally.
    "subtotal_fils": 35000,
    "vat_fils": 1750,                // UAE 5%, category-overridable
    "vat_rate_bps": 500,             // 5.00% in basis points
    "shipping_fils": 0,
    "surcharge_fils": 0,
    "discount_fils": 0,
    "grand_total_fils": 36750,
    "default_selection": {
      "payment_method_id": "card",
      "shipping_by_group": { "g1": "standard" }
    }
  },

  "payment_methods": [
    {
      "id": "card",
      "available": true,
      "surcharge_fils": 0,
      "surcharge_type": "fixed",        // "fixed" | "percentage_bps"
      "reason_key": null,
      "reason_params": null
    },
    {
      "id": "cod",
      "available": false,
      "surcharge_fils": 1000,
      "surcharge_type": "fixed",
      "reason_key": "payment.cod.over_threshold",
      "reason_params": {
        "limit": { "value": 500000, "type": "money", "currency": "AED" }
      }
    },
    {
      "id": "tabby",
      "available": true,
      "surcharge_fils": 0,
      "surcharge_type": "fixed",
      "min_amount_fils": 10000,         // from payment_method_thresholds (authoritative for BNPL)
      "max_amount_fils": 500000,
      "plans": [
        { "installments": 4, "interval_days": 30 },
        { "installments": 3, "interval_days": 30 }   // P2 multi-plan support; P1 may return single-entry
      ],
      "reason_key": null
    },
    {
      "id": "tamara",
      "available": true,
      "surcharge_fils": 0,
      "surcharge_type": "fixed",
      "min_amount_fils": 5000,
      "max_amount_fils": 300000,
      "plans": [
        { "installments": 3, "interval_days": 30 }
      ],
      "reason_key": null
    }
  ],

  "shipping": {
    "groups": [
      {
        "group_id": "g1",
        "label_key": "shipping.group.from_city",
        "label_params": { "city": { "value": "Dubai", "type": "string" } },
        "items": [
          { "vendor_id": "v_abc", "item_ids": ["i1", "i2"] },
          { "vendor_id": "v_def", "item_ids": ["i3"] }
        ],
        "methods": [
          {
            "id": "standard",
            "available": true,
            "price_fils": 0,
            "estimated_days": { "min": 3, "max": 5 },
            "free_threshold_fils": 20000,
            "cutoff_at": null,
            "next_available_at": null,
            "reason_key": null
          },
          {
            "id": "express",
            "available": true,
            "price_fils": 5500,              // summed across vendors in group
            "estimated_days": { "min": 1, "max": 2 },
            "free_threshold_fils": null,
            "cutoff_at": null,               // P1: always null; populated P3 (§10 O3)
            "next_available_at": null,
            "reason_key": null
          },
          {
            "id": "same_day",
            "available": false,
            "price_fils": 10000,
            "estimated_days": { "min": 0, "max": 0 },
            "free_threshold_fils": null,
            "cutoff_at": null,               // P1: always null; populated P3 (§10 O3)
            "next_available_at": null,       // P1: always null; populated P3
            "reason_key": "shipping.same_day.zone_unsupported",
            "reason_params": null
          },
          {
            "id": "pickup",
            "available": true,
            "price_fils": 0,
            "estimated_days": { "min": 1, "max": 1 },
            "free_threshold_fils": null,
            "cutoff_at": null,
            "next_available_at": null,
            "reason_key": null,
            "pickup_location_id": "3a7b2c8e-..."   // warehouses.id (uuid); frontend fetches display info via GET /warehouses/:id
          }
        ],
        "selected": "standard"
      }
    ]
  },

  "compatibility": {
    // payment_method_id -> shipping_method_ids this payment can coexist with
    "card":   ["standard", "express", "same_day", "pickup"],
    "cod":    ["standard", "pickup"],
    "tabby":  ["standard", "express", "same_day", "pickup"],
    "tamara": ["standard", "express", "same_day", "pickup"]
  },

  "notices": [
    {
      "code": "items_missing_cod",
      "severity": "warning",
      "i18n_key": "checkout.notice.items_missing_cod",
      "params": { "count": { "value": 2, "type": "number", "plural": true } },
      "affected_item_ids": ["i1", "i2"],
      "escalate_on_select": "cod"          // when this payment is selected, treat as blocking
    }
  ]
}
```

### 2.3 Empty eligibility (200)

```jsonc
{
  "schema_version": 1,
  "quote_token": "...",
  "issued_at": "2026-04-17T12:00:00Z",
  "expires_at": "2026-04-17T12:05:00Z",
  "currency": "AED",
  "payment_methods": [],
  "blocking_error": {
    "code": "no_eligible_payment_methods",
    "severity": "error",
    "i18n_key": "checkout.error.no_eligible_payment_methods",
    "params": {},
    "affected_item_ids": null              // cart-level, not item-level
  },
  "shipping": { "groups": [...] }
}
```

A group with zero available shipping methods surfaces `blocking_error` with `code: "shipping_unavailable_for_group"` and `params.group_id`.

### 2.4 304 Not Modified

Returned when `If-None-Match` matches. Frontend reuses cached body. See §8 for cache key inputs.

### 2.5 409 Conflict (on `/checkout/initiate`)

Returned when `quote_token` is stale. Body uses the same envelope (§2.6) with a freshly-issued quote attached at `fresh_quote`:

```jsonc
{
  "error": {
    "code": "quote_token_stale",
    "severity": "error",
    "i18n_key": "checkout.error.quote_token_stale",
    "params": { "reason": { "value": "cart_mutation", "type": "string" } },
    "affected_item_ids": null
  },
  "fresh_quote": { ...full /checkout/quote payload... }
}
```

Detection is a stateless HMAC re-derive — no Redis lookup required.

Stock changes between quote and place-order use the same envelope with `code: "items_out_of_stock"` and `affected_item_ids` populated.

### 2.6 Unified envelope

All error / notice / blocking / reason objects use the same shape:

```
{
  "code": "snake_case_code",
  "severity": "info" | "warning" | "error",
  "i18n_key": "namespaced.key",
  "params": { "<name>": { "value": ..., "type": "money" | "number" | "date" | "string", ... } },
  "affected_item_ids": [] | null              // optional; null for cart-level
}
```

Typed params tell the frontend ICU/MessageFormat layer how to format (currency, Arabic-Indic numerals, RTL, plural rules).

`type: "money"` requires `currency` (ISO 4217).
`type: "number"` supports `plural: true` to trigger ICU plural selection.
`type: "date"` carries ISO-8601 timestamps; client formats per locale.

### 2.7 `GET /checkout/payment-instruments` (P1)

Returns the customer's saved payment instruments. Orthogonal to availability; separate cache lifetime.

```jsonc
// Response (200)
{
  "schema_version": 1,
  "instruments": [
    {
      "id": "pm_01HY...",          // stable platform ID (payments.id or payment_tokens.id)
      "type": "card",              // matches payment_methods[].id
      "brand": "visa",             // "visa"|"mastercard"|"amex"|"mada"|...
      "last4": "4242",
      "exp_month": 12,
      "exp_year": 2028,
      "is_expired": false,
      "is_default": true,
      "requires_3ds": false,       // heuristic hint based on historical 3DS challenges
      "network_token_available": true,
      "funding": "credit"          // "credit"|"debit"|"prepaid"|"unknown"
    }
  ]
}
```

Empty list is valid (guest or new customer). Cache: `private, max-age=300`.

---

## 3. Rule Model

### 3.1 Precedence

```
product.deny > vendor.deny > category.deny > zone.deny > platform.default
```

Any deny at any level disables the method. Deny semantics only — no allow-list inversions. The rule engine evaluates all scopes uniformly; absence of a deny = allow.

### 3.2 BNPL specifics

Base gate: `cart_total in [min_amount, max_amount] AND provider_eligibility_check(customer, total)` (amounts come from `payment_method_thresholds`, authoritative for BNPL).

**Scope restriction enforced by schema CHECK (§5.1):** BNPL rules may only be at `category`, `zone`, or platform-global scope. Product-scope and vendor-scope denies are forbidden for BNPL methods.

Category-scope deny is supported but not seeded until open item O1 is resolved.

Provider eligibility is cached in `bnpl_eligibility_cache` by `(user_id, provider, amount_bucket_100aed)`. **Near-boundary bypass:** within ±5% of `min_amount` or `max_amount`, always call the provider (no cache) to avoid bucket-cliff misclassification. Cache refresh uses BullMQ async refill; never blocks `/quote`.

### 3.3 Payment × shipping restrictions

Cross-restrictions live in `payment_method_rules` (scope: method × shipping_method). Response surfaces the resolved `compatibility` matrix.

Client-side logic on shipping-selection change:

```
available_payment_methods = payment_methods.filter(pm =>
  pm.available &&
  groups.every(g => pm.id in compatibility && g.selected in compatibility[pm.id])
)
```

No backend roundtrip on selection changes.

### 3.4 Delivery-group formation

```
1. Resolve the delivery address to zone_id:
     Read user_addresses.area_id for the requested address_id.
     If non-null, treat it as delivery_zones.id. If null, set zone_id = null (pessimistic fallback).
   (Note: delivery_zones.boundary is currently varchar, not PostGIS geography —
    see §5.2 note and §10 O9. PostGIS ST_Contains lookup is a P2 enhancement;
    area_id is authoritative for P1.)
2. Collect distinct vendor_ids from the cart (set V).
3. Fetch candidate shipping_rates with nullable-aware predicate:
     SELECT * FROM shipping_rates
     WHERE deleted_at IS NULL
       AND (vendor_id = ANY($V) OR vendor_id IS NULL)
       AND (zone_id = $zone_id OR zone_id IS NULL)
4. For each (vendor_id in V), resolve the effective rates per method using precedence:
     (vendor_id=v, zone_id=z) > (vendor_id=v, zone_id=NULL) > (vendor_id=NULL, zone_id=z) > (vendor_id=NULL, zone_id=NULL)
   (Platform defaults — vendor_id IS NULL — ARE applied when no vendor-specific rate exists.)
5. For each line item, compute available_method_set from its vendor's effective rates
   (filtered by weight, order amount, and vendor_holidays multi-day closures).
6. Group items where (available_method_set, zone_id) is identical.
7. For each group and each method, price_fils = SUM(effective_price_per_vendor_in_group).
8. Emit one group per unique availability set.
```

Complexity is O(V+L) where V = distinct vendors, L = line items. Not O(L × V × Z).

### 3.5 Rule evaluation ORDER BY

Deterministic order for same-method matches:

```sql
ORDER BY scope_level DESC, priority DESC, created_at DESC, id DESC
```

First matching deny wins. `id DESC` tiebreaker uses UUIDv7's time-ordering (`db-design/13-design-decisions.md`) to disambiguate identical `created_at` values from bulk seeds or transactional admin edits.

---

## 4. Frontend Behavior

### 4.1 When to call

- On checkout page load (with or without `address_id`).
- On address change → refetch with new `address_id`.
- On cart mutation → refetch, **debounced 300ms**.
- On app foreground (mobile) → refetch with `If-None-Match`; any cached quote past `expires_at` is invalidated without a roundtrip.
- Use `If-None-Match` on every call; 304 is cheap.

### 4.2 Race protection

Response includes top-level `issued_at`. Frontend treats the most-recently-issued token as authoritative; if a slower response returns an older `issued_at`, drop it.

### 4.3 Stale selection handling

When previously-selected method becomes unavailable:

- **New default is cheaper or equivalent** → auto-select + non-blocking toast.
- **New default is more expensive** → **modal** requiring explicit user acknowledgment before proceeding. Modal shows the cost delta.
- Applies to both payment method and shipping selection.

### 4.4 Surcharge preview (selection-independent surcharges)

Per §1.13, surcharge depends only on the payment method; shipping price depends only on the shipping method per group. Neither varies by the other. Frontend computes displayed total locally:

```
displayed_total
  = totals.grand_total_fils
  - surcharge(default_selection.payment_method_id)
  + surcharge(selected.payment_method_id)
  - SUM over groups of price(default shipping for group)
  + SUM over groups of price(selected shipping for group)
```

`/checkout/initiate` validates and rejects on mismatch via the §2.5 409 envelope.

### 4.5 Notice escalation

A notice with `escalate_on_select: "cod"` must be promoted to `severity: error` (hard block) if the user selects COD, regardless of its original severity.

---

## 5. Backend Schema

### 5.0 New enum types

Added in the same migration that creates the new tables:

```sql
CREATE TYPE rule_action AS ENUM ('deny');
-- 'allow' reserved for a possible future allow-list mode; not used in v1.

CREATE TYPE surcharge_type AS ENUM ('fixed', 'percentage_bps');
-- 'percentage_bps' means amount_fils carries the pre-computed amount for the
-- current cart total; the raw basis-points multiplier is not returned.
```

**Not enums:**
- `shipping_method` values (`standard`, `express`, `same_day`, `pickup`) remain the existing varchar vocabulary used by `shipping_rates.method` (`shipping-rate.entity.ts:36`, varchar(100)). New columns use `varchar(32)` (not an enum) to avoid an ALTER of the existing table.
- `payment_method` in new rule/threshold/cache tables is stored as `varchar(32)` following the **API vocabulary** (§2.0.1), **not** the existing `PaymentMethod` DB enum. This decouples the API from the current DB enum, which has values like `credit_card`/`debit_card`/`cash_on_delivery` that the API aggregates/renames (see §2.0.1). A `CHECK (method IN ('card','cod','tabby','tamara'))` constraint enforces the vocabulary.

Application code validates both vocabularies against the canonical lists.

### 5.1 New tables

```sql
-- Scope denies for card, cod, and BNPL (with CHECK restrictions below).
CREATE TABLE payment_method_rules (
  id              uuid PRIMARY KEY,
  method          varchar(32) NOT NULL,        -- API vocabulary per §2.0.1; NOT the DB PaymentMethod enum
  action          rule_action NOT NULL,        -- 'deny'

  -- Scope (at most one non-null; platform-global = all null)
  vendor_id       uuid REFERENCES vendors(id),
  product_id      uuid REFERENCES products(id),
  category_id     uuid REFERENCES categories(id),
  zone_id         uuid REFERENCES delivery_zones(id),

  -- For cross-restrictions: method × shipping_method deny (e.g. cod × express)
  shipping_method varchar(32),                  -- nullable; matches shipping_rates.method vocabulary

  -- Amount thresholds for non-BNPL methods (e.g. COD over X).
  -- NOT authoritative for BNPL — those come from payment_method_thresholds.
  min_amount_fils bigint,
  max_amount_fils bigint,

  scope_level     smallint GENERATED ALWAYS AS (
                    CASE
                      WHEN product_id  IS NOT NULL THEN 4
                      WHEN vendor_id   IS NOT NULL THEN 3
                      WHEN category_id IS NOT NULL THEN 2
                      WHEN zone_id     IS NOT NULL THEN 1
                      ELSE 0
                    END
                  ) STORED,
  priority        integer NOT NULL DEFAULT 0,
  reason_key      text NOT NULL,
  reason_params   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES users(id),
  deleted_at      timestamptz,

  CONSTRAINT method_vocabulary CHECK (method IN ('card', 'cod', 'tabby', 'tamara')),

  -- At most one FK scope set (0 = platform-global; 1 = scoped).
  CONSTRAINT at_most_one_scope CHECK (
    (CASE WHEN vendor_id   IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN product_id  IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN category_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN zone_id     IS NOT NULL THEN 1 ELSE 0 END) <= 1
  ),

  -- BNPL scope restriction: Tabby/Tamara denies allowed only at category, zone, or global.
  CONSTRAINT bnpl_scope_limit CHECK (
    method NOT IN ('tabby', 'tamara')
    OR (product_id IS NULL AND vendor_id IS NULL)
  ),

  -- BNPL amount-threshold duplication guard: thresholds live in payment_method_thresholds only.
  CONSTRAINT bnpl_no_amount_thresholds CHECK (
    method NOT IN ('tabby', 'tamara')
    OR (min_amount_fils IS NULL AND max_amount_fils IS NULL)
  )
);

CREATE INDEX idx_pmr_method            ON payment_method_rules(method) WHERE deleted_at IS NULL;
CREATE INDEX idx_pmr_vendor            ON payment_method_rules(vendor_id) WHERE vendor_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_pmr_product           ON payment_method_rules(product_id) WHERE product_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_pmr_category          ON payment_method_rules(category_id) WHERE category_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_pmr_zone              ON payment_method_rules(zone_id) WHERE zone_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_pmr_method_shipping   ON payment_method_rules(method, shipping_method) WHERE shipping_method IS NOT NULL AND deleted_at IS NULL;


-- BNPL cart-total thresholds + plans (one row per provider; platform-scope only).
CREATE TABLE payment_method_thresholds (
  provider        varchar(32) PRIMARY KEY CHECK (provider IN ('tabby', 'tamara')),
  min_amount_fils bigint NOT NULL,
  max_amount_fils bigint NOT NULL,
  plans           jsonb NOT NULL,               -- [{installments: int, interval_days: int}, ...]
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- P1 seed values (illustrative; real values from product):
-- ('tabby',  10000,  500000, '[{"installments": 4, "interval_days": 30}, {"installments": 3, "interval_days": 30}]')
-- ('tamara',  5000,  300000, '[{"installments": 3, "interval_days": 30}]')


-- Surcharges (P2).
CREATE TABLE payment_surcharges (
  id                 uuid PRIMARY KEY,
  method             varchar(32) NOT NULL CHECK (method IN ('card','cod','tabby','tamara')),
  vendor_id          uuid REFERENCES vendors(id),
  zone_id            uuid REFERENCES delivery_zones(id),
  amount_fils        bigint NOT NULL,
  surcharge_type     surcharge_type NOT NULL,
  vat_inclusive      boolean NOT NULL DEFAULT true,
  min_amount_fils    bigint,
  max_amount_fils    bigint,
  scope_level        smallint NOT NULL,
  priority           integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

-- BNPL eligibility cache (P2). user_id FKs to users(id) — consistent with rest of schema.
CREATE TABLE bnpl_eligibility_cache (
  user_id             uuid NOT NULL REFERENCES users(id),
  provider            varchar(32) NOT NULL CHECK (provider IN ('tabby','tamara')),
  amount_bucket_fils  bigint NOT NULL,       -- floor(amount / 10000) * 10000, i.e. 100 AED buckets
  eligible            boolean NOT NULL,
  checked_at          timestamptz NOT NULL,
  expires_at          timestamptz NOT NULL,
  PRIMARY KEY (user_id, provider, amount_bucket_fils)
);

-- Audit log for rule changes (compliance + support debugging).
CREATE TABLE payment_rule_audit (
  id         uuid PRIMARY KEY,
  actor_id   uuid NOT NULL REFERENCES users(id),
  rule_id    uuid NOT NULL,
  action     text NOT NULL,                  -- 'create' | 'update' | 'delete'
  before     jsonb,
  after      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Monotonic counter for cache invalidation.
CREATE TABLE rules_epoch (
  id           smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  epoch        bigint NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO rules_epoch (id, epoch) VALUES (1, 0);
```

Triggers bump `rules_epoch.epoch` on any write to:
- `payment_method_rules`
- `payment_method_thresholds`
- `payment_surcharges`
- `shipping_rates`
- `tax_rates`
- `vendor_holidays`

### 5.2 Existing schema (no changes in P1)

Verified against TypeORM entities at `backend/libs/database/src/entities/`:

- **`shipping_rates`** (`shipping-rate.entity.ts`): `vendor_id uuid nullable`, `zone_id uuid nullable`, `method varchar(100)`, `base_cost integer`, `per_kg_cost integer nullable`, `free_above integer nullable`, `estimated_days_min smallint nullable`, `estimated_days_max smallint nullable`. Monetary fields are `integer` (int32); response aggregation widens to bigint at the API layer.
- **`delivery_zones`** (`delivery-zone.entity.ts`): has `id uuid`, `name`, `boundary varchar` — **not yet PostGIS `geography`**. P1 zone resolution uses `user_addresses.area_id` → `delivery_zones.id` (see §3.4 step 1). PostGIS `ST_Contains` path deferred — see §10 O9.
- **`user_addresses`** (`user-address.entity.ts`): has `area_id uuid nullable`, `latitude numeric(10,7) nullable`, `longitude numeric(10,7) nullable`. P1 reads `area_id` as the zone key.
- **`vendor_holidays`** (`vendor-holiday.entity.ts`): `vendor_id`, `starts_at date`, `ends_at date` — calendar-day granularity only. Used for multi-day closures; NOT suitable for per-day cutoff times (that's §10 O3).
- **`warehouses`** (`warehouse.entity.ts`): `id uuid` — source for `pickup_location_id`.
- **`tax_rates`** (`tax-rate.entity.ts`): `rate numeric(5,2)` — stored as a percentage. The API's `vat_rate_bps` is `rate × 100` (e.g. `5.00` → `500` bps).
- **`users`** (`user.entity.ts`): `id uuid` — the canonical FK target for rule `created_by`, audit `actor_id`, and BNPL cache `user_id`. MaterialHub does not have a separate `customers` table; all customer-facing IDs are `users.id`.
- **`cart_items`** (`cart-item.entity.ts`): `id uuid` — matches `shipping.groups[].items[].item_ids[]`.

### 5.3 `quote_token` derivation (stateless HMAC)

```
issued_at   = current timestamp (RFC 3339, milliseconds)
mac_payload = concat(
  cart_hash,                                 -- sha256 of sorted cart line items
  address_id | "no_address",
  user_id | "guest",                          -- users.id; "customer" in prose refers to the user acting as buyer
  rules_epoch,                               -- bigint, string-encoded
  fx_snapshot.captured_at,
  issued_at
)
mac         = HMAC_SHA256(secret=QUOTE_TOKEN_KEY, payload=mac_payload)
quote_token = "q_" + base64url(mac[:16]) + "." + issued_at
```

`QUOTE_TOKEN_KEY` is rotated quarterly; during rotation both keys are accepted for 24h.

Truncation to 16 bytes (128 bits) provides collision resistance appropriate for quote validity (not a session token).

`/checkout/initiate` re-derives with current `rules_epoch` + `fx_snapshot.captured_at` + current `cart_hash`. Mismatch → 409.

**The `.issued_at` suffix is part of the public contract.** Frontend parses `token.split('.')[1]` for race-drop logic (§4.2). Stability guarantee: the format will not change within `schema_version = 1`.

### 5.4 ETag strategy

See §8 for the canonical cache key definition. §5.3 HMAC and §8 ETag serve different purposes (quote validity vs. network cache) and therefore have different inputs — this is intentional.

---

## 6. Phasing (Revised per review)

### Phase 1 — Unblock frontend this sprint (~10 pts)

- `GET /checkout/quote` endpoint with full response envelope (including §2.0 ID schema).
- `GET /checkout/payment-instruments` endpoint (§2.7).
- Platform-default rules as **TypeScript constants** in `apps/order-service/src/checkout/defaults.ts` (no new config table in P1).
- `payment_method_thresholds` table + seeds for Tabby/Tamara (including `plans` jsonb with at least one plan each).
- `rules_epoch` table + trigger on `payment_method_thresholds` + `shipping_rates`.
- Delivery-group algorithm implementing §3.4 (the algorithm ships in P1 even though it typically yields a single group since only global rules exist).
- Stateless HMAC `quote_token` with `.issued_at` suffix.
- ETag with `rules_epoch`.
- `/checkout/initiate` validates `quote_token`; 409 on stale (§2.5 envelope).
- Seed `reason_keys.json` registry in `libs/dto/reason-keys.json` with the keys used in the contract.

Explicitly deferred from P1: `payment_method_rules`, `payment_surcharges`, `bnpl_eligibility_cache`, `payment_rule_audit`, admin panel CRUD.

### Phase 2 — Rules engine + surcharges (~1 sprint)

- `payment_method_rules` with vendor, category, zone scopes + the CHECK constraints.
- `payment_surcharges` + VAT-aware computation.
- `bnpl_eligibility_cache` + async BullMQ refresh + near-boundary bypass.
- Admin panel CRUD + `payment_rule_audit`.
- Delivery-groups become *meaningful* (variation across vendors).
- Add `rules_epoch` triggers on `payment_method_rules`, `payment_surcharges`, `tax_rates`, `vendor_holidays`.

### Phase 3 — Advanced rules (~1–2 sprints)

- Product-scope rules (flash sale payment overrides).
- `next_available_at` / `cutoff_at` shipping window model (Ramadan, Friday freeze, prayer time) — requires new columns on shipping rates or a new `shipping_windows` table; §10 O3 drives the shape.
- Full reason-key i18n coverage (AR, EN, HI, UR, ML).
- Open-item resolutions from §10 (COD fraud gating, multi-address, B2B, customer tier, enum convergence O8).

### Phase 2 bundle with infra

- `delivery_zones.boundary` PostGIS migration (§10 O9) should land with the Phase 2 rule tables so that geo-resolution can replace the `area_id` fallback path for new-address flows.

**No breaking changes to `POST /checkout/initiate`.** Adds optional `quote_token` field; validates when present.

---

## 7. Edge Cases

| # | Case | Resolution |
|---|---|---|
| E1 | 0 eligible payment methods | `blocking_error.code = "no_eligible_payment_methods"`. Frontend shows blocking modal. |
| E2 | Coupon drops total below Tabby min | Refetch triggers new quote; Tabby becomes unavailable; stale-selection rule applies. |
| E3 | Selected method becomes ineligible mid-session | `quote_token` invalidates at `/initiate` → 409 with fresh quote attached (§2.5). |
| E4 | Flash-sale item requires card-only (P3) | Product-scope rule; BNPL always excluded since `bnpl_scope_limit` CHECK forbids product-scope denies — use card+cod denies only. |
| E5 | Stock changes between quote and place-order | `/initiate` resolves inside `SELECT FOR UPDATE`; returns §2.5 envelope with `code: "items_out_of_stock"`, `affected_item_ids` populated. `/quote` is advisory only. |
| E6 | Multi-currency | Surcharges stored in AED fils; converted at quote time using `fx_snapshot.rate`. `fx_snapshot.captured_at` is bound into `quote_token` — FX rollover triggers 409. |
| E7 | Partial stock across delivery groups | `/initiate` fails the whole order atomically; frontend re-quotes. Split-group partial commits not supported in v1. |
| E8 | Address geocode ambiguity / missing `area_id` | Zone resolution is pessimistic — `user_addresses.area_id IS NULL` maps to platform-default rates (`shipping_rates` rows with `zone_id IS NULL`); same-day disabled with `shipping.zone.ambiguous` reason. PostGIS fallback deferred to §10 O9. |
| E9 | Simultaneous quote requests | Both can legitimately succeed with different `quote_token`s if `rules_epoch` bumped in between. `/initiate` accepts whichever token was valid at issue. No lock. |
| E10 | Customer tier transitions mid-session | Deferred to P3 (§10 O7). Tier concept not in v1 schema. |

---

## 8. ETag Semantics (Canonical)

**Cache key inputs:** `cart_hash`, `address_id`, `user_id`, `rules_epoch`, `fx_epoch` (date-rounded to the day — FX rates roll over daily per platform policy).

```
etag = sha256(
  cart_hash || address_id || user_id || rules_epoch || fx_epoch
)
```

**TTL:** 60 s client-side. Server-side sends `Cache-Control: max-age=60, private`. `private` disables CDN/shared-cache storage — intentional, since the response contains per-customer data.

**`expires_at` vs ETag.** Independent.
- `expires_at` = `issued_at + 300s` (P1; config-tunable). It is the `quote_token` validity horizon at `/initiate`.
- ETag is the network-cache lifetime.
- A 304 body past `expires_at` means the client should refetch without `If-None-Match` before calling `/initiate`.

`customer_tier` is deliberately NOT in the ETag key — tier is not modeled in v1 schema (see §10 O7).

The field is named `user_id` (not `customer_id`) to align with the existing schema convention; `users.id` is the buyer identity throughout MaterialHub.

---

## 9. Explicitly Out of Scope (v1)

Documented as known limitations. Promote in §10 if any become launch blockers.

- **Multi-address shipping** (gift orders, one cart → multiple destinations).
- **B2B / corporate purchases** (PO number, TRN on invoice, separate billing address).
- **Gift wrap / gift messages** with surcharge.
- **Wallet / store credit / gift card** partial tender.
- **Split shipping per group to different addresses.**
- **Free-zone VAT nuances** (JAFZA, DMCC, DAFZA qualifying 0% VAT).
- **COD fraud gating** (per-customer cap, RTO blacklist, new-account cooldown) — open item O2.
- **Customer tier / loyalty** as a rule dimension — open item O7.

---

## 10. Open Items (require product/legal decision)

**O1 — Tabby/Tamara merchant-category restrictions.**
Current rule: BNPL is cart-total-only. Review flagged: Tabby/Tamara UAE merchant agreements prohibit certain categories (regulated goods, gift cards/top-ups, digital wallets, some jewellery tiers). A disallowed SKU in a BNPL order can trigger chargeback + merchant-account suspension. Schema supports category-scope deny without change (§5.1 `bnpl_scope_limit`).
**Needed:** confirm whether MaterialHub's catalog includes any Tabby/Tamara-restricted categories. If yes, Phase 2 seeds `payment_method_rules` with category denies.
**Owner:** product + legal.

**O2 — COD fraud gating scope.**
UAE COD refusal/RTO rates are 15–25%. Real marketplaces gate COD by lifetime cap until N successful deliveries, RTO blacklist, new-account cooldown, phone-OTP gate. Current rule only covers amount threshold.
**Needed:** decide v1 scope. Recommended default: defer to Phase 3.
**Owner:** product + finance.

**O3 — Ramadan / Eid / Friday / prayer-time shipping windows.**
Schema fields `cutoff_at` and `next_available_at` present in v1 contract; population requires rule data.
**Needed:** confirm which time windows apply (vendor-configurable vs platform-global). Recommended: platform-global Friday 11:30–13:30 freeze in Phase 1 (hardcoded); vendor-configurable in Phase 3.
**Owner:** operations + product.

**O4 — Reason-key vocabulary.**
Backend publishes `reason_keys.json` registry committed to repo (seeded in P1 with at least the keys used in this doc). Frontend adds translations to AR/EN/HI/UR/ML.
**Owner:** tech leads (backend + frontend).

**O5 — BNPL eligibility cache TTL.**
Options: 5 min conservative (higher provider API call volume), 15 min aggressive (better latency, stale-eligibility risk).
**Owner:** product.

**O6 — Admin panel rule ownership.**
`payment_method_rules` is admin-mutable. Super-admin-only, or vendor-scoped rules editable by vendors?
**Needed:** decide before Phase 2 admin panel build.
**Owner:** product.

**O7 — Customer tier / loyalty dimension.**
Not modeled in v1 schema. If tier affects free-shipping thresholds or BNPL limits, requires (a) a `users.tier` enum + column, (b) `user_tier` in `rules_epoch` invalidation, (c) addition to ETag key, (d) inclusion in `quote_token` HMAC inputs.
**Needed:** confirm whether tier is a real requirement for v1 or can wait for P3.
**Owner:** product + growth.

**O8 — DB `PaymentMethod` enum alignment.**
The existing DB enum (`enums/payment.enums.ts`) has `credit_card`, `debit_card`, `paypal`, `stripe`, `bank_transfer`, `cash_on_delivery`, `wallet`, `crypto`, `tabby`, `tamara`. The API uses a decoupled vocabulary (§2.0.1: `card`, `cod`, `tabby`, `tamara`) to avoid ALTER TYPE migrations in P1. Long-term this divergence is tech debt.
**Needed:** decide whether to (a) converge: add `card`/`cod` to the DB enum and deprecate `credit_card`/`debit_card`/`cash_on_delivery`, or (b) keep the decoupling permanently with a translation layer at `/checkout/initiate`. Decision is safe to defer beyond P2 but should land before additional payment surfaces are built (refunds, disputes) that would compound the divergence.
**Owner:** backend tech lead.

**O9 — `delivery_zones.boundary` PostGIS migration.**
The column is currently `varchar` with no PostGIS type and no GiST index, so `ST_Contains` lookups are not executable. P1 uses `user_addresses.area_id` as the zone key (safe fallback; requires addresses to have `area_id` populated). Without PostGIS, geo-derived zone resolution (new addresses lacking `area_id`, map-picker flows) will pessimistically default to platform-global shipping rates.
**Needed:** schedule `ALTER COLUMN boundary TYPE geography(POLYGON, 4326) USING ST_GeomFromText(boundary)::geography`, add GiST index, confirm PostGIS extension is enabled in all environments. Recommend P2 bundle with the rule tables; do not block P1 on it.
**Owner:** platform / infra + backend.

---

## 11. Summary Table

| Need | Field / Section | Phase |
|---|---|---|
| `GET /checkout/quote` endpoint | §2 | P1 |
| `GET /checkout/payment-instruments` | §2.7 | P1 |
| Totals block with VAT | §2.2 `totals` | P1 |
| Delivery-groups (algorithm) | §2.2 `shipping.groups`, §3.4 | P1 |
| `quote_token` (stateless HMAC) | §5.3 | P1 |
| `rules_epoch` counter + seed triggers | §5.1, §5.4 | P1 |
| ETag with `rules_epoch` | §8 | P1 |
| Cost-aware auto-switch | §4.3 | P1 |
| Unified envelope + typed params | §2.6 | P1 |
| `reason_keys.json` registry | §10 O4 | P1 |
| Platform-default rules (TS constants) | §6 P1 | P1 |
| `payment_method_rules` table | §5.1 | P2 |
| `payment_surcharges` table | §5.1 | P2 |
| BNPL eligibility cache | §5.1 | P2 |
| Admin CRUD + audit log | §5.1, §10 O6 | P2 |
| Ramadan / cutoff windows | §2.2 `cutoff_at`, §10 O3 | P3 |
| COD fraud gating | §10 O2 | P3 |
| Customer tier dimension | §10 O7 | P3 |

---

## 12. Worked Example

Cart: 3 items, 2 vendors. Delivering to Dubai.

- Vendor A (Dubai Marina warehouse): items i1 (150 AED), i2 (200 AED). Offers Standard + Express + Same Day.
- Vendor B (Sharjah warehouse): item i3 (450 AED). Offers Standard + Express only (no Same Day from Sharjah → Dubai).
- Cart total: 800 AED = 80000 fils.

Zone resolution: address resolves to `zone_dubai_central`.

`shipping_rates` fetched: vendor A rates for zone, vendor B rates for zone, platform-default fallback.

Effective rates (per vendor, summed at emit):
- Vendor A: Standard 0 fils, Express 2500 fils, Same Day 5000 fils.
- Vendor B: Standard 0 fils, Express 3000 fils, (no Same Day).

Grouping: availability sets differ → 2 groups.
- Group g1 (A only): `{standard, express, same_day}` ×1 vendor.
- Group g2 (B only): `{standard, express}` ×1 vendor.

BNPL: cart total 80000 fils. Tabby range [10000, 500000]. Within range, not near boundary (boundary: ±5% of 500000 = ±25000, so 475000-525000; 80000 is far from boundary). Cache lookup for `(customer, tabby, amount_bucket=80000)`. Hit → eligible.

Tamara range [5000, 300000]. 80000 is within range.

COD: platform default 5000 AED cap; cart at 8000 AED → COD over threshold. `payment.cod.over_threshold` with `params.limit = { value: 500000, type: "money", currency: "AED" }`.

Card: available.

Compatibility: COD × [standard, pickup] only (platform-default cross-restriction).

Response (abbreviated):

```jsonc
{
  "schema_version": 1,
  "quote_token": "q_...",
  "issued_at": "2026-04-17T12:00:00Z",
  "expires_at": "2026-04-17T12:05:00Z",
  "currency": "AED",
  "totals": {
    "subtotal_fils": 80000, "vat_fils": 4000, "vat_rate_bps": 500,
    "shipping_fils": 0, "surcharge_fils": 0, "discount_fils": 0,
    "grand_total_fils": 84000,
    "default_selection": {
      "payment_method_id": "card",
      "shipping_by_group": { "g1": "standard", "g2": "standard" }
    }
  },
  "payment_methods": [
    { "id": "card", "available": true, "surcharge_fils": 0, "surcharge_type": "fixed" },
    { "id": "cod", "available": false, "surcharge_fils": 1000, "surcharge_type": "fixed",
      "reason_key": "payment.cod.over_threshold",
      "reason_params": { "limit": { "value": 500000, "type": "money", "currency": "AED" } } },
    { "id": "tabby", "available": true, "min_amount_fils": 10000, "max_amount_fils": 500000,
      "plans": [{"installments": 4, "interval_days": 30}] },
    { "id": "tamara", "available": true, "min_amount_fils": 5000, "max_amount_fils": 300000,
      "plans": [{"installments": 3, "interval_days": 30}] }
  ],
  "shipping": {
    "groups": [
      { "group_id": "g1", "items": [{"vendor_id": "v_a", "item_ids": ["i1","i2"]}],
        "methods": [
          { "id": "standard", "available": true, "price_fils": 0, "estimated_days": {"min":3,"max":5}, "free_threshold_fils": 20000 },
          { "id": "express",  "available": true, "price_fils": 2500, "estimated_days": {"min":1,"max":2} },
          { "id": "same_day", "available": true, "price_fils": 5000, "estimated_days": {"min":0,"max":0} }
        ], "selected": "standard" },
      { "group_id": "g2", "items": [{"vendor_id": "v_b", "item_ids": ["i3"]}],
        "methods": [
          { "id": "standard", "available": true, "price_fils": 0, "estimated_days": {"min":3,"max":5} },
          { "id": "express",  "available": true, "price_fils": 3000, "estimated_days": {"min":1,"max":2} }
        ], "selected": "standard" }
    ]
  },
  "compatibility": {
    "card":   ["standard","express","same_day","pickup"],
    "cod":    ["standard","pickup"],
    "tabby":  ["standard","express","same_day","pickup"],
    "tamara": ["standard","express","same_day","pickup"]
  },
  "notices": []
}
```

---

## 13. Original Questions (reference)

Preserved for traceability. Resolutions:

- **Q1.1** → §1.3, §3.1 (product > vendor > category > zone > platform, deny wins).
- **Q1.2** → §3.1 amount thresholds via rule scope; multi-vendor Tabby conflict moot since BNPL is cart-total (with category-deny option in §10 O1).
- **Q1.3** → §3.2 cart-total default + provider eligibility + bucket cache; category-deny open item O1.
- **Q1.4** → §3.1 zone-scope rules.
- **Q2.x surcharges** → §2.2 `surcharge_fils` + `surcharge_type: fixed | percentage_bps`; VAT-inclusive flag on rule; inline preview via §4.4.
- **Q3.1–Q3.5** → existing `shipping_rates` + delivery-groups (§3.4).
- **Q5.1–Q5.5** → §4 (debounce, ETag, 4.3 modal-on-expensive, 4.4 local preview, delivery-groups replace per-vendor UX).
- **Q7.1–Q7.3** → §5.1 new tables; §5.2 existing unchanged; §10 O6 admin ownership.
