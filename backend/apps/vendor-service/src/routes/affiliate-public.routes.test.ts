/**
 * Route-level tests for the `/a` public affiliate routes.
 *
 * GET /a/:slug (Task: HTTP-status regression fix):
 * affiliate-resolve.service.test.ts exercises AffiliateResolveService directly
 * and never asserts the real HTTP response status. The regression this covers:
 * the not-found branch returned `{ statusCode: 404, ... }` in the JSON body
 * but never called `set.status = 404`, so Elysia responded with HTTP 200 for
 * an unknown/suspended affiliate slug.
 *
 * POST /a/track (Task 5 review fix — guest-session resolution):
 * affiliate-attribution.service.test.ts calls AffiliateAttributionService.recordClick
 * directly with a pre-resolved sessionId and never exercises the route's guest-session
 * lookup. The regression this covers: the handler used to pass the RAW `x-guest-session`
 * header value straight through as sessionId. Every other consumer of that header
 * (order-service cart.routes.ts, /cart/merge, reels) SHA-256-hashes the token and looks
 * it up in `guest_sessions.session_token` to get the real `guest_sessions.id` — cart/order
 * keys guests by that resolved id, so storing the raw token meant it could never be
 * joined at commission time. These tests assert the *resolved* guest_sessions.id (not
 * the raw header token) is what reaches recordClick.
 *
 * Strategy mirrors vendor-invites.integration.test.ts / vendor.service.test.ts:
 * mock.module(container) AND mock.module("@materialhub/database") BEFORE importing the
 * routes, so (a) the stubbed `affiliateResolveService` / `affiliateAttributionService`
 * decorators are in place, and (b) the module-scope `guestSessionRepo` in
 * affiliate-public.routes.ts (built from `AppDataSource.getRepository(GuestSession)`
 * at import time) resolves against our stub instead of a real DB connection. Then
 * mount the route on a bare Elysia app and drive it with `.handle(new Request(...))`.
 */
import { afterEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";

// biome-ignore lint/suspicious/noExplicitAny: test-only stub return value
let resolveResult: any = null;

// biome-ignore lint/suspicious/noExplicitAny: test-only stub state — recordClick's return value
let recordClickResult: any = { id: "attr-1" };
// biome-ignore lint/suspicious/noExplicitAny: test-only call capture
const recordClickCalls: any[] = [];

// biome-ignore lint/suspicious/noExplicitAny: test-only stub state — the guest_sessions row (or null) the mocked repo returns
let guestSessionRow: any = null;
// biome-ignore lint/suspicious/noExplicitAny: test-only call capture
const guestSessionFindOneCalls: any[] = [];

const containerAbsPath = `${import.meta.dir}/../container.ts`;

mock.module(containerAbsPath, () => ({
  container: new Elysia({ name: "vendor-service-container" })
    .decorate("affiliateResolveService", {
      resolveAndClick: async (_slug: string) => resolveResult,
    })
    // biome-ignore lint/suspicious/noExplicitAny: test-only stub input capture
    .decorate("affiliateAttributionService", {
      recordClick: async (input: any) => {
        recordClickCalls.push(input);
        return recordClickResult;
      },
    }),
}));

// Spread the real module so GuestSession (and everything else) keeps its real
// identity/shape — we only intercept AppDataSource.getRepository so the
// module-scope `guestSessionRepo` in affiliate-public.routes.ts resolves to a
// controllable stub instead of touching a real DB connection.
const realDb = await import("@materialhub/database");
const realGetRepository = realDb.AppDataSource.getRepository.bind(realDb.AppDataSource);

mock.module("@materialhub/database", () => ({
  ...realDb,
  AppDataSource: {
    ...realDb.AppDataSource,
    // biome-ignore lint/suspicious/noExplicitAny: test-only stub signature
    getRepository: (entity: any) => {
      if (entity === realDb.GuestSession) {
        return {
          // biome-ignore lint/suspicious/noExplicitAny: test-only stub signature
          findOne: async (opts: any) => {
            guestSessionFindOneCalls.push(opts);
            return guestSessionRow;
          },
        };
      }
      return realGetRepository(entity);
    },
  },
}));

// Dynamic import AFTER mock.module — static imports are hoisted above
// mock.module, so a static import would bind the real container/database first.
const { affiliatePublicRoutes } = await import("./affiliate-public.routes.ts");

// biome-ignore lint/suspicious/noExplicitAny: Elysia's generic chain makes exact typing impractical in tests
function buildApp(): any {
  // biome-ignore lint/suspicious/noExplicitAny: test-only cast
  return new Elysia().use(affiliatePublicRoutes as any);
}

afterEach(() => {
  resolveResult = null;
  recordClickResult = { id: "attr-1" };
  recordClickCalls.length = 0;
  guestSessionRow = null;
  guestSessionFindOneCalls.length = 0;
});

describe("GET /a/:slug", () => {
  test("returns HTTP 404 when the slug does not resolve", async () => {
    resolveResult = null;
    const app = buildApp();
    const res = await app.handle(new Request("http://localhost/a/unknown-slug"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { statusCode: number; error: string };
    expect(body.statusCode).toBe(404);
    expect(body.error).toBe("affiliate_link_not_found");
  });

  test("returns HTTP 200 with the resolved target when the slug resolves", async () => {
    resolveResult = { code: "AFF-X", targetType: "product", targetId: "p1", vendorId: "v1" };
    const app = buildApp();
    const res = await app.handle(new Request("http://localhost/a/good-slug"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { statusCode: number; data: typeof resolveResult };
    expect(body.statusCode).toBe(200);
    expect(body.data).toEqual(resolveResult);
  });
});

describe("POST /a/track", () => {
  test("resolves x-guest-session to the guest_sessions.id — NOT the raw header token", async () => {
    guestSessionRow = { id: "gs-resolved-id" };
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/a/track", {
        method: "POST",
        headers: { "content-type": "application/json", "x-guest-session": "raw-token-abc" },
        body: JSON.stringify({ code: "AFF-X" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { attributed: boolean } };
    expect(body.data.attributed).toBe(true);

    expect(recordClickCalls).toHaveLength(1);
    expect(recordClickCalls[0].sessionId).toBe("gs-resolved-id");
    expect(recordClickCalls[0].sessionId).not.toBe("raw-token-abc");
    expect(recordClickCalls[0].buyerUserId).toBeNull();

    // The lookup must key off a SHA-256 hash of the token, not the raw token
    // (mirrors cart.routes.ts — the auth service stores the hash).
    expect(guestSessionFindOneCalls).toHaveLength(1);
    const lookedUpToken = guestSessionFindOneCalls[0].where.session_token;
    expect(lookedUpToken).not.toBe("raw-token-abc");
    expect(lookedUpToken).toHaveLength(64); // sha256 hex
  });

  test("sessionId is null when the guest session token does not resolve to a row", async () => {
    guestSessionRow = null;
    const app = buildApp();
    await app.handle(
      new Request("http://localhost/a/track", {
        method: "POST",
        headers: { "content-type": "application/json", "x-guest-session": "unknown-token" },
        body: JSON.stringify({ code: "AFF-X" }),
      }),
    );
    expect(recordClickCalls).toHaveLength(1);
    expect(recordClickCalls[0].sessionId).toBeNull();
  });

  test("sessionId is null and no lookup happens when there is no x-guest-session header", async () => {
    const app = buildApp();
    await app.handle(
      new Request("http://localhost/a/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "AFF-X" }),
      }),
    );
    expect(guestSessionFindOneCalls).toHaveLength(0);
    expect(recordClickCalls).toHaveLength(1);
    expect(recordClickCalls[0].sessionId).toBeNull();
    expect(recordClickCalls[0].buyerUserId).toBeNull();
  });
});
