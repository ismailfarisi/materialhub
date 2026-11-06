import { describe, expect, it, mock } from "bun:test";
import { Elysia } from "elysia";

// The real container connects to Postgres at import time (`await ensureDatabase()`),
// which CI doesn't have. Route *mounting* doesn't need it: an unauthenticated
// request never reaches a controller — a mounted route 401s, an unmounted one 404s.
mock.module("../container.ts", () => ({
  container: new Elysia({ name: "container-stub" }),
}));

const { app } = await import("../app.ts");

describe("shipping route mounting", () => {
  // The gateway proxies prefixes verbatim (proxy.ts forwards `upstreamPath: path`),
  // so every prefix it maps to this service must exist at the service root.
  // `/vendor/warehouses` regressed once by being nested under the `/shipping`
  // prefix, which 404'd every vendor-dashboard warehouse fetch.
  it("serves GET /vendor/warehouses at the service root", async () => {
    const res = await app.handle(new Request("http://localhost/vendor/warehouses"));
    expect(res.status).toBe(401); // mounted; unauthenticated requests are rejected, not 404
  });

  it("keeps admin warehouse routes under /shipping", async () => {
    const res = await app.handle(new Request("http://localhost/shipping/warehouses"));
    expect(res.status).not.toBe(404);
  });
});

describe("admin payout route mounting", () => {
  // `/admin/payouts` is already in the gateway's proxy table, so a new
  // sub-route only needs to exist at this service's root. 401 (mounted, guard
  // rejects) rather than 404 (unrouted) is the whole assertion — the same
  // distinction that hid `/admin/shipments` for an entire release.
  it("serves GET /admin/payouts/:id/statement", async () => {
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/11111111-1111-4111-8111-111111111111/statement"),
    );
    expect(res.status).toBe(401);
  });
});

describe("delivery promise route mounting", () => {
  // Public estimate routes sit under the gateway's /shipping prefix; vendor
  // settings under /vendor/warehouses; admin holidays under /admin/public-holidays.
  it("serves the vendor warehouse delivery settings behind auth", async () => {
    const res = await app.handle(new Request("http://localhost/vendor/warehouses/delivery"));
    expect(res.status).toBe(401);
  });

  it("serves the admin public-holiday list behind auth", async () => {
    const res = await app.handle(new Request("http://localhost/admin/public-holidays"));
    expect(res.status).toBe(401);
  });

  it("mounts the public estimate route", async () => {
    const res = await app.handle(new Request("http://localhost/shipping/delivery-estimate"));
    expect(res.status).not.toBe(404);
  });
});
