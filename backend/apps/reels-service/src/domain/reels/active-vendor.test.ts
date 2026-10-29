import { describe, expect, it, mock } from "bun:test";
import { resolveActiveVendorId, resolveActiveVendorIdWithFallback } from "./active-vendor.ts";

describe("resolveActiveVendorId", () => {
  const memberships = [
    { vid: "vendor-1", r: "owner" as const },
    { vid: "vendor-2", r: "manager" as const },
  ];

  it("uses a matching active vendor header", () => {
    expect(resolveActiveVendorId(memberships, "vendor-2")).toBe("vendor-2");
  });

  it("ignores a header outside the user's memberships", () => {
    expect(resolveActiveVendorId(memberships, "vendor-3")).toBeNull();
  });

  it("auto-resolves the only membership when the header is absent", () => {
    expect(resolveActiveVendorId([{ vid: "vendor-1", r: "owner" }], null)).toBe("vendor-1");
  });

  it("does not guess when the user has multiple memberships", () => {
    expect(resolveActiveVendorId(memberships, null)).toBeNull();
  });
});

describe("resolveActiveVendorIdWithFallback", () => {
  it("uses the token claim and never hits the DB when it resolves", async () => {
    const loadDb = mock(async () => []);
    const result = await resolveActiveVendorIdWithFallback(
      [{ vid: "vendor-1", r: "owner" }],
      null,
      "user-1",
      loadDb,
    );
    expect(result).toBe("vendor-1");
    expect(loadDb).toHaveBeenCalledTimes(0);
  });

  it("falls back to a DB membership lookup when the token carries none", async () => {
    const loadDb = mock(async () => [{ vid: "vendor-9", r: "owner" as const }]);
    const result = await resolveActiveVendorIdWithFallback([], null, "user-1", loadDb);
    expect(result).toBe("vendor-9");
    expect(loadDb).toHaveBeenCalledTimes(1);
  });

  it("honours the active-vendor header against DB memberships on fallback", async () => {
    const loadDb = mock(async () => [
      { vid: "vendor-1", r: "owner" as const },
      { vid: "vendor-2", r: "manager" as const },
    ]);
    const result = await resolveActiveVendorIdWithFallback(undefined, "vendor-2", "user-1", loadDb);
    expect(result).toBe("vendor-2");
  });

  it("returns null when neither token nor DB yields a membership", async () => {
    const loadDb = mock(async () => []);
    const result = await resolveActiveVendorIdWithFallback(undefined, null, "user-1", loadDb);
    expect(result).toBeNull();
  });
});
