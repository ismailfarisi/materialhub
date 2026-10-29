import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export type ReindexJobState =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "waiting-children"
  | "prioritized";

export interface ReindexJobStatus {
  jobId: string | null;
  state: ReindexJobState | null;
  progress: { processed: number; total: number; percent: number } | null;
  result: { processed: number; durationMs: number } | null;
  failedReason: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

const searchReindexKey = ["admin", "search", "reindex"] as const;

export function useStartReindex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ jobId: string }> => {
      const { data } = await api.post("/admin/search/reindex");
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: searchReindexKey }),
  });
}

/**
 * Polls for the latest reindex job. When a job is active, the hook
 * re-fetches every 2s so the UI can show live progress. When no job is
 * running, polling stops.
 */
export function useReindexStatus() {
  return useQuery<ReindexJobStatus>({
    queryKey: searchReindexKey,
    queryFn: async () => {
      const { data } = await api.get("/admin/search/reindex");
      return data.data as ReindexJobStatus;
    },
    refetchInterval: (query) => {
      const s = query.state.data?.state;
      return s === "active" || s === "waiting" ? 2000 : false;
    },
  });
}
