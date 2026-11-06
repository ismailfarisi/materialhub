import { describe, expect, it, mock } from "bun:test";
import { collectIds, extractDidYouMean } from "./typesense-search.adapter.ts";

// Mock the typesense module before importing the adapter to avoid
// loading the native typesense client (causes Bun/Windows segfault)
mock.module("typesense", () => ({
  default: { Client: class MockClient {} },
  Client: class MockClient {},
}));

// Mock config to avoid requireEnv throwing in tests
mock.module("@materialhub/config", () => ({
  config: {
    typesense: {
      host: "localhost",
      port: 8108,
      protocol: "http",
      apiKey: "test-key",
      collectionName: "products",
    },
  },
}));

class MockAttribute {}
class MockAttributeTranslation {}
class MockAttributeValueTranslation {}
class MockBrand {}

const mockAttributes = [
  {
    id: "attr-skin-type",
    slug: "skin-type",
    name: "Skin type",
    filter_input_type: "checkbox",
    values: [
      {
        id: "val-dry",
        slug: "dry",
        value: "dry",
        display_value: "Dry",
        color_hex: null,
        swatch_image_url: null,
      },
    ],
  },
];

const mockBrands = [
  { id: "brand-dior", slug: "dior", name: "Dior" },
  { id: "brand-ouai", slug: "ouai", name: "Ouai" },
];

mock.module("@materialhub/database", () => ({
  AppDataSource: {
    getRepository(entity: unknown) {
      if (entity === MockAttribute) {
        return {
          find: async () => mockAttributes,
        };
      }
      if (entity === MockAttributeTranslation) {
        return {
          find: async () => [
            {
              attribute_id: "attr-skin-type",
              locale: "ar",
              name: "نوع البشرة",
            },
          ],
        };
      }
      if (entity === MockAttributeValueTranslation) {
        return {
          find: async () => [
            {
              attribute_value_id: "val-dry",
              locale: "ar",
              value: "جافة",
              display_value: "جافة",
            },
          ],
        };
      }
      if (entity === MockBrand) {
        return {
          find: async () => mockBrands,
        };
      }
      throw new Error("Unexpected repository");
    },
  },
  Attribute: MockAttribute,
  AttributeTranslation: MockAttributeTranslation,
  AttributeValueTranslation: MockAttributeValueTranslation,
  Brand: MockBrand,
}));

const { TypesenseSearchAdapter } = await import("./typesense-search.adapter.ts");

describe("TypesenseSearchAdapter", () => {
  it("builds correct search parameters from filters", () => {
    const adapter = new TypesenseSearchAdapter();
    const params = (adapter as any).buildSearchParams({
      query: "red shoes",
      categoryId: "cat-1",
      minPrice: 1000,
      maxPrice: 5000,
      sortBy: "price_asc",
      limit: 20,
    });
    expect(params.q).toBe("red shoes");
    expect(params.query_by).toBe("name,description,tags,category_name,brand_name");
    expect(params.filter_by).toContain("category_ids:=cat-1");
    expect(params.filter_by).toContain("price_min:>= 1000");
    expect(params.filter_by).toContain("price_max:<= 5000");
    expect(params.sort_by).toBe("price_min:asc");
    expect(params.per_page).toBe(20);
  });

  it("defaults to relevance sort when query present", () => {
    const adapter = new TypesenseSearchAdapter();
    const params = (adapter as any).buildSearchParams({ query: "laptop" });
    expect(params.sort_by).toBe("_text_match:desc,rating_avg:desc");
  });

  it("facets on slug-backed brand and vendor fields for filter values", () => {
    const adapter = new TypesenseSearchAdapter();
    const params = (adapter as any).buildSearchParams({});
    expect(params.facet_by).toBe(
      "category_name,brand_slug,attributes,vendor_slug,in_stock,plastic_ban_ready,attr_bag_thickness_microns",
    );
  });

  it("builds filter for inStock", () => {
    const adapter = new TypesenseSearchAdapter();
    const params = (adapter as any).buildSearchParams({ inStock: true });
    expect(params.filter_by).toContain("in_stock:=true");
  });

  it("builds a rating floor filter from minRating (string from URL)", () => {
    const adapter = new TypesenseSearchAdapter();
    const params = (adapter as any).buildSearchParams({ minRating: "4" });
    expect(params.filter_by).toContain("rating_avg:>= 4");
  });

  it("ignores a non-numeric minRating", () => {
    const adapter = new TypesenseSearchAdapter();
    const params = (adapter as any).buildSearchParams({ minRating: "" });
    expect(params.filter_by).not.toContain("rating_avg");
  });
});

describe("TypesenseSearchAdapter.buildSearchParams — AttributeFilterInput kinds", () => {
  const adapter = new TypesenseSearchAdapter();

  it("checkbox: OR across valueIds for same attribute (single :=[...] clause)", () => {
    const params = adapter.buildSearchParams({
      attributes: [
        {
          kind: "checkbox",
          attributeId: "attr-color",
          valueIds: ["val-red", "val-blue"],
        },
      ],
    } as any);
    // Use Typesense array-of-values syntax so the field matches if it
    // contains ANY of the listed values; emitting two separate clauses
    // joined with " && " would force AND semantics and zero out the result.
    expect(params.filter_by).toContain("attributes:=[attr-color:val-red,attr-color:val-blue]");
    expect(params.filter_by).not.toContain("attr-color:val-red && attributes:=attr-color:val-blue");
  });

  it("checkbox: AND across DIFFERENT attributes", () => {
    const params = adapter.buildSearchParams({
      attributes: [
        { kind: "checkbox", attributeId: "attr-color", valueIds: ["val-red"] },
        { kind: "checkbox", attributeId: "attr-size", valueIds: ["val-l"] },
      ],
    } as any);
    expect(params.filter_by).toContain("attributes:=[attr-color:val-red]");
    expect(params.filter_by).toContain("attributes:=[attr-size:val-l]");
    expect(params.filter_by).toContain(" && ");
  });

  it("radio: single attribute:=value clause", () => {
    const params = adapter.buildSearchParams({
      attributes: [{ kind: "radio", attributeId: "attr-gender", valueId: "val-women" }],
    } as any);
    expect(params.filter_by).toContain("attributes:=attr-gender:val-women");
  });

  it("range: numeric bounds on typesense attribute column", () => {
    const params = adapter.buildSearchParams({
      attributes: [{ kind: "range", attributeSlug: "weight", min: 100, max: 500 }],
    } as any);
    expect(params.filter_by).toContain("attr_weight:>=100");
    expect(params.filter_by).toContain("attr_weight:<=500");
  });

  it("toggle: boolean attribute filter", () => {
    const params = adapter.buildSearchParams({
      attributes: [{ kind: "toggle", attributeSlug: "on_sale", value: true }],
    } as any);
    expect(params.filter_by).toContain("attr_on_sale:=true");
  });
});

describe("buildSearchParams skus", () => {
  const adapter = new TypesenseSearchAdapter();
  it("emits a skus array filter clause", () => {
    const params = adapter.buildSearchParams({ skus: ["A", "B"] });
    expect(params.filter_by).toContain("skus:=[A,B]");
  });
  it("omits the clause when no skus", () => {
    const params = adapter.buildSearchParams({});
    expect(params.filter_by).not.toContain("skus:");
  });
});

describe("TypesenseSearchAdapter attribute facet localization", () => {
  it("uses Arabic attribute and value labels when locale is ar", async () => {
    const adapter = new TypesenseSearchAdapter();

    const facets = await (adapter as any).hydrateAttributeFacets(
      [{ value: "attr-skin-type:val-dry", count: 4 }],
      "ar",
    );

    expect(facets).toEqual([
      {
        key: "skin-type",
        attributeId: "attr-skin-type",
        name: "نوع البشرة",
        filter_input_type: "checkbox",
        values: [
          {
            value: "dry",
            label: "جافة",
            count: 4,
            color_hex: null,
            swatch_image_url: null,
          },
        ],
      },
    ]);
  });
});

describe("TypesenseSearchAdapter brand facets", () => {
  it("hydrates brand_slug buckets into storefront brand filter options", async () => {
    const adapter = new TypesenseSearchAdapter();

    const facets = await (adapter as any).hydrateBrandFacets([
      { value: "dior", count: 4 },
      { value: "ouai", count: 2 },
    ]);

    expect(facets).toEqual([
      { value: "dior", label: "Dior", count: 4 },
      { value: "ouai", label: "Ouai", count: 2 },
    ]);
  });
});

describe("extractDidYouMean (pure helper)", () => {
  it("returns null for null/undefined/zero-found result", () => {
    expect(extractDidYouMean(null)).toBeNull();
    expect(extractDidYouMean(undefined)).toBeNull();
    expect(extractDidYouMean({ found: 0, hits: [] })).toBeNull();
  });

  it("extracts the <mark>…</mark> token from the top hit's highlight snippet", () => {
    const result = {
      found: 1,
      hits: [
        {
          document: { name: "Dior Sauvage" },
          highlights: [{ snippet: "<mark>Dior</mark> Sauvage" }],
        },
      ],
    };
    expect(extractDidYouMean(result)).toBe("Dior");
  });

  it("falls back to the first lowercased name token when no highlights are present", () => {
    const result = {
      found: 1,
      hits: [
        {
          document: { name: "Dior Sauvage" },
          highlights: [],
        },
      ],
    };
    expect(extractDidYouMean(result)).toBe("dior");
  });

  it("falls back to first name token when snippet has no <mark> tag", () => {
    const result = {
      found: 1,
      hits: [
        {
          document: { name: "Dior Sauvage" },
          highlights: [{ snippet: "Dior Sauvage" }],
        },
      ],
    };
    expect(extractDidYouMean(result)).toBe("dior");
  });

  it("returns null when hit has no name and no highlight", () => {
    const result = {
      found: 1,
      hits: [{ document: {}, highlights: [] }],
    };
    expect(extractDidYouMean(result)).toBeNull();
  });

  it("TypesenseSearchAdapter.didYouMean returns null on empty/whitespace input", async () => {
    const adapter = new TypesenseSearchAdapter();
    expect(await adapter.didYouMean("")).toBeNull();
    expect(await adapter.didYouMean("   ")).toBeNull();
  });
});

describe("collectIds pagination", () => {
  it("accumulates ids across pages until cap, preserving order", async () => {
    const pages: Record<number, string[]> = { 1: ["a", "b", "c"], 2: ["d", "e"] };
    const fetchPage = async (page: number) => ({ ids: pages[page] ?? [], found: 5 });
    const ids = await collectIds(fetchPage, { cap: 4, perPage: 3 });
    expect(ids).toEqual(["a", "b", "c", "d"]); // capped at 4
  });
});

describe("buildSearchParams — eco catalogue", () => {
  const adapter = new TypesenseSearchAdapter();
  it("filters on admin-approved plastic-ban ready declarations", () => {
    const params = adapter.buildSearchParams({ plasticBanReady: true });
    expect(params.filter_by).toContain("plastic_ban_ready:=true");
  });
  it("omits the clause when the filter is off", () => {
    expect(adapter.buildSearchParams({}).filter_by).not.toContain("plastic_ban_ready");
    expect(adapter.buildSearchParams({ plasticBanReady: false }).filter_by).not.toContain(
      "plastic_ban_ready",
    );
  });
  it("facets on plastic_ban_ready", () => {
    expect(adapter.buildSearchParams({}).facet_by).toContain("plastic_ban_ready");
  });
  it("maps hyphenated range slugs onto the attr_ field name", () => {
    const params = adapter.buildSearchParams({
      attributes: [{ kind: "range", attributeSlug: "bag-thickness-microns", min: 50 }],
    } as any);
    expect(params.filter_by).toContain("attr_bag_thickness_microns:>=50");
    expect(params.filter_by).not.toContain("<=");
  });
});

describe("hydrateRangeFacets — eco catalogue", () => {
  it("turns numeric attr_ facet stats into a range attribute facet", async () => {
    (mockAttributes as any[]).push({
      id: "attr-bag",
      slug: "bag-thickness-microns",
      name: "Bag thickness (microns)",
      filter_input_type: "range",
      values: [],
    });
    const adapter = new TypesenseSearchAdapter();
    const out = await adapter.hydrateRangeFacets({
      attr_bag_thickness_microns: { min: 40, max: 110 },
    });
    expect(out).toEqual([
      {
        key: "bag-thickness-microns",
        attributeId: "attr-bag",
        name: "Bag thickness (microns)",
        filter_input_type: "range",
        values: [],
        min: 40,
        max: 110,
      },
    ]);
    expect(await adapter.hydrateRangeFacets({})).toEqual([]);
    (mockAttributes as any[]).pop();
  });
});
