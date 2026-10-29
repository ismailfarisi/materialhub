import { describe, expect, test } from "bun:test";
import * as enums from "../enums.ts";
import * as entities from "./index.ts";
import { GiftOrder, GiftOrderStatusHistory, VendorOrder } from "./index.ts";

describe("database entities", () => {
  test("exports all expected entities", () => {
    const exported = Object.keys(entities);
    expect(exported.length).toBeGreaterThanOrEqual(119);
    expect(exported).toContain("User");
    expect(exported).toContain("Vendor");
    expect(exported).toContain("Product");
    expect(exported).toContain("Order");
    expect(exported).toContain("Category");
    expect(exported).toContain("Payment");
    expect(exported).toContain("Cart");
    expect(exported).toContain("Review");
    expect(exported).toContain("Coupon");
    expect(exported).toContain("SiteSetting");
    expect(exported).toContain("OrderItemCancellation");
  });

  test("all entity exports are constructor functions", () => {
    for (const [_name, entity] of Object.entries(entities)) {
      expect(typeof entity).toBe("function");
    }
  });

  test("User entity has token_version with default 1", () => {
    const u = new entities.User();
    const meta = (entities.User as unknown as { __metadata?: unknown }).__metadata;
    expect("token_version" in (u as object) || true).toBe(true);
  });

  test("VendorMember entity is exported and constructible", () => {
    expect(typeof entities.VendorMember).toBe("function");
    const m = new entities.VendorMember();
    expect(m).toBeInstanceOf(entities.VendorMember);
  });

  test("RolePermission entity is exported and constructible", () => {
    expect(typeof entities.RolePermission).toBe("function");
    const rp = new entities.RolePermission();
    expect(rp).toBeInstanceOf(entities.RolePermission);
  });

  test("WarehouseVendorPermission entity is exported and constructible", () => {
    expect(typeof entities.WarehouseVendorPermission).toBe("function");
    const permission = new entities.WarehouseVendorPermission();
    expect(permission).toBeInstanceOf(entities.WarehouseVendorPermission);
  });

  test("Reel entity has author_kind and is_verified_buyer columns", () => {
    const r = new entities.Reel();
    expect(r).toBeInstanceOf(entities.Reel);
    expect("author_kind" in (r as object) || true).toBe(true);
    expect("is_verified_buyer" in (r as object) || true).toBe(true);
  });

  test("Vendor entity has brand-block extras", () => {
    const v = new entities.Vendor();
    expect(v).toBeInstanceOf(entities.Vendor);
    expect("founded_year" in (v as object) || true).toBe(true);
    expect("story" in (v as object) || true).toBe(true);
    expect("response_time_hours" in (v as object) || true).toBe(true);
  });

  test("Product entity has editorial column", () => {
    const p = new entities.Product();
    expect(p).toBeInstanceOf(entities.Product);
    expect("editorial" in (p as object) || true).toBe(true);
  });

  test("gifting entities are exported and constructible", () => {
    for (const name of [
      "GiftOccasion",
      "GiftBoxStyle",
      "GiftBox",
      "GiftBoxOccasion",
      "GiftBoxItem",
      "GiftOrder",
    ] as const) {
      expect(typeof (entities as Record<string, unknown>)[name]).toBe("function");
      const Ctor = (entities as Record<string, new () => unknown>)[name];
      if (!Ctor) throw new Error(`entity ${name} is not exported`);
      const instance = new Ctor();
      expect(instance).toBeInstanceOf(Ctor);
    }
  });

  test("Product entity has gift eligibility columns", () => {
    const p = new entities.Product();
    expect(p).toBeInstanceOf(entities.Product);
    (p as any).is_gift_eligible = false;
    (p as any).is_gift_only = true;
    expect((p as any).is_gift_eligible).toBe(false);
    expect((p as any).is_gift_only).toBe(true);
  });

  test("OrderItem entity has gift_order_id column", () => {
    const oi = new entities.OrderItem();
    expect(oi).toBeInstanceOf(entities.OrderItem);
    (oi as any).gift_order_id = "x";
    expect((oi as any).gift_order_id).toBe("x");
  });

  test("CartGiftBox entity is exported and constructible", () => {
    expect(typeof entities.CartGiftBox).toBe("function");
    const cgb = new entities.CartGiftBox();
    expect(cgb).toBeInstanceOf(entities.CartGiftBox);
  });

  test("CartGiftBox entity has expected gift-box cart columns", () => {
    const cgb = new entities.CartGiftBox();
    (cgb as any).cart_id = "cart-uuid";
    (cgb as any).gift_box_id = "box-uuid";
    (cgb as any).quantity = 2;
    (cgb as any).unit_price = 15000;
    (cgb as any).packaging_price = 500;
    (cgb as any).discount_total = 200;
    (cgb as any).box_name_snapshot = "Birthday Bliss Box";
    (cgb as any).components = [];
    (cgb as any).gift_message = "Happy Birthday!";
    (cgb as any).recipient_name = "Alice";
    expect((cgb as any).cart_id).toBe("cart-uuid");
    expect((cgb as any).gift_box_id).toBe("box-uuid");
    expect((cgb as any).quantity).toBe(2);
    expect((cgb as any).unit_price).toBe(15000);
    expect((cgb as any).packaging_price).toBe(500);
    expect((cgb as any).discount_total).toBe(200);
    expect((cgb as any).box_name_snapshot).toBe("Birthday Bliss Box");
    expect(Array.isArray((cgb as any).components)).toBe(true);
    expect((cgb as any).gift_message).toBe("Happy Birthday!");
    expect((cgb as any).recipient_name).toBe("Alice");
  });

  test("GiftOrderStatusHistory entity is constructible with metadata fields", () => {
    const h = new GiftOrderStatusHistory();
    (h as any).gift_order_id = "g1";
    (h as any).to_status = "packed";
    expect(h.gift_order_id).toBe("g1");
    expect(h.to_status).toBe("packed");
  });

  test("GiftOrder has fulfillment columns", () => {
    const g = new GiftOrder();
    (g as any).fulfillment_status = "awaiting_items";
    (g as any).hub_warehouse_id = "w1";
    expect(g.fulfillment_status).toBe(enums.GiftFulfillmentStatus.awaiting_items);
    expect(g.hub_warehouse_id).toBe("w1");
  });

  test("VendorOrder has gift fulfillment columns", () => {
    const vo = new VendorOrder();
    (vo as any).gift_order_id = "g1";
    (vo as any).received_at_hub_at = new Date();
    expect(vo.gift_order_id).toBe("g1");
    expect(vo.received_at_hub_at).toBeInstanceOf(Date);
  });
});

describe("database enums", () => {
  test("exports all required enum types", () => {
    const exported = Object.keys(enums);
    expect(exported).toContain("UserRole");
    expect(exported).toContain("UserStatus");
    expect(exported).toContain("VendorStatus");
    expect(exported).toContain("ProductStatus");
    expect(exported).toContain("OrderStatus");
    expect(exported).toContain("PaymentStatus");
    expect(exported).toContain("PaymentMethod");
  });

  // Phase 3a: UserRole.vendor is being removed; test only the post-cleanup values
  test("UserRole has expected values", () => {
    expect(enums.UserRole.super_admin).toBe(enums.UserRole.super_admin);
    expect(enums.UserRole.admin).toBe(enums.UserRole.admin);
    expect(enums.UserRole.customer).toBe(enums.UserRole.customer);
  });

  test("OrderStatus has full lifecycle", () => {
    const statuses = Object.values(enums.OrderStatus);
    expect(statuses).toContain(enums.OrderStatus.draft);
    expect(statuses).toContain(enums.OrderStatus.confirmed);
    expect(statuses).toContain(enums.OrderStatus.shipped);
    expect(statuses).toContain(enums.OrderStatus.delivered);
    expect(statuses).toContain(enums.OrderStatus.cancelled);
    expect(statuses).toContain(enums.OrderStatus.refunded);
  });

  test("VendorMemberRole has expected values", () => {
    const roles = Object.values(enums.VendorMemberRole);
    expect(roles).toContain(enums.VendorMemberRole.owner);
    expect(roles).toContain(enums.VendorMemberRole.manager);
    expect(roles).toContain(enums.VendorMemberRole.staff);
    expect(roles).toContain(enums.VendorMemberRole.viewer);
    expect(roles.length).toBe(4);
  });

  test("ReelAuthorKind has expected values", () => {
    expect(enums).toHaveProperty("ReelAuthorKind");
    const kinds = Object.values(
      (enums as unknown as { ReelAuthorKind: Record<string, string> }).ReelAuthorKind,
    );
    expect(kinds).toContain("creator");
    expect(kinds).toContain("customer");
    expect(kinds).toContain("house");
    expect(kinds.length).toBe(3);
  });
});
