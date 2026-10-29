import { describe, expect, it } from "bun:test";
import { creatorDirectoryRoutes } from "./creator-directory.routes.ts";

describe("creator directory auth wiring", () => {
  it("401s an unauthenticated GET /vendor/reels/creators", async () => {
    const res = await creatorDirectoryRoutes.handle(
      new Request("http://local/vendor/reels/creators", { method: "GET" }),
    );
    expect(res.status).toBe(401);
  });

  it("401s an unauthenticated search request too", async () => {
    const res = await creatorDirectoryRoutes.handle(
      new Request("http://local/vendor/reels/creators?q=glow&category=Makeup", { method: "GET" }),
    );
    expect(res.status).toBe(401);
  });
});
