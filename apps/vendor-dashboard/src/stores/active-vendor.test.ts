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

describe("switchActiveVendor", () => {
  test("sets the vendor and clears vendor-scoped cache, keeping auth", async () => {
    const { QueryClient } = await import("@tanstack/react-query");
    const { switchActiveVendor } = await import("./active-vendor");
    const qc = new QueryClient();
    qc.setQueryData(["auth", "me"], { id: "u1" });
    qc.setQueryData(["vendor", "products", {}], { items: [1] });
    qc.setQueryData(["team-members", "v1"], [1]);
    useActiveVendor.setState({ activeVendorId: "v1" });

    switchActiveVendor("v2", qc);

    expect(useActiveVendor.getState().activeVendorId).toBe("v2");
    expect(qc.getQueryData(["auth", "me"])).toEqual({ id: "u1" });
    expect(qc.getQueryData(["vendor", "products", {}])).toBeUndefined();
    expect(qc.getQueryData(["team-members", "v1"])).toBeUndefined();
  });

  test("no-op when switching to the already active vendor", async () => {
    const { QueryClient } = await import("@tanstack/react-query");
    const { switchActiveVendor } = await import("./active-vendor");
    const qc = new QueryClient();
    qc.setQueryData(["vendor", "profile"], { id: "v1" });
    useActiveVendor.setState({ activeVendorId: "v1" });
    switchActiveVendor("v1", qc);
    expect(qc.getQueryData(["vendor", "profile"])).toEqual({ id: "v1" });
  });
});
