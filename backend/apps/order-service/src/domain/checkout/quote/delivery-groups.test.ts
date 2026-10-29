import { describe, expect, it } from "bun:test";
import { type DgItem, type DgRate, formDeliveryGroups } from "./delivery-groups.ts";

describe("formDeliveryGroups — §12 worked example", () => {
  const zoneId = "zone_dubai_central";
  const items: DgItem[] = [
    { id: "i1", vendor_id: "v_a", product_id: "p1", quantity: 1, unit_price: 15000 },
    { id: "i2", vendor_id: "v_a", product_id: "p2", quantity: 1, unit_price: 20000 },
    { id: "i3", vendor_id: "v_b", product_id: "p3", quantity: 1, unit_price: 45000 },
  ];
  const rates: DgRate[] = [
    {
      id: "r1",
      vendor_id: "v_a",
      zone_id: zoneId,
      method: "standard",
      base_cost: 0,
      per_kg_cost: 0,
      free_above: 20000,
      estimated_days_min: 3,
      estimated_days_max: 5,
    },
    {
      id: "r2",
      vendor_id: "v_a",
      zone_id: zoneId,
      method: "express",
      base_cost: 2500,
      per_kg_cost: 0,
      free_above: null,
      estimated_days_min: 1,
      estimated_days_max: 2,
    },
    {
      id: "r3",
      vendor_id: "v_a",
      zone_id: zoneId,
      method: "same_day",
      base_cost: 5000,
      per_kg_cost: 0,
      free_above: null,
      estimated_days_min: 0,
      estimated_days_max: 0,
    },
    {
      id: "r4",
      vendor_id: "v_b",
      zone_id: zoneId,
      method: "standard",
      base_cost: 0,
      per_kg_cost: 0,
      free_above: null,
      estimated_days_min: 3,
      estimated_days_max: 5,
    },
    {
      id: "r5",
      vendor_id: "v_b",
      zone_id: zoneId,
      method: "express",
      base_cost: 3000,
      per_kg_cost: 0,
      free_above: null,
      estimated_days_min: 1,
      estimated_days_max: 2,
    },
  ];

  it("produces exactly 2 groups keyed by availability-set differences", () => {
    const groups = formDeliveryGroups({
      items,
      rates,
      zoneId,
      vendorHolidays: new Set(),
      subtotalFils: 80000,
    });
    expect(groups).toHaveLength(2);
  });

  it("Vendor A group: standard 0, express 2500, same_day 5000", () => {
    const groups = formDeliveryGroups({
      items,
      rates,
      zoneId,
      vendorHolidays: new Set(),
      subtotalFils: 80000,
    });
    const gA = groups.find((g) => g.vendorIds.includes("v_a"));
    if (!gA) throw new Error("Vendor A group missing");
    expect([...gA.itemIds].sort()).toEqual(["i1", "i2"]);
    const methodPrice = (id: string) => gA.methods.find((m) => m.id === id)?.price_fils;
    expect(methodPrice("standard")).toBe(0);
    expect(methodPrice("express")).toBe(2500);
    expect(methodPrice("same_day")).toBe(5000);
  });

  it("Vendor B group: standard 0, express 3000, no same_day", () => {
    const groups = formDeliveryGroups({
      items,
      rates,
      zoneId,
      vendorHolidays: new Set(),
      subtotalFils: 80000,
    });
    const gB = groups.find((g) => g.vendorIds.includes("v_b"));
    if (!gB) throw new Error("Vendor B group missing");
    expect([...gB.itemIds].sort()).toEqual(["i3"]);
    expect(gB.methods.find((m) => m.id === "standard")?.price_fils).toBe(0);
    expect(gB.methods.find((m) => m.id === "express")?.price_fils).toBe(3000);
    expect(gB.methods.find((m) => m.id === "same_day")).toBeUndefined();
  });

  it("E8: zoneId null → uses platform-default rates (vendor_id=NULL AND zone_id=NULL)", () => {
    const ratesWithDefault: DgRate[] = [
      ...rates,
      {
        id: "r99",
        vendor_id: null,
        zone_id: null,
        method: "standard",
        base_cost: 1000,
        per_kg_cost: 0,
        free_above: null,
        estimated_days_min: 5,
        estimated_days_max: 7,
      },
    ];
    const groups = formDeliveryGroups({
      items,
      rates: ratesWithDefault,
      zoneId: null,
      vendorHolidays: new Set(),
      subtotalFils: 80000,
    });
    expect(groups).toHaveLength(1);
    const g = groups[0];
    if (!g) throw new Error("no group");
    expect(g.methods.find((m) => m.id === "standard")?.price_fils).toBe(2000);
  });

  it("vendor on holiday → 0 methods for that vendor, group.blocking = true", () => {
    const groups = formDeliveryGroups({
      items,
      rates,
      zoneId,
      vendorHolidays: new Set(["v_b"]),
      subtotalFils: 80000,
    });
    const gB = groups.find((g) => g.vendorIds.includes("v_b"));
    if (!gB) throw new Error("Vendor B group missing");
    expect(gB.methods).toHaveLength(0);
    expect(gB.blocking).toBe(true);
  });
});
