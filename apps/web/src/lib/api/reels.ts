import { api, ensureGuestSessionToken } from "../api";

export interface ReelUploadResponse {
	uploadUrl: string;
	assetId: string;
	reelId: string;
}

export async function requestReelUpload(): Promise<ReelUploadResponse> {
	const res = await api.post("/reels/uploads");
	return res.data.data as ReelUploadResponse;
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
	status: "draft" | "pending_review" | "approved" | "rejected" | "removed";
	rejection_reason: string | null;
	published_at: string | null;
	created_at: string;
	tags?: Array<{ id: string; product_id: string }>;
}

export interface GetMyReelsParams {
	assetId?: string;
	cursor?: string;
	limit?: number;
}

export async function getMyReels(
	params: GetMyReelsParams = {},
): Promise<{ items: MyReelSummary[]; nextCursor: string | null }> {
	const res = await api.get("/me/reels", {
		params: {
			asset_id: params.assetId,
			cursor: params.cursor,
			limit: params.limit,
		},
	});
	return {
		items: res.data.items ?? [],
		nextCursor: res.data.nextCursor ?? null,
	};
}

export async function getReel(reelId: string) {
	const res = await api.get(`/reels/${reelId}`);
	return res.data.data;
}

export async function publishReel(reelId: string) {
	const res = await api.post(`/reels/${reelId}/publish`);
	return res.data.data;
}

export interface UpdateReelMetadataPayload {
	caption?: string;
	language_code?: string;
	thumbnail_url?: string;
	is_sponsored_disclosed?: boolean;
}

export async function updateReelMetadata(
	reelId: string,
	data: UpdateReelMetadataPayload,
) {
	const res = await api.patch(`/reels/${reelId}`, data);
	return res.data.data;
}

export interface AddReelTagPayload {
	productId: string;
	variantId?: string;
	timestampSeconds: number;
	displayX?: number;
	displayY?: number;
}

export async function addReelTag(reelId: string, payload: AddReelTagPayload) {
	const res = await api.post(`/reels/${reelId}/tags`, payload);
	return res.data.data;
}

export async function deleteReelTag(reelId: string, tagId: string) {
	await api.delete(`/reels/${reelId}/tags/${tagId}`);
}

export interface TapReelTagResponse {
	tag: {
		id: string;
		timestampSeconds: number;
		displayX: number | null;
		displayY: number | null;
	};
	product: {
		id: string;
		name: string;
		priceFils: number;
		imageUrl: string | null;
		inStock: boolean;
		brandId: string | null;
		vendorId: string;
	};
}

export async function tapReelTag(
	reelId: string,
	tagId: string,
): Promise<TapReelTagResponse> {
	await ensureGuestSessionToken();
	const res = await api.post(`/reels/${reelId}/tags/${tagId}/taps`);
	return res.data.data as TapReelTagResponse;
}

export async function deleteReel(reelId: string) {
	await api.delete(`/reels/${reelId}`);
}

export interface GetFeedParams {
	context: "home" | "product" | "brand" | "vendor" | "user" | "category";
	tab?: "for_you" | "latest" | "following";
	productId?: string;
	brandId?: string;
	vendorId?: string;
	userId?: string;
	categoryId?: string;
	categorySlug?: string;
	language?: string;
	cursor?: string;
	limit?: number;
	author_kind?: "creator" | "customer" | "house" | "all";
}

export async function getFeed(params: GetFeedParams) {
	const res = await api.get("/reels/feed", { params });
	// biome-ignore lint/suspicious/noExplicitAny: API response shape — FeedReel DTO pending
	return res.data as { reels: any[]; nextCursor: string | null };
}

export interface RecordViewPayload {
	watchDurationSeconds: number;
	completionPercentage: number;
	deviceType?: string;
}

export async function recordView(reelId: string, payload: RecordViewPayload) {
	// Wait for the guest-session bootstrap before posting — without an identity
	// the backend silently no-ops the increment.
	await ensureGuestSessionToken();
	await api.post(`/reels/${reelId}/views`, payload);
}

export async function toggleLike(reelId: string) {
	const res = await api.post(`/reels/${reelId}/like`);
	return res.data.data as { action: "liked" | "unliked" };
}

export async function toggleSave(reelId: string) {
	const res = await api.post(`/reels/${reelId}/save`);
	return res.data.data as { action: "saved" | "unsaved" };
}

export async function recordShare(reelId: string) {
	const res = await api.post(`/reels/${reelId}/share`);
	return res.data.data as { shareCount: number; shareableUrl: string };
}

export async function toggleFollow(userId: string) {
	const res = await api.post(`/users/${userId}/follow`);
	return res.data.data as { action: "followed" | "unfollowed" };
}

export async function getSavedReels(cursor?: string) {
	const res = await api.get("/me/reels/saved", { params: { cursor } });
	// biome-ignore lint/suspicious/noExplicitAny: API response shape — Reel item DTO pending
	return res.data as { items: any[]; nextCursor: string | null };
}

export async function getWatchHistory(cursor?: string) {
	const res = await api.get("/me/reels/watch-history", { params: { cursor } });
	// biome-ignore lint/suspicious/noExplicitAny: API response shape — WatchHistory item DTO pending
	return res.data as { items: any[]; nextCursor: string | null };
}

export interface UserProfile {
	id: string;
	displayName: string;
	avatarUrl?: string | null;
	followerCount: number;
	followingCount: number;
	publishedReelCount: number;
	isSelf: boolean;
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
	const res = await api.get(`/users/${userId}`);
	return res.data.data as UserProfile;
}

export interface TaggableProductRow {
	product_id: string;
	name: string;
	thumbnail_url: string | null;
	variant_label: string | null;
	delivered_at: string | null;
	source: "purchased" | "vendor_owned" | "permission";
}

export async function fetchTaggableProducts(
	q: string,
	limit = 20,
): Promise<TaggableProductRow[]> {
	const res = await api.get("/me/reels/taggable-products", {
		params: { q: q || undefined, limit },
		timeout: 4000,
	});
	const items =
		(res.data?.data?.items as TaggableProductRow[] | undefined) ??
		(res.data?.items as TaggableProductRow[] | undefined) ??
		[];
	return items;
}
