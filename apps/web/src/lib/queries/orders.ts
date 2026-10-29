import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export function useOrders(params?: {
  page?: number;
  limit?: number;
  status?: string;
}) {
  return useQuery({
    queryKey: ["orders", params],
    queryFn: async () => {
      const { data } = await api.get("/buyer/orders", { params });
      return data.data;
    },
  });
}

export function useOrder(id: string, options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data } = await api.get(`/buyer/orders/${id}`);
      return data.data;
    },
    enabled: !!id,
    refetchInterval: options?.refetchInterval ?? false,
  });
}

export function useCancelOrder() {
  return useMutation({
    mutationFn: async ({
      orderId,
      reason,
    }: {
      orderId: string;
      reason: string;
    }) => {
      const { data } = await api.post(`/orders/${orderId}/cancel`, { reason });
      return data.data;
    },
  });
}

export type ReturnReason =
  | "defective"
  | "wrong_item"
  | "not_as_described"
  | "changed_mind"
  | "arrived_late"
  | "other";

export type ReturnItemCondition = "unopened" | "damaged" | "used";

export interface CreateReturnPayload {
  orderId: string;
  vendor_order_id: string;
  reason: ReturnReason;
  reason_details?: string;
  media_urls?: string[];
  items: Array<{
    order_item_id: string;
    quantity: number;
    reason: ReturnReason;
    condition?: ReturnItemCondition;
  }>;
}

export function useCreateReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, ...payload }: CreateReturnPayload) => {
      const { data } = await api.post(`/orders/${orderId}/return`, payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      queryClient.invalidateQueries({ queryKey: ["order"] });
    },
  });
}

export function useReturn(id: string) {
  return useQuery({
    queryKey: ["return", id],
    queryFn: async () => {
      const { data } = await api.get(`/buyer/returns/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useUpdateReturnShipping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      carrier,
      tracking_number,
      shipping_cost,
      paid_by,
    }: {
      id: string;
      carrier: string;
      tracking_number: string;
      shipping_cost?: number;
      paid_by?: "buyer" | "vendor" | "platform";
    }) => {
      const { data } = await api.patch(`/buyer/returns/${id}/shipping`, {
        carrier,
        tracking_number,
        shipping_cost,
        paid_by,
      });
      return data.data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      queryClient.invalidateQueries({ queryKey: ["return", vars.id] });
    },
  });
}

export function useReorder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data } = await api.post(`/buyer/orders/${orderId}/reorder`);
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart"] }),
  });
}

export function useReturns(params?: { page?: number }) {
  return useQuery({
    queryKey: ["returns", params],
    queryFn: async () => {
      const { data } = await api.get("/buyer/returns", { params });
      return data.data;
    },
  });
}
