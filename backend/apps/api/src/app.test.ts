import { describe, expect, test } from "bun:test";
import { app } from "./app.ts";

/**
 * The real public app. Only paths that are answered before auth and before any
 * module dispatch are exercised here (no DB/Redis needed).
 */
describe("public app: unknown paths", () => {
  const unknown: Array<[string, string]> = [
    ["GET", "/nope"],
    ["POST", "/nope/deeper"],
    ["GET", "/internal/inventory/adjust"],
    ["POST", "/internal/orders/verified-purchase"],
  ];

  for (const [method, path] of unknown) {
    test(`${method} ${path} → 404 for an anonymous caller (not 401)`, async () => {
      const res = await app.handle(new Request(`http://localhost${path}`, { method }));
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string; statusCode: number };
      expect(body.error).toBe("NOT_FOUND");
      expect(body.statusCode).toBe(404);
    });
  }

  test("404 still carries CORS headers for browser callers", async () => {
    const res = await app.handle(
      new Request("http://localhost/nope", { headers: { origin: "http://localhost:4000" } }),
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:4000");
  });

  test("CORS preflight on any path is left to the cors plugin", async () => {
    const res = await app.handle(
      new Request("http://localhost/nope", {
        method: "OPTIONS",
        headers: { origin: "http://localhost:4000", "access-control-request-method": "GET" },
      }),
    );
    expect(res.status).toBe(204);
  });
});
