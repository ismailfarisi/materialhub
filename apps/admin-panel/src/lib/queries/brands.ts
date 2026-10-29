import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

interface BrandFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  product_count?: number;
  created_at: string;
}

export function useBrands(filters: BrandFilters = {}) {
  return useQuery({
    queryKey: ["admin", "brands", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.search) params.search = filters.search;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/admin/brands", { params });
      return data.data;
    },
  });
}

export function useCreateBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; slug: string; logo_url?: string }) => {
      const { data } = await api.post("/admin/brands", body);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "brands"] });
    },
  });
}

export function useUpdateBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: { id: string; name?: string; slug?: string; logo_url?: string }) => {
      const { data } = await api.patch(`/admin/brands/${id}`, body);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "brands"] });
    },
  });
}

export function useDeleteBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/admin/brands/${id}`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "brands"] });
    },
  });
}

export function useRecomputeBrandCounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ updated: number; total: number }> => {
      const { data } = await api.post("/admin/brands/recompute-counts");
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "brands"] });
    },
  });
}

// ─── Vendor brand submissions ────────────────────────────────────────────
// Brands a vendor asked for because the catalogue was missing one. The row
// already exists and that vendor can already attach products to it; approving
// is what makes it visible on the storefront. Rejecting keeps the row (so those
// products don't lose their brand_id) and shows the reason back to the vendor.

export interface BrandSubmission extends Brand {
  status: "pending" | "approved" | "rejected";
  submitted_by_vendor_id: string | null;
  submitted_at: string | null;
  rejection_reason: string | null;
  description?: string | null;
  website_url?: string | null;
}

export function useBrandSubmissions(status: "pending" | "approved" | "rejected" = "pending") {
  return useQuery({
    queryKey: ["admin", "brand-submissions", status],
    queryFn: async () => {
      const { data } = await api.get("/admin/brands/submissions", { params: { status } });
      return data.data as {
        data: BrandSubmission[];
        total: number;
        page: number;
        limit: number;
      };
    },
  });
}

export function useApproveBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/admin/brands/${id}/approve`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "brand-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "brands"] });
    },
  });
}

export function useRejectBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data } = await api.post(`/admin/brands/${id}/reject`, { reason });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "brand-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "brands"] });
    },
  });
}
