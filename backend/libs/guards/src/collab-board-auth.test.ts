import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { isPublicRoute } from "./jwt-auth.ts";
import { jwtAuth } from "./jwt-auth.ts";

/**
 * The collab board (spec §7) is optional-auth, not public. Getting this wrong is
 * silent: registering it as public short-circuits with `user = null`, so every
 * row would report the viewer as ineligible rather than 401-ing visibly.
 */
describe("GET /reels/collab-board route classification", () => {
  const app = () =>
    new Elysia()
      .use(jwtAuth)
      .get("/reels/collab-board", ({ user }) => ({ user: user ?? null }))
      .get("/vendor/reels/collabs", ({ user }) => ({ user: user ?? null }));

  test("is not registered as a public route", () => {
    expect(isPublicRoute("/reels/collab-board", "GET")).toBe(false);
  });

  test("serves an anonymous request instead of 401-ing", async () => {
    const res = await app().handle(new Request("http://localhost/reels/collab-board"));
    expect(res.status).toBe(200);
    expect((await res.json()).user).toBeNull();
  });

  test("a sibling vendor collab route still requires auth", async () => {
    // Guards against an over-broad prefix rule accidentally opening the whole
    // collab surface.
    const res = await app().handle(new Request("http://localhost/vendor/reels/collabs"));
    expect(res.status).toBe(401);
  });
});
