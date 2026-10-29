import type { PaginatedResult } from "@materialhub/utils";

export type AttributeFilterInput =
  | { kind: "checkbox"; attributeId: string; valueIds: string[] }
  | { kind: "radio"; attributeId: string; valueId: string }
  | { kind: "range"; attributeSlug: string; min?: number; max?: number }
  | { kind: "toggle"; attributeSlug: string; value: true };

export interface ProductFilters {
  query?: string;
  ids?: string[];
  categoryId?: string | string[];
  category?: string | string[];
  categoryPath?: string;
  brandId?: string | string[];
  brand?: string | string[];
  vendorId?: string | string[];
  vendor?: string | string[];
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  tags?: string[];
  skus?: string[];
  attributes?: AttributeFilterInput[];
  inStock?: boolean;
  cursor?: string;
  limit?: number;
  locale?: string;
  sortBy?: "relevance" | "price_asc" | "price_desc" | "newest" | "rating";
}

export interface FacetCount {
  value: string;
  count: number;
}

export interface SearchFacets {
  categories?: FacetCount[];
  brands?: FacetCount[];
  priceRanges?: FacetCount[];
  attributes?: FacetCount[];
  vendors?: FacetCount[];
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  facets?: SearchFacets;
  cursor?: string;
}

export interface SuggestResult {
  text: string;
  highlight: string;
}

export interface SuggestProduct {
  id: string;
  slug: string;
  name: string;
  image_url: string | null;
  price_min: number;
  price_max: number;
}

export interface SuggestCategory {
  id: string;
  name: string;
  slug: string;
}

export interface SuggestBrand {
  id: string;
  name: string;
  slug: string;
}

export interface SuggestResponse {
  products: SuggestProduct[];
  categories: SuggestCategory[];
  brands: SuggestBrand[];
  did_you_mean: string | null; // populated by PR7; always null until then
}

export interface ActiveDealForIndex {
  id: string;
  deal_price: number;
  original_price: number;
  expires_at: Date | string;
}

export interface SearchService {
  searchProducts(filters: ProductFilters): Promise<PaginatedResult<any>>;
  searchProductIds(filters: ProductFilters, cap: number): Promise<string[]>;
  indexProduct(product: any, activeDeal?: ActiveDealForIndex | null): Promise<void>;
  removeProduct(productId: string): Promise<void>;
  suggest(query: string, limit?: number): Promise<SuggestProduct[]>;
  didYouMean?(query: string): Promise<string | null>;
}

export interface AttributeFacetValue {
  value: string; // attribute value slug
  label: string;
  count: number;
  color_hex?: string | null;
  swatch_image_url?: string | null;
}

export interface AttributeFacet {
  key: string; // attribute slug — frontend URL param name
  attributeId: string; // attribute UUID — used when writing Typesense filters
  name: string;
  filter_input_type: "checkbox" | "color_swatch" | "radio" | "range" | "toggle" | null;
  values: AttributeFacetValue[];
}
