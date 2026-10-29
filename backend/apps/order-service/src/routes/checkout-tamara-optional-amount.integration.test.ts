import { describe, expect, it, mock } from "bun:test";
import { config } from "@materialhub/config";
import { errorHandler } from "@materialhub/plugins";
import { Elysia } from "elysia";
import jwt from "jsonwebtoken";

// Regression coverage for: the frontend "retry Tamara" flow calls
// POST /checkout/tamara with only order_id + redirect URLs (no amount). The
// route used to declare `amount: t.Integer()` as required, so Elysia rejected
// the request with a 400 before the handler ever ran. The order's own
// grand_total is authoritative server-side (payment.service.ts:183), so
// `amount` is now optional in the body schema.
//
// This mounts the REAL exported `checkoutRoutes` (checkout.routes.ts) and
// drives it through app.handle(), so it pins the actual production body
// schema — not a hand-copied duplicate that could silently drift from it.
//
// The real DI container (`../container.ts`) connects to Postgres/Redis and
// eagerly wires the whole service graph at import time, which CI doesn't
// have. Mirroring the precedent in service-offering.auth-wiring.test.ts and
// route-mounting.test.ts: mock.module the container down to a bare Elysia
// decorated with a stub `checkoutController`, then import the real route
// module so its actual `.use(jwtAuth).use(requireRole(...))` wiring and body
// schema stay under test. A real JWT (signed with the same secret jwtAuth
// verifies against) drives it through the real auth guard rather than
// bypassing it.
mock.module("../container.ts", () => ({
  container: new Elysia({ name: "container-stub" }).decorate("checkoutController", {
    createBnplSession: mock(() =>
      Promise.resolve({ redirect_url: "https://checkout.tamara.co/session/abc" }),
    ),
  }),
}));

const { checkoutRoutes } = await import("./checkout.routes.ts");

const app = new Elysia().use(errorHandler).use(checkoutRoutes);

const ORDER_ID = "00000000-0000-0000-0000-000000000001";

// `tv` (token version) is omitted so jwtAuth skips the Redis token-version
// lookup, keeping this test DB/Redis-free — same trick as
// service-offering.auth-wiring.test.ts.
function signCustomer(): string {
  return jwt.sign(
    {
      sub: "11111111-1111-1111-1111-111111111111",
      email: "customer@test.local",
      role: "customer",
    },
    config.jwt.accessSecret,
    { algorithm: "HS256", expiresIn: "1h" },
  );
}

async function postTamara(body: Record<string, unknown>, token?: string): Promise<Response> {
  return app.handle(
    new Request("http://localhost/checkout/tamara", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /checkout/tamara — optional amount (real route + real auth guard)", () => {
  const token = signCustomer();

  it("accepts a request with no amount (retry flow) and returns 200", async () => {
    const res = await postTamara(
      {
        order_id: ORDER_ID,
        return_url: "https://materialhubuae.com/checkout/tamara/return",
        failure_url: "https://materialhubuae.com/checkout/tamara/failure",
        cancel_url: "https://materialhubuae.com/checkout/tamara/cancel",
      },
      token,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.statusCode).toBe(200);
    expect(body.data.redirect_url).toBe("https://checkout.tamara.co/session/abc");
  });

  it("still accepts a request that sends amount (backward compatible)", async () => {
    const res = await postTamara({ order_id: ORDER_ID, amount: 105000 }, token);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.statusCode).toBe(200);
  });

  it("still rejects a request missing order_id", async () => {
    const res = await postTamara({ amount: 105000 }, token);
    // Elysia's own default for a VALIDATION error is 422, but this service's
    // real errorHandler (mounted here, unlike the old hand-copied test app)
    // maps VALIDATION -> 400 (see libs/plugins/src/index.ts:114) — asserting
    // against the actual mounted app caught this drift from the old test's
    // assumption.
    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated request with 401 (auth remains enforced)", async () => {
    const res = await postTamara({ order_id: ORDER_ID });
    expect(res.status).toBe(401);
  });
});
