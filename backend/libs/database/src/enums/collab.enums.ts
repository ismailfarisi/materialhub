export enum CollabOpportunityType {
  product_seeding = "product_seeding",
  paid_campaign = "paid_campaign",
  event_appearance = "event_appearance",
}

export enum CollabVisibility {
  board = "board",
  direct = "direct",
}

export enum CollabOpportunityStatus {
  draft = "draft",
  open = "open",
  filled = "filled",
  completed = "completed",
  cancelled = "cancelled",
  expired = "expired",
}

/**
 * Mirrors ReelBriefBidStatus verb-for-verb so the delivery/revision UI and the
 * expiry jobs can be shared rather than reimplemented. `in_progress` is the one
 * addition: seeding needs a state between "accepted" and "delivered" while the
 * product is in transit.
 */
export enum CollabApplicationStatus {
  invited = "invited",
  applied = "applied",
  accepted = "accepted",
  declined = "declined",
  withdrawn = "withdrawn",
  in_progress = "in_progress",
  delivered = "delivered",
  revision_requested = "revision_requested",
  completed = "completed",
  rejected = "rejected",
  expired = "expired",
}

export enum CollabEventType {
  created = "created",
  published = "published",
  invited = "invited",
  applied = "applied",
  withdrawn = "withdrawn",
  accepted = "accepted",
  declined = "declined",
  shipped = "shipped",
  received = "received",
  delivered = "delivered",
  revision_requested = "revision_requested",
  approved = "approved",
  rejected = "rejected",
  settled = "settled",
  cancelled = "cancelled",
  expired = "expired",
}

/**
 * Who caused a collab event. `system` covers the scheduled expiry/sweep jobs.
 *
 * App-level enum only — `collab_events.actor` is a `varchar(10)` column, matching
 * `reel_brief_events.actor`. No Postgres enum type is created for it.
 */
export enum CollabActor {
  vendor = "vendor",
  creator = "creator",
  system = "system",
}

/**
 * Defined here so `collab_opportunities.required_platforms` can exist now.
 * Spec §1-6 (creator social showcase) is the feature that populates data behind
 * it; until that ships, the column is accepted but no creator has connected
 * accounts to match against.
 */
export enum SocialPlatform {
  instagram = "instagram",
  tiktok = "tiktok",
  youtube = "youtube",
  internal_reel = "internal_reel",
}
