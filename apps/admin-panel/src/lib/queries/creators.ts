import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

interface CreatorAppFilters {
  status?: string;
  page?: number;
  limit?: number;
}

export function useCreatorApplications(filters: CreatorAppFilters = {}) {
  return useQuery({
    queryKey: ["admin", "creator-applications", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.status && filters.status !== "__all__") params.status = filters.status;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/admin/creators/applications", { params });
      // envelope: { statusCode, items, total, timestamp }
      return data;
    },
  });
}

export function useCreatorApplication(id: string) {
  return useQuery({
    queryKey: ["admin", "creator-applications", id],
    queryFn: async () => {
      const { data } = await api.get(`/admin/creators/applications/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useApproveCreatorApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/admin/creators/applications/${id}/approve`);
      return data.data;
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["admin", "creator-applications"] });
      qc.invalidateQueries({ queryKey: ["admin", "creator-applications", id] });
    },
  });
}

export function useRejectCreatorApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { data } = await api.post(`/admin/creators/applications/${id}/reject`, { notes });
      return data.data;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["admin", "creator-applications"] });
      qc.invalidateQueries({ queryKey: ["admin", "creator-applications", id] });
    },
  });
}

export function useRequestInfoCreatorApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { data } = await api.post(`/admin/creators/applications/${id}/request-info`, { notes });
      return data.data;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["admin", "creator-applications"] });
      qc.invalidateQueries({ queryKey: ["admin", "creator-applications", id] });
    },
  });
}

/**
 * Removes creator status from one or more users — demotes creator_tier back
 * to 'regular' via the same endpoint the Users page uses for a single user
 * (PATCH /admin/users/:id/creator-tier). There is no bulk endpoint, so this
 * fans the calls out client-side and reports how many of each outcome.
 * Demoting an already-regular user is a safe no-op (see user-admin.service.ts),
 * so a stale selection can't error.
 */
export function useBulkRemoveCreatorStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userIds: string[]) => {
      const results = await Promise.allSettled(
        userIds.map((id) => api.patch(`/admin/users/${id}/creator-tier`, { creator_tier: "regular" })),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      return { succeeded: userIds.length - failed, failed };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "creator-applications"] });
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
