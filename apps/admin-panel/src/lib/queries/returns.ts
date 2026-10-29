import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

interface ReturnFilters {
  status?: string;
  page?: number;
  limit?: number;
}

export interface ReturnItemRow {
  id: string;
  order_item_id: string;
  quantity: number;
  refund_amount?: number | null;
  orderItem?: {
    id: string;
    product_id: string;
    product_name: string | null;
    product_image_url?: string | null;
    variant_name?: string | null;
  } | null;
}

export interface ReturnRequest {
  id: string;
  return_number: string;
  order_id: string;
  vendor_order_id: string;
  vendor_id: string;
  reason: string;
  status: string;
  refund_amount?: number | null;
  created_at: string;
  order?: { id: string; order_number: string } | null;
  returnItems?: ReturnItemRow[];
  // Convenience accessors (legacy — kept for any stale call sites)
  order_number?: string;
  product_name?: string;
}

export function useReturns(filters: ReturnFilters = {}) {
  return useQuery({
    queryKey: ["admin", "returns", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.status && filters.status !== "__all__") params.status = filters.status;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/admin/returns", { params });
      // Route spreads `{ data, total }` into the envelope, so axios's
      // `data.data` is the array of returns and `data.total` is the count.
      return { items: (data.data ?? []) as ReturnRequest[], total: data.total ?? 0 };
    },
  });
}

export function useApproveReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      refund_amount,
      refund_method = "original_payment",
      admin_notes,
    }: {
      id: string;
      refund_amount?: number;
      refund_method?: "wallet" | "original_payment" | "manual";
      admin_notes?: string;
    }) => {
      const { data } = await api.patch(`/admin/returns/${id}/approve`, {
        refund_amount,
        refund_method,
        admin_notes,
      });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "returns"] });
    },
  });
}

export function useRejectReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data } = await api.patch(`/admin/returns/${id}/reject`, { rejection_reason: reason });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "returns"] });
    },
  });
}
