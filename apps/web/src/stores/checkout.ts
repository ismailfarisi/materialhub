import { create } from "zustand";
import type { CheckoutQuote } from "@/lib/queries/checkout-quote";

export type PaymentMethod = "card" | "cod" | "tamara";

interface CheckoutState {
  selectedAddressId: string | null;
  quoteToken: string | null;
  quoteData: CheckoutQuote | null;
  quoteExpiresAt: string | null;
  selectedShippingByGroup: Record<string, string>;
  paymentMethod: PaymentMethod | null;
  couponCode: string;
  discount: number;
  orderId: string | null;
  isAddressDrawerOpen: boolean;
  expandedShippingGroupId: string | null;
  isMobileSummaryOpen: boolean;
  editingAddressId: string | null;
  isPlacing: boolean;
  error: string;

  setSelectedAddressId: (id: string | null) => void;
  setQuote: (quote: CheckoutQuote) => void;
  setSelectedShipping: (groupId: string, methodId: string) => void;
  isQuoteExpired: () => boolean;
  setPaymentMethod: (method: PaymentMethod) => void;
  setCoupon: (code: string, discount: number) => void;
  setOrderId: (id: string) => void;
  setAddressDrawerOpen: (open: boolean, editId?: string | null) => void;
  setExpandedShippingGroup: (groupId: string | null) => void;
  setMobileSummaryOpen: (open: boolean) => void;
  setIsPlacing: (placing: boolean) => void;
  setError: (error: string) => void;
  reset: () => void;
}

function getLastPaymentMethod(): PaymentMethod | null {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem("checkout_last_payment_method");
  if (saved === "card" || saved === "cod" || saved === "tamara") {
    return saved;
  }
  return null;
}

const initialState = {
  selectedAddressId: null as string | null,
  quoteToken: null as string | null,
  quoteData: null as CheckoutQuote | null,
  quoteExpiresAt: null as string | null,
  selectedShippingByGroup: {} as Record<string, string>,
  paymentMethod: getLastPaymentMethod() || ("card" as PaymentMethod),
  couponCode: "",
  discount: 0,
  orderId: null as string | null,
  isAddressDrawerOpen: false,
  expandedShippingGroupId: null as string | null,
  isMobileSummaryOpen: false,
  editingAddressId: null as string | null,
  isPlacing: false,
  error: "",
};

export const useCheckoutStore = create<CheckoutState>((set, get) => ({
  ...initialState,
  setSelectedAddressId: (selectedAddressId) => set({ selectedAddressId }),
  setQuote: (quote) =>
    set((s) => ({
      quoteToken: quote.quote_token,
      quoteData: quote,
      quoteExpiresAt: quote.expires_at,
      selectedShippingByGroup: {
        ...quote.totals.default_selection.shipping_by_group,
        ...s.selectedShippingByGroup,
      },
    })),
  setSelectedShipping: (groupId, methodId) =>
    set((s) => ({
      selectedShippingByGroup: { ...s.selectedShippingByGroup, [groupId]: methodId },
    })),
  isQuoteExpired: () => {
    const { quoteExpiresAt } = get();
    if (!quoteExpiresAt) return false;
    return Date.now() >= new Date(quoteExpiresAt).getTime();
  },
  setPaymentMethod: (paymentMethod) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("checkout_last_payment_method", paymentMethod);
    }
    set({ paymentMethod });
  },
  setCoupon: (couponCode, discount) => set({ couponCode, discount }),
  setOrderId: (orderId) => set({ orderId }),
  setAddressDrawerOpen: (isAddressDrawerOpen, editId) =>
    set({ isAddressDrawerOpen, editingAddressId: editId ?? null }),
  setExpandedShippingGroup: (expandedShippingGroupId) => set({ expandedShippingGroupId }),
  setMobileSummaryOpen: (isMobileSummaryOpen) => set({ isMobileSummaryOpen }),
  setIsPlacing: (isPlacing) => set({ isPlacing }),
  setError: (error) => set({ error }),
  reset: () => set({ ...initialState, paymentMethod: getLastPaymentMethod() || "card" }),
}));
