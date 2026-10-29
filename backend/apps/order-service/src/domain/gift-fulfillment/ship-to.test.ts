import { describe, expect, test } from "bun:test";
import { resolveShipTo } from "./ship-to.ts";

const hub = {
  name: "MaterialHub Hub",
  address_line_1: "Hub St 1",
  address_line_2: null,
  city: "Dubai",
  emirate: "Dubai",
  country_code: "AE",
  contact_phone: "+9715000",
};
const customer = {
  name: "Sara",
  address_line_1: "Villa 2",
  city: "Abu Dhabi",
  emirate: "Abu Dhabi",
};

describe("resolveShipTo", () => {
  test("gift order with a hub → ships to hub", () => {
    const r = resolveShipTo({ giftOrderId: "g1", hub, customerAddress: customer });
    expect(r.is_hub).toBe(true);
    expect(r.name).toBe("MaterialHub Hub");
    expect(r.city).toBe("Dubai");
  });
  test("non-gift order → ships to customer", () => {
    const r = resolveShipTo({ giftOrderId: null, hub: null, customerAddress: customer });
    expect(r.is_hub).toBe(false);
    expect(r.name).toBe("Sara");
    expect(r.city).toBe("Abu Dhabi");
  });
  test("gift order but hub missing → falls back to customer (no crash)", () => {
    const r = resolveShipTo({ giftOrderId: "g1", hub: null, customerAddress: customer });
    expect(r.is_hub).toBe(false);
    expect(r.name).toBe("Sara");
  });
  test("carries the UAE unit fields (building/apartment/floor) through to the consignee", () => {
    const r = resolveShipTo({
      giftOrderId: null,
      hub: null,
      customerAddress: {
        ...customer,
        building_name: "Marina Tower",
        apartment: "1203",
        floor: "12",
      },
    });
    expect(r.building_name).toBe("Marina Tower");
    expect(r.apartment).toBe("1203");
    expect(r.floor).toBe("12");
  });
});
