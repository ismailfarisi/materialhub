import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export function useCreateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      order_item_id: string;
      rating: number;
      title?: string;
      body?: string;
      media_urls?: string[];
    }) => {
      const { data } = await api.post("/reviews", payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order"] });
      queryClient.invalidateQueries({ queryKey: ["product-reviews"] });
    },
  });
}

/** POST /reviews/:id/vote — signed-in buyers; the author cannot vote on their own review (403). */
export function useVoteReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reviewId,
      isHelpful,
    }: {
      reviewId: string;
      isHelpful: boolean;
    }) => {
      const { data } = await api.post(`/reviews/${reviewId}/vote`, {
        is_helpful: isHelpful,
      });
      return data.data as { id: string; helpful_count: number; not_helpful_count: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-reviews"] });
    },
  });
}

/**
 * POST /reviews/:id/flag — report a published review. One report per buyer;
 * the review stays up until enough buyers report it or a moderator acts.
 */
export function useFlagReview() {
  return useMutation({
    mutationFn: async ({ reviewId, reason }: { reviewId: string; reason?: string }) => {
      const { data } = await api.post(`/reviews/${reviewId}/flag`, reason ? { reason } : {});
      return data.data as { id: string; status: string; flag_count: number; hidden: boolean };
    },
  });
}
