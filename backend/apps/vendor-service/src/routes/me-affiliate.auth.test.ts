import { describe, expect, it } from "bun:test";
import { meAffiliateRoutes } from "./me-affiliate.routes.ts";

describe("me-affiliate auth wiring", () => {
  it("returns 401 for an unauthenticated GET /me/affiliate/earnings", async () => {
    const res = await meAffiliateRoutes.handle(
      new Request("http://local/me/affiliate/earnings", { method: "GET" }),
    );
    expect(res.status).toBe(401);
  });
});
