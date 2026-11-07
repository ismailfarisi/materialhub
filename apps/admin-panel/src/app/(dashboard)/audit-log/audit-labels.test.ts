import { describe, expect, test } from "vitest";
import { entityTypeLabel } from "./audit-labels";

describe("entityTypeLabel", () => {
  test("humanises stored entity types", () => {
    expect(entityTypeLabel("categories")).toBe("Categories");
    expect(entityTypeLabel("sales-channels")).toBe("Sales channels");
    expect(entityTypeLabel("shipping_rates")).toBe("Shipping rates");
  });
});
