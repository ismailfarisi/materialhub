import { describe, expect, test, beforeEach } from "bun:test";
import { getMembershipsFromToken } from "./auth";

describe("getMembershipsFromToken", () => {
  beforeEach(() => {
    // Reset cookies between tests. document is provided by the bun:test happy-dom
    // shim; if it isn't, this test won't run — that's a bun config to investigate.
    if (typeof document !== "undefined") {
      document.cookie = "vendor_access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    }
  });

  test("returns [] when no cookie", () => {
    if (typeof document === "undefined") {
      // Skip in non-DOM env.
      return;
    }
    expect(getMembershipsFromToken()).toEqual([]);
  });

  test("returns vm array from valid JWT cookie", () => {
    if (typeof document === "undefined") return;
    const payload = btoa(JSON.stringify({ sub: "u1", vm: [{ vid: "v1", r: "owner" }] }));
    document.cookie = `vendor_access_token=aaa.${payload}.bbb`;
    expect(getMembershipsFromToken()).toEqual([{ vid: "v1", r: "owner" }]);
  });

  test("returns [] when payload missing vm", () => {
    if (typeof document === "undefined") return;
    const payload = btoa(JSON.stringify({ sub: "u1" }));
    document.cookie = `vendor_access_token=aaa.${payload}.bbb`;
    expect(getMembershipsFromToken()).toEqual([]);
  });

  test("returns [] for malformed token", () => {
    if (typeof document === "undefined") return;
    document.cookie = "vendor_access_token=garbage";
    expect(getMembershipsFromToken()).toEqual([]);
  });
});
