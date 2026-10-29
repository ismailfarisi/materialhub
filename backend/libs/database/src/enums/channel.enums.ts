export enum SalesChannelCode {
  google_merchant = "google_merchant",
  meta_catalog = "meta_catalog",
  tiktok = "tiktok",
}

export enum ChannelSyncStatus {
  pending = "pending",
  synced = "synced",
  excluded = "excluded",
  error = "error",
}

export enum ChannelReviewStatus {
  pending = "pending",
  approved = "approved",
  disapproved = "disapproved",
}

export enum ChannelDeliveryKind {
  delta = "delta",
  conversion = "conversion",
}
