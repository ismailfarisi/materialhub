import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { VENDOR_TRANSITIONS, isValidTransition } from "./domain/types.ts";

describe("vendor-service", () => {
  function createHealthApp() {
    return new Elysia({ prefix: "/vendors" }).get("/health", () => ({
      status: "ok",
      service: "vendor-service",
      timestamp: new Date().toISOString(),
    }));
  }

  test("GET /vendors/health returns 200", async () => {
    const app = createHealthApp();
    const res = await app.handle(new Request("http://localhost/vendors/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("ok");
    expect(body.service).toBe("vendor-service");
  });

  test("all valid transitions are covered", () => {
    expect(isValidTransition("pending", "under_review")).toBe(true);
    expect(isValidTransition("under_review", "approved")).toBe(true);
    expect(isValidTransition("under_review", "rejected")).toBe(true);
    expect(isValidTransition("rejected", "pending")).toBe(true);
    expect(isValidTransition("approved", "suspended")).toBe(true);
    expect(isValidTransition("approved", "deactivated")).toBe(true);
    expect(isValidTransition("suspended", "approved")).toBe(true);
  });

  test("invalid transitions are blocked", () => {
    expect(isValidTransition("pending", "approved")).toBe(false);
    expect(isValidTransition("rejected", "approved")).toBe(false);
    expect(isValidTransition("deactivated", "approved")).toBe(false);
    expect(isValidTransition("suspended", "pending")).toBe(false);
  });

  test("deactivated has no valid transitions", () => {
    expect(VENDOR_TRANSITIONS.deactivated).toEqual([]);
  });
});
