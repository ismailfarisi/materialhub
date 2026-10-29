import { describe, expect, it } from "bun:test";
import {
  type VendorAreaSets,
  resolveAreas,
  serviceOfferingCollectionSchema,
  serviceOfferingToDocument,
} from "./service-offering.collection.ts";

const MARINA = { id: "area-marina", slug: "dubai-marina", name: "Dubai Marina" };
const JBR = { id: "area-jbr", slug: "jbr", name: "JBR" };
const DEIRA = { id: "area-deira", slug: "deira", name: "Deira" };

const AREAS: VendorAreaSets = { premises: [MARINA, JBR], homeVisit: [DEIRA, JBR] };

function offering(overrides: Record<string, unknown> = {}) {
  return {
    id: "off-1",
    slug: "balayage-off-1",
    name: "Balayage",
    description: "Hand-painted highlights",
    vendor_id: "vendor-1",
    vendor: { name: "Glow Studio", slug: "glow-studio" },
    category_id: "cat-hair",
    category: { name: "Hair", slug: "hair" },
    price_fils: 45000,
    duration_minutes: 90,
    location_mode: "at_premises",
    payment_mode: "deposit",
    media_urls: ["https://cdn/x.jpg"],
    status: "published",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("serviceOfferingCollectionSchema", () => {
  it("is named service_offerings and sorts by price_fils", () => {
    expect(serviceOfferingCollectionSchema.name).toBe("service_offerings");
    expect(serviceOfferingCollectionSchema.default_sorting_field).toBe("price_fils");
  });

  it("declares area_ids and location_mode as facets", () => {
    const byName = new Map(serviceOfferingCollectionSchema.fields?.map((f) => [f.name, f]));
    expect(byName.get("area_ids")?.facet).toBe(true);
    expect(byName.get("location_mode")?.facet).toBe(true);
  });
});

describe("serviceOfferingToDocument — mode-aware areas", () => {
  it("at_premises uses branch areas only", () => {
    const doc = serviceOfferingToDocument(offering({ location_mode: "at_premises" }), AREAS);
    expect(doc.area_ids.sort()).toEqual(["area-jbr", "area-marina"]);
    expect(doc.premises_area_ids?.sort()).toEqual(["area-jbr", "area-marina"]);
    expect(doc.home_visit_area_ids ?? []).toEqual([]);
  });

  it("home_visit uses service areas only", () => {
    const doc = serviceOfferingToDocument(offering({ location_mode: "home_visit" }), AREAS);
    expect(doc.area_ids.sort()).toEqual(["area-deira", "area-jbr"]);
    expect(doc.home_visit_area_ids?.sort()).toEqual(["area-deira", "area-jbr"]);
    expect(doc.premises_area_ids ?? []).toEqual([]);
  });

  it("either unions both and de-duplicates the overlap", () => {
    const doc = serviceOfferingToDocument(offering({ location_mode: "either" }), AREAS);
    // JBR is in both sets and must appear exactly once.
    expect(doc.area_ids.sort()).toEqual(["area-deira", "area-jbr", "area-marina"]);
    expect(doc.area_ids.filter((a) => a === "area-jbr")).toHaveLength(1);
  });

  /**
   * The union in `area_slugs` is why an `area` + `visit` query has to filter on
   * a bucket-specific field — see buildServiceSearchParams. Indexing the slug
   * twins is what makes that expressible, since the query param is a slug and
   * the pre-existing buckets hold ids.
   */
  it("indexes each bucket's slugs separately from the union", () => {
    const doc = serviceOfferingToDocument(offering({ location_mode: "either" }), AREAS);
    expect(doc.area_slugs.sort()).toEqual(["dubai-marina", "jbr", "deira"].sort());
    expect(doc.premises_area_slugs?.sort()).toEqual(["dubai-marina", "jbr"]);
    expect(doc.home_visit_area_slugs?.sort()).toEqual(["deira", "jbr"]);
  });

  it("keeps area_ids, area_slugs and area_names index-aligned", () => {
    const doc = serviceOfferingToDocument(offering({ location_mode: "either" }), AREAS);
    expect(doc.area_slugs).toHaveLength(doc.area_ids.length);
    expect(doc.area_names).toHaveLength(doc.area_ids.length);
    const i = doc.area_ids.indexOf("area-marina");
    expect(doc.area_slugs[i]).toBe("dubai-marina");
    expect(doc.area_names[i]).toBe("Dubai Marina");
  });

  it("produces empty arrays (not a throw) for a vendor with no areas", () => {
    const doc = serviceOfferingToDocument(offering({ location_mode: "either" }), {
      premises: [],
      homeVisit: [],
    });
    expect(doc.area_ids).toEqual([]);
    expect(doc.area_slugs).toEqual([]);
  });
});

describe("serviceOfferingToDocument — scalar fields", () => {
  it("maps price, duration, vendor and category", () => {
    const doc = serviceOfferingToDocument(offering(), AREAS);
    expect(doc.id).toBe("off-1");
    expect(doc.price_fils).toBe(45000);
    expect(doc.duration_minutes).toBe(90);
    expect(doc.vendor_name).toBe("Glow Studio");
    expect(doc.category_slug).toBe("hair");
    expect(doc.created_at).toBe(Math.floor(Date.parse("2026-07-01T00:00:00.000Z") / 1000));
  });

  it("omits rating when absent and sets it when supplied", () => {
    expect(serviceOfferingToDocument(offering(), AREAS).rating_avg).toBeUndefined();
    const rated = serviceOfferingToDocument(offering(), AREAS, { avg: 4.5, count: 12 });
    expect(rated.rating_avg).toBe(4.5);
    expect(rated.rating_count).toBe(12);
  });

  it("falls back to Uncategorized when the offering has no category", () => {
    const doc = serviceOfferingToDocument(offering({ category_id: null, category: null }), AREAS);
    expect(doc.category_name).toBe("Uncategorized");
    expect(doc.category_slug).toBeUndefined();
  });
});

describe("resolveAreas — de-duplication per set", () => {
  it("de-dupes premises when two branches share the same area", () => {
    // A vendor with two branches both in Dubai Marina yields two identical
    // rows from resolveVendorAreas; the card must show it once, not
    // "At their salon in Dubai Marina, Dubai Marina".
    const dupedAreas: VendorAreaSets = {
      premises: [MARINA, { ...MARINA }],
      homeVisit: [],
    };
    const resolved = resolveAreas("at_premises", dupedAreas);
    expect(resolved.premises).toEqual([MARINA]);
  });

  it("de-dupes home_visit when two service-area rows share the same area", () => {
    const dupedAreas: VendorAreaSets = {
      premises: [],
      homeVisit: [DEIRA, { ...DEIRA }],
    };
    const resolved = resolveAreas("home_visit", dupedAreas);
    expect(resolved.homeVisit).toEqual([DEIRA]);
  });

  it("carries the per-set dedupe through to serviceOfferingToDocument's premises_area_ids", () => {
    const dupedAreas: VendorAreaSets = {
      premises: [MARINA, { ...MARINA }],
      homeVisit: [],
    };
    const doc = serviceOfferingToDocument(offering({ location_mode: "at_premises" }), dupedAreas);
    expect(doc.premises_area_ids).toEqual(["area-marina"]);
  });
});
