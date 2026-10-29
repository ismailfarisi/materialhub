import { describe, expect, it } from "bun:test";
import { app } from "../../app.ts";

// Mounting + guard wiring only — no database needed. A 404 means the module was
// never mounted in app.ts; a 401 means it is mounted and jwtAuth is wired.
async function req(method: string, path: string): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, { method }));
}

const UUID = "11111111-1111-4111-8111-111111111111";

describe("admin booking routes are mounted", () => {
  it("GET /admin/bookings requires auth (not 404)", async () => {
    const res = await req("GET", "/admin/bookings");
    expect(res.status).toBe(401);
  });

  it("GET /admin/bookings/:id requires auth (not 404)", async () => {
    const res = await req("GET", `/admin/bookings/${UUID}`);
    expect(res.status).toBe(401);
  });

  it("POST /admin/bookings/:id/complete requires auth (not 404)", async () => {
    const res = await req("POST", `/admin/bookings/${UUID}/complete`);
    expect(res.status).toBe(401);
  });

  it("does not shadow the customer /me/bookings route", async () => {
    const res = await req("GET", "/me/bookings");
    expect(res.status).toBe(401);
  });
});
