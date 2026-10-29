import type { MediaItem } from "@materialhub/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

const k = (productId: string) => ["admin", "products", productId, "media"] as const;

export function useProductMedia(productId: string) {
  return useQuery({
    queryKey: k(productId),
    queryFn: async () => {
      const { data } = await api.get(`/admin/products/${productId}/media`);
      return data.data.items as MediaItem[];
    },
    enabled: !!productId,
    refetchInterval: (q) => {
      const items = q.state.data as MediaItem[] | undefined;
      return items?.some((i) => i.kind === "video" && i.status === "processing") ? 5000 : false;
    },
  });
}

export function useReorderMedia(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      items: Array<{ id: string; kind: "image" | "video"; sort_order: number }>,
    ) => {
      await api.patch(`/admin/products/${productId}/media/reorder`, { items });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: k(productId) }),
  });
}

export function useUpdateImage(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      imageId,
      ...body
    }: {
      imageId: string;
      alt_text?: string | null;
      focal_x?: number | null;
      focal_y?: number | null;
      variant_id?: string | null;
    }) => {
      const { data } = await api.patch(`/admin/products/${productId}/images/${imageId}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: k(productId) }),
  });
}

export function useCropImage(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      imageId,
      crop,
      rotation_degrees,
    }: {
      imageId: string;
      crop: { x: number; y: number; w: number; h: number };
      rotation_degrees?: number;
    }) => {
      const { data } = await api.post(`/admin/products/${productId}/images/${imageId}/crop`, {
        crop,
        rotation_degrees,
      });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: k(productId) }),
  });
}

export function useReplaceImage(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ imageId, key }: { imageId: string; key: string }) => {
      const { data } = await api.post(`/admin/products/${productId}/images/${imageId}/replace`, {
        key,
      });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: k(productId) }),
  });
}

export function usePresignVideo(productId: string) {
  return useMutation({
    mutationFn: async (body: {
      filename: string;
      content_type: string;
      size_bytes: number;
    }) => {
      const { data } = await api.post(`/admin/products/${productId}/videos/presign`, body);
      return data.data as { url: string; key: string };
    },
  });
}

export function useProcessVideo(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const { data } = await api.post(`/admin/products/${productId}/videos/process`, { key });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: k(productId) }),
  });
}

export function useDeleteVideo(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (videoId: string) => {
      await api.delete(`/admin/products/${productId}/videos/${videoId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: k(productId) }),
  });
}

export function useEnhanceImage(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (imageId: string) => {
      const { data } = await api.post(`/admin/products/${productId}/images/${imageId}/enhance`);
      return data.data as {
        candidate_id?: string;
        preview_url?: string;
        no_change_detected?: boolean;
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: k(productId) }),
  });
}

export function useAcceptAi(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      imageId,
      candidate_id,
    }: {
      imageId: string;
      candidate_id: string;
    }) => {
      const { data } = await api.post(
        `/admin/products/${productId}/images/${imageId}/enhance/accept`,
        { candidate_id },
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: k(productId) }),
  });
}

export function useRejectAi(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      imageId,
      candidate_id,
    }: {
      imageId: string;
      candidate_id: string;
    }) => {
      await api.post(`/admin/products/${productId}/images/${imageId}/enhance/reject`, {
        candidate_id,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: k(productId) }),
  });
}

export function useRevertAi(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (imageId: string) => {
      const { data } = await api.post(`/admin/products/${productId}/images/${imageId}/revert`);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: k(productId) }),
  });
}
