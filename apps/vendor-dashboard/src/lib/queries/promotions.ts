import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface CouponFilters {
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
