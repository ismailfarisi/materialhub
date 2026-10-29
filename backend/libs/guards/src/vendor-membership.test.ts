import { beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { permissionMatrix } from "./permission-matrix.ts";
import { vendorMembership } from "./vendor-membership.ts";

describe("vendorMembership guard", () => {
  beforeEach(() => {
    permissionMatrix.__setMapForTests([
      { role: "owner", permission: "orders.refund" },
      { role: "manager", permission: "orders.refund" },
    ]);
  });

  test("single membership, no header → resolves that vendor", async () => {
    const app = new Elysia()
      .derive(({ headers }: any) => ({
        user: { id: "u1", email: "u1@x.com", role: "customer" as const },
        vendorMemberships: [{ vid: "v1", r: "owner" as const }],
        headers,
      }))
      .use(vendorMembership("orders.refund"))
      .get("/test", ({ member }: any) => ({ role: member?.r ?? null, vid: member?.vid ?? null }));
    const res = await app.handle(new Request("http://localhost/test"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.vid).toBe("v1");
    expect(body.role).toBe("owner");
  });

  test("0 memberships, no header → 400 MISSING_ACTIVE_VENDOR", async () => {
    const app = new Elysia()
      .derive(({ headers }: any) => ({
        user: { id: "u1", email: "u1@x.com", role: "customer" as const },
        vendorMemberships: [],
        headers,
      }))
      .use(vendorMembership("orders.refund"))
      .get("/test", () => ({ ok: true }));
    const res = await app.handle(new Request("http://localhost/test"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("MISSING_ACTIVE_VENDOR");
  });

  test("2 memberships, no header → 400 MISSING_ACTIVE_VENDOR", async () => {
    const app = new Elysia()
      .derive(({ headers }: any) => ({
        user: { id: "u1", email: "u1@x.com", role: "customer" as const },
        vendorMemberships: [
          { vid: "v1", r: "owner" as const },
          { vid: "v2", r: "manager" as const },
        ],
        headers,
      }))
      .use(vendorMembership("orders.refund"))
      .get("/test", () => ({ ok: true }));
    const res = await app.handle(new Request("http://localhost/test"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("MISSING_ACTIVE_VENDOR");
  });

  test("header for non-member vendor → 403 INVALID_ACTIVE_VENDOR", async () => {
    const app = new Elysia()
      .derive(({ headers }: any) => ({
        user: { id: "u1", email: "u1@x.com", role: "customer" as const },
        vendorMemberships: [{ vid: "v1", r: "owner" as const }],
        headers,
      }))
      .use(vendorMembership("orders.refund"))
      .get("/test", () => ({ ok: true }));
    const res = await app.handle(
      new Request("http://localhost/test", {
        headers: { "x-active-vendor-id": "v999" },
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toBe("INVALID_ACTIVE_VENDOR");
  });

  test("permission missing for role → 403 INSUFFICIENT_VENDOR_PERMISSION", async () => {
    const app = new Elysia()
      .derive(({ headers }: any) => ({
        user: { id: "u1", email: "u1@x.com", role: "customer" as const },
        vendorMemberships: [{ vid: "v1", r: "viewer" as const }],
        headers,
      }))
      .use(vendorMembership("orders.refund"))
      .get("/test", () => ({ ok: true }));
    const res = await app.handle(new Request("http://localhost/test"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toBe("INSUFFICIENT_VENDOR_PERMISSION");
  });

  test("no user in context → 401 UNAUTHORIZED", async () => {
    const app = new Elysia()
      .derive(() => ({ user: null, vendorMemberships: [] }))
      .use(vendorMembership("orders.refund"))
      .get("/test", () => ({ ok: true }));
    const res = await app.handle(new Request("http://localhost/test"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error).toBe("UNAUTHORIZED");
  });
});

describe("vendorMembership with alternative permissions", () => {
  beforeEach(() => {
    permissionMatrix.__setMapForTests([
      { role: "owner", permission: "orders.fulfill" },
      { role: "staff", permission: "inventory.write" },
    ]);
  });

  function appFor(guard: Elysia, role: "owner" | "staff") {
    return new Elysia()
      .derive(({ headers }: any) => ({
        user: { id: "u1", email: "u1@x.com", role: "customer" as const },
        vendorMemberships: [{ vid: "v1", r: role }],
        headers,
      }))
      .use(guard as any)
      .get("/test", () => ({ ok: true }));
  }

  test("passes when the role holds any one of the listed permissions", async () => {
    // staff holds inventory.write but NOT orders.fulfill
    const app = appFor(vendorMembership("orders.fulfill", "inventory.write"), "staff");
    const res = await app.handle(new Request("http://localhost/test"));
    expect(res.status).toBe(200);
  });

  test("passes for the other role via the other permission", async () => {
    const app = appFor(vendorMembership("orders.fulfill", "inventory.write"), "owner");
    const res = await app.handle(new Request("http://localhost/test"));
    expect(res.status).toBe(200);
  });

  test("403s when the role holds none of them", async () => {
    const app = appFor(vendorMembership("bank.write", "team.write"), "staff");
    const res = await app.handle(new Request("http://localhost/test"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toBe("INSUFFICIENT_VENDOR_PERMISSION");
  });
});
