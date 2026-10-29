import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface ShippingContributionTier {
  id: string;
  vendor_id: string | null;
  /** Inclusive lower bound of the order-value band, in fils. */
  min_order_value: number;
  /** What the vendor pays for orders in this band, in fils. */
  vendor_contribution: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ShippingContributionTierCreate = Omit<
  ShippingContributionTier,
  "id" | "created_at" | "updated_at" | "deleted_at"
>;
export type ShippingContributionTierUpdate = Partial<ShippingContributionTierCreate>;

export interface ShippingContributionTierFilters {
  vendor_id?: string;
  is_active?: "true" | "false";
}

const LIST_KEY = ["admin", "shipping-contribution-tiers"] as const;
const BASE_COST_KEY = ["admin", "shipping-base-carrier-cost"] as const;

export function useShippingContributionTiers(filters: ShippingContributionTierFilters = {}) {
  return useQuery({
    queryKey: [...LIST_KEY, filters],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.vendor_id) params.vendor_id = filters.vendor_id;
      if (filters.is_active) params.is_active = filters.is_active;
      const { data } = await api.get("/admin/shipping-contribution-tiers", { params });
      return data.data as ShippingContributionTier[];
    },
    staleTime: 30_000,
  });
}

export function useShippingContributionTier(id: string) {
  return useQuery({
    queryKey: [...LIST_KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/admin/shipping-contribution-tiers/${id}`);
      return data.data as ShippingContributionTier;
    },
    enabled: !!id,
  });
}

export function useCreateShippingContributionTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ShippingContributionTierCreate) => {
      const { data } = await api.post("/admin/shipping-contribution-tiers", payload);
      return data.data as ShippingContributionTier;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useUpdateShippingContributionTier(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ShippingContributionTierUpdate) => {
      const { data } = await api.patch(`/admin/shipping-contribution-tiers/${id}`, payload);
      return data.data as ShippingContributionTier;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: [...LIST_KEY, id] });
    },
  });
}

export function useDeleteShippingContributionTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/admin/shipping-contribution-tiers/${id}`);
      return data.data as { id: string; deleted_at: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export interface BaseCarrierCost {
  base_carrier_cost_fils: number;
}

export function useBaseCarrierCost() {
  return useQuery({
    queryKey: BASE_COST_KEY,
    queryFn: async () => {
      const { data } = await api.get("/admin/shipping-contribution-tiers/base-cost");
      return data.data as BaseCarrierCost;
    },
    staleTime: 30_000,
  });
}

export function useUpdateBaseCarrierCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (base_carrier_cost_fils: number) => {
      const { data } = await api.patch("/admin/shipping-contribution-tiers/base-cost", {
        base_carrier_cost_fils,
      });
      return data.data as BaseCarrierCost;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BASE_COST_KEY }),
  });
}
