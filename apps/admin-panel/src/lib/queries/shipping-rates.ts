import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface ShippingRate {
  id: string;
  vendor_id: string | null;
  zone_id: string | null;
  name: string;
  method: string;
  min_weight_grams: number | null;
  max_weight_grams: number | null;
  min_order_amount: number | null;
  carrier: string | null;
  base_cost: number;
  carrier_cost: number | null;
  per_kg_cost: number;
  free_above: number | null;
  currency: string;
  estimated_days_min: number | null;
  estimated_days_max: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ShippingRateCreate = Omit<
  ShippingRate,
  "id" | "created_at" | "updated_at" | "deleted_at"
>;
export type ShippingRateUpdate = Partial<ShippingRateCreate>;

export interface ShippingRateFilters {
  vendor_id?: string;
  zone_id?: string;
  method?: string;
  is_active?: "true" | "false";
}

const LIST_KEY = ["admin", "shipping-rates"] as const;

export function useShippingRates(filters: ShippingRateFilters = {}) {
  return useQuery({
    queryKey: [...LIST_KEY, filters],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.vendor_id) params.vendor_id = filters.vendor_id;
      if (filters.zone_id) params.zone_id = filters.zone_id;
      if (filters.method) params.method = filters.method;
      if (filters.is_active) params.is_active = filters.is_active;
      const { data } = await api.get("/admin/shipping-rates", { params });
      return data.data as ShippingRate[];
    },
    staleTime: 30_000,
  });
}

export function useShippingRate(id: string) {
  return useQuery({
    queryKey: [...LIST_KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/admin/shipping-rates/${id}`);
      return data.data as ShippingRate;
    },
    enabled: !!id,
  });
}

export function useCreateShippingRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ShippingRateCreate) => {
      const { data } = await api.post("/admin/shipping-rates", payload);
      return data.data as ShippingRate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useUpdateShippingRate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ShippingRateUpdate) => {
      const { data } = await api.patch(`/admin/shipping-rates/${id}`, payload);
      return data.data as ShippingRate;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: [...LIST_KEY, id] });
    },
  });
}

export function useDeleteShippingRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/admin/shipping-rates/${id}`);
      return data.data as { id: string; deleted_at: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export interface VendorOption {
  id: string;
  business_name: string;
}
export function useVendorOptions() {
  return useQuery({
    queryKey: ["admin", "vendor-options"],
    queryFn: async () => {
      const { data } = await api.get("/admin/vendors", { params: { limit: 100 } });
      const items: any[] = Array.isArray(data.data)
        ? data.data
        : (data.data?.data ?? data.data?.items ?? data.data?.rows ?? []);
      return items.map<VendorOption>((v) => ({
        id: v.id,
        business_name: v.business_name ?? v.name ?? v.id,
      }));
    },
    staleTime: 5 * 60_000,
  });
}

export interface ZoneOption {
  id: string;
  name: string;
}
export function useZoneOptions() {
  return useQuery({
    queryKey: ["admin", "zone-options"],
    queryFn: async () => {
      const { data } = await api.get("/shipping/delivery-zones");
      const items: any[] = Array.isArray(data.data) ? data.data : data.data?.items ?? [];
      return items.map<ZoneOption>((z) => ({ id: z.id, name: z.name }));
    },
    staleTime: 5 * 60_000,
  });
}
