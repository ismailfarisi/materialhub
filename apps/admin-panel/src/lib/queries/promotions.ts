import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

// Coupons
export function useAdminCoupons(filters: { status?: string; type?: string; search?: string; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ["admin", "coupons", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.status && filters.status !== "__all__") params.status = filters.status;
      if (filters.type && filters.type !== "__all__") params.type = filters.type;
      if (filters.search) params.search = filters.search;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/admin/coupons", { params });
      return data;
    },
  });
}

export function useAdminCoupon(id: string) {
  return useQuery({
    queryKey: ["admin", "coupons", id],
    queryFn: async () => {
      const { data } = await api.get(`/admin/coupons/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const { data } = await api.post("/admin/coupons", payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "coupons"] }),
  });
}

export function useUpdateCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Record<string, any>) => {
      const { data } = await api.patch(`/admin/coupons/${id}`, payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "coupons"] }),
  });
}

export function useDeleteCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/admin/coupons/${id}`);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "coupons"] }),
  });
}

// Flash Deals
export function useAdminFlashDeals(filters: { status?: string; vendor_id?: string; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ["admin", "flash-deals", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.status && filters.status !== "__all__") params.status = filters.status;
      if (filters.vendor_id) params.vendor_id = filters.vendor_id;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/admin/flash-deals", { params });
      return data;
    },
  });
}

export function useAdminFlashDeal(id: string) {
  return useQuery({
    queryKey: ["admin", "flash-deals", id],
    queryFn: async () => {
      const { data } = await api.get(`/admin/flash-deals/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateFlashDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const { data } = await api.post("/admin/flash-deals", payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "flash-deals"] }),
  });
}

export function useUpdateFlashDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Record<string, any>) => {
      const { data } = await api.patch(`/admin/flash-deals/${id}`, payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "flash-deals"] }),
  });
}

export function useDeleteFlashDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/admin/flash-deals/${id}`);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "flash-deals"] }),
  });
}

// Promotions Overview (unified)
export function usePromotionsOverview(filters: { type?: string; status?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ["admin", "promotions", filters],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.type && filters.type !== "__all__") params.type = filters.type;
      if (filters.status && filters.status !== "__all__") params.status = filters.status;
      if (filters.search) params.search = filters.search;
      const { data } = await api.get("/admin/promotions", { params });
      return data;
    },
  });
}
