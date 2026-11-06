// API payment vocabulary (spec §2.0.1 — NOT the DB PaymentMethod enum).
// net_terms: "Pay on invoice" for approved business accounts (workstream 3).
export const API_PAYMENT_METHODS = ["card", "cod", "tabby", "tamara", "net_terms"] as const;
export type ApiPaymentMethod = (typeof API_PAYMENT_METHODS)[number];

// API shipping method vocabulary (matches shipping_rates.method).
export const API_SHIPPING_METHODS = ["standard", "express", "same_day", "pickup"] as const;
export type ApiShippingMethod = (typeof API_SHIPPING_METHODS)[number];

// Platform-default payment × shipping compatibility (spec §2.2, §12).
// COD is restricted to {standard, pickup}; all other methods accept any shipping.
export const DEFAULT_COMPATIBILITY: Record<ApiPaymentMethod, readonly ApiShippingMethod[]> = {
  card: ["standard", "express", "same_day", "pickup"],
  cod: ["standard", "pickup"],
  tabby: ["standard", "express", "same_day", "pickup"],
  tamara: ["standard", "express", "same_day", "pickup"],
  net_terms: ["standard", "express", "same_day", "pickup"],
};

// Quote token + ETag windows.
export const QUOTE_EXPIRES_SECONDS = 300;
export const QUOTE_ETAG_MAX_AGE_SECONDS = 60;
export const PAYMENT_INSTRUMENTS_MAX_AGE_SECONDS = 300;

// Rate limit for /checkout/quote (spec §2.1).
export const QUOTE_RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 };

// UAE VAT default (bps). TaxService returns percent; ×100 → bps.
export const DEFAULT_VAT_RATE_BPS = 500;

// Card brand → funding mapping (best-effort heuristic; spec §2.7).
// TODO §10 O5: replace with PSP-sourced funding data when saved_cards table lands.
export const CARD_BRAND_FUNDING: Record<string, "credit" | "debit" | "prepaid" | "unknown"> = {
  visa: "unknown",
  mastercard: "unknown",
  amex: "credit",
  mada: "debit",
};

// FX snapshot — P1 only supports AED.
// captured_at resolves to the current UTC date at 00:00; this doubles as fx_epoch input (spec §8).
export function getFxSnapshot(): { base: "AED"; rate: 1; captured_at: string } {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return { base: "AED", rate: 1, captured_at: d.toISOString() };
}
