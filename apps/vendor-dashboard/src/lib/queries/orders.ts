import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface OrderFilters {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ShipTo {
  name: string;
  address_line_1: string;
  address_line_2?: string | null;
  city: string;
  emirate?: string | null;
  country_code?: string;
  phone?: string | null;
  is_hub: boolean;
}

export function useVendorOrders(filters: OrderFilters = {}) {
  return useQuery({
    queryKey: ["vendor", "orders", filters],
    queryFn: async () => {
      const { data } = await api.get("/vendor/orders", { params: filters });
      return data.data;
    },
  });
}

export function useVendorOrder(id: string) {
  return useQuery({
    queryKey: ["vendor", "orders", id],
    queryFn: async () => {
      const { data } = await api.get(`/vendor/orders/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data } = await api.patch(`/vendor/orders/${id}/status`, { status });
      return data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["vendor", "orders", id] });
    },
  });
}

export function useCreateShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      carrier,
      tracking_number,
    }: {
      orderId: string;
      carrier: string;
      tracking_number: string;
    }) => {
      const { data } = await api.post(`/vendor/orders/${orderId}/ship`, {
        carrier,
        tracking_number,
      });
      return data.data;
    },
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "orders", orderId] });
    },
  });
}

export function useUpdateShipmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      shipmentId,
      status,
      reason,
    }: {
      orderId: string;
      shipmentId: string;
      status: string;
      reason: string;
    }) => {
      const { data } = await api.patch(
        `/vendor/orders/${orderId}/shipments/${shipmentId}/status`,
        { status, reason },
      );
      return data.data;
    },
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "orders", orderId] });
    },
  });
}
