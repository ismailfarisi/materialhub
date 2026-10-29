import { describe, expect, it } from "bun:test";
import { vendorAffiliatesRoutes } from "./vendor-affiliates.routes.ts";

describe("vendor-affiliates auth wiring", () => {
  it("returns 401 (not 500) for an unauthenticated GET /vendor/affiliates", async () => {
    const res = await vendorAffiliatesRoutes.handle(
      new Request("http://local/vendor/affiliates", { method: "GET" }),
    );
    expect(res.status).toBe(401);
  });
});
