import { describe, expect, it } from "bun:test";
import { jwt } from "@elysiajs/jwt";
import { config } from "@materialhub/config";
import { Elysia } from "elysia";
import { app } from "../app.ts";

async function signTestToken(userId: string): Promise<string> {
  const signer = new Elysia()
    .use(jwt({ name: "accessJwt", secret: config.jwt.accessSecret, alg: "HS256" }))
    .get("/sign", ({ accessJwt }) =>
      accessJwt.sign({ sub: userId, email: "creator@test.com", role: "customer" }),
    );
  const res = await signer.handle(new Request("http://local/sign"));
  return res.text();
}

describe("creator portfolio route auth wiring", () => {
  it("GET /me/creator/portfolio/videos 401s without a token", async () => {
    const res = await app.handle(new Request("http://localhost/me/creator/portfolio/videos"));
    expect(res.status).toBe(401);
  });

  it("POST /me/creator/portfolio/videos/presign 401s without a token", async () => {
    const res = await app.handle(
      new Request("http://localhost/me/creator/portfolio/videos/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "clip.mp4", content_type: "video/mp4" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("POST /me/creator/portfolio/videos 401s without a token", async () => {
    const res = await app.handle(
      new Request("http://localhost/me/creator/portfolio/videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "users/u1/portfolio/abc/clip.mp4", kind: "sample" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("DELETE /me/creator/portfolio/videos/:id 401s without a token", async () => {
    const res = await app.handle(
      new Request("http://localhost/me/creator/portfolio/videos/pv-1", { method: "DELETE" }),
    );
    expect(res.status).toBe(401);
  });
});

describe("creator portfolio route error mapping (authenticated)", () => {
  it("POST /me/creator/portfolio/videos with a key outside the caller's prefix 400s", async () => {
    // finalizeVideo's prefix check throws before touching any repo or AWS
    // SDK call, so this drives the real route + service end-to-end with no
    // mocking, same technique as the avatar routes' invalid-key test.
    const userId = "44444444-4444-4444-4444-444444444444";
    const token = await signTestToken(userId);
    const res = await app.handle(
      new Request("http://localhost/me/creator/portfolio/videos", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: "users/someone-else/portfolio/abc/clip.mp4", kind: "sample" }),
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_portfolio_key");
  });

  it("POST /me/creator/portfolio/videos/presign with an unsupported content type 400s", async () => {
    const userId = "55555555-5555-5555-5555-555555555555";
    const token = await signTestToken(userId);
    const res = await app.handle(
      new Request("http://localhost/me/creator/portfolio/videos/presign", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ filename: "clip.avi", content_type: "video/x-msvideo" }),
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("Invalid content type");
  });
});
