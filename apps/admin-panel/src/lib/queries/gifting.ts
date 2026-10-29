import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

// ---------------------------------------------------------------------------
// Occasions
// ---------------------------------------------------------------------------

export interface GiftOccasion {
	id: string;
	name: string;
	slug: string;
	image_url: string | null;
	sort_order: number;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface GiftOccasionInput {
	name: string;
	slug?: string;
	image_url?: string | null;
	sort_order?: number;
	is_active?: boolean;
}

const OCCASIONS_KEY = ["admin", "gift", "occasions"] as const;

export function useGiftOccasions() {
	return useQuery({
		queryKey: OCCASIONS_KEY,
		queryFn: async () => {
			const { data } = await api.get("/admin/gift/occasions");
			return data.data as GiftOccasion[];
		},
	});
}

export function useCreateGiftOccasion() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (body: GiftOccasionInput) => {
			const { data } = await api.post("/admin/gift/occasions", body);
			return data.data as GiftOccasion;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: OCCASIONS_KEY }),
	});
}

export function useUpdateGiftOccasion() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			...body
		}: Partial<GiftOccasionInput> & { id: string }) => {
			const { data } = await api.patch(`/admin/gift/occasions/${id}`, body);
			return data.data as GiftOccasion;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: OCCASIONS_KEY }),
	});
}

export function useDeleteGiftOccasion() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.delete(`/admin/gift/occasions/${id}`);
			return data.data;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: OCCASIONS_KEY }),
	});
}

// ---------------------------------------------------------------------------
// Box Styles
// ---------------------------------------------------------------------------

export interface GiftStyleDimensions {
	length: number;
	width: number;
	height: number;
	unit: string;
}

export interface GiftStyle {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	dimensions: GiftStyleDimensions | null;
	max_capacity: number | null;
	/** Stored in fils (smallest currency unit). */
	base_price: number;
	images: string[];
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export interface GiftStyleInput {
	name: string;
	slug?: string;
	description?: string | null;
	dimensions?: GiftStyleDimensions | null;
	max_capacity?: number | null;
	/** Sent in fils (smallest currency unit). */
	base_price?: number;
	images?: string[];
	is_active?: boolean;
}

const STYLES_KEY = ["admin", "gift", "styles"] as const;

export function useGiftStyles() {
	return useQuery({
		queryKey: STYLES_KEY,
		queryFn: async () => {
			const { data } = await api.get("/admin/gift/styles");
			return data.data as GiftStyle[];
		},
	});
}

export function useCreateGiftStyle() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (body: GiftStyleInput) => {
			const { data } = await api.post("/admin/gift/styles", body);
			return data.data as GiftStyle;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: STYLES_KEY }),
	});
}

export function useUpdateGiftStyle() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			...body
		}: Partial<GiftStyleInput> & { id: string }) => {
			const { data } = await api.patch(`/admin/gift/styles/${id}`, body);
			return data.data as GiftStyle;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: STYLES_KEY }),
	});
}

export function useDeleteGiftStyle() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.delete(`/admin/gift/styles/${id}`);
			return data.data;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: STYLES_KEY }),
	});
}

// ---------------------------------------------------------------------------
// Gift Boxes
// ---------------------------------------------------------------------------

export interface GiftBoxItem {
	id: string;
	product_id: string;
	variant_id: string | null;
	quantity: number;
	sort_order: number;
}

export interface GiftBox {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	style_id: string;
	hero_image_url: string | null;
	/** Whole-number percentage (e.g. 10 = 10% off). */
	discount_percentage: number;
	is_active: boolean;
	starts_at: string | null;
	expires_at: string | null;
	style?: GiftStyle;
	items: GiftBoxItem[];
	occasions?: GiftOccasion[];
}

/** Authoritative price breakdown from the backend (all amounts in fils). */
export interface GiftBoxPrice {
	itemsSubtotal: number;
	discount: number;
	packaging: number;
	total: number;
	perVendor: Array<{ vendor_id: string; subtotal: number }>;
}

/** Server-resolved per-item pricing (fils), used to seed the client price meter. */
export interface GiftBoxHydratedItem {
	product_id: string;
	variant_id: string | null;
	vendor_id: string;
	quantity: number;
	/** Unit price in fils. */
	unit_price: number;
}

export interface GiftBoxDetail {
	box: GiftBox;
	price: GiftBoxPrice;
	hydratedItems: GiftBoxHydratedItem[];
}

export interface GiftBoxItemInput {
	product_id: string;
	variant_id?: string | null;
	quantity: number;
	sort_order?: number;
}

export interface GiftBoxInput {
	name: string;
	slug?: string;
	description?: string | null;
	/** Box style UUID (required on create). */
	style_id: string;
	hero_image_url?: string | null;
	discount_percentage?: number;
	is_active?: boolean;
	starts_at?: string | null;
	expires_at?: string | null;
	occasion_ids?: string[];
	items?: GiftBoxItemInput[];
}

const BOXES_KEY = ["admin", "gift", "boxes"] as const;

/**
 * Lists gift boxes via the admin endpoint GET /admin/gift/boxes, which returns
 * ALL boxes (active AND inactive/scheduled), unlike the public /gift/boxes.
 */
export function useGiftBoxes() {
	return useQuery({
		queryKey: BOXES_KEY,
		queryFn: async () => {
			const { data } = await api.get("/admin/gift/boxes");
			return data.data as { items: GiftBoxDetail[]; total: number };
		},
	});
}

export function useGiftBox(id: string | null | undefined) {
	return useQuery({
		queryKey: [...BOXES_KEY, id],
		queryFn: async () => {
			const { data } = await api.get(`/admin/gift/boxes/${id}`);
			return data.data as GiftBoxDetail;
		},
		enabled: !!id && id !== "new",
	});
}

export function useCreateGiftBox() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (body: GiftBoxInput) => {
			const { data } = await api.post("/admin/gift/boxes", body);
			return data.data as GiftBoxDetail;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: BOXES_KEY }),
	});
}

export function useUpdateGiftBox() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			...body
		}: Partial<GiftBoxInput> & { id: string }) => {
			const { data } = await api.patch(`/admin/gift/boxes/${id}`, body);
			return data.data as GiftBoxDetail;
		},
		onSuccess: (_data, { id }) => {
			qc.invalidateQueries({ queryKey: BOXES_KEY });
			qc.invalidateQueries({ queryKey: [...BOXES_KEY, id] });
		},
	});
}

export function useDeleteGiftBox() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.delete(`/admin/gift/boxes/${id}`);
			return data.data;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: BOXES_KEY }),
	});
}

// ---------------------------------------------------------------------------
// Admin product search (for the box item picker)
// ---------------------------------------------------------------------------

export interface AdminProductSearchResult {
	id: string;
	name: string;
	sku: string | null;
	/** Unit price in fils. */
	price: number;
	image_url: string | null;
	vendor_id: string | null;
	vendor_name: string | null;
}

/**
 * Searches admin products for the box item picker. Reuses the same
 * `GET /admin/products?search=` endpoint the collections item picker uses
 * (see `searchAdminProductsLookup` in lib/queries/lookups.ts), but also
 * returns price/image so the picker can seed the client-side price meter.
 */
export function useAdminProductSearch(query: string) {
	return useQuery({
		queryKey: ["admin", "products", "gift-search", query],
		queryFn: async (): Promise<AdminProductSearchResult[]> => {
			const params: Record<string, string | number> = { limit: 20 };
			if (query) params.search = query;
			const { data } = await api.get("/admin/products", { params });
			const items = data.data?.items ?? [];
			return items.map((p: any): AdminProductSearchResult => {
				const primaryImage =
					(p.images ?? []).find((i: any) => i.is_primary) ??
					(p.images ?? [])[0] ??
					null;
				return {
					id: p.id,
					name: p.name,
					sku: p.sku ?? null,
					price: p.price ?? 0,
					image_url: primaryImage?.url ?? p.image_url ?? null,
					vendor_id: p.vendor?.id ?? p.vendor_id ?? null,
					vendor_name: p.vendor?.business_name ?? null,
				};
			});
		},
		enabled: query.length === 0 || query.length >= 2,
	});
}
