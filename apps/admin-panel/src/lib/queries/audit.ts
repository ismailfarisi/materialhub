import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

interface AuditLogFilters {
  actor?: string;
  action?: string;
  entity_type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

export function useAuditLog(filters: AuditLogFilters = {}) {
  return useQuery({
    queryKey: ["admin", "audit-log", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.actor) params.actor = filters.actor;
      if (filters.action && filters.action !== "__all__") params.action = filters.action;
      if (filters.entity_type && filters.entity_type !== "__all__") params.entity_type = filters.entity_type;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/admin/audit-log", { params });
      return data.data;
    },
  });
}
