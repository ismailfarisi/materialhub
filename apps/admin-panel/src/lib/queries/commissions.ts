import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

/** Bounds in fils of the line total; rate in percent. */
export interface CommissionTier {
  min_amount: number;
  max_amount: number | null;
  rate: number;
}

export interface CategoryCommission {
  id: string;
  category_id: string;
  category_name: string;
  rate: number;
}

export interface VendorCommission {
  id: string;
  vendor_id: string;
  vendor_name: string;
  /** percentage | fixed | tiered */
  commission_type?: string | null;
  /** Percent for `percentage`; fils per item for `fixed`. */
  rate: number;
  tiers?: CommissionTier[];
}

export interface CommissionConfig {
  default_rate: number;
  category_overrides: CategoryCommission[];
  vendor_overrides: VendorCommission[];
}

export function useCommissionConfig() {
  return useQuery({
    queryKey: ["admin", "commissions"],
    queryFn: async () => {
      const { data } = await api.get("/admin/commissions/config");
      return data.data as CommissionConfig;
    },
  });
}

export function useGlobalCommissionRate() {
  return useQuery({
    queryKey: ["admin", "commissions", "global-rate"],
    queryFn: async () => {
      const { data } = await api.get("/admin/commissions/global-rate");
      return data.data.rate as number;
    },
  });
}

export function useUpdateGlobalCommissionRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rate: number) => {
      const { data } = await api.patch("/admin/commissions/global-rate", { rate });
      return data.data.rate as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "commissions"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "commissions", "global-rate"] });
    },
  });
}

/** PATCH /admin/categories/:id — category rates live on the category (percent, 0–100). */
export function useUpdateCategoryCommission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ categoryId, rate }: { categoryId: string; rate: number | null }) => {
      const { data } = await api.patch(`/admin/categories/${categoryId}`, {
        commission_rate: rate,
      });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "commissions"] });
    },
  });
}

/**
 * PATCH /admin/commissions/vendors/:vendorId/rate. `value` is percent (or fils
 * for `fixed`); tiers go back in the camelCase shape the rate resolver reads.
 */
export function useUpdateVendorCommission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      vendorId,
      type,
      value,
      tiers,
    }: {
      vendorId: string;
      type: "percentage" | "fixed" | "tiered";
      value: number;
      tiers?: CommissionTier[];
    }) => {
      const { data } = await api.patch(`/admin/commissions/vendors/${vendorId}/rate`, {
        type,
        value,
        tiers: tiers?.map((t) => ({
          minAmount: t.min_amount,
          ...(t.max_amount != null ? { maxAmount: t.max_amount } : {}),
          rate: t.rate,
        })),
      });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "commissions"] });
    },
  });
}
