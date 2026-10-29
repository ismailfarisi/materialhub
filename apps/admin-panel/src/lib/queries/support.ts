import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

interface TicketFilters {
  status?: string;
  priority?: string;
  assigned_to?: string;
  page?: number;
  limit?: number;
}

interface UpdateTicketPayload {
  status?: string;
  priority?: string;
  assigned_to?: string;
}

interface AddMessagePayload {
  message: string;
  is_internal: boolean;
}

export function useTickets(filters: TicketFilters = {}) {
  return useQuery({
    queryKey: ["admin", "support", "tickets", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.status && filters.status !== "__all__") params.status = filters.status;
      if (filters.priority && filters.priority !== "__all__") params.priority = filters.priority;
      if (filters.assigned_to) params.assigned_to = filters.assigned_to;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/support/admin/tickets", { params });
      return data.data;
    },
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ["admin", "support", "tickets", id],
    queryFn: async () => {
      const { data } = await api.get(`/support/admin/tickets/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateTicketPayload }) => {
      const { data } = await api.put(`/support/admin/tickets/${id}`, payload);
      return data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "support", "tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "support", "tickets", id] });
    },
  });
}

export function useAddMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: AddMessagePayload }) => {
      const { data } = await api.post(`/support/admin/tickets/${id}/messages`, payload);
      return data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "support", "tickets", id] });
    },
  });
}
