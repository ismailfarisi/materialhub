# Prompt: Integrate Checkout Quote API into Next.js Checkout Flow

## Context

You are working on **MaterialHub**, a multi-vendor UAE ecommerce marketplace. The backend has a new Dynamic Checkout Options API that the frontend checkout flow needs to consume. The full design spec is at `docs/frontend-specs/2026-04-18-checkout-quote-api-integration.md`.

## Repo Layout

- Frontend app: `apps/web/` (Next.js 14, App Router, TypeScript strict)
- State: Zustand (`apps/web/src/stores/checkout.ts`)
- API client: Axios instance at `apps/web/src/lib/api.ts`
- Queries: React Query (`@tanstack/react-query`) at `apps/web/src/lib/queries/`
- Components: `apps/web/src/components/checkout/`
- i18n: `next-intl`, messages at `apps/web/messages/en.json`
- Money: all API values are **fils** (integer); 100 fils = 1 AED

## Current Problem

The checkout page calculates totals client-side with hardcoded values:
- VAT hardcoded at 5% (`checkout-page.tsx:66`)
- Shipping prices hardcoded in `stores/checkout.ts:11-15`
- Tabby/Tamara/COD always shown regardless of availability
- No `quote_token` passed to `/checkout/initiate`
- No saved-card list

## Task

Integrate two new API endpoints into the checkout flow and fix all issues above.

### New Endpoints

**GET /checkout/quote?address_id=<uuid>**
- Returns quote with authoritative totals, available payment methods, shipping groups
- Response type: `CheckoutQuote` (see spec)
- Cached with ETag; send `If-None-Match` on repeat calls
- Token expires in 5 minutes

**GET /checkout/payment-instruments**
- Returns saved cards for the user
- Response type: `PaymentInstrumentsResponse` (see spec)

### Files to Create

1. `apps/web/src/lib/queries/checkout-quote.ts`
   - `useCheckoutQuote(addressId: string | null)` — React Query `useQuery`, `staleTime: 55_000`, sends ETag header
   - `usePaymentInstruments()` — React Query `useQuery`, `staleTime: 280_000`

### Files to Modify

2. `apps/web/src/stores/checkout.ts`
   - Remove `SHIPPING_METHODS` constant and `shippingMethod` state
   - Add `quoteToken`, `quoteData: CheckoutQuote | null`, `quoteExpiresAt`, `selectedShippingByGroup: Record<string, string>`
   - Add `setQuote(quote: CheckoutQuote)`, `setSelectedShipping(groupId, methodId)`, `isQuoteExpired(): boolean`

3. `apps/web/src/components/checkout/checkout-page.tsx`
   - Remove client-side total calculation (lines 60–67)
   - Call `useCheckoutQuote(selectedAddressId)` and store result via `setQuote()`
   - Pass `quote_token` + `address_id` to `/checkout/initiate`
   - Handle HTTP 409 response: call `setQuote(response.fresh_quote)`, show error message, do NOT auto-retry

4. `apps/web/src/components/checkout/payment-section.tsx`
   - Render payment methods from `quote.payment_methods` array
   - Show greyed tab + translated `reason_key` when `available === false`
   - Show BNPL instalment breakdown from `plans[]`
   - Show COD surcharge when `surcharge_fils > 0`
   - Render saved cards from `usePaymentInstruments()` above new-card input

5. `apps/web/src/components/checkout/shipping-section.tsx`
   - Replace hardcoded methods with `quote.shipping.groups[]`
   - When `requires_address: true`, show "Add an address to see delivery options"
   - Show free shipping banner when `free_threshold_fils` is set
   - Per-method price is always 0 — do not show price per method (platform charges one flat fee)

6. `apps/web/src/components/checkout/order-summary-sidebar.tsx`
   - Change props: remove individual total props, add `quote: CheckoutQuote | null`
   - Show skeleton when `quote` is null
   - Render all rows from `quote.totals.*` (convert fils to AED via helper)

7. `apps/web/src/components/checkout/mobile-order-bar.tsx`
   - Same prop change as sidebar

8. `apps/web/src/lib/money.ts` (new helper)
   - `filsToAed(fils: number): string` → `(fils / 100).toFixed(2)`
   - `formatAed(fils: number): string` → `"X.XX AED"`

9. `apps/web/messages/en.json`
   - Add i18n keys listed in spec section 7

## Key Constraints

- Do NOT change `coupon-section.tsx`, `delivery-section.tsx`, `address-drawer.tsx`
- Do NOT change the payment processing logic after `initiate` (Stripe confirm, Tabby/Tamara redirect)
- Do NOT change `cart.ts` queries
- The `quote_token` must be passed to initiate but the backend still works without it (graceful degradation)
- When quote is loading, show skeleton — never show NaN or undefined in the UI
- 409 from initiate must NOT crash the page; it must update the quote display gracefully

## Acceptance Criteria

All items in spec section 10 must pass before marking complete.
