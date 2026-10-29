import { describe, expect, test } from "bun:test";
import { HttpError } from "@materialhub/plugins";
import {
  assertNonOwnerRole,
  assertVendorIdMatches,
  normalizeEmail,
} from "./vendor-member.validators.ts";

describe("normalizeEmail", () => {
  test("lowercases and trims", () => {
    expect(normalizeEmail("  Foo@Bar.COM  ")).toBe("foo@bar.com");
  });
  test("returns lowercased input that has no whitespace", () => {
    expect(normalizeEmail("alice@example.com")).toBe("alice@example.com");
  });
});

describe("assertNonOwnerRole", () => {
  test("throws HttpError(422, ..., 'INVITE_OWNER_NOT_ALLOWED') on owner", () => {
    try {
      assertNonOwnerRole("owner");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).statusCode).toBe(422);
      expect((err as HttpError).code).toBe("INVITE_OWNER_NOT_ALLOWED");
    }
  });
  test("accepts manager / staff / viewer", () => {
    expect(() => assertNonOwnerRole("manager")).not.toThrow();
    expect(() => assertNonOwnerRole("staff")).not.toThrow();
    expect(() => assertNonOwnerRole("viewer")).not.toThrow();
  });
});

describe("assertVendorIdMatches", () => {
  test("throws HttpError(403, ..., 'INVALID_ACTIVE_VENDOR') when path vendorId !== member.vid", () => {
    try {
      assertVendorIdMatches("v1", "v2");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).statusCode).toBe(403);
      expect((err as HttpError).code).toBe("INVALID_ACTIVE_VENDOR");
    }
  });
  test("does not throw when matching", () => {
    expect(() => assertVendorIdMatches("v1", "v1")).not.toThrow();
  });
});
