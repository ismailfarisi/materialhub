import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface ReturnFilters {
  status?: string;
  page?: number;
  limit?: number;
}

export function useVendorReturns(filters: ReturnFilters = {}) {
  return useQuery({
    queryKey: ["vendor", "returns", filters],
    queryFn: async () => {
      const { data } = await api.get("/vendor/returns", { params: filters });
      // Route spreads `{ data, total }` into the envelope, so axios's
      // `data.data` is the array and `data.total` is the count.
      return { items: data.data ?? [], total: data.total ?? 0 };
    },
  });
}

// Vendor cannot approve returns — only admin can via /admin/returns/:id/approve

export function useReceiveReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, restock = false }: { id: string; restock?: boolean }) => {
      const { data } = await api.patch(`/vendor/returns/${id}/received`, { restock });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "returns"] });
    },
  });
}
