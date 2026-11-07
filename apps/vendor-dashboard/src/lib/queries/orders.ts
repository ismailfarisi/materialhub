import { toast } from "@materialhub/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

/** One line naming why an order action failed, from the API's error body. */
export function orderActionError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string | string[] } }; message?: string };
  const msg = e?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(" ");
  return msg || fallback;
}

function toastFailure(title: string) {
  return (err: unknown) =>
    toast({
      variant: "destructive",
      title,
      description: orderActionError(err, "Something went wrong. Try again."),
    });
}

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
      try {
        const { data } = await api.get(`/vendor/orders/${id}`);
        return data.data;
      } catch (err) {
        // A real 404 (unknown or another vendor's order): "Order not found".
        if ((err as { response?: { status?: number } })?.response?.status === 404) return null;
        throw err;
      }
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
    onError: toastFailure("Could not update the order"),
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
      // No `items`: the API ships every unshipped unit of this vendor order.
      const { data } = await api.post(`/vendor/orders/${orderId}/ship`, {
        carrier,
        tracking_number,
      });
      return data.data;
    },
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["vendor", "orders", orderId] });
      toast({ title: "Shipment created", description: "The order is marked as shipped." });
    },
    onError: toastFailure("Could not create the shipment"),
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
    onError: toastFailure("Could not update the shipment"),
  });
}
