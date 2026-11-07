import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

interface ReviewFilters {
  /** A review status, or `needs_moderation` / `reported` (queue views). */
  status?: string;
  page?: number;
  limit?: number;
}

/** Row of GET /admin/reviews (backend `toAdminReviewRow`). */
export interface Review {
  id: string;
  product_id: string;
  product_name: string | null;
  product_slug: string | null;
  vendor_id: string;
  vendor_name: string | null;
  user_id: string;
  reviewer_name: string | null;
  reviewer_email: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  status: string;
  /** Distinct buyers who reported the review. */
  flag_count: number;
  rejection_reason: string | null;
  is_verified_purchase: boolean;
  helpful_count: number;
  created_at: string;
}

export function useAdminReviews(filters: ReviewFilters = {}) {
  return useQuery({
    queryKey: ["admin", "reviews", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.status && filters.status !== "__all__") params.status = filters.status;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/admin/reviews", { params });
      // The list endpoint spreads { data, total } at the top level; reading
      // only `data.data` lost the total ("0 total reviews").
      return { items: (data.data ?? []) as Review[], total: Number(data.total ?? 0) };
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
    mutationFn: async ({ id, rejection_reason }: { id: string; rejection_reason: string }) => {
      // PATCH /admin/reviews/:id/reject requires { rejection_reason } — the
      // old call sent no body and every reject was a 400.
      const { data } = await api.patch(`/admin/reviews/${id}/reject`, { rejection_reason });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
    },
  });
}
