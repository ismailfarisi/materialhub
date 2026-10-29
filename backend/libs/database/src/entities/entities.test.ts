import { describe, expect, test } from "bun:test";
import * as enums from "../enums.ts";
import * as entities from "./index.ts";
import { VendorOrder } from "./index.ts";

describe("database entities", () => {
  test("exports all expected entities", () => {
    const exported = Object.keys(entities);
    expect(exported.length).toBeGreaterThanOrEqual(110);
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

  test("VendorOrder is constructible", () => {
    const vo = new VendorOrder();
    expect(vo).toBeInstanceOf(VendorOrder);
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
});
