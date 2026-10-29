import { describe, expect, test } from "bun:test";
import { PERMISSIONS, type Permission, isPermission } from "./permissions.ts";

describe("permissions catalog", () => {
  test("contains the 14 permissions from the design spec", () => {
    expect(PERMISSIONS.length).toBe(14);
    expect(PERMISSIONS).toContain("orders.refund");
    expect(PERMISSIONS).toContain("team.write");
    expect(PERMISSIONS).toContain("bank.write");
  });

  test("isPermission narrows correctly", () => {
    expect(isPermission("orders.refund")).toBe(true);
    expect(isPermission("orders.notarealperm")).toBe(false);
  });

  test("array is readonly at the type level", () => {
    const arr: readonly Permission[] = PERMISSIONS;
    expect(arr).toBe(PERMISSIONS);
  });
});
