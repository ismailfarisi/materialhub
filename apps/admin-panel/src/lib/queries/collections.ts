import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export type CollectionKind = "product" | "variant";
export type CollectionSort = "custom" | "price_asc" | "price_desc" | "newest" | "rating";

export interface CollectionRules {
  v: 1;
  match: "all" | "any";
  conditions: {
    category_slugs?: string[];
    brand_slugs?: string[];
    tags?: string[];
    sku_in?: string[];
    price_min?: number;
    price_max?: number;
    in_stock?: boolean;
  };
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  kind: CollectionKind;
  rules: CollectionRules | null;
  default_sort: CollectionSort;
  max_products: number | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CollectionItem {
  item_id: string;
  product_id: string;
  name: string;
  image_url: string | null;
  sku: string | null;
  position: number;
}

export interface SkuResolution {
  matched: { sku: string; id: string; name?: string }[];
  unmatched: string[];
  duplicates: string[];
}

export interface CollectionInput {
  name: string;
  slug?: string;
  description?: string;
  kind?: CollectionKind;
  rules?: CollectionRules | null;
  default_sort?: CollectionSort;
  max_products?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean;
}

type ItemRole = "pin" | "exclude";

const KEY = ["admin", "collections"] as const;

export function useCollections(filters: { search?: string; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.search) params.search = filters.search;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/admin/collections", { params });
      return data.data as { data: Collection[]; total: number; page: number; limit: number };
    },
  });
}

export function useCollection(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get(`/admin/collections/${id}`);
      return data.data as Collection;
    },
  });
}

export function useCollectionItems(id: string | undefined, role: ItemRole) {
  return useQuery({
    queryKey: [...KEY, "items", id, role],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get(`/admin/collections/${id}/items`, { params: { role } });
      return data.data as CollectionItem[];
    },
  });
}

export function useCollectionPreview(
  id: string | undefined,
  opts: { sort?: CollectionSort; page?: number; perPage?: number },
) {
  return useQuery({
    queryKey: [...KEY, "preview", id, opts],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get(`/admin/collections/${id}/preview`, { params: opts });
      return data.data as {
        items: any[];
        total: number;
        page: number;
        perPage: number;
        hasMore: boolean;
      };
    },
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CollectionInput) => {
      const { data } = await api.post("/admin/collections", body);
      return data.data as Collection;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: CollectionInput & { id: string }) => {
      const { data } = await api.patch(`/admin/collections/${id}`, body);
      return data.data as Collection;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: [...KEY, "detail", vars.id] });
      qc.invalidateQueries({ queryKey: [...KEY, "preview", vars.id] });
    },
  });
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/admin/collections/${id}`);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

function invalidateItems(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: [...KEY, "items", id] });
  qc.invalidateQueries({ queryKey: [...KEY, "preview", id] });
}

export function useResolveSkus() {
  return useMutation({
    mutationFn: async (body: { kind?: CollectionKind; skus: string[] }) => {
      const { data } = await api.post("/admin/collections/resolve-skus", body);
      return data.data as SkuResolution;
    },
  });
}

export function useAddItems(collectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      role: ItemRole;
      entries: { product_id?: string; variant_id?: string; source_sku?: string }[];
    }) => {
      const { data } = await api.post(`/admin/collections/${collectionId}/items`, body);
      return data.data;
    },
    onSuccess: () => invalidateItems(qc, collectionId),
  });
}

export function useReorderItems(collectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemIds: string[]) => {
      const { data } = await api.patch(`/admin/collections/${collectionId}/items/reorder`, {
        itemIds,
      });
      return data.data;
    },
    onSuccess: () => invalidateItems(qc, collectionId),
  });
}

export function useRemoveItem(collectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { data } = await api.delete(`/admin/collections/${collectionId}/items/${itemId}`);
      return data.data;
    },
    onSuccess: () => invalidateItems(qc, collectionId),
  });
}
