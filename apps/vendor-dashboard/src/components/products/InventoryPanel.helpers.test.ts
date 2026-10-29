import { describe, expect, it } from "bun:test";
import {
  type InventoryRecord,
  inventoryButtonState,
  onHandForWarehouse,
  warehouseLabel,
} from "./InventoryPanel";

const warehouses = [
  { id: "wh-1", name: "Main", is_active: true, is_default: true },
  { id: "wh-2", name: "Overflow", is_active: true, is_default: false },
];

describe("warehouseLabel", () => {
  it("returns the warehouse name when the vendor owns it", () => {
    expect(warehouseLabel("wh-1", warehouses)).toBe("Main");
    expect(warehouseLabel("wh-2", warehouses)).toBe("Overflow");
  });

  it("returns Unassigned for a warehouse the vendor does not own", () => {
    expect(warehouseLabel("wh-orphan", warehouses)).toBe("Unassigned");
  });

  it("returns Unassigned for a null warehouse", () => {
    expect(warehouseLabel(null, warehouses)).toBe("Unassigned");
  });

  it("returns Unassigned before the warehouse list has loaded", () => {
    expect(warehouseLabel("wh-1", undefined)).toBe("Unassigned");
  });
});

describe("inventoryButtonState", () => {
  const base = { targetWarehouse: "wh-1", quantity: "5", busy: false };

  it("enables both actions for a positive quantity", () => {
    expect(inventoryButtonState(base)).toEqual({ canRestock: true, canAdjust: true });
  });

  it("disables both actions at exactly 0 (0 restock is rejected, 0 adjust is a no-op — zero out via Mark out of stock)", () => {
    expect(inventoryButtonState({ ...base, quantity: "0" })).toEqual({
      canRestock: false,
      canAdjust: false,
    });
  });

  it("enables Adjust but not Restock for a negative quantity (reducing stock)", () => {
    expect(inventoryButtonState({ ...base, quantity: "-3" })).toEqual({
      canRestock: false,
      canAdjust: true,
    });
  });

  it("disables both when the quantity box is empty or whitespace", () => {
    expect(inventoryButtonState({ ...base, quantity: "" })).toEqual({
      canRestock: false,
      canAdjust: false,
    });
    expect(inventoryButtonState({ ...base, quantity: "   " })).toEqual({
      canRestock: false,
      canAdjust: false,
    });
  });

  it("disables both for a non-numeric quantity", () => {
    expect(inventoryButtonState({ ...base, quantity: "abc" })).toEqual({
      canRestock: false,
      canAdjust: false,
    });
  });

  it("disables both when no warehouse is targeted", () => {
    expect(inventoryButtonState({ ...base, targetWarehouse: "" })).toEqual({
      canRestock: false,
      canAdjust: false,
    });
  });

  it("disables both while a mutation is in flight", () => {
    expect(inventoryButtonState({ ...base, busy: true })).toEqual({
      canRestock: false,
      canAdjust: false,
    });
  });
});

describe("onHandForWarehouse", () => {
  const rows: InventoryRecord[] = [
    { id: "a", warehouse_id: "wh-1", quantity_on_hand: 4, quantity_reserved: 0 },
    { id: "b", warehouse_id: "wh-2", quantity_on_hand: 7, quantity_reserved: 1 },
    // legacy duplicate row for the same warehouse
    { id: "c", warehouse_id: "wh-1", quantity_on_hand: 3, quantity_reserved: 0 },
  ];

  it("sums on-hand across rows for the targeted warehouse", () => {
    expect(onHandForWarehouse(rows, "wh-1")).toBe(7);
    expect(onHandForWarehouse(rows, "wh-2")).toBe(7);
  });

  it("returns 0 for a warehouse with no rows", () => {
    expect(onHandForWarehouse(rows, "wh-3")).toBe(0);
  });

  it("returns 0 when no warehouse is targeted", () => {
    expect(onHandForWarehouse(rows, "")).toBe(0);
    expect(onHandForWarehouse(rows, null)).toBe(0);
  });
});
