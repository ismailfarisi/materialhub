import { api, ensureGuestSessionToken } from "../api";

// --- Types -----------------------------------------------------------------

export interface GiftOccasion {
	id: string;
	name: string;
	slug: string;
	image_url: string | null;
	sort_order: number;
	is_active: boolean;
}

export interface GiftBoxStyle {
	name: string;
	images: string[];
	dimensions: string | null;
	base_price: number;
	max_capacity: number;
}

export interface GiftBoxItem {
	product_id: string;
	variant_id: string | null;
	quantity: number;
}

export interface GiftBox {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	style: GiftBoxStyle;
	hero_image_url: string | null;
	discount_percentage: number;
	items: GiftBoxItem[];
}

export interface GiftBoxPrice {
	itemsSubtotal: number;
	discount: number;
	packaging: number;
	total: number;
	perVendor: Record<string, number>;
}

export interface GiftBoxHydratedItem {
	product_id: string;
	variant_id: string | null;
	vendor_id: string;
	quantity: number;
	unit_price: number;
}

export interface GiftBoxDetail {
	box: GiftBox;
	price: GiftBoxPrice;
	hydratedItems: GiftBoxHydratedItem[];
}

export interface GiftBoxListResult {
	items: GiftBoxDetail[];
	total: number;
	page: number;
	perPage: number;
}

export interface AddGiftBoxToCartInput {
	giftBoxId: string;
	quantity?: number;
	giftMessage?: string | null;
	recipientName?: string | null;
}

// --- Server-side reads (used by server components) -------------------------
// The storefront unwraps the { statusCode, data, timestamp } envelope's `.data`.

export async function getOccasions(): Promise<GiftOccasion[]> {
	const { data } = await api.get("/gift/occasions");
	return data.data as GiftOccasion[];
}

export async function getOccasion(slug: string): Promise<GiftOccasion> {
	const { data } = await api.get(`/gift/occasions/${slug}`);
	return data.data as GiftOccasion;
}

export async function getBoxes(
	occasionSlug?: string,
	page = 1,
	perPage = 24,
): Promise<GiftBoxListResult> {
	const { data } = await api.get("/gift/boxes", {
		params: {
			...(occasionSlug ? { occasion: occasionSlug } : {}),
			page,
			perPage,
		},
	});
	return data.data as GiftBoxListResult;
}

export async function getBox(slug: string): Promise<GiftBoxDetail> {
	const { data } = await api.get(`/gift/boxes/${slug}`);
	return data.data as GiftBoxDetail;
}

// --- Cart mutation ---------------------------------------------------------
// Mirrors useAddToCart: optional-auth POST that relies on the shared `api`
// instance to attach credentials + the x-guest-session header. We bootstrap a
// guest session first (matching the reels client) so anonymous users succeed.

export async function addGiftBoxToCart(
	input: AddGiftBoxToCartInput,
): Promise<unknown> {
	await ensureGuestSessionToken();
	const { data } = await api.post("/cart/gift-box", {
		giftBoxId: input.giftBoxId,
		...(input.quantity != null ? { quantity: input.quantity } : {}),
		...(input.giftMessage != null ? { giftMessage: input.giftMessage } : {}),
		...(input.recipientName != null
			? { recipientName: input.recipientName }
			: {}),
	});
	return data.data;
}
