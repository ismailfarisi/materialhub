import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

// ── API types ──────────────────────────────────────────────────────────────

export interface CheckoutQuotePaymentMethod {
  id: "card" | "cod" | "tabby" | "tamara";
  available: boolean;
  surcharge_fils: number;
  surcharge_type: "fixed" | "percentage_bps";
  min_amount_fils?: number;
  max_amount_fils?: number;
  plans?: { installments: number; interval_days: number }[];
  reason_key: string | null;
  reason_params?: Record<string, unknown>;
}

export interface QuoteShippingMethod {
  id: "standard" | "express" | "same_day" | "pickup";
  available: boolean;
  price_fils: number;
  estimated_days: { min: number; max: number };
  free_threshold_fils: number | null;
  cutoff_at: string | null;
  next_available_at: string | null;
  reason_key: string | null;
}

export interface ShippingGroup {
  group_id: string;
  label_key?: string;
  items: { vendor_id: string; item_ids: string[] }[];
  methods: QuoteShippingMethod[];
  selected: string;
}

export interface CheckoutQuote {
  schema_version: 1;
  quote_token: string;
  issued_at: string;
  expires_at: string;
  currency: "AED";
  requires_address: boolean;
  fx_snapshot: { base: "AED"; rate: 1; captured_at: string };
  totals: {
    subtotal_fils: number;
    vat_fils: number;
    vat_rate_bps: number;
    shipping_fils: number;
    surcharge_fils: number;
    discount_fils: number;
    coupon_code?: string | null;
    grand_total_fils: number;
    default_selection: {
      payment_method_id: string;
      shipping_by_group: Record<string, string>;
    };
  };
  payment_methods: CheckoutQuotePaymentMethod[];
  shipping: { groups: ShippingGroup[] } | null;
  compatibility: Record<string, string[]>;
  notices: Array<{ key: string; params?: Record<string, unknown> }>;
  blocking_error?: {
    code: string;
    i18n_key: string;
    params?: Record<string, unknown>;
    affected_item_ids?: string[] | null;
  };
}

export interface SavedCard {
  id: string;
  type: "card";
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_expired: boolean;
  is_default: boolean;
  requires_3ds: boolean;
  network_token_available: boolean;
  funding: "credit" | "debit" | "prepaid" | "unknown";
}

export interface PaymentInstrumentsResponse {
  schema_version: 1;
  instruments: SavedCard[];
}

// ── ETag + data cache (module-level, survives re-renders) ──────────────────

const etagCache = new Map<string, string>();
const dataCache = new Map<string, CheckoutQuote>();

/**
 * Drop the cached ETag (and stale body) for an address so the *next* quote
 * fetch sends no `If-None-Match` and the server is forced to return a full
 * `200` with a fresh `expires_at` + `quote_token`.
 *
 * The quote ETag is derived purely from cart/address/rules/fx-date and
 * intentionally excludes any timestamp, so a plain refetch of an unchanged
 * cart comes back `304` and the client keeps replaying the now-expired
 * `expires_at` — leaving checkout permanently stuck on "quote expired". Call
 * this before refetching when we specifically need a fresh expiry window
 * (e.g. placing the order after the quote lapsed).
 */
export function invalidateQuoteEtag(addressId: string | null): void {
  const cacheKey = addressId ?? "no-address";
  etagCache.delete(cacheKey);
  dataCache.delete(cacheKey);
}

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useCheckoutQuote(addressId: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: ["checkout", "quote", addressId],
    queryFn: async () => {
      const cacheKey = addressId ?? "no-address";
      const headers: Record<string, string> = {};
      const etag = etagCache.get(cacheKey);
      if (etag) headers["If-None-Match"] = etag;

      const res = await api.get("/checkout/quote", {
        params: addressId ? { address_id: addressId } : undefined,
        headers,
        validateStatus: (status) =>
          (status >= 200 && status < 300) || status === 304,
      });

      if (res.status === 304) {
        const cached = dataCache.get(cacheKey);
        if (cached) return cached;
        // dataCache miss on a 304 — clear the stale ETag so the next fetch sends a full request
        etagCache.delete(cacheKey);
        throw new Error("ETag cache miss on 304; retrying without If-None-Match");
      }

      const responseEtag = res.headers["etag"] as string | undefined;
      if (responseEtag) etagCache.set(cacheKey, responseEtag);

      const quote = res.data.data as CheckoutQuote;
      dataCache.set(cacheKey, quote);
      return quote;
    },
    staleTime: 55_000,
    enabled: isAuthenticated,
  });
}

export function usePaymentInstruments() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: ["checkout", "payment-instruments"],
    queryFn: async () => {
      const { data } = await api.get("/checkout/payment-instruments");
      return data.data as PaymentInstrumentsResponse;
    },
    staleTime: 280_000,
    enabled: isAuthenticated,
  });
}
