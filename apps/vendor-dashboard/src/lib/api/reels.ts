import { api } from "../api";

export interface ReelUploadResponse {
	uploadUrl: string;
	assetId: string;
	reelId: string;
}

export interface ReelProductTag {
	id: string;
	product_id: string;
	variant_id?: string | null;
	timestamp_seconds: string | number;
	product?: { id: string; name: string; primary_image_url?: string | null };
}

export interface MyReelSummary {
	id: string;
	user_id: string;
	video_asset_id: string;
	video_playback_url: string;
	video_duration_seconds: number;
	thumbnail_url: string;
	caption: string | null;
	language_code: string;
	is_sponsored_disclosed: boolean;
	status: "draft" | "pending_review" | "approved" | "rejected" | "removed";
	rejection_reason: string | null;
	published_at: string | null;
	created_at: string;
	tags?: ReelProductTag[];
}

export interface TaggableProductRow {
	product_id: string;
	name: string;
	thumbnail_url: string | null;
	variant_label: string | null;
	delivered_at: string | null;
	source: "purchased" | "vendor_owned" | "permission";
}

export async function requestReelUpload(): Promise<ReelUploadResponse> {
	const { data } = await api.post("/reels/uploads");
	return data.data as ReelUploadResponse;
}

export async function getMyReels(
	params: {
		assetId?: string;
		cursor?: string;
		limit?: number;
	} = {},
): Promise<{ items: MyReelSummary[]; nextCursor: string | null }> {
	const { data } = await api.get("/me/reels", {
		params: {
			asset_id: params.assetId,
			cursor: params.cursor,
			limit: params.limit,
		},
	});
	return { items: data.items ?? [], nextCursor: data.nextCursor ?? null };
}

export async function getReel(reelId: string): Promise<MyReelSummary> {
	const { data } = await api.get(`/reels/${reelId}`);
	return data.data as MyReelSummary;
}

export async function updateReelMetadata(
	reelId: string,
	payload: {
		caption?: string;
		language_code?: string;
		thumbnail_url?: string;
		is_sponsored_disclosed?: boolean;
	},
): Promise<MyReelSummary> {
	const { data } = await api.patch(`/reels/${reelId}`, payload);
	return data.data as MyReelSummary;
}

export async function publishReel(reelId: string): Promise<MyReelSummary> {
	const { data } = await api.post(`/reels/${reelId}/publish`);
	return data.data as MyReelSummary;
}

export async function addReelTag(
	reelId: string,
	payload: {
		productId: string;
		variantId?: string;
		timestampSeconds: number;
		displayX?: number;
		displayY?: number;
	},
): Promise<ReelProductTag> {
	const { data } = await api.post(`/reels/${reelId}/tags`, payload);
	return data.data as ReelProductTag;
}

export async function deleteReelTag(
	reelId: string,
	tagId: string,
): Promise<void> {
	await api.delete(`/reels/${reelId}/tags/${tagId}`);
}

export async function deleteReel(reelId: string): Promise<void> {
	await api.delete(`/reels/${reelId}`);
}

export async function fetchTaggableProducts(
	q: string,
	limit = 20,
): Promise<TaggableProductRow[]> {
	const { data } = await api.get("/me/reels/taggable-products", {
		params: { q: q || undefined, limit },
		timeout: 4000,
	});
	return (data?.data?.items as TaggableProductRow[] | undefined) ?? [];
}
