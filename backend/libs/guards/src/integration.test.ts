import { beforeAll, describe, expect, test } from "bun:test";
import { jwt } from "@elysiajs/jwt";
import { config } from "@materialhub/config";
import { Elysia } from "elysia";
import { jwtAuth, signAccessToken, vendorMembership } from "./index.ts";
import { permissionMatrix, __setRedisForTests as setMatrixRedis } from "./permission-matrix.ts";
import { __setRedisForTests as setTvRedis } from "./token-version.ts";

describe("auth + vendorMembership end-to-end", () => {
  beforeAll(() => {
    setMatrixRedis({
      isOpen: true,
      get: () => Promise.resolve("1"),
      set: () => Promise.resolve("OK"),
    } as never);
    permissionMatrix.__setMapForTests([
      { role: "owner", permission: "orders.refund" },
      { role: "manager", permission: "orders.refund" },
      { role: "staff", permission: "orders.read" },
      { role: "viewer", permission: "orders.read" },
    ]);
  });

  async function buildApp() {
    return new Elysia()
      .use(jwt({ name: "accessJwt", secret: config.jwt.accessSecret, alg: "HS256" }))
      .use(jwtAuth)
      .use(vendorMembership("orders.refund"))
      .post("/orders/:id/refund", () => ({ ok: true }));
  }

  async function signWith(payload: Parameters<typeof signAccessToken>[1]): Promise<string> {
    // Use a tiny app just to access an accessJwt instance — same secret/alg as the real one.
    const signerApp = new Elysia()
      .use(jwt({ name: "accessJwt", secret: config.jwt.accessSecret, alg: "HS256" }))
      .get("/__sign", async ({ accessJwt }: any) => {
        const tok = await signAccessToken(accessJwt, payload);
        return { tok };
      });
    const res = await signerApp.handle(new Request("http://localhost/__sign"));
    return ((await res.json()) as { tok: string }).tok;
  }

  test("owner can hit orders.refund route", async () => {
    setTvRedis({
      isOpen: true,
      get: () => Promise.resolve("1"),
      set: () => Promise.resolve("OK"),
    } as never);

    const ownerToken = await signWith({
      id: "u-owner",
      email: "owner@x.com",
      role: "customer",
      token_version: 1,
      memberships: [{ vid: "v-1", r: "owner" }],
    });

    const app = await buildApp();
    const res = await app.handle(
      new Request("http://localhost/orders/abc/refund", {
        method: "POST",
        headers: { authorization: `Bearer ${ownerToken}` },
      }),
    );
    expect(res.status).toBe(200);
  });

  test("staff is blocked from orders.refund", async () => {
    setTvRedis({
      isOpen: true,
      get: () => Promise.resolve("1"),
      set: () => Promise.resolve("OK"),
    } as never);

    const staffToken = await signWith({
      id: "u-staff",
      email: "staff@x.com",
      role: "customer",
      token_version: 1,
      memberships: [{ vid: "v-1", r: "staff" }],
    });

    const app = await buildApp();
    const res = await app.handle(
      new Request("http://localhost/orders/abc/refund", {
        method: "POST",
        headers: { authorization: `Bearer ${staffToken}` },
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("INSUFFICIENT_VENDOR_PERMISSION");
  });

  test("revoked token (stale tv) returns 401 TOKEN_REVOKED", async () => {
    setTvRedis({
      isOpen: true,
      get: () => Promise.resolve("9"), // current tv on server
      set: () => Promise.resolve("OK"),
    } as never);

    const staleToken = await signWith({
      id: "u-owner",
      email: "owner@x.com",
      role: "customer",
      token_version: 4, // stale
      memberships: [{ vid: "v-1", r: "owner" }],
    });

    const app = await buildApp();
    const res = await app.handle(
      new Request("http://localhost/orders/abc/refund", {
        method: "POST",
        headers: { authorization: `Bearer ${staleToken}` },
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("TOKEN_REVOKED");
  });

  test("user with no memberships → 400 MISSING_ACTIVE_VENDOR", async () => {
    setTvRedis({
      isOpen: true,
      get: () => Promise.resolve("1"),
      set: () => Promise.resolve("OK"),
    } as never);

    const noMembershipsToken = await signWith({
      id: "u-customer",
      email: "c@x.com",
      role: "customer",
      token_version: 1,
      memberships: [],
    });

    const app = await buildApp();
    const res = await app.handle(
      new Request("http://localhost/orders/abc/refund", {
        method: "POST",
        headers: { authorization: `Bearer ${noMembershipsToken}` },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("MISSING_ACTIVE_VENDOR");
  });
});
