import { describe, expect, it } from "bun:test";
import { adminAffiliatesRoutes } from "./admin-affiliates.routes.ts";

describe("admin-affiliates auth wiring", () => {
  it("returns 401 for an unauthenticated GET /admin/affiliates", async () => {
    const res = await adminAffiliatesRoutes.handle(
      new Request("http://local/admin/affiliates", { method: "GET" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for an unauthenticated POST /admin/affiliates", async () => {
    const res = await adminAffiliatesRoutes.handle(
      new Request("http://local/admin/affiliates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendorId: "a0000000-0000-0000-0000-000000000001",
          email: "affiliate@example.com",
          commissionType: "percentage",
          commissionValue: 1000,
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for an unauthenticated PATCH /admin/affiliates/:id/status", async () => {
    const res = await adminAffiliatesRoutes.handle(
      new Request("http://local/admin/affiliates/a0000000-0000-0000-0000-000000000001/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "suspended" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for an unauthenticated POST /admin/affiliates/:id/links", async () => {
    const res = await adminAffiliatesRoutes.handle(
      new Request("http://local/admin/affiliates/a0000000-0000-0000-0000-000000000001/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType: "store" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
