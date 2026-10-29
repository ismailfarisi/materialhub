import { describe, expect, it } from "bun:test";
import { isPublicRoute } from "./jwt-auth.ts";

describe("isPublicRoute — /services", () => {
  it("allows the exact list path (the trailing-slash trap)", () => {
    // The pre-existing clause was `path.startsWith("/services/")` — WITH a
    // trailing slash — so bare `/services` fell through and 401'd. This is
    // easy to miss locally because `/services/` behaves correctly.
    expect(isPublicRoute("/services", "GET")).toBe(true);
  });

  it("still allows the detail and by-id reads", () => {
    expect(isPublicRoute("/services/balayage-abc", "GET")).toBe(true);
    expect(isPublicRoute("/services/by-id/uuid-1", "GET")).toBe(true);
  });

  it("does not make writes public", () => {
    expect(isPublicRoute("/services", "POST")).toBe(false);
  });

  it("does not leak the gated vendor management prefix", () => {
    expect(isPublicRoute("/vendor/services", "GET")).toBe(false);
  });
});
