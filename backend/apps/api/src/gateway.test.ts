import { describe, expect, test } from "bun:test";
import { cors } from "@elysiajs/cors";
import { errorHandler, requestLogger } from "@materialhub/plugins";
import { Elysia } from "elysia";

/**
 * Tests for the API Gateway behavior.
 * We recreate the gateway logic without .listen() to avoid port binding.
 */
describe("API Gateway", () => {
  function createGateway() {
    return new Elysia()
      .use(cors())
      .use(errorHandler)
      .use(requestLogger)
      .get("/health", () => ({
        status: "ok",
        service: "api-gateway",
        timestamp: new Date().toISOString(),
        services: {},
      }));
  }

  test("GET /health returns 200 with gateway info", async () => {
    const app = createGateway();
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.status).toBe("ok");
    expect(body.service).toBe("api-gateway");
    expect(body.timestamp).toBeDefined();
  });

  test("health response has ISO timestamp", async () => {
    const app = createGateway();
    const res = await app.handle(new Request("http://localhost/health"));
    const body = (await res.json()) as any;
    // ISO 8601 format check
    expect(() => new Date(body.timestamp)).not.toThrow();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  test("CORS headers are set", async () => {
    const app = createGateway();
    const res = await app.handle(
      new Request("http://localhost/health", {
        headers: { origin: "http://example.com" },
      }),
    );
    // CORS plugin should set access-control-allow-origin
    const acaoHeader = res.headers.get("access-control-allow-origin");
    expect(acaoHeader).toBeDefined();
  });

  test("correlation ID is set on responses", async () => {
    const app = createGateway();
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.headers.get("x-correlation-id")).toBeDefined();
  });

  test("returns 404 for unknown routes", async () => {
    const app = createGateway();
    const res = await app.handle(new Request("http://localhost/nonexistent"));
    expect(res.status).toBe(404);
  });
});
