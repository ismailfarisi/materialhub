import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

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

export function useUpdateCommission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { type: string; [key: string]: any }) => {
      const { data } = await api.patch(`/admin/commissions/vendors/${body.vendor_id ?? body.id}/rate`, body);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "commissions"] });
    },
  });
}
