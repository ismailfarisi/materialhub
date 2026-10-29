import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface CouponFilters {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface FlashDealFilters {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

// ─── Coupon Hooks ────────────────────────────────────────────────────────────

export function useVendorCoupons(filters: CouponFilters = {}) {
  return useQuery({
    queryKey: ["vendor", "coupons", filters],
    queryFn: async () => {
      const { data } = await api.get("/vendor/coupons", { params: filters });
      // List endpoints spread the page at the top level: { items, total, page, limit }
      return data;
    },
  });
}

export function useVendorCoupon(id: string) {
  return useQuery({
    queryKey: ["vendor", "coupons", id],
    queryFn: async () => {
      const { data } = await api.get(`/vendor/coupons/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateVendorCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await api.post("/vendor/coupons", payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "coupons"] });
    },
  });
}

export function useUpdateVendorCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const { data } = await api.patch(`/vendor/coupons/${id}`, payload);
      return data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "coupons"] });
      queryClient.invalidateQueries({ queryKey: ["vendor", "coupons", id] });
    },
  });
}

export function useDeleteVendorCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/vendor/coupons/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "coupons"] });
    },
  });
}

// ─── Flash Deal Hooks ─────────────────────────────────────────────────────────

export function useVendorFlashDeals(filters: FlashDealFilters = {}) {
  return useQuery({
    queryKey: ["vendor", "flash-deals", filters],
    queryFn: async () => {
      const { data } = await api.get("/vendor/flash-deals", { params: filters });
      // List endpoints spread the page at the top level: { items, total, page, limit }
      return data;
    },
  });
}

export function useVendorFlashDeal(id: string) {
  return useQuery({
    queryKey: ["vendor", "flash-deals", id],
    queryFn: async () => {
      const { data } = await api.get(`/vendor/flash-deals/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateVendorFlashDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await api.post("/vendor/flash-deals", payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "flash-deals"] });
    },
  });
}

export function useUpdateVendorFlashDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const { data } = await api.patch(`/vendor/flash-deals/${id}`, payload);
      return data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "flash-deals"] });
      queryClient.invalidateQueries({ queryKey: ["vendor", "flash-deals", id] });
    },
  });
}

export function useDeleteVendorFlashDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/vendor/flash-deals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "flash-deals"] });
    },
  });
}
