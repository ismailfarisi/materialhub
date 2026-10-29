import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface ReelsProgramStatus {
  joinedAt: string | null;
  commissionRate: string;
  subsidyEndsAt: string | null;
  isActive: boolean;
}

const REELS_PROGRAM_KEY = ["vendor", "reels-program"] as const;

export function useReelsProgram() {
  return useQuery<ReelsProgramStatus>({
    queryKey: REELS_PROGRAM_KEY,
    queryFn: async () => {
      const { data } = await api.get("/vendor/reels-program");
      return data.data as ReelsProgramStatus;
    },
  });
}

export function useOptInReelsProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/vendor/reels-program/opt-in");
      return data.data as ReelsProgramStatus;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REELS_PROGRAM_KEY });
    },
  });
}

export function useOptOutReelsProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post("/vendor/reels-program/opt-out");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REELS_PROGRAM_KEY });
    },
  });
}
