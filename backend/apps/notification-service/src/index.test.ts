import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

function createTestApp() {
  return new Elysia({ prefix: "/notifications" }).get("/health", () => ({
    status: "ok",
    service: "notification-service",
    timestamp: new Date().toISOString(),
  }));
}

describe("notification-service", () => {
  test("GET /notifications/health returns 200", async () => {
    const app = createTestApp();
    const res = await app.handle(new Request("http://localhost/notifications/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("notification-service");
  });
});
