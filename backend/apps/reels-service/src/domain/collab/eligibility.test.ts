import { describe, expect, it } from "bun:test";
import { SocialPlatform } from "@materialhub/database";
import { type CreatorProfile, evaluateEligibility } from "./eligibility.ts";

const creator = (over: Partial<CreatorProfile> = {}): CreatorProfile => ({
  reach: 25_000,
  categories: ["Beauty"],
  platforms: [SocialPlatform.instagram],
  ...over,
});

const reqs = (over = {}) => ({
  min_follower_count: null,
  required_platforms: null,
  required_categories: null,
  ...over,
});

describe("evaluateEligibility", () => {
  it("passes a creator meeting every requirement", () => {
    const r = evaluateEligibility(
      creator(),
      reqs({
        min_follower_count: 10_000,
        required_categories: ["Beauty"],
        required_platforms: [SocialPlatform.instagram],
      }),
    );
    expect(r).toEqual({ eligible: true, reasons: [] });
  });

  it("passes when the opportunity sets no requirements at all", () => {
    expect(evaluateEligibility(creator({ reach: 0, categories: [] }), reqs()).eligible).toBe(true);
  });

  it("names each unmet requirement, in a stable order", () => {
    const r = evaluateEligibility(
      creator({ reach: 500 }),
      reqs({ min_follower_count: 10_000, required_categories: ["Fragrance"] }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toEqual(["below_min_followers", "category_mismatch"]);
  });

  it("treats reach exactly at the floor as eligible", () => {
    const r = evaluateEligibility(creator({ reach: 10_000 }), reqs({ min_follower_count: 10_000 }));
    expect(r.eligible).toBe(true);
  });

  it("treats empty required_platforms and required_categories as `any`", () => {
    const r = evaluateEligibility(
      creator({ categories: [], platforms: [] }),
      reqs({ required_platforms: [], required_categories: [] }),
    );
    expect(r.eligible).toBe(true);
  });

  it("matches categories case-insensitively", () => {
    const r = evaluateEligibility(
      creator({ categories: ["beauty"] }),
      reqs({ required_categories: ["Beauty"] }),
    );
    expect(r.eligible).toBe(true);
  });

  it("needs only one of several required categories to match", () => {
    const r = evaluateEligibility(
      creator({ categories: ["Beauty"] }),
      reqs({ required_categories: ["Fragrance", "Beauty", "Tech"] }),
    );
    expect(r.eligible).toBe(true);
  });

  it("flags a creator with no connected platform when one is required", () => {
    // This is the state every creator is in until spec §1-6 ships, which is why
    // the vendor UI should not offer the platform filter before then.
    const r = evaluateEligibility(
      creator({ platforms: [] }),
      reqs({ required_platforms: [SocialPlatform.tiktok] }),
    );
    expect(r.reasons).toEqual(["platform_not_connected"]);
  });
});
