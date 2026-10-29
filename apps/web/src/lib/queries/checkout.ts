import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface AvailableCoupon {
  code: string;
  name: string;
  type: string;
  discount: number;
  minimum_order_amount: number | null;
  expires_at: string | null;
}

export function useAvailableCoupons(enabled = true) {
  return useQuery({
    queryKey: ["checkout", "available-coupons"],
    queryFn: async (): Promise<AvailableCoupon[]> => {
      const { data } = await api.get("/checkout/available-coupons");
      return data.data ?? [];
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useInitiateCheckout() {
  return useMutation({
    mutationFn: async (payload: {
      quote_token?: string;
      address_id?: string;
      shippingAddress: object;
      billingAddress?: object;
      shippingMethod?: string;
      payment_method?: string;
      customerNotes?: string;
    }) => {
      const { data } = await api.post("/checkout/initiate", payload);
      return data.data;
    },
  });
}

export function useApplyCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      coupon_code: string;
      order_id?: string;
    }): Promise<{ discount: number; code: string; type: string }> => {
      const { data } = await api.post("/checkout/apply-coupon", payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkout", "available-coupons"] });
    },
  });
}

export function useCreatePaymentIntent() {
  return useMutation({
    mutationFn: async (payload: {
      order_id: string;
      amount: number;
      payment_method: string;
    }) => {
      const { data } = await api.post("/checkout/payment-intent", payload);
      return data.data;
    },
  });
}

export function useCodCheckout() {
  return useMutation({
    mutationFn: async (payload: { order_id: string; amount: number }) => {
      const { data } = await api.post("/checkout/cod", payload);
      return data.data;
    },
  });
}

export function useTabbyCheckout() {
  return useMutation({
    mutationFn: async (payload: {
      order_id: string;
      amount: number;
      return_url?: string;
    }) => {
      const { data } = await api.post("/checkout/tabby", payload);
      return data.data;
    },
  });
}

export function useValidateCoupon() {
  return useMutation({
    mutationFn: async (payload: {
      coupon_code: string;
      cart_subtotal: number;
      cart_item_ids: string[];
    }) => {
      const { data } = await api.post("/checkout/validate-coupon", payload);
      return data.data;
    },
  });
}

export function useRemoveCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload?: { order_id?: string }) => {
      const { data } = await api.post("/checkout/remove-coupon", payload || {});
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkout", "available-coupons"] });
    },
  });
}
