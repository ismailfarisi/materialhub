import { describe, expect, it } from "bun:test";
import { collabCreatorRoutes } from "./collab-creator.routes.ts";
import { collabVendorRoutes } from "./collab-vendor.routes.ts";

const OPP = "a0000000-0000-0000-0000-000000000001";
const APP = "b0000000-0000-0000-0000-000000000002";
const json = (body: unknown) => ({
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("collab vendor auth wiring", () => {
  it("401s an unauthenticated GET /vendor/reels/collabs", async () => {
    const res = await collabVendorRoutes.handle(
      new Request("http://local/vendor/reels/collabs", { method: "GET" }),
    );
    expect(res.status).toBe(401);
  });

  it("401s an unauthenticated POST /vendor/reels/collabs", async () => {
    const res = await collabVendorRoutes.handle(
      new Request("http://local/vendor/reels/collabs", {
        method: "POST",
        ...json({
          type: "product_seeding",
          visibility: "board",
          title: "Seed our serum",
          description: "Post a reel",
          seededProductId: OPP,
          seededQty: 1,
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("401s an unauthenticated accept — the route that commits a slot", async () => {
    const res = await collabVendorRoutes.handle(
      new Request(`http://local/vendor/reels/collabs/${OPP}/applications/${APP}/accept`, {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("401s an unauthenticated invite", async () => {
    const res = await collabVendorRoutes.handle(
      new Request(`http://local/vendor/reels/collabs/${OPP}/invite`, {
        method: "POST",
        ...json({ creatorIds: [APP] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("401s an unauthenticated approve", async () => {
    const res = await collabVendorRoutes.handle(
      new Request(`http://local/vendor/reels/collabs/${OPP}/applications/${APP}/approve`, {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("collab creator auth wiring", () => {
  it("401s an unauthenticated GET /me/creator/collabs", async () => {
    const res = await collabCreatorRoutes.handle(
      new Request("http://local/me/creator/collabs", { method: "GET" }),
    );
    expect(res.status).toBe(401);
  });

  it("401s an unauthenticated apply", async () => {
    const res = await collabCreatorRoutes.handle(
      new Request(`http://local/me/creator/collabs/${OPP}/apply`, {
        method: "POST",
        ...json({ pitch: "pick me" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("401s an unauthenticated deliver", async () => {
    const res = await collabCreatorRoutes.handle(
      new Request(`http://local/me/creator/collabs/applications/${APP}/deliver`, {
        method: "POST",
        ...json({ reelId: OPP }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
