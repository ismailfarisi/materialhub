import { describe, expect, test, beforeEach } from "bun:test";
import { useActiveVendor, syncActiveVendorWithMemberships } from "./active-vendor";

describe("active-vendor store", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") localStorage.clear();
    useActiveVendor.setState({ activeVendorId: null });
  });

  test("setActiveVendorId updates state", () => {
    useActiveVendor.getState().setActiveVendorId("v1");
    expect(useActiveVendor.getState().activeVendorId).toBe("v1");
  });

  test("syncActiveVendorWithMemberships clears state when memberships empty", () => {
    useActiveVendor.setState({ activeVendorId: "stale" });
    syncActiveVendorWithMemberships([]);
    expect(useActiveVendor.getState().activeVendorId).toBeNull();
  });

  test("falls back to first membership when stored id is no longer valid", () => {
    useActiveVendor.setState({ activeVendorId: "v-stale" });
    syncActiveVendorWithMemberships([
      { vid: "v-current", r: "owner" },
      { vid: "v-other", r: "manager" },
    ]);
    expect(useActiveVendor.getState().activeVendorId).toBe("v-current");
  });

  test("preserves valid stored id", () => {
    useActiveVendor.setState({ activeVendorId: "v2" });
    syncActiveVendorWithMemberships([
      { vid: "v1", r: "owner" },
      { vid: "v2", r: "manager" },
    ]);
    expect(useActiveVendor.getState().activeVendorId).toBe("v2");
  });
});
