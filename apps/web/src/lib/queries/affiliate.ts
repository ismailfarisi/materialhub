"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// My affiliations (invited + active, across all vendors)
export function useAffiliations() {
  return useQuery({
    queryKey: ["affiliate", "affiliations"],
    queryFn: async () => {
      const { data } = await api.get("/me/affiliate/affiliations");
      return data?.data ?? [];
    },
  });
}

// Earnings grouped by commission status: [{ status, total_fils, count }]
export function useAffiliateEarnings() {
  return useQuery({
    queryKey: ["affiliate", "earnings"],
    queryFn: async () => {
      const { data } = await api.get("/me/affiliate/earnings");
      return data?.data ?? [];
    },
  });
}

export function useAcceptAffiliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/me/affiliate/affiliations/${id}/accept`, {});
      return data?.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["affiliate", "affiliations"] }),
  });
}

export function useAffiliateLinks(id: string) {
  return useQuery({
    queryKey: ["affiliate", "links", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get(`/me/affiliate/affiliations/${id}/links`);
      return data?.data ?? [];
    },
  });
}

export function useCreateAffiliateLink(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { targetType: "store" | "product"; targetId?: string | null }) => {
      const { data } = await api.post(`/me/affiliate/affiliations/${id}/links`, input);
      return data?.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["affiliate", "links", id] }),
  });
}

export function useRequestPayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/me/affiliate/payout", {});
      return data?.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["affiliate", "earnings"] }),
  });
}
