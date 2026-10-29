import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { bulkJobAccessGuard } from "./bulk-job-access.ts";

function buildApp(user: any) {
  return new Elysia()
    .derive(() => ({ user, vendorMemberships: user?.vendorMemberships ?? [] }))
    .use(bulkJobAccessGuard)
    .post("/test", async ({ bulkAccess, body }: any) => {
      return await bulkAccess.assertCanCreate({
        targetVendorId: (body as any)?.targetVendorId ?? null,
      });
    });
}

function buildViewApp(user: any) {
  return new Elysia()
    .derive(() => ({ user, vendorMemberships: user?.vendorMemberships ?? [] }))
    .use(bulkJobAccessGuard)
    .post("/test-view", async ({ bulkAccess, body }: any) => {
      return await bulkAccess.assertCanView(body as any);
    });
}

describe("bulkJobAccessGuard.assertCanCreate", () => {
  test("super_admin returns targetVendorId as-is", async () => {
    const app = buildApp({ id: "u1", role: "super_admin", vendorMemberships: [] });
    const res = await app.handle(
      new Request("http://localhost/test", {
        method: "POST",
        body: JSON.stringify({ targetVendorId: "v1" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await res.json()).toEqual({ vendorId: "v1" });
  });

  test("admin without targetVendorId throws 400", async () => {
    const app = buildApp({ id: "u1", role: "admin", vendorMemberships: [] });
    const res = await app.handle(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });

  test("user with active membership uses their first vid", async () => {
    const app = buildApp({
      id: "u1",
      role: "customer",
      vendorMemberships: [{ vid: "v-mine", r: "owner" }],
    });
    const res = await app.handle(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await res.json()).toEqual({ vendorId: "v-mine" });
  });

  test("user with membership cannot act on behalf of another vendor", async () => {
    const app = buildApp({
      id: "u1",
      role: "customer",
      vendorMemberships: [{ vid: "v-mine", r: "owner" }],
    });
    const res = await app.handle(
      new Request("http://localhost/test", {
        method: "POST",
        body: JSON.stringify({ targetVendorId: "v-other" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });

  test("customer without any membership is forbidden", async () => {
    const app = buildApp({ id: "u1", role: "customer", vendorMemberships: [] });
    const res = await app.handle(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("bulkJobAccessGuard.assertCanView", () => {
  function jobFixture(vendorId: string) {
    return JSON.stringify({ vendor_id: vendorId });
  }

  test("super_admin returns scope=platform", async () => {
    const app = buildViewApp({ id: "u1", role: "super_admin", vendorMemberships: [] });
    const res = await app.handle(
      new Request("http://localhost/test-view", {
        method: "POST",
        body: jobFixture("v1"),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await res.json()).toEqual({ allowed: true, scope: "platform" });
  });

  test("admin returns scope=vendor", async () => {
    const app = buildViewApp({ id: "u1", role: "admin", vendorMemberships: [] });
    const res = await app.handle(
      new Request("http://localhost/test-view", {
        method: "POST",
        body: jobFixture("v1"),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await res.json()).toEqual({ allowed: true, scope: "vendor" });
  });

  test("user with membership viewing own vendor's job returns scope=own", async () => {
    const app = buildViewApp({
      id: "u1",
      role: "customer",
      vendorMemberships: [{ vid: "v-mine", r: "owner" }],
    });
    const res = await app.handle(
      new Request("http://localhost/test-view", {
        method: "POST",
        body: jobFixture("v-mine"),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await res.json()).toEqual({ allowed: true, scope: "own" });
  });

  test("user with membership viewing foreign vendor's job throws 403", async () => {
    const app = buildViewApp({
      id: "u1",
      role: "customer",
      vendorMemberships: [{ vid: "v-mine", r: "owner" }],
    });
    const res = await app.handle(
      new Request("http://localhost/test-view", {
        method: "POST",
        body: jobFixture("v-other"),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });

  test("user without membership throws 403", async () => {
    const app = buildViewApp({ id: "u1", role: "customer", vendorMemberships: [] });
    const res = await app.handle(
      new Request("http://localhost/test-view", {
        method: "POST",
        body: jobFixture("v1"),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(403);
  });
});
