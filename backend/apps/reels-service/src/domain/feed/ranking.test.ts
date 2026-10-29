import { describe, expect, it } from "bun:test";
import { RankingService } from "./ranking.service.ts";

describe("RankingService.computeScore", () => {
  const svc = new RankingService();

  it("returns 0 for a brand-new reel with no engagement", () => {
    const score = svc.computeScore({
      likeCount: 0,
      saveCount: 0,
      shareCount: 0,
      tapCount: 0,
      attributedPurchaseCount: 0,
      publishedAt: new Date(),
      now: new Date(),
    });
    expect(score).toBe(0);
  });

  it("scores recent reel with engagement higher than older one with same engagement", () => {
    const sample = {
      likeCount: 100,
      saveCount: 10,
      shareCount: 5,
      tapCount: 30,
      attributedPurchaseCount: 0,
    };
    const now = new Date("2026-04-15T12:00:00Z");
    const recent = svc.computeScore({
      ...sample,
      publishedAt: new Date("2026-04-15T11:00:00Z"), // 1h ago
      now,
    });
    const older = svc.computeScore({
      ...sample,
      publishedAt: new Date("2026-04-13T12:00:00Z"), // 48h ago
      now,
    });
    expect(recent).toBeGreaterThan(older);
  });

  it("weights purchases more than taps more than likes", () => {
    const now = new Date();
    const publishedAt = new Date(now.getTime() - 3600 * 1000);
    const onlyLikes = svc.computeScore({
      likeCount: 100,
      saveCount: 0,
      shareCount: 0,
      tapCount: 0,
      attributedPurchaseCount: 0,
      publishedAt,
      now,
    });
    const onlyTaps = svc.computeScore({
      likeCount: 0,
      saveCount: 0,
      shareCount: 0,
      tapCount: 100,
      attributedPurchaseCount: 0,
      publishedAt,
      now,
    });
    const onlyPurchases = svc.computeScore({
      likeCount: 0,
      saveCount: 0,
      shareCount: 0,
      tapCount: 0,
      attributedPurchaseCount: 100,
      publishedAt,
      now,
    });
    expect(onlyTaps).toBeGreaterThan(onlyLikes);
    expect(onlyPurchases).toBeGreaterThan(onlyTaps);
  });
});
