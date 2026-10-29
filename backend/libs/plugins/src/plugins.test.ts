import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { errorHandler, requestLogger } from "./index.ts";

describe("errorHandler", () => {
  function createApp() {
    return new Elysia().use(errorHandler);
  }

  test("returns 404 for unknown routes", async () => {
    const app = createApp().get("/exists", () => "ok");
    const res = await app.handle(new Request("http://localhost/not-found"));
    expect(res.status).toBe(404);
  });

  test("returns error status for unhandled exceptions", async () => {
    const app = createApp().get("/throw", () => {
      throw new Error("something broke");
    });
    const res = await app.handle(new Request("http://localhost/throw"));
    expect(res.status).toBe(500);
  });

  test("successful routes still return 200", async () => {
    const app = createApp().get("/ok", () => ({ success: true }));
    const res = await app.handle(new Request("http://localhost/ok"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
  });
});

describe("requestLogger", () => {
  function createApp() {
    return new Elysia().use(requestLogger).get("/test", ({ correlationId }) => ({ correlationId }));
  }

  test("derives a correlationId into context", async () => {
    const app = createApp();
    const res = await app.handle(new Request("http://localhost/test"));
    const body = (await res.json()) as any;
    expect(body.correlationId).toBeDefined();
    expect(typeof body.correlationId).toBe("string");
    // Should be a valid UUID
    expect(body.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("generates unique correlationIds per request", async () => {
    const app = createApp();
    const res1 = await app.handle(new Request("http://localhost/test"));
    const res2 = await app.handle(new Request("http://localhost/test"));
    const body1 = (await res1.json()) as any;
    const body2 = (await res2.json()) as any;
    expect(body1.correlationId).not.toBe(body2.correlationId);
  });

  test("correlationId is a valid UUID v4 format", async () => {
    const app = createApp();
    const res = await app.handle(new Request("http://localhost/test"));
    const body = (await res.json()) as any;
    expect(body.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
