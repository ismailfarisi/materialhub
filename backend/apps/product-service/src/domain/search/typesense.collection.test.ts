import { describe, expect, it } from "bun:test";
import { productCollectionSchema, productToDocument } from "./typesense.collection.ts";

describe("productCollectionSchema", () => {
  it("has correct collection name and fields", () => {
    expect(productCollectionSchema.name).toBe("products");
    const fieldNames = productCollectionSchema.fields.map((f: any) => f.name);
    expect(fieldNames).toContain("name");
    expect(fieldNames).toContain("description");
    expect(fieldNames).toContain("category_name");
    expect(fieldNames).toContain("category_ids");
    expect(fieldNames).toContain("category_slugs");
    expect(fieldNames).toContain("brand_name");
    expect(fieldNames).toContain("vendor_name");
    expect(fieldNames).toContain("price_min");
    expect(fieldNames).toContain("tags");
    expect(fieldNames).toContain("rating_avg");
    expect(fieldNames).toContain("in_stock");
    expect(fieldNames).toContain("attributes");
  });

  it("category_ids and category_slugs are multi-valued (string[])", () => {
    const fields = productCollectionSchema.fields as Array<{ name: string; type: string }>;
    const ids = fields.find((f) => f.name === "category_ids");
    const slugs = fields.find((f) => f.name === "category_slugs");
    expect(ids?.type).toBe("string[]");
    expect(slugs?.type).toBe("string[]");
  });

  it("enables default sorting on price_min", () => {
    expect(productCollectionSchema.default_sorting_field).toBe("price_min");
  });
});

describe("productToDocument", () => {
  it("maps a product entity to a Typesense document", () => {
    const product = {
      id: "uuid-1",
      name: "Test Product",
      short_description: "Short desc",
      category: { name: "Electronics" },
      brand: { name: "BrandX" },
      vendor: { store_name: "VendorY" },
      vendor_id: "vendor-uuid",
      price: 5000,
      compare_at_price: 6000,
      tags: ["tag1", "tag2"],
      rating_avg: 4.5,
      status: "published",
      variants: [
        { price: 4500, is_active: true },
        { price: 5500, is_active: true },
      ],
      inventoryRecords: [{ quantity_on_hand: 10, quantity_reserved: 2 }],
      created_at: new Date("2026-01-01"),
    };
    const doc = productToDocument(product as any);
    expect(doc.id).toBe("uuid-1");
    expect(doc.price_min).toBe(4500);
    expect(doc.in_stock).toBe(true);
    expect(doc.category_name).toBe("Electronics");
  });

  it("prefers medium product images for storefront cards", () => {
    const product = {
      id: "uuid-images",
      name: "Image Product",
      slug: "image-product",
      category: { name: "Packaging" },
      vendor: {},
      vendor_id: "v",
      price: 1000,
      status: "published",
      variants: [],
      inventoryRecords: [],
      images: [
        {
          url: "https://cdn.example.com/large.webp",
          medium_url: "https://cdn.example.com/medium.webp",
          card_url: "https://cdn.example.com/card.webp",
          thumbnail_url: "https://cdn.example.com/thumb.webp",
          is_primary: true,
          sort_order: 0,
        },
      ],
      created_at: new Date("2026-01-01"),
    };

    const doc = productToDocument(product);

    expect(doc.images).toEqual(["https://cdn.example.com/medium.webp"]);
  });

  it("uses provided ancestors for category_ids / category_slugs", () => {
    const product = {
      id: "uuid-3",
      name: "Subtree Product",
      category_id: "leaf-id",
      category: { name: "Perfume Oils & Attars", slug: "perfume-oils-attars" },
      vendor: {},
      vendor_id: "v",
      price: 1000,
      status: "published",
      variants: [],
      inventoryRecords: [],
      created_at: new Date("2026-01-01"),
    };
    const doc = productToDocument(product as any, {
      ids: ["leaf-id", "papers-id", "packaging-id"],
      slugs: ["kraft-paper", "papers", "packaging-papers"],
    });
    expect(doc.category_ids).toEqual(["leaf-id", "papers-id", "packaging-id"]);
    expect(doc.category_slugs).toEqual(["kraft-paper", "papers", "packaging-papers"]);
  });

  it("falls back to leaf-only when ancestors are not provided", () => {
    const product = {
      id: "uuid-4",
      name: "Leaf-Only Product",
      category_id: "leaf-id",
      category: { name: "Perfume Oils & Attars", slug: "perfume-oils-attars" },
      vendor: {},
      vendor_id: "v",
      price: 1000,
      status: "published",
      variants: [],
      inventoryRecords: [],
      created_at: new Date("2026-01-01"),
    };
    const doc = productToDocument(product as any);
    expect(doc.category_ids).toEqual(["leaf-id"]);
    expect(doc.category_slugs).toEqual(["perfume-oils-attars"]);
  });

  it("sets in_stock to false when no inventory available", () => {
    const product = {
      id: "uuid-2",
      name: "Sold Out Product",
      category: { name: "Books" },
      vendor: { store_name: "VendorZ" },
      vendor_id: "vendor-uuid",
      price: 3000,
      status: "published",
      variants: [],
      inventoryRecords: [{ quantity_on_hand: 5, quantity_reserved: 5 }],
      created_at: new Date("2026-01-01"),
    };
    const doc = productToDocument(product as any);
    expect(doc.in_stock).toBe(false);
  });

  it("uses product price and compare_at_price (MSRP) as-is", () => {
    const product = {
      id: "uuid-plain",
      name: "Plain Product",
      category: { name: "Packaging" },
      vendor: {},
      vendor_id: "v",
      price: 6500,
      compare_at_price: 8000,
      status: "published",
      variants: [],
      inventoryRecords: [],
      created_at: new Date("2026-01-01"),
    };
    const doc = productToDocument(product as any);
    expect(doc.price_min).toBe(6500);
    expect(doc.compare_at_price).toBe(8000);
  });
});

describe("productToDocument skus", () => {
  it("collects product sku + active variant skus, deduped", () => {
    const doc = productToDocument({
      id: "p1",
      name: "Serum",
      slug: "serum",
      status: "published",
      vendor_id: "v1",
      category_id: "c1",
      price: 1000,
      created_at: new Date(),
      sku: "PROD-1",
      variants: [
        { is_active: true, price: 1000, sku: "VAR-1" },
        { is_active: true, price: 1200, sku: "VAR-2" },
        { is_active: false, price: 900, sku: "VAR-OLD" },
      ],
    });
    expect(doc.skus?.sort()).toEqual(["PROD-1", "VAR-1", "VAR-2"]);
  });

  it("omits skus when none present", () => {
    const doc = productToDocument({
      id: "p2",
      name: "x",
      slug: "x",
      status: "published",
      vendor_id: "v1",
      category_id: "c1",
      price: 1000,
      created_at: new Date(),
    });
    expect(doc.skus).toBeUndefined();
  });
});
