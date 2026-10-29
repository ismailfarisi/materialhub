import { describe, expect, it } from "bun:test";
import { resolveVendorAreas } from "./resolve-vendor-areas.ts";

const deps = {
  loadBranchAreas: async (vendorIds: string[]) =>
    vendorIds.includes("v1")
      ? [
          {
            vendor_id: "v1",
            area_id: "a-marina",
            slug: "dubai-marina",
            name: "Dubai Marina",
          },
        ]
      : [],
  loadServiceAreas: async (vendorIds: string[]) =>
    vendorIds.includes("v1")
      ? [{ vendor_id: "v1", area_id: "a-deira", slug: "deira", name: "Deira" }]
      : [],
};

describe("resolveVendorAreas", () => {
  it("groups branch and service areas per vendor", async () => {
    const map = await resolveVendorAreas(["v1"], deps);
    expect(map.get("v1")?.premises).toEqual([
      { id: "a-marina", slug: "dubai-marina", name: "Dubai Marina" },
    ]);
    expect(map.get("v1")?.homeVisit).toEqual([{ id: "a-deira", slug: "deira", name: "Deira" }]);
  });

  it("returns an empty set for a vendor with no coverage rather than omitting it", async () => {
    const map = await resolveVendorAreas(["v1", "v2"], deps);
    expect(map.get("v2")).toEqual({ premises: [], homeVisit: [] });
  });

  it("short-circuits on an empty vendor list", async () => {
    const map = await resolveVendorAreas([], {
      loadBranchAreas: async () => {
        throw new Error("should not query");
      },
      loadServiceAreas: async () => {
        throw new Error("should not query");
      },
    });
    expect(map.size).toBe(0);
  });
});
