import type { LookupItem } from "@/components/ui/entity-combobox";
import { api } from "../api";

// ─── Products (admin) ────────────────────────────────────────────────

export async function searchAdminProductsLookup(
	q: string,
	vendorId?: string | null,
): Promise<LookupItem[]> {
	const params: Record<string, string | number> = { limit: 20 };
	if (q) params.search = q;
	if (vendorId) params.vendor_id = vendorId;
	const { data } = await api.get("/admin/products", { params });
	const items = data.data?.items ?? [];
	return items.map(
		(p: {
			id: string;
			name: string;
			vendor?: { business_name?: string };
			sku?: string;
		}) => ({
			id: p.id,
			label: p.name,
			sublabel: p.vendor?.business_name ?? p.sku ?? undefined,
		}),
	);
}

export async function getAdminProductByIdLookup(
	id: string,
): Promise<LookupItem | null> {
	try {
		const { data } = await api.get(`/admin/products/${id}`);
		const p = data.data;
		if (!p) return null;
		return {
			id: p.id,
			label: p.name,
			sublabel: p.vendor?.business_name ?? p.sku ?? undefined,
		};
	} catch {
		return null;
	}
}

// ─── Users (admin) — server search ───────────────────────────────────

function userLabel(u: {
	id: string;
	first_name?: string;
	last_name?: string;
	email?: string;
	role?: string;
}): LookupItem {
	const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
	return {
		id: u.id,
		label: name || u.email || "Unknown User",
		sublabel: name ? u.email : u.role,
	};
}

export async function searchAdminUsersLookup(q: string): Promise<LookupItem[]> {
	const params: Record<string, string | number> = { limit: 20 };
	if (q) params.search = q;
	const { data } = await api.get("/admin/users", { params });
	const items = data.data?.users ?? data.data?.items ?? [];
	return items.map(userLabel);
}

export async function getAdminUserByIdLookup(
	id: string,
): Promise<LookupItem | null> {
	try {
		const { data } = await api.get(`/admin/users/${id}`);
		const u = data.data;
		return u ? userLabel(u) : null;
	} catch {
		return null;
	}
}

// ─── Attributes (admin) — bounded list, in-memory ────────────────────────

let attributeCache: Promise<LookupItem[]> | null = null;

async function loadAttributesFlat(): Promise<LookupItem[]> {
	if (!attributeCache) {
		attributeCache = (async () => {
			const { data } = await api.get("/admin/attributes", {
				params: { limit: 1000 },
			});
			const items = data.data?.data ?? data.data?.items ?? data.data ?? [];
			return items.map((a: { id: string; name: string; type: string }) => ({
				id: a.id,
				label: a.name,
				sublabel: a.type,
			}));
		})();
	}
	return attributeCache;
}

export async function searchAdminAttributesLookup(
	q: string,
): Promise<LookupItem[]> {
	const all = await loadAttributesFlat();
	if (!q) return all.slice(0, 50);
	const ql = q.toLowerCase();
	return all.filter((a) => a.label.toLowerCase().includes(ql)).slice(0, 50);
}

export async function getAdminAttributeByIdLookup(
	id: string,
): Promise<LookupItem | null> {
	const all = await loadAttributesFlat();
	return all.find((a) => a.id === id) ?? null;
}

type TreeNode = {
	id: string;
	name: string;
	slug?: string;
	children?: TreeNode[];
};

// ─── Categories (admin) — full tree, in-memory ───────────────────────

let categoryCache: Promise<LookupItem[]> | null = null;

async function loadCategoriesFlat(): Promise<LookupItem[]> {
	if (!categoryCache) {
		categoryCache = (async () => {
			const { data } = await api.get("/categories/tree");
			const flat: LookupItem[] = [];
			function walk(nodes: TreeNode[], pathLabel: string) {
				for (const n of nodes ?? []) {
					const label = pathLabel ? `${pathLabel} › ${n.name}` : n.name;
					flat.push({ id: n.id, label });
					if (n.children?.length) walk(n.children, label);
				}
			}
			walk(data.data ?? [], "");
			return flat;
		})();
	}
	return categoryCache;
}

export async function searchAdminCategoriesLookup(
	q: string,
): Promise<LookupItem[]> {
	const all = await loadCategoriesFlat();
	if (!q) return all.slice(0, 50);
	const ql = q.toLowerCase();
	return all.filter((c) => c.label.toLowerCase().includes(ql)).slice(0, 50);
}

export async function getAdminCategoryByIdLookup(
	id: string,
): Promise<LookupItem | null> {
	const all = await loadCategoriesFlat();
	return all.find((c) => c.id === id) ?? null;
}

// ─── Brands (admin) — bounded list, in-memory ────────────────────────

let brandCache: Promise<LookupItem[]> | null = null;

async function loadBrandsFlat(): Promise<LookupItem[]> {
	if (!brandCache) {
		brandCache = (async () => {
			const { data } = await api.get("/admin/brands", {
				params: { limit: 200 },
			});
			const items = data.data?.data ?? data.data?.items ?? data.data ?? [];
			return items.map((b: { id: string; name: string; slug?: string }) => ({
				id: b.id,
				label: b.name,
			}));
		})();
	}
	return brandCache;
}

export async function searchAdminBrandsLookup(
	q: string,
): Promise<LookupItem[]> {
	const all = await loadBrandsFlat();
	if (!q) return all.slice(0, 50);
	const ql = q.toLowerCase();
	return all.filter((b) => b.label.toLowerCase().includes(ql)).slice(0, 50);
}

export async function getAdminBrandByIdLookup(
	id: string,
): Promise<LookupItem | null> {
	const all = await loadBrandsFlat();
	return all.find((b) => b.id === id) ?? null;
}

// ─── Vendors (admin) — server search ─────────────────────────────────

export async function searchAdminVendorsLookup(
	q: string,
): Promise<LookupItem[]> {
	const params: Record<string, string | number> = { limit: 20 };
	if (q) params.search = q;
	const { data } = await api.get("/admin/vendors", { params });
	const items = data.data?.data ?? [];
	return items.map(
		(v: {
			id: string;
			business_name?: string;
			contact_email?: string;
			sku?: string;
			options?: unknown;
			option_values?: unknown;
			price?: number;
			compare_at_price?: number;
		}) => ({
			id: v.id,
			label: v.business_name ?? "Unnamed vendor",
			sublabel: v.contact_email ?? undefined,
		}),
	);
}

export async function getAdminVendorByIdLookup(
	id: string,
): Promise<LookupItem | null> {
	try {
		const { data } = await api.get(`/admin/vendors/${id}`);
		const v = data.data;
		if (!v) return null;
		return {
			id: v.id,
			label: v.business_name ?? "Unnamed vendor",
			sublabel: v.contact_email ?? undefined,
		};
	} catch {
		return null;
	}
}

// ─── Variants (admin) — derived from product detail ──────────────────

export async function searchAdminVariantsLookup(
	productId: string,
): Promise<LookupItem[]> {
	if (!productId) return [];
	try {
		const { data } = await api.get(`/admin/products/${productId}`);
		const variants = data.data?.variants ?? [];
		return variants.map(
			(v: {
				id: string;
				business_name?: string;
				contact_email?: string;
				sku?: string;
				options?: unknown;
				option_values?: unknown;
				price?: number;
				compare_at_price?: number;
			}) => ({
				id: v.id,
				label: v.sku ?? v.id.slice(0, 8),
				sublabel: variantOptionLabel(v),
			}),
		);
	} catch {
		return [];
	}
}

export async function getAdminVariantByIdLookup(
	productId: string,
	variantId: string,
): Promise<LookupItem | null> {
	if (!productId || !variantId) return null;
	const variants = await searchAdminVariantsLookup(productId);
	return variants.find((v) => v.id === variantId) ?? null;
}

function variantOptionLabel(v: {
	id: string;
	business_name?: string;
	contact_email?: string;
	sku?: string;
	options?: unknown;
	option_values?: unknown;
	price?: number;
	compare_at_price?: number;
}): string | undefined {
	const opts = v.options ?? v.option_values ?? null;
	if (!opts) return undefined;
	if (Array.isArray(opts)) {
		return opts
			.map(
				(o: { value?: string; label?: string; name?: string }) =>
					o.value ?? o.label ?? o.name,
			)
			.filter(Boolean)
			.join(" / ");
	}
	if (typeof opts === "object") {
		return Object.entries(opts)
			.map(([k, val]) => `${k}: ${val}`)
			.join(" / ");
	}
	return undefined;
}

// ─── Product pricing (admin) — for flash-deal preview ────────────────

export type ProductPricing = {
	id: string;
	name: string;
	slug: string;
	price: number;
	compare_at_price: number | null;
	currency: string;
	image_url: string | null;
	vendor: { id: string; business_name: string };
};

export type VariantPricing = {
	id: string;
	sku: string | null;
	options:
		| Record<string, string>
		| Array<{ name: string; value: string }>
		| null;
	price: number | null;
	compare_at_price: number | null;
};

export async function getAdminProductPricing(
	id: string,
): Promise<ProductPricing | null> {
	if (!id) return null;
	try {
		const { data } = await api.get(`/admin/products/${id}`);
		const p = data.data;
		if (!p) return null;
		const primaryImage =
			(p.images ?? []).find(
				(i: { is_primary?: boolean; url?: string }) => i.is_primary,
			) ??
			(p.images ?? [])[0] ??
			null;
		return {
			id: p.id,
			name: p.name,
			slug: p.slug,
			price: p.price,
			compare_at_price: p.compare_at_price ?? null,
			currency: p.currency ?? "AED",
			image_url: primaryImage?.url ?? null,
			vendor: {
				id: p.vendor?.id ?? p.vendor_id,
				business_name: p.vendor?.business_name ?? "Unknown vendor",
			},
		};
	} catch {
		return null;
	}
}

export async function getAdminVariantPricing(
	productId: string,
	variantId: string,
): Promise<VariantPricing | null> {
	if (!productId || !variantId) return null;
	try {
		const { data } = await api.get(`/admin/products/${productId}`);
		const variant = (data.data?.variants ?? []).find(
			(v: {
				id: string;
				business_name?: string;
				contact_email?: string;
				sku?: string;
				options?: unknown;
				option_values?: unknown;
				price?: number;
				compare_at_price?: number;
			}) => v.id === variantId,
		);
		if (!variant) return null;
		return {
			id: variant.id,
			sku: variant.sku ?? null,
			options: variant.options ?? variant.option_values ?? null,
			price: variant.price ?? null,
			compare_at_price: variant.compare_at_price ?? null,
		};
	} catch {
		return null;
	}
}

// ─── Category SLUGS (for collection rules) ───────────────────────────
let categorySlugCache: Promise<LookupItem[]> | null = null;

async function loadCategorySlugsFlat(): Promise<LookupItem[]> {
	if (!categorySlugCache) {
		categorySlugCache = (async () => {
			const { data } = await api.get("/categories/tree");
			const flat: LookupItem[] = [];
			function walk(nodes: TreeNode[], pathLabel: string) {
				for (const n of nodes ?? []) {
					const label = pathLabel ? `${pathLabel} › ${n.name}` : n.name;
					if (n.slug) flat.push({ id: n.slug, label });
					if (n.children?.length) walk(n.children, label);
				}
			}
			walk(data.data ?? [], "");
			return flat;
		})();
	}
	return categorySlugCache;
}

export async function searchAdminCategorySlugsLookup(
	q: string,
): Promise<LookupItem[]> {
	const all = await loadCategorySlugsFlat();
	if (!q) return all.slice(0, 50);
	const ql = q.toLowerCase();
	return all.filter((c) => c.label.toLowerCase().includes(ql)).slice(0, 50);
}

export async function getAdminCategorySlugLookup(
	slug: string,
): Promise<LookupItem | null> {
	const all = await loadCategorySlugsFlat();
	return all.find((c) => c.id === slug) ?? null;
}

// ─── Brand SLUGS (for collection rules) ──────────────────────────────
let brandSlugCache: Promise<LookupItem[]> | null = null;

async function loadBrandSlugsFlat(): Promise<LookupItem[]> {
	if (!brandSlugCache) {
		brandSlugCache = (async () => {
			const { data } = await api.get("/admin/brands", {
				params: { limit: 200 },
			});
			const items = data.data?.data ?? data.data?.items ?? data.data ?? [];
			return items
				.filter((b: { id: string; name: string; slug?: string }) => b.slug)
				.map((b: { id: string; name: string; slug?: string }) => ({
					id: b.slug,
					label: b.name,
				}));
		})();
	}
	return brandSlugCache;
}

export async function searchAdminBrandSlugsLookup(
	q: string,
): Promise<LookupItem[]> {
	const all = await loadBrandSlugsFlat();
	if (!q) return all.slice(0, 50);
	const ql = q.toLowerCase();
	return all.filter((b) => b.label.toLowerCase().includes(ql)).slice(0, 50);
}

export async function getAdminBrandSlugLookup(
	slug: string,
): Promise<LookupItem | null> {
	const all = await loadBrandSlugsFlat();
	return all.find((b) => b.id === slug) ?? null;
}
