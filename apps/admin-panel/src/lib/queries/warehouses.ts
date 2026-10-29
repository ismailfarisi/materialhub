import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface Warehouse {
  id: string;
  vendor_id: string | null;
  name: string;
  code: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  emirate: string;
  country_code: string;
  contact_phone: string | null;
  contact_email: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

export interface WarehouseInput {
  name: string;
  code: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  emirate: string;
  country_code?: string;
  contact_phone?: string;
  contact_email?: string;
}

/** List a vendor's warehouses. Defaults to including inactive (admin view). */
export function useVendorWarehouses(vendorId: string, includeInactive = true) {
  return useQuery({
    queryKey: ["admin", "warehouses", vendorId, includeInactive],
    queryFn: async () => {
      const params: Record<string, string> = { vendor_id: vendorId };
      if (includeInactive) params.include_inactive = "true";
      const { data } = await api.get("/shipping/warehouses", { params });
      return data.data as Warehouse[];
    },
    enabled: !!vendorId,
  });
}

export function useCreateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WarehouseInput & { vendor_id: string }) => {
      const { data } = await api.post("/shipping/warehouses", payload);
      return data.data as Warehouse;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["admin", "warehouses", vars.vendor_id] }),
  });
}

export function useUpdateWarehouse(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<WarehouseInput> & { id: string; is_active?: boolean }) => {
      const { data } = await api.patch(`/shipping/warehouses/${id}`, patch);
      return data.data as Warehouse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "warehouses", vendorId] }),
  });
}

export function useSetDefaultWarehouse(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/shipping/warehouses/${id}/default`);
      return data.data as Warehouse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "warehouses", vendorId] }),
  });
}

export function useDeleteWarehouse(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/shipping/warehouses/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "warehouses", vendorId] }),
  });
}
