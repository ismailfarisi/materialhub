export enum ReelStatus {
  draft = "draft",
  pending_review = "pending_review",
  approved = "approved",
  rejected = "rejected",
  removed = "removed",
}

export enum ReelModerationAction {
  approved = "approved",
  rejected = "rejected",
  removed = "removed",
  restored = "restored",
  flagged = "flagged",
}

export enum ReelTaggingScope {
  any_product = "any_product",
  specific_brand = "specific_brand",
  specific_vendor = "specific_vendor",
  specific_products = "specific_products",
}

export enum ReelCommissionStatus {
  pending = "pending",
  earned = "earned",
  voided = "voided",
  paid_out = "paid_out",
}

export enum CreatorTier {
  regular = "regular",
  creator = "creator",
  influencer = "influencer", // reserved, unused at launch
}

export enum ReelAuthorKind {
  creator = "creator",
  customer = "customer",
  house = "house",
}

export enum CreatorApplicationStatus {
  pending = "pending",
  needs_info = "needs_info",
  approved = "approved",
  rejected = "rejected",
}
