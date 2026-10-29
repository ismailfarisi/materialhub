import { describe, expect, it } from "bun:test";
import { type HydratableOffering, hydrateOfferingRefs } from "./hydrate-offering-refs.ts";

function makeDeps() {
  let vendorCalls = 0;
  let categoryCalls = 0;
  const deps = {
    loadVendorRefs: async (vendorIds: string[]) => {
      vendorCalls += 1;
      return vendorIds
        .filter((id) => id === "v1")
        .map((id) => ({ id, name: "Glow Studio", slug: "glow-studio" }));
    },
    loadCategoryRefs: async (categoryIds: string[]) => {
      categoryCalls += 1;
      return categoryIds
        .filter((id) => id === "cat-1")
        .map((id) => ({ id, name: "Hair", slug: "hair" }));
    },
  };
  return { deps, vendorCalls: () => vendorCalls, categoryCalls: () => categoryCalls };
}

describe("hydrateOfferingRefs", () => {
  it("attaches vendor and category refs by id", async () => {
    const { deps } = makeDeps();
    const offerings: HydratableOffering[] = [{ vendor_id: "v1", category_id: "cat-1" }];
    await hydrateOfferingRefs(offerings, deps);
    expect(offerings[0]?.vendor).toEqual({ name: "Glow Studio", slug: "glow-studio" });
    expect(offerings[0]?.category).toEqual({ name: "Hair", slug: "hair" });
  });

  it("batches — calls each loader exactly once for a multi-row input, not once per row", async () => {
    const { deps, vendorCalls, categoryCalls } = makeDeps();
    const offerings: HydratableOffering[] = [
      { vendor_id: "v1", category_id: "cat-1" },
      { vendor_id: "v1", category_id: "cat-1" },
      { vendor_id: "v1", category_id: "cat-1" },
    ];
    await hydrateOfferingRefs(offerings, deps);
    expect(vendorCalls()).toBe(1);
    expect(categoryCalls()).toBe(1);
    expect(offerings.every((o) => o.vendor?.name === "Glow Studio")).toBe(true);
  });

  it("leaves vendor/category undefined for a null id", async () => {
    const { deps } = makeDeps();
    const offerings: HydratableOffering[] = [{ vendor_id: null, category_id: null }];
    await hydrateOfferingRefs(offerings, deps);
    expect(offerings[0]?.vendor).toBeUndefined();
    expect(offerings[0]?.category).toBeUndefined();
  });

  it("leaves vendor/category undefined for an id with no matching row", async () => {
    const { deps } = makeDeps();
    const offerings: HydratableOffering[] = [
      { vendor_id: "v-missing", category_id: "cat-missing" },
    ];
    await hydrateOfferingRefs(offerings, deps);
    expect(offerings[0]?.vendor).toBeUndefined();
    expect(offerings[0]?.category).toBeUndefined();
  });

  it("issues no query at all for an empty input", async () => {
    const deps = {
      loadVendorRefs: async () => {
        throw new Error("should not query vendors");
      },
      loadCategoryRefs: async () => {
        throw new Error("should not query categories");
      },
    };
    await hydrateOfferingRefs([], deps);
  });
});
