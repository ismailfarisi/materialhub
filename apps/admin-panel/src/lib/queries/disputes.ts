import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

interface DisputeFilters {
  status?: string;
  priority?: string;
  page?: number;
  limit?: number;
}

export interface Dispute {
  id: string;
  order_number: string;
  status: string;
  priority: string;
  assigned_to?: string;
  assigned_to_name?: string;
  created_at: string;
}

export function useDisputes(filters: DisputeFilters = {}) {
  return useQuery({
    queryKey: ["admin", "disputes", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.status && filters.status !== "__all__") params.status = filters.status;
      if (filters.priority && filters.priority !== "__all__") params.priority = filters.priority;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/admin/disputes", { params });
      return data.data;
    },
  });
}

export function useAssignDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, admin_id }: { id: string; admin_id: string }) => {
      const { data } = await api.patch(`/admin/disputes/${id}/assign`, { assignee_id: admin_id });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "disputes"] });
    },
  });
}

export function useResolveDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      resolution,
      resolution_notes,
      amount,
      notes,
    }: {
      id: string;
      resolution?: string;
      resolution_notes?: string;
      amount?: number;
      notes?: string;
    }) => {
      const { data } = await api.patch(`/admin/disputes/${id}/resolve`, {
        resolution,
        resolution_notes: resolution_notes ?? notes,
        amount,
        notes: notes ?? resolution_notes,
      });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "disputes"] });
    },
  });
}
