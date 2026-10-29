export enum ReelLicenseRightsScope {
  in_platform = "in_platform",
  off_platform = "off_platform",
  both = "both",
}

export enum ReelLicenseFundingSource {
  stripe = "stripe",
  payout_balance = "payout_balance",
}

export enum ReelLicenseOfferStatus {
  pending_creator = "pending_creator",
  countered = "countered", // reserved for 2b; unused in 2a
  completed = "completed",
  declined = "declined",
  expired = "expired",
  cancelled = "cancelled",
}

export enum ReelLicenseHoldStatus {
  held = "held",
  captured = "captured",
  released = "released",
}

export enum ReelLicenseEventType {
  offered = "offered",
  countered = "countered",
  re_offered = "re_offered",
  accepted = "accepted",
  declined = "declined",
  expired = "expired",
  cancelled = "cancelled",
  captured = "captured",
  released = "released",
}

export enum ReelFeaturePlacement {
  product = "product",
  storefront = "storefront",
}

export enum ReelBriefStatus {
  open = "open",
  awarded = "awarded",
  fulfilled = "fulfilled",
  cancelled = "cancelled",
  expired = "expired",
}

export enum ReelBriefBidStatus {
  pending = "pending",
  accepted = "accepted",
  delivered = "delivered",
  revision_requested = "revision_requested",
  completed = "completed",
  rejected = "rejected",
  withdrawn = "withdrawn",
  declined = "declined",
}

export enum ReelBriefEventType {
  brief_created = "brief_created",
  bid_placed = "bid_placed",
  bid_withdrawn = "bid_withdrawn",
  bid_accepted = "bid_accepted",
  bid_declined = "bid_declined",
  delivered = "delivered",
  revision_requested = "revision_requested",
  approved = "approved",
  rejected = "rejected",
  brief_cancelled = "brief_cancelled",
  brief_expired = "brief_expired",
  delivery_expired = "delivery_expired",
}
