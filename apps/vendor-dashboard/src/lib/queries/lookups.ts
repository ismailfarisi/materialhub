import { api } from "../api";
import type { LookupItem } from "@/components/ui/entity-combobox";

// ─── Vendor's Own Products ──────────────────────────────────────────

export async function searchVendorProductsLookup(q: string): Promise<LookupItem[]> {
  const params: Record<string, string | number> = { limit: 20 };
  if (q) params.search = q;
  const { data } = await api.get("/products/mine", { params });
  const items = data.data?.items ?? [];
  return items.map((p: any) => ({
    id: p.id,
    label: p.name,
    sublabel: p.sku ?? undefined,
  }));
}

export async function getVendorProductByIdLookup(
  id: string,
): Promise<LookupItem | null> {
  try {
    const { data } = await api.get(`/products/${id}`);
    const p = data.data;
    if (!p) return null;
    return { id: p.id, label: p.name, sublabel: p.sku ?? undefined };
  } catch {
    return null;
  }
}

// ─── Vendor's Product Variants ──────────────────────────────────────

export async function searchVendorVariantsLookup(
  productId: string,
): Promise<LookupItem[]> {
  if (!productId) return [];
  try {
    const { data } = await api.get(`/products/${productId}`);
    const variants = data.data?.variants ?? [];
    return variants.map((v: any) => ({
      id: v.id,
      label: v.sku ?? v.id.slice(0, 8),
      sublabel: variantOptionLabel(v),
    }));
  } catch {
    return [];
  }
}

export async function getVendorVariantByIdLookup(
  productId: string,
  variantId: string,
): Promise<LookupItem | null> {
  if (!productId || !variantId) return null;
  const variants = await searchVendorVariantsLookup(productId);
  return variants.find((v) => v.id === variantId) ?? null;
}

function variantOptionLabel(v: any): string | undefined {
  const opts = v.options ?? v.option_values ?? null;
  if (!opts) return undefined;
  if (Array.isArray(opts)) {
    return opts
      .map((o: any) => o.value ?? o.label ?? o.name)
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

// ─── Product pricing (vendor) — for flash-deal preview ───────────────

export type VendorProductPricing = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  currency: string;
  image_url: string | null;
};

export type VendorVariantPricing = {
  id: string;
  sku: string | null;
  options: Record<string, string> | Array<{ name: string; value: string }> | null;
  price: number | null;
  compare_at_price: number | null;
};

export async function getVendorProductPricing(
  id: string,
): Promise<VendorProductPricing | null> {
  if (!id) return null;
  try {
    const { data } = await api.get(`/products/${id}`);
    const p = data.data;
    if (!p) return null;
    const primaryImage =
      (p.images ?? []).find((i: any) => i.is_primary) ?? (p.images ?? [])[0] ?? null;
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      compare_at_price: p.compare_at_price ?? null,
      currency: p.currency ?? "AED",
      image_url: primaryImage?.url ?? null,
    };
  } catch {
    return null;
  }
}

export async function getVendorVariantPricing(
  productId: string,
  variantId: string,
): Promise<VendorVariantPricing | null> {
  if (!productId || !variantId) return null;
  try {
    const { data } = await api.get(`/products/${productId}`);
    const variant = (data.data?.variants ?? []).find((v: any) => v.id === variantId);
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
