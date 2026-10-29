import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

function createOrderApp() {
  return new Elysia({ prefix: "/orders" })
    .get("/health", () => ({
      status: "ok",
      service: "order-service",
      timestamp: new Date().toISOString(),
    }))
    .get("/", () => ({ message: "TODO: list orders" }))
    .get("/:id", () => ({ message: "TODO: get order" }))
    .post("/checkout/initiate", () => ({ message: "TODO: initiate checkout" }))
    .post("/checkout/apply-coupon", () => ({ message: "TODO: apply coupon" }))
    .post("/checkout/payment-intent", () => ({
      message: "TODO: create payment intent",
    }));
}

describe("order-service", () => {
  test("GET /orders/health returns 200", async () => {
    const app = createOrderApp();
    const res = await app.handle(new Request("http://localhost/orders/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("ok");
    expect(body.service).toBe("order-service");
  });

  test("GET /orders returns 200", async () => {
    const app = createOrderApp();
    const res = await app.handle(new Request("http://localhost/orders/"));
    expect(res.status).toBe(200);
  });

  test("GET /orders/:id returns 200", async () => {
    const app = createOrderApp();
    const res = await app.handle(new Request("http://localhost/orders/order-123"));
    expect(res.status).toBe(200);
  });

  test("POST /orders/checkout/initiate returns 200", async () => {
    const app = createOrderApp();
    const res = await app.handle(
      new Request("http://localhost/orders/checkout/initiate", { method: "POST" }),
    );
    expect(res.status).toBe(200);
  });

  test("POST /orders/checkout/apply-coupon returns 200", async () => {
    const app = createOrderApp();
    const res = await app.handle(
      new Request("http://localhost/orders/checkout/apply-coupon", { method: "POST" }),
    );
    expect(res.status).toBe(200);
  });

  test("POST /orders/checkout/payment-intent returns 200", async () => {
    const app = createOrderApp();
    const res = await app.handle(
      new Request("http://localhost/orders/checkout/payment-intent", { method: "POST" }),
    );
    expect(res.status).toBe(200);
  });

  test("checkout routes return TODO messages", async () => {
    const app = createOrderApp();
    const checkoutRoutes = [
      "/orders/checkout/initiate",
      "/orders/checkout/apply-coupon",
      "/orders/checkout/payment-intent",
    ];

    for (const path of checkoutRoutes) {
      const res = await app.handle(new Request(`http://localhost${path}`, { method: "POST" }));
      const body = (await res.json()) as any;
      expect(body.message).toContain("TODO");
    }
  });
});
