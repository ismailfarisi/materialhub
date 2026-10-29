import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export type PendingWriteStatus = "pending" | "approved" | "rejected" | "applied";
export type PendingWriteKind =
  | "order.accept"
  | "order.reject"
  | "shipment.create"
  | "shipment.update_status"
  | "inventory.adjust"
  | "product.update_price"
  | "product.update_attribute";

export interface PendingWrite {
  id: string;
  integration_id: string;
  vendor_id: string;
  kind: PendingWriteKind;
  payload: Record<string, unknown>;
  current_value?: Record<string, unknown> | null;
  status: PendingWriteStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reason: string | null;
  created_at: string;
}

const KEYS = {
  all: ["admin", "integrations", "pending-writes"] as const,
  list: (integrationId: string, status?: string) =>
    [...KEYS.all, integrationId, status ?? "__any__"] as const,
};

export function usePendingWrites(integrationId: string, status = "pending") {
  return useQuery({
    queryKey: KEYS.list(integrationId, status),
    queryFn: async () => {
      const { data } = await api.get(`/admin/integrations/${integrationId}/pending-writes`, {
        params: { status },
      });
      return data.data as PendingWrite[];
    },
    enabled: !!integrationId,
  });
}

export function useApprovePendingWrite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/admin/integrations/pending-writes/${id}/approve`);
      return data.data as { id: string; applied: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useRejectPendingWrite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/admin/integrations/pending-writes/${id}/reject`);
      return data.data as { id: string; status: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}
