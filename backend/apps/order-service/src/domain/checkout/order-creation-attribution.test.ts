import { describe, expect, it } from "bun:test";
import { buildOrderAttribution } from "./order-creation.service.ts";

describe("buildOrderAttribution", () => {
  it("returns null when no affiliate code is present", () => {
    expect(buildOrderAttribution(undefined)).toBeNull();
    expect(buildOrderAttribution(null)).toBeNull();
    expect(buildOrderAttribution("")).toBeNull();
  });

  it("wraps a present code into the attribution payload", () => {
    expect(buildOrderAttribution("AFF-ABC12345")).toEqual({ affiliate_code: "AFF-ABC12345" });
  });
});
