import { describe, expect, it } from "bun:test";
import { jwt } from "@elysiajs/jwt";
import { config } from "@materialhub/config";
import { Elysia } from "elysia";
import { app } from "../app.ts";

/**
 * Signs a real access token with the same plugin/secret jwtAuth verifies
 * against, via a throwaway app — @elysiajs/jwt only exposes `sign` through
 * a plugin-derived handler context, not as a standalone export. Mirrors the
 * helper in collab-creator.routes.test.ts (not exported there, so replicated
 * here).
 */
async function signTestToken(userId: string): Promise<string> {
  const signer = new Elysia()
    .use(jwt({ name: "accessJwt", secret: config.jwt.accessSecret, alg: "HS256" }))
    .get("/sign", ({ accessJwt }) =>
      accessJwt.sign({ sub: userId, email: "creator@test.com", role: "customer" }),
    );
  const res = await signer.handle(new Request("http://local/sign"));
  return res.text();
}

describe("creator application route auth wiring", () => {
  it("POST /me/creator/apply 401s without a token", async () => {
    const res = await app.handle(
      new Request("http://localhost/me/creator/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: "Aisha Glow",
          bio: "Skincare tips",
          primary_category: "Skincare",
          social_links: { instagram: "@aishaglow" },
          agreed_to_terms: true,
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("GET /me/creator/application 401s without a token", async () => {
    const res = await app.handle(new Request("http://localhost/me/creator/application"));
    expect(res.status).toBe(401);
  });

  it("PATCH /me/creator/application 401s without a token", async () => {
    const res = await app.handle(
      new Request("http://localhost/me/creator/application", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bio: "New bio" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("POST /me/creator/avatar/presign 401s without a token", async () => {
    const res = await app.handle(
      new Request("http://localhost/me/creator/avatar/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "me.jpg", content_type: "image/jpeg" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("POST /me/creator/avatar 401s without a token", async () => {
    const res = await app.handle(
      new Request("http://localhost/me/creator/avatar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "users/u1/avatar/abc/me.jpg" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("creator application route error mapping (authenticated)", () => {
  it("POST /me/creator/avatar with a key outside the caller's prefix 400s as invalid_avatar_key", async () => {
    // finalizeAvatar's prefix check throws before touching any repo or AWS
    // SDK call, so this drives the real route + service end-to-end with no
    // mocking. Pre-existing mapping (was already in the exact-match table);
    // this is the first end-to-end test proving it actually reaches a 400.
    const userId = "22222222-2222-2222-2222-222222222222";
    const token = await signTestToken(userId);
    const res = await app.handle(
      new Request("http://localhost/me/creator/avatar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: "users/someone-else/avatar/abc/me.jpg" }),
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_avatar_key");
  });

  it("POST /me/creator/avatar/presign with an unsupported content type 400s instead of 500ing", async () => {
    // MediaService.generatePresignedUrlForAsset throws a dynamic-message
    // Error for an unsupported content type before any AWS SDK call, so this
    // drives the real route + service end-to-end with no mocking. Regression
    // test for finding 1: previously this fell through mapApplyError's
    // exact-match table and surfaced as an unmapped 500.
    const userId = "33333333-3333-3333-3333-333333333333";
    const token = await signTestToken(userId);
    const res = await app.handle(
      new Request("http://localhost/me/creator/avatar/presign", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ filename: "me.gif", content_type: "image/gif" }),
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("Invalid content type");
  });
});
