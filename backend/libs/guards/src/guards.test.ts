import { describe, expect, test } from "bun:test";
import { jwt } from "@elysiajs/jwt";
import { config } from "@materialhub/config";
import { Elysia } from "elysia";
import { authGuard, requireRole } from "./index.ts";
import { jwtAuth } from "./jwt-auth.ts";
import {
  __setDataSourceForTests as setTvDS,
  __setRedisForTests as setTvRedis,
} from "./token-version.ts";

// ---------- authGuard (placeholder) ----------
describe("authGuard", () => {
  function createApp() {
    return new Elysia().use(authGuard).get("/test", ({ user }) => ({ user }));
  }

  test("returns 401 UNAUTHORIZED when no authorization header", async () => {
    const app = createApp();
    const res = await app.handle(new Request("http://localhost/test"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error).toBe("UNAUTHORIZED");
  });

  test("returns 401 UNAUTHORIZED with invalid authorization header", async () => {
    const app = createApp();
    const res = await app.handle(
      new Request("http://localhost/test", {
        headers: { authorization: "Bearer some-token" },
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error).toBe("UNAUTHORIZED");
  });
});

// ---------- requireRole ----------
describe("requireRole", () => {
  test("throws Unauthorized when user is null", async () => {
    const app = new Elysia()
      .derive(() => ({ user: null }))
      .use(requireRole("admin"))
      .get("/admin", () => "ok");

    const res = await app.handle(new Request("http://localhost/admin"));
    // Elysia will catch the thrown error and return 500
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("throws Forbidden when user role is not in allowed roles", async () => {
    const app = new Elysia()
      .derive(() => ({
        user: { id: "1", email: "user@test.com", role: "customer" as const },
      }))
      .use(requireRole("admin", "super_admin"))
      .get("/admin", () => "ok");

    const res = await app.handle(new Request("http://localhost/admin"));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("allows access when user role matches", async () => {
    const app = new Elysia()
      .derive(() => ({
        user: { id: "1", email: "admin@test.com", role: "admin" as const },
      }))
      .use(requireRole("admin", "super_admin"))
      .get("/admin", () => ({ access: "granted" }));

    const res = await app.handle(new Request("http://localhost/admin"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.access).toBe("granted");
  });

  // Phase 3a: vendor role removed — test with customer + admin multi-role list
  test("allows multiple roles (customer in list)", async () => {
    const app = new Elysia()
      .derive(() => ({
        user: { id: "1", email: "v@test.com", role: "customer" as const },
      }))
      .use(requireRole("customer", "admin"))
      .get("/dashboard", () => ({ access: "granted" }));

    const res = await app.handle(new Request("http://localhost/dashboard"));
    expect(res.status).toBe(200);
  });
});

// ---------- jwtAuth ----------
describe("jwtAuth", () => {
  // Helper to create a signed token
  async function createToken(payload: Record<string, any>): Promise<string> {
    const signer = new Elysia().use(jwt({ name: "signer", secret: config.jwt.accessSecret }));
    // Use Elysia's internal jwt to sign
    const app = signer.get("/sign", async ({ signer }) => {
      const token = await signer.sign(payload);
      return { token };
    });
    const res = await app.handle(new Request("http://localhost/sign"));
    const body = (await res.json()) as any;
    return body.token;
  }

  function createProtectedApp() {
    return new Elysia()
      .use(jwtAuth)
      .get("/health", () => ({ status: "ok" }))
      .get("/protected", ({ user }) => ({ user }));
  }

  test("allows public routes without token", async () => {
    const app = createProtectedApp();
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("ok");
  });

  test("returns 401 for protected routes without token", async () => {
    const app = createProtectedApp();
    const res = await app.handle(new Request("http://localhost/protected"));
    expect(res.status).toBe(401);
  });

  test("returns 401 for invalid token", async () => {
    const app = createProtectedApp();
    const res = await app.handle(
      new Request("http://localhost/protected", {
        headers: { authorization: "Bearer invalid-token-here" },
      }),
    );
    expect(res.status).toBe(401);
  });

  test("allows api/docs routes without token", async () => {
    const app = new Elysia()
      .use(jwtAuth)
      .get("/api/docs", () => ({ docs: true }))
      .get("/api/docs/json", () => ({ spec: {} }));

    const res1 = await app.handle(new Request("http://localhost/api/docs"));
    expect(res1.status).toBe(200);

    const res2 = await app.handle(new Request("http://localhost/api/docs/json"));
    expect(res2.status).toBe(200);
  });

  test("allows auth routes without token", async () => {
    const app = new Elysia()
      .use(jwtAuth)
      .post("/auth/login", () => ({ token: "x" }))
      .post("/auth/register", () => ({ ok: true }))
      .post("/auth/refresh", () => ({ ok: true }))
      .post("/auth/phone/start", () => ({ ok: true }))
      .post("/auth/phone/verify", () => ({ ok: true }))
      .post("/auth/phone/register", () => ({ ok: true }))
      .post("/auth/forgot-password", () => ({ ok: true }))
      .post("/auth/reset-password", () => ({ ok: true }));

    for (const path of [
      "/auth/login",
      "/auth/register",
      "/auth/refresh",
      "/auth/phone/start",
      "/auth/phone/verify",
      "/auth/phone/register",
      "/auth/forgot-password",
      "/auth/reset-password",
    ]) {
      const res = await app.handle(new Request(`http://localhost${path}`, { method: "POST" }));
      expect(res.status).toBe(200);
    }
  });

  test("allows GET /products/:id/recommendations without token (PDP rails)", async () => {
    const app = new Elysia()
      .use(jwtAuth)
      .get("/products/:id/recommendations", () => ({ ok: true }));

    const productId = "ef27b3f3-a971-47a8-b5ca-366b7f334819";
    for (const path of [
      `/products/${productId}/recommendations`,
      `/products/${productId}/recommendations?type=more-from-brand`,
      `/products/${productId}/recommendations?type=pairs-with`,
      `/products/${productId}/recommendations?type=cross-brand`,
      `/products/${productId}/recommendations?type=bestsellers`,
    ]) {
      const res = await app.handle(new Request(`http://localhost${path}`));
      expect(res.status).toBe(200);
    }
  });

  test("allows GET /checkout/bnpl-thresholds without token (PDP installment strip)", async () => {
    const app = new Elysia().use(jwtAuth).get("/checkout/bnpl-thresholds", () => ({ data: [] }));

    const res = await app.handle(new Request("http://localhost/checkout/bnpl-thresholds"));
    expect(res.status).toBe(200);
  });

  test("still requires auth for non-public /checkout subpaths and /products/:id/foo", async () => {
    const app = new Elysia()
      .use(jwtAuth)
      .post("/checkout/initiate", () => ({ ok: true }))
      .get("/products/ef27b3f3-a971-47a8-b5ca-366b7f334819/private", () => ({ ok: true }));

    const res1 = await app.handle(
      new Request("http://localhost/checkout/initiate", { method: "POST" }),
    );
    expect(res1.status).toBe(401);

    const res2 = await app.handle(
      new Request("http://localhost/products/ef27b3f3-a971-47a8-b5ca-366b7f334819/private"),
    );
    expect(res2.status).toBe(401);
  });

  test("allows GET /collections/:slug without token (public storefront)", async () => {
    const app = new Elysia().use(jwtAuth).get("/collections/:slug", () => ({ ok: true }));
    const res = await app.handle(new Request("http://localhost/collections/summer-edit"));
    expect(res.status).toBe(200);
  });

  test("still requires auth for /admin/collections", async () => {
    const app = new Elysia().use(jwtAuth).get("/admin/collections", () => ({ ok: true }));
    const res = await app.handle(new Request("http://localhost/admin/collections"));
    expect(res.status).toBe(401);
  });
});

// ---------- jwtAuth tv/vm (Phase 2) ----------
describe("jwtAuth tv/vm", () => {
  async function createToken(payload: Record<string, any>): Promise<string> {
    const app = new Elysia()
      .use(jwt({ name: "signer", secret: config.jwt.accessSecret }))
      .get("/sign", async ({ signer }: any) => ({ token: await signer.sign(payload) }));
    const res = await app.handle(new Request("http://localhost/sign"));
    return ((await res.json()) as { token: string }).token;
  }

  function createProtectedApp() {
    return new Elysia()
      .use(jwtAuth)
      .get("/protected", ({ user, vendorMemberships }: any) => ({ user, vendorMemberships }));
  }

  test("old-shape token (no tv) authenticates without Redis check", async () => {
    setTvRedis(null);
    setTvDS(null);
    const token = await createToken({ sub: "u1", email: "u1@x.com", role: "customer" });
    const app = createProtectedApp();
    const res = await app.handle(
      new Request("http://localhost/protected", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.user.id).toBe("u1");
    expect(body.vendorMemberships).toEqual([]);
  });

  test("new-shape token with matching tv authenticates", async () => {
    setTvRedis({
      isOpen: true,
      get: () => Promise.resolve("4"),
      set: () => Promise.resolve("OK"),
    } as never);
    const token = await createToken({
      sub: "u1",
      email: "u1@x.com",
      role: "customer",
      tv: 4,
      vm: [{ vid: "v1", r: "owner" }],
    });
    const app = createProtectedApp();
    const res = await app.handle(
      new Request("http://localhost/protected", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.vendorMemberships).toEqual([{ vid: "v1", r: "owner" }]);
  });

  test("new-shape token with stale tv returns 401 TOKEN_REVOKED", async () => {
    setTvRedis({
      isOpen: true,
      get: () => Promise.resolve("9"),
      set: () => Promise.resolve("OK"),
    } as never);
    const token = await createToken({
      sub: "u1",
      email: "u1@x.com",
      role: "customer",
      tv: 4,
    });
    const app = createProtectedApp();
    const res = await app.handle(
      new Request("http://localhost/protected", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error).toBe("TOKEN_REVOKED");
  });

  test("malformed vm entries are filtered out", async () => {
    setTvRedis(null);
    const token = await createToken({
      sub: "u1",
      email: "u1@x.com",
      role: "customer",
      vm: [{ vid: "v1", r: "owner" }, { vid: 123 }, { r: "manager" }, "garbage"],
    });
    const app = createProtectedApp();
    const res = await app.handle(
      new Request("http://localhost/protected", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.vendorMemberships).toEqual([{ vid: "v1", r: "owner" }]);
  });
});
