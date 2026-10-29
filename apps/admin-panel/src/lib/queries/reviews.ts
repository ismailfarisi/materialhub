import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

interface ReviewFilters {
  status?: string;
  page?: number;
  limit?: number;
}

export interface Review {
  id: string;
  product_name: string;
  rating: number;
  body: string;
  reviewer_name: string;
  status: string;
  created_at: string;
}

export function usePendingReviews(filters: ReviewFilters = {}) {
  return useQuery({
    queryKey: ["admin", "reviews", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.status && filters.status !== "__all__") params.status = filters.status;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/admin/reviews", { params });
      return data.data;
    },
  });
}

export function useApproveReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/admin/reviews/${id}/approve`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
    },
  });
}

export function useRejectReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/admin/reviews/${id}/reject`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
    },
  });
}
