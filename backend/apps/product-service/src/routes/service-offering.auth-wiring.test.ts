// service-offering.auth-wiring.test.ts
//
// Regression guard for the Phase 7 auth-wiring bug on product-service's
// vendor-facing service catalog CRUD. Elysia's scoped derive does not cross
// plugin encapsulation, so `serviceOfferingRoutes` must `.use(jwtAuth)` in its
// OWN instance before `.use(vendorMembership(...))`; without it `context.user`
// is never populated and the guard 401s EVERY caller (observed live: valid
// vendor JWT -> /vendor/services 401 "Authentication required").
//
// This is a mock-container + real-route mounting test. Importing the real
// product-service DI container (`../container.ts`) standalone is infeasible —
// it eagerly wires the whole service graph (BullMQ workers, and a bulk-module
// init-order landmine: "Cannot access 'bulkService' before initialization").
// So we `mock.module` the container down to a bare Elysia plugin and import
// the REAL exported `serviceOfferingRoutes`, keeping its actual
// `.use(jwtAuth).guard(.use(vendorMembership))` wiring under test. The 403 path
// never touches the container's controllers, so the stub is never invoked.
//
// NO DB: an intentionally-empty permission matrix stops the request at the
// vendorMembership guard with 403 INSUFFICIENT_VENDOR_PERMISSION. The
// load-bearing assertion is that the status is NOT 401 and the error is NOT
// "UNAUTHORIZED" — i.e. jwtAuth populated `user`. Pre-fix this route returned
// 401 UNAUTHORIZED here.
import { beforeAll, describe, expect, it, mock } from "bun:test";
import { config } from "@materialhub/config";
import { permissionMatrix } from "@materialhub/guards";
import { errorHandler } from "@materialhub/plugins";
import { Elysia } from "elysia";
import jwt from "jsonwebtoken";

// Stub the heavy DI container BEFORE the real route module is evaluated. A bare
// Elysia satisfies `.use(container)`; its controllers are never reached on the
// 401/403 auth path this test exercises.
mock.module("../container.ts", () => ({ container: new Elysia({ name: "container" }) }));

const { serviceOfferingRoutes } = await import("./service-offering.routes.ts");
const { productGroupRoutes } = await import("./product-group.routes.ts");

const VENDOR_ID = "11111111-1111-1111-1111-111111111111";

const app = new Elysia().use(errorHandler).use(serviceOfferingRoutes);

// Single membership (role=owner) so vendorMembership resolves `active` without
// an X-Active-Vendor-Id header. `tv` omitted so jwtAuth skips the Redis
// token-version lookup — keeps this test DB/Redis-free.
function signVendor(): string {
  return jwt.sign(
    {
      sub: "44444444-4444-4444-4444-444444444444",
      email: "owner@test.local",
      role: "customer",
      vm: [{ vid: VENDOR_ID, r: "owner" }],
    },
    config.jwt.accessSecret,
    { algorithm: "HS256", expiresIn: "1h" },
  );
}

async function req(method: string, path: string, token?: string): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }),
  );
}

describe("service-offering.routes.ts auth wiring (jwtAuth present in the instance)", () => {
  let token = "";

  beforeAll(() => {
    // Empty matrix: owner holds no permissions -> a request that reaches the
    // guard 403s without touching any controller/DB. If jwtAuth were missing,
    // it would 401 (UNAUTHORIZED) first — the pre-fix bug this locks out.
    permissionMatrix.__setMapForTests([]);
    token = signVendor();
  });

  it("a valid vendor JWT is NOT rejected as UNAUTHORIZED (GET /vendor/services)", async () => {
    const res = await req("GET", "/vendor/services", token);
    // biome-ignore lint/suspicious/noExplicitAny: loosely-typed JSON body
    const json = (await res.json().catch(() => ({}))) as any;

    expect(res.status).not.toBe(401);
    expect(json.error).not.toBe("UNAUTHORIZED");
    // Positive proof jwtAuth populated `user`: reached the permission check.
    expect(res.status).toBe(403);
    expect(json.error).toBe("INSUFFICIENT_VENDOR_PERMISSION");
  });

  it("a request with NO token still 401s (auth remains enforced)", async () => {
    const res = await req("GET", "/vendor/services", undefined);
    expect(res.status).toBe(401);
  });
});

describe("product-group.routes.ts auth wiring (jwtAuth present in the instance)", () => {
  let token = "";

  beforeAll(() => {
    // Empty matrix: owner holds no permissions -> a request that reaches the
    // guard 403s without touching any controller/DB. If jwtAuth were missing,
    // it would 401 (UNAUTHORIZED) first — the pre-fix bug this locks out.
    permissionMatrix.__setMapForTests([]);
    token = signVendor();
  });

  const appWithProductGroups = new Elysia().use(errorHandler).use(productGroupRoutes);

  async function reqProductGroups(method: string, path: string, token?: string): Promise<Response> {
    return appWithProductGroups.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      }),
    );
  }

  it("a valid vendor JWT is NOT rejected as UNAUTHORIZED (GET /vendor/product-groups/by-product/:productId)", async () => {
    const res = await reqProductGroups("GET", "/vendor/product-groups/by-product/test-id", token);
    // biome-ignore lint/suspicious/noExplicitAny: loosely-typed JSON body
    const json = (await res.json().catch(() => ({}))) as any;

    expect(res.status).not.toBe(401);
    expect(json.error).not.toBe("UNAUTHORIZED");
    // Positive proof jwtAuth populated `user`: reached the permission check.
    expect(res.status).toBe(403);
    expect(json.error).toBe("INSUFFICIENT_VENDOR_PERMISSION");
  });
});
