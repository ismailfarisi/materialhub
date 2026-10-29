import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

function createProductApp() {
  return new Elysia({ prefix: "/products" })
    .get("/health", () => ({
      status: "ok",
      service: "product-service",
      timestamp: new Date().toISOString(),
    }))
    .get("/", () => ({ message: "TODO: list products" }))
    .get("/:id", () => ({ message: "TODO: get product" }))
    .post("/", () => ({ message: "TODO: create product" }))
    .put("/:id", () => ({ message: "TODO: update product" }))
    .delete("/:id", () => ({ message: "TODO: delete product" }));
}

describe("product-service", () => {
  test("GET /products/health returns 200", async () => {
    const app = createProductApp();
    const res = await app.handle(new Request("http://localhost/products/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("ok");
    expect(body.service).toBe("product-service");
  });

  test("GET /products returns 200", async () => {
    const app = createProductApp();
    const res = await app.handle(new Request("http://localhost/products/"));
    expect(res.status).toBe(200);
  });

  test("GET /products/:id returns 200", async () => {
    const app = createProductApp();
    const res = await app.handle(new Request("http://localhost/products/abc-123"));
    expect(res.status).toBe(200);
  });

  test("POST /products returns 200", async () => {
    const app = createProductApp();
    const res = await app.handle(new Request("http://localhost/products/", { method: "POST" }));
    expect(res.status).toBe(200);
  });

  test("PUT /products/:id returns 200", async () => {
    const app = createProductApp();
    const res = await app.handle(
      new Request("http://localhost/products/abc-123", { method: "PUT" }),
    );
    expect(res.status).toBe(200);
  });

  test("DELETE /products/:id returns 200", async () => {
    const app = createProductApp();
    const res = await app.handle(
      new Request("http://localhost/products/abc-123", { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
  });

  test("all CRUD routes are registered", async () => {
    const app = createProductApp();
    const routes = [
      { path: "/products/", method: "GET" },
      { path: "/products/1", method: "GET" },
      { path: "/products/", method: "POST" },
      { path: "/products/1", method: "PUT" },
      { path: "/products/1", method: "DELETE" },
    ];

    for (const route of routes) {
      const res = await app.handle(
        new Request(`http://localhost${route.path}`, { method: route.method }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.message).toContain("TODO");
    }
  });
});
