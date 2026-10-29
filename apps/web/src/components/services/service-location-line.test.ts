import { describe, expect, it } from "vitest";
import { areaNamesFor } from "./service-location-line";
import type { ServiceListItem } from "../../lib/booking/types";

const item = {
  area_ids: ["a1", "a2", "a3"],
  area_slugs: ["marina", "jbr", "deira"],
  area_names: ["Dubai Marina", "JBR", "Deira"],
  premises_area_ids: ["a1", "a2"],
  home_visit_area_ids: ["a3"],
} as ServiceListItem;

describe("areaNamesFor", () => {
  it("resolves premises ids to names via index alignment", () => {
    expect(areaNamesFor(item, "premises")).toEqual(["Dubai Marina", "JBR"]);
  });

  it("resolves home-visit ids to names", () => {
    expect(areaNamesFor(item, "home_visit")).toEqual(["Deira"]);
  });

  it("returns an empty array when the bucket is absent", () => {
    expect(areaNamesFor({ ...item, home_visit_area_ids: undefined }, "home_visit")).toEqual([]);
  });

  it("skips an id with no matching name rather than emitting undefined", () => {
    const broken = { ...item, premises_area_ids: ["a1", "ghost"] } as ServiceListItem;
    expect(areaNamesFor(broken, "premises")).toEqual(["Dubai Marina"]);
  });
});
