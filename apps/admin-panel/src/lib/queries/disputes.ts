import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ResolveDisputePayload } from "../disputes.helpers";

interface DisputeFilters {
  status?: string;
  assigned_to?: string;
  page?: number;
  limit?: number;
}

/** Row of GET /admin/disputes (flattened by the backend's toDisputeSummary). */
export interface Dispute {
  id: string;
  dispute_number: string;
  status: string;
  category: string;
  description: string;
  evidence_urls: string[];
  order_id: string;
  order_number: string | null;
  order_status: string | null;
  /** Fils. */
  order_total: number | null;
  /** Fils. */
  order_refund_total: number | null;
  currency: string;
  vendor_order_id: string | null;
  vendor_order_number: string | null;
  /** Fils. */
  vendor_order_total: number | null;
  vendor_id: string;
  vendor_name: string | null;
  opened_by: string;
  buyer_name: string | null;
  buyer_email: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  resolution: string | null;
  /** Fils. */
  resolution_amount: number | null;
  resolved_at: string | null;
  escalated_at: string | null;
  deadline_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisputeMessage {
  id: string;
  sender_id: string;
  sender_role: string;
  message: string;
  attachment_urls: string[];
  is_internal: boolean;
  created_at: string;
}

export interface DisputeDetail extends Dispute {
  messages: DisputeMessage[];
}

export interface AdminUserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

const KEY = ["admin", "disputes"] as const;

export function useDisputes(filters: DisputeFilters = {}) {
  return useQuery({
    queryKey: [...KEY, "list", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.status && filters.status !== "__all__") params.status = filters.status;
      if (filters.assigned_to) params.assigned_to = filters.assigned_to;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/admin/disputes", { params });
      // The list endpoint spreads { data, total } at the top level.
      return { items: (data.data ?? []) as Dispute[], total: Number(data.total ?? 0) };
    },
  });
}

export function useDispute(id: string) {
  return useQuery({
    queryKey: [...KEY, "detail", id],
    queryFn: async () => {
      const { data } = await api.get(`/admin/disputes/${id}`);
      return data.data as DisputeDetail;
    },
    enabled: !!id,
  });
}

/**
 * Admins who can own a dispute: GET /admin/users filters by one role, so ask
 * for admins and super admins and merge.
 */
export function useAdminAssignees(enabled = true) {
  return useQuery({
    queryKey: ["admin", "users", "assignees"],
    queryFn: async () => {
      const roles = ["admin", "super_admin"];
      const pages = await Promise.all(
        roles.map((role) =>
          api.get("/admin/users", { params: { role, status: "active", limit: 100 } }),
        ),
      );
      const seen = new Set<string>();
      const out: AdminUserOption[] = [];
      for (const { data } of pages) {
        // GET /admin/users answers { data: { users, total, ... } }.
        const users = Array.isArray(data.data) ? data.data : (data.data?.users ?? []);
        for (const u of users as Array<{
          id: string;
          first_name?: string;
          last_name?: string;
          email: string;
          role: string;
        }>) {
          if (seen.has(u.id)) continue;
          seen.add(u.id);
          const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email;
          out.push({ id: u.id, name, email: u.email, role: u.role });
        }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

function useDisputeMutation<TVars extends { id: string }>(
  fn: (vars: TVars) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [...KEY, "list"] });
      queryClient.invalidateQueries({ queryKey: [...KEY, "detail", vars.id] });
    },
  });
}

export function useAssignDispute() {
  return useDisputeMutation(async ({ id, assignee_id }: { id: string; assignee_id: string }) => {
    const { data } = await api.patch(`/admin/disputes/${id}/assign`, { assignee_id });
    return data.data;
  });
}

export function useEscalateDispute() {
  return useDisputeMutation(async ({ id }: { id: string }) => {
    const { data } = await api.patch(`/admin/disputes/${id}/escalate`);
    return data.data;
  });
}

export function useCloseDispute() {
  return useDisputeMutation(async ({ id }: { id: string }) => {
    const { data } = await api.patch(`/admin/disputes/${id}/close`);
    return data.data;
  });
}

export function useResolveDispute() {
  return useDisputeMutation(
    async ({ id, payload }: { id: string; payload: ResolveDisputePayload }) => {
      const { data } = await api.patch(`/admin/disputes/${id}/resolve`, payload);
      return data.data;
    },
  );
}

export function useAddDisputeMessage() {
  return useDisputeMutation(
    async ({ id, message, is_internal }: { id: string; message: string; is_internal: boolean }) => {
      const { data } = await api.post(`/disputes/${id}/messages`, { message, is_internal });
      return data.data;
    },
  );
}
