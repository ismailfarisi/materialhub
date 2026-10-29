import type { SocialPlatform } from "@materialhub/database";

/** What we know about a creator, gathered by `CollabService.resolveCreatorProfile`. */
export interface CreatorProfile {
  /** Combined audience reach. See `resolveCreatorReach` for the §1-6 seam. */
  reach: number;
  /** Niche categories the creator works in. */
  categories: string[];
  /** Platforms the creator has connected. Empty until spec §1-6 ships. */
  platforms: SocialPlatform[];
}

/** The eligibility bar an opportunity sets. Null or empty means "no requirement". */
export interface EligibilityRequirements {
  min_follower_count: number | null;
  required_platforms: SocialPlatform[] | null;
  required_categories: string[] | null;
}

export type EligibilityReason =
  | "below_min_followers"
  | "category_mismatch"
  | "platform_not_connected";

export interface EligibilityResult {
  eligible: boolean;
  /** Every unmet requirement, in a stable order. */
  reasons: EligibilityReason[];
}

/**
 * Pure eligibility check.
 *
 * Reasons are returned rather than just a boolean because the board shows every
 * open opportunity to every creator and explains why Apply is disabled. Hiding
 * work a creator narrowly misses is worse than telling them what they need.
 *
 * Evaluated at apply time, not at list time — a per-viewer filtered board query
 * would be expensive, and the honest failure mode here is a disabled button, not
 * a missing row.
 */
export function evaluateEligibility(
  creator: CreatorProfile,
  reqs: EligibilityRequirements,
): EligibilityResult {
  const reasons: EligibilityReason[] = [];

  if (reqs.min_follower_count != null && creator.reach < reqs.min_follower_count) {
    reasons.push("below_min_followers");
  }

  if (reqs.required_categories?.length) {
    const have = new Set(creator.categories.map((c) => c.toLowerCase()));
    const matches = reqs.required_categories.some((c) => have.has(c.toLowerCase()));
    if (!matches) reasons.push("category_mismatch");
  }

  if (reqs.required_platforms?.length) {
    const have = new Set(creator.platforms);
    const matches = reqs.required_platforms.some((p) => have.has(p));
    if (!matches) reasons.push("platform_not_connected");
  }

  return { eligible: reasons.length === 0, reasons };
}
