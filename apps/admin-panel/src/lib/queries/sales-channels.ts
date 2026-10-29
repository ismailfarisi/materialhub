import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export type ChannelCode = "google_merchant" | "meta_catalog" | "tiktok";

export interface ChannelView {
  id: string;
  code: ChannelCode;
  display_name: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  feed_url: string | null;
  feed_format: string;
  delta_enabled: boolean;
  last_full_feed_at: string | null;
  last_full_feed_status: string | null;
  last_delta_success_at: string | null;
  degraded_until: string | null;
  has_credentials: boolean;
}

export interface ChannelFeedRunRow {
  id: string;
  channel_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  item_count: number;
  excluded_count: number;
  error_count: number;
  file_url: string | null;
  file_size_bytes: number | null;
  trigger: string;
  error_message: string | null;
  created_at: string;
}

export interface ChannelDeliveryRow {
  id: string;
  channel_id: string;
  kind: string;
  event_name: string | null;
  dedup_event_id: string | null;
  order_id: string | null;
  product_id: string | null;
  payload: Record<string, unknown> | null;
  response_status: number | null;
  status: string;
  latency_ms: number | null;
  attempt: number;
  error_message: string | null;
  created_at: string;
}

export interface ChannelStats {
  runs: { ok: number; fail: number; skipped: number };
  deliveries: { ok: number; fail: number; pct: number | null };
}

const KEYS = {
  all: ["admin", "sales-channels"] as const,
  list: () => [...KEYS.all, "list"] as const,
  stats: (code: string) => [...KEYS.all, code, "stats"] as const,
  runs: (code: string) => [...KEYS.all, code, "runs"] as const,
  deliveries: (code: string) => [...KEYS.all, code, "deliveries"] as const,
};

export function useSalesChannels() {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn: async () => {
      const { data } = await api.get("/admin/sales-channels");
      return data.data as ChannelView[];
    },
    refetchInterval: 30_000,
  });
}

export function useChannelStats(code: string) {
  return useQuery({
    queryKey: KEYS.stats(code),
    queryFn: async () => {
      const { data } = await api.get(`/admin/sales-channels/${code}/stats`);
      return data.data as ChannelStats;
    },
    refetchInterval: 30_000,
  });
}

export function useChannelRuns(code: string, enabled = false) {
  return useQuery({
    queryKey: KEYS.runs(code),
    queryFn: async () => {
      const { data } = await api.get(`/admin/sales-channels/${code}/runs`, {
        params: { limit: 10 },
      });
      return data.data as ChannelFeedRunRow[];
    },
    enabled,
  });
}

export function useChannelDeliveries(code: string, enabled = false) {
  return useQuery({
    queryKey: KEYS.deliveries(code),
    queryFn: async () => {
      const { data } = await api.get(`/admin/sales-channels/${code}/deliveries`, {
        params: { limit: 20 },
      });
      return data.data as ChannelDeliveryRow[];
    },
    enabled,
  });
}

export function usePatchChannelEnabled(code: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (is_enabled: boolean) => {
      const { data } = await api.patch(`/admin/sales-channels/${code}`, { is_enabled });
      return data.data as ChannelView;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list() }),
  });
}

export function useRebuildChannel(code: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/admin/sales-channels/${code}/rebuild`);
      return data.data as { jobId: string };
    },
    onSuccess: () => {
      // Refresh the runs table after 2s so the new "running" row appears.
      setTimeout(() => qc.invalidateQueries({ queryKey: KEYS.runs(code) }), 2000);
    },
  });
}

export function useSetChannelCredentials(code: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (credentials: Record<string, unknown>) => {
      const { data } = await api.put(`/admin/sales-channels/${code}/credentials`, {
        credentials,
      });
      return data.data as { code: string; credentials_set: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list() }),
  });
}
