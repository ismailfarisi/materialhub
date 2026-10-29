# Frontend Spec: Checkout Quote API Integration (P1)

**Branch:** `feat/checkout-dynamic-options-p1`
**API doc:** `docs/backend-requests/2026-04-17-dynamic-checkout-options-api.md`
**Date:** 2026-04-18

---

## 1. What Changed on the Backend

Two new endpoints are live:

| Endpoint | Auth | Cache |
|---|---|---|
| `GET /checkout/quote?address_id=<uuid>` | Bearer | ETag + `Cache-Control: private, max-age=60` |
| `GET /checkout/payment-instruments` | Bearer | `Cache-Control: private, max-age=300` |

`POST /checkout/initiate` now accepts `quote_token` + `address_id` and may return **409** if the token is stale (cart changed, rules changed, or FX expired).

---

## 2. Problems with the Current Frontend

| Issue | Location | Impact |
|---|---|---|
| Totals calculated client-side (hardcoded 5% VAT) | `checkout-page.tsx:66` | Wrong if VAT rate changes |
| Shipping prices hardcoded in store | `stores/checkout.ts:11-15` | Ignores live rates and free threshold |
| Tabby/Tamara always shown | `payment-section.tsx` | Shows unavailable methods to user |
| No `quote_token` sent to `/initiate` | `checkout-page.tsx:91` | Backend can't validate quote integrity |
| No saved-card list | `payment-section.tsx` | Can't show saved cards |
| COD always available | `payment-section.tsx` | COD is blocked above 5000 AED |

---

## 3. API Response Shapes

### `GET /checkout/quote`

```ts
interface CheckoutQuote {
  schema_version: 1;
  quote_token: string;           // starts with "q_", pass to /initiate
  issued_at: string;             // ISO 8601
  expires_at: string;            // 5 min window
  currency: "AED";
  requires_address: boolean;     // true when called without address_id
  fx_snapshot: { base: "AED"; rate: 1; captured_at: string };
  totals: {
    subtotal_fils: number;
    vat_fils: number;
    vat_rate_bps: number;        // 500 = 5%
    shipping_fils: number;       // platform flat fee (0 if free)
    surcharge_fils: number;      // COD surcharge if applicable
    discount_fils: number;
    grand_total_fils: number;
    default_selection: {
      payment_method_id: string; // "card" | "cod" | "tabby" | "tamara"
      shipping_by_group: Record<string, string>; // groupId → methodId
    };
  };
  payment_methods: PaymentMethod[];
  shipping: { groups: ShippingGroup[] } | null;  // null when requires_address
  compatibility: Record<string, string[]>;        // paymentId → allowed shippingIds
  notices: Envelope[];
  blocking_error?: Envelope;
}

interface PaymentMethod {
  id: "card" | "cod" | "tabby" | "tamara";
  available: boolean;
  surcharge_fils: number;
  surcharge_type: "fixed" | "percentage_bps";
  min_amount_fils?: number;
  max_amount_fils?: number;
  plans?: { installments: number; interval_days: number }[];
  reason_key: string | null;     // i18n key shown when available=false
  reason_params?: Record<string, unknown>;
}

interface ShippingGroup {
  group_id: string;
  label_key?: string;
  items: { vendor_id: string; item_ids: string[] }[];
  methods: ShippingMethod[];
  selected: string;              // default selected method id
}

interface ShippingMethod {
  id: "standard" | "express" | "same_day" | "pickup";
  available: boolean;
  price_fils: number;            // always 0 (platform flat fee model)
  estimated_days: { min: number; max: number };
  free_threshold_fils: number | null;  // show "Free above X AED"
  cutoff_at: string | null;
  next_available_at: string | null;
  reason_key: string | null;
}
```

### `GET /checkout/payment-instruments`

```ts
interface PaymentInstrumentsResponse {
  schema_version: 1;
  instruments: SavedCard[];
}

interface SavedCard {
  id: string;
  type: "card";
  brand: string;          // "visa" | "mastercard" | "amex" | "mada"
  last4: string;
  exp_month: number;
  exp_year: number;
  is_expired: boolean;
  is_default: boolean;
  requires_3ds: boolean;
  network_token_available: boolean;
  funding: "credit" | "debit" | "prepaid" | "unknown";
}
```

### `POST /checkout/initiate` — updated body

```ts
{
  quote_token?: string;    // from quote response
  address_id?: string;
  shippingAddress: object; // still required for legacy compatibility
  shippingMethod?: string;
  customerNotes?: string;
}
```

**409 Stale Quote response:**

```ts
{
  status: 409,
  error: {
    code: "QUOTE_STALE",
    message: string;
    stale_reason: "cart_changed" | "rules_changed" | "fx_expired";
  },
  fresh_quote: CheckoutQuote;   // ready to display immediately
}
```

---

## 4. Files to Change

### 4a. New file: `apps/web/src/lib/queries/checkout-quote.ts`

Add two new query hooks:

```ts
// useCheckoutQuote — fetches and caches the quote; refetches on address change
export function useCheckoutQuote(addressId: string | null)
// usePaymentInstruments — fetches saved cards
export function usePaymentInstruments()
```

Key behaviours:
- Send `If-None-Match` header with stored ETag; accept 304 as cache hit
- `staleTime: 55_000` (55s — just under the 60s server cache window)
- `enabled: !!userId` (don't fetch for guests)
- Store last ETag in a module-level ref, not in React state

### 4b. Update `apps/web/src/stores/checkout.ts`

**Remove:**
- `SHIPPING_METHODS` constant (hardcoded prices)
- `ShippingMethod` interface
- `shippingMethod: ShippingMethod` state field

**Add:**
```ts
quoteToken: string | null;
quoteData: CheckoutQuote | null;
quoteExpiresAt: string | null;
selectedShippingByGroup: Record<string, string>; // groupId → methodId
setQuote: (quote: CheckoutQuote) => void;
setSelectedShipping: (groupId: string, methodId: string) => void;
isQuoteExpired: () => boolean;
```

**Keep:** `paymentMethod` selection (user preference), `selectedAddressId`, coupon state, UI flags.

### 4c. Update `apps/web/src/components/checkout/checkout-page.tsx`

**Remove:**
- Client-side VAT, shipping, total calculations (lines 60–67)
- `shippingMethod` from store usage

**Add:**
- Call `useCheckoutQuote(selectedAddressId)` on mount and on address change
- On quote load, call `store.setQuote(quote)` and auto-select `default_selection`
- Pass `quote_token` + `address_id` to `initiate.mutateAsync()`
- Handle 409: display a toast "Your cart was updated — please review", update quote with `fresh_quote`, **do not** auto-retry initiate
- Use `quote.totals.*` for all displayed values

**Updated `handlePlaceOrder`:**
```ts
const order = await initiate.mutateAsync({
  quote_token: quoteToken ?? undefined,
  address_id: selectedAddressId ?? undefined,
  shippingAddress: selectedAddress,
  shippingMethod: Object.values(selectedShippingByGroup)[0] ?? "standard",
});

// Handle 409 inline
if (order?.status === 409) {
  store.setQuote(order.fresh_quote);
  setError(t("quoteRefreshed")); // "Prices updated — please review and place order again"
  return;
}
```

### 4d. Update `apps/web/src/components/checkout/payment-section.tsx`

**Remove:** hardcoded display of all 4 payment methods unconditionally.

**Add:**
- Read `paymentMethods` from `quote.payment_methods`
- For each method: render tab only if `available === true` OR render it greyed-out with `reason_key` translated
- For Tabby/Tamara: show `plans[0].installments` (e.g. "4 payments of X AED")
- Surcharge: if `surcharge_fils > 0`, show inline "includes X AED COD fee"
- COD: show `"payment.cod.over_threshold"` translated reason when unavailable
- Saved cards: render card picker from `usePaymentInstruments()` above the new-card form; skip if no instruments

### 4e. Update `apps/web/src/components/checkout/shipping-section.tsx`

**Remove:** hardcoded `SHIPPING_METHODS` rendering.

**Add:**
- If `quote.requires_address`: show "Add an address to see delivery options" placeholder
- For each `shipping.groups[]`:
  - If only 1 group: no group label shown
  - If multiple groups: show group vendor names
  - List each `group.methods[]` as a radio option
  - `price_fils` is always 0 per method (platform flat fee) — **do not show per-method price**
  - Show estimated days: `min–max days`
  - Show unavailable methods greyed out with `reason_key` translated
  - If `free_threshold_fils` is set on any method, show a banner: **"Free shipping on orders above 150 AED"**

### 4f. Update `apps/web/src/components/checkout/order-summary-sidebar.tsx`

**Remove:** props `subtotal`, `shipping`, `discount`, `vat`, `total` (calculated externally).

**Add:** single `quote: CheckoutQuote | null` prop. When null, show skeleton.

Render from `quote.totals`:
- Subtotal: `subtotal_fils / 100` AED
- Shipping: `shipping_fils / 100` AED (show "Free" if 0 and has items)
- Discount: `discount_fils / 100` AED (hide row if 0)
- VAT (5%): `vat_fils / 100` AED
- Surcharge: `surcharge_fils / 100` AED (hide if 0, label by payment method)
- **Grand total:** `grand_total_fils / 100` AED

Also update `MobileOrderBar` with same approach.

---

## 5. ETag Handling

The quote endpoint returns `ETag` and `Cache-Control: private, max-age=60`.

Simple implementation — store last ETag per address in a module-level map:

```ts
const etagCache = new Map<string, string>(); // addressId → etag

// On fetch:
const headers: Record<string, string> = {};
const cached = etagCache.get(addressId ?? "");
if (cached) headers["If-None-Match"] = cached;

const res = await api.get("/checkout/quote", { headers, params: { address_id: addressId } });

if (res.status === 304) return previousData; // React Query handles this via staleTime
etagCache.set(addressId ?? "", res.headers.etag ?? "");
return res.data.data;
```

---

## 6. UX States to Handle

| State | UI |
|---|---|
| `requires_address: true` | Shipping section shows address prompt; totals show subtotal + VAT only, no shipping row |
| Quote loading | Skeleton in totals sidebar and payment section |
| Quote expired (`isQuoteExpired()`) | Show "Refreshing prices…" banner, re-fetch |
| 409 on initiate | Toast: "Prices updated — review and confirm" + refresh quote display |
| `blocking_error` present | Show red banner above Place Order button; disable button |
| Payment method `available: false` | Grey out tab, show `reason_key` translated tooltip/label |
| Free shipping met | Show "🎉 You qualify for free shipping!" in shipping section |

---

## 7. i18n Keys Needed

Add to `messages/en.json` under `checkout`:

```json
{
  "quoteRefreshed": "Your cart or prices were updated. Please review and place your order again.",
  "quoteExpired": "Your quote has expired. Refreshing prices…",
  "freeShippingAbove": "Free shipping on orders above {amount} AED",
  "freeShippingQualified": "You qualify for free shipping!",
  "shippingIncluded": "Shipping included",
  "payment.cod.over_threshold": "Cash on delivery is not available for orders above 5,000 AED",
  "payment.cod.surcharge": "Includes {amount} AED COD fee",
  "payment.tabby.unavailable_min": "Tabby requires a minimum order of {amount} AED",
  "payment.tabby.unavailable_max": "Tabby is not available for orders above {amount} AED",
  "payment.tamara.unavailable_min": "Tamara requires a minimum order of {amount} AED",
  "bnplPlan": "{installments} payments of {amount} AED"
}
```

---

## 8. fils → AED Helper

All money values from the API are in **fils** (integer, 100 fils = 1 AED).

```ts
// lib/money.ts
export function filsToAed(fils: number): string {
  return (fils / 100).toFixed(2);
}
export function formatAed(fils: number): string {
  return `${filsToAed(fils)} AED`;
}
```

---

## 9. What NOT to Change

- `coupon-section.tsx` — coupon flow unchanged (still uses `/checkout/validate-coupon`)
- `delivery-section.tsx` — address selection unchanged; just pass selected `address_id` to quote fetch
- `address-drawer.tsx` — no changes
- `cart.ts` queries — no changes
- Payment processing after initiate (Stripe, Tabby redirect, Tamara redirect) — unchanged

---

## 10. Acceptance Criteria

- [ ] Quote is fetched on checkout page mount; totals sidebar shows API values, not client-calculated
- [ ] Payment methods hidden/greyed based on `available` flag
- [ ] Tabby and Tamara show instalment count from `plans`
- [ ] COD shows surcharge when applicable
- [ ] Shipping section shows method options from quote groups; no hardcoded prices
- [ ] Free shipping banner appears when `free_threshold_fils` is set
- [ ] `quote_token` is passed to `/checkout/initiate`
- [ ] 409 response shows refresh message and updates UI without crashing
- [ ] Saved cards list rendered above new-card form (empty state = skip)
- [ ] Totals sidebar accepts `quote` prop and renders skeleton while loading
- [ ] No client-side VAT calculation remains in `checkout-page.tsx`
