import { createHash } from "node:crypto";
import type { ChannelListing } from "@materialhub/database";
import type { FeedItem } from "./feed-item.ts";

/**
 * Stable SHA-256 hash of a feed item's serialized projection.
 * Same input -> same hash, regardless of object-key order. Used to detect
 * whether the item has changed since the last sync.
 */
export function computeContentHash(item: FeedItem): string {
  const canonical = JSON.stringify(item, Object.keys(item).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

export interface DiffResult {
  /** Items whose hash changed (or that have no prior row). */
  upserts: Array<{ item: FeedItem; hash: string; prevHash: string | null }>;
  /** Existing rows whose hash matches the new item — no action needed. */
  unchanged: ChannelListing[];
  /** Rows that no longer match an eligible item — should be soft-deleted. */
  removed: ChannelListing[];
}

/**
 * Compare an eligible feed-item set against the existing `channel_listings`
 * rows for one channel. Used by both the full-feed cron (post-build) and the
 * delta-scan cron (to enqueue only changed items).
 */
export function diffEligibleVsExisting(
  eligible: FeedItem[],
  existing: ChannelListing[],
): DiffResult {
  const existingByOfferId = new Map(existing.map((row) => [row.offer_id, row]));
  const seenOfferIds = new Set<string>();

  const upserts: DiffResult["upserts"] = [];
  const unchanged: ChannelListing[] = [];

  for (const item of eligible) {
    seenOfferIds.add(item.offer_id);
    const prev = existingByOfferId.get(item.offer_id);
    const hash = computeContentHash(item);
    if (!prev) {
      upserts.push({ item, hash, prevHash: null });
    } else if (prev.content_hash !== hash) {
      upserts.push({ item, hash, prevHash: prev.content_hash ?? null });
    } else {
      unchanged.push(prev);
    }
  }

  const removed = existing.filter((row) => !seenOfferIds.has(row.offer_id));
  return { upserts, unchanged, removed };
}
