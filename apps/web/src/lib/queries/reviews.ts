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

export function useVoteReview() {
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
      return data.data;
    },
  });
}
