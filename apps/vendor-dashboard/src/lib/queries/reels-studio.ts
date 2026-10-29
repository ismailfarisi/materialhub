import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	addReelTag,
	deleteReel,
	deleteReelTag,
	fetchTaggableProducts,
	getMyReels,
	getReel,
	publishReel,
	requestReelUpload,
	updateReelMetadata,
} from "../api/reels";

export const reelStudioKeys = {
	all: ["vendor", "reels"] as const,
	list: (params: Record<string, unknown> = {}) =>
		[...reelStudioKeys.all, "list", params] as const,
	detail: (id: string) => [...reelStudioKeys.all, "detail", id] as const,
	taggable: (q: string) => [...reelStudioKeys.all, "taggable", q] as const,
};

export function useMyReels(
	params: { assetId?: string; cursor?: string; limit?: number } = {},
) {
	return useQuery({
		queryKey: reelStudioKeys.list(params),
		queryFn: () => getMyReels(params),
	});
}

export function useReel(reelId: string) {
	return useQuery({
		queryKey: reelStudioKeys.detail(reelId),
		queryFn: () => getReel(reelId),
		enabled: !!reelId,
	});
}

export function useTaggableProducts(q: string, limit = 20) {
	return useQuery({
		queryKey: reelStudioKeys.taggable(q),
		queryFn: () => fetchTaggableProducts(q, limit),
		staleTime: 30_000,
	});
}

export function useRequestReelUpload() {
	return useMutation({ mutationFn: requestReelUpload });
}

export function useUpdateReelMetadata() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			reelId,
			payload,
		}: { reelId: string; payload: Parameters<typeof updateReelMetadata>[1] }) =>
			updateReelMetadata(reelId, payload),
		onSuccess: (reel) => {
			queryClient.invalidateQueries({ queryKey: reelStudioKeys.all });
			queryClient.setQueryData(reelStudioKeys.detail(reel.id), reel);
		},
	});
}

export function usePublishReel() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: publishReel,
		onSuccess: (reel) => {
			queryClient.invalidateQueries({ queryKey: reelStudioKeys.all });
			queryClient.setQueryData(reelStudioKeys.detail(reel.id), reel);
		},
	});
}

export function useAddReelTag() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			reelId,
			payload,
		}: { reelId: string; payload: Parameters<typeof addReelTag>[1] }) =>
			addReelTag(reelId, payload),
		onSuccess: (_tag, { reelId }) => {
			queryClient.invalidateQueries({
				queryKey: reelStudioKeys.detail(reelId),
			});
			queryClient.invalidateQueries({ queryKey: reelStudioKeys.all });
		},
	});
}

export function useDeleteReelTag() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ reelId, tagId }: { reelId: string; tagId: string }) =>
			deleteReelTag(reelId, tagId),
		onSuccess: (_data, { reelId }) => {
			queryClient.invalidateQueries({
				queryKey: reelStudioKeys.detail(reelId),
			});
			queryClient.invalidateQueries({ queryKey: reelStudioKeys.all });
		},
	});
}

export function useDeleteReel() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteReel,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: reelStudioKeys.all }),
	});
}
