/**
 * POST /checkout/initiate body validation. The route's `transform` hook runs
 * BEFORE schema validation and used to dereference `body.shippingAddress`
 * unconditionally, so `{}` crashed with a 500 (addr.full_name on undefined)
 * instead of the schema's 400. Imports the REAL checkout.routes.ts (real
 * jwtAuth/requireRole) behind errorHandler with a stub controller.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
import { config } from "@materialhub/config";
import { errorHandler } from "@materialhub/plugins";
import { Elysia } from "elysia";

const checkoutController = {
  initiateCheckout: mock(async (_userId: string, _data: any) => ({
    orderId: "ord-1",
    orderNumber: "MH-0001",
    grandTotal: 10500,
  })),
};

mock.module("../container.ts", () => ({
  container: new Elysia({ name: "order-service-container" }).decorate({
    checkoutController,
    quoteController: {},
  }),
}));

const { checkoutRoutes } = await import("./checkout.routes.ts");
const app = new Elysia()
  .use(errorHandler)
  .decorate({ checkoutController, quoteController: {} })
  .use(checkoutRoutes as any);

function b64url(x: unknown): string {
  return Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
}
function sign(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const body = b64url({
    sub: "cust-1",
    email: "buyer@materialhub.test",
    role: "customer",
    iat: now,
    exp: now + 3600,
  });
  const sig = createHmac("sha256", config.jwt.accessSecret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

function post(body: unknown) {
  return app.handle(
    new Request("http://localhost/checkout/initiate", {
      method: "POST",
      headers: { authorization: `Bearer ${sign()}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

// A saved user_addresses row, as apps/web checkout-page.tsx sends it
// (`shippingAddress: selectedAddress` straight from /users/me/addresses).
const savedAddress = {
  id: "5f0c2d7e-8a51-4c43-9a43-0d6c1c8f2a11",
  user_id: "cust-1",
  label: "Warehouse",
  full_name: "Layla Haddad",
  phone: "+971501234567",
  street: "Street 14, Al Quoz Industrial 3",
  area: "Al Quoz",
  building_name: null,
  apartment: null,
  floor: null,
  city: "Dubai",
  emirate: "Dubai",
  postal_code: null,
  country_code: "AE",
  is_default: true,
};

beforeEach(() => checkoutController.initiateCheckout.mockClear());

describe("POST /checkout/initiate validation", () => {
  test.each([
    ["an empty object", {}],
    ["a null shippingAddress", { shippingAddress: null }],
    ["a string shippingAddress", { shippingAddress: "Dubai" }],
    ["an array shippingAddress", { shippingAddress: [] }],
    ["an address without phone/city", { shippingAddress: { full_name: "Layla Haddad" } }],
    [
      "a non-string full_name",
      { shippingAddress: { full_name: 42, phone: "+971501234567", city: "Dubai" } },
    ],
  ])("rejects %s with 400, controller not called", async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(checkoutController.initiateCheckout).not.toHaveBeenCalled();
  });

  test("accepts the web app's COD body (saved address + address_id + quote_token)", async () => {
    const res = await post({
      quote_token: "qt_abc",
      address_id: savedAddress.id,
      shippingAddress: savedAddress,
      payment_method: "cod",
    });
    expect(res.status).toBe(200);
    const data = checkoutController.initiateCheckout.mock.calls[0]?.[1];
    expect(data.paymentMethod).toBe("cod");
    // transform still normalises the address
    expect(data.shippingAddress.first_name).toBe("Layla");
    expect(data.shippingAddress.last_name).toBe("Haddad");
    expect(data.shippingAddress.address_line_1).toBe(savedAddress.street);
    expect(data.shippingAddress.address_line_2).toBe("Al Quoz");
  });

  test("accepts the web app's card body without a quote token", async () => {
    const res = await post({
      address_id: savedAddress.id,
      shippingAddress: savedAddress,
      shippingMethod: "standard",
      payment_method: "stripe",
    });
    expect(res.status).toBe(200);
    expect(checkoutController.initiateCheckout).toHaveBeenCalledTimes(1);
  });
});
