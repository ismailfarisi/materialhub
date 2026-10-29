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
