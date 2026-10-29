export enum VendorStatus {
  pending = "pending",
  under_review = "under_review",
  approved = "approved",
  rejected = "rejected",
  suspended = "suspended",
  deactivated = "deactivated",
}

export enum VendorDocumentType {
  trade_license = "trade_license",
  vat_certificate = "vat_certificate",
  emirates_id = "emirates_id",
  passport = "passport",
  bank_statement = "bank_statement",
  other = "other",
}

export enum CommissionType {
  percentage = "percentage",
  fixed = "fixed",
  tiered = "tiered",
}

export enum CommissionStatus {
  pending = "pending",
  held = "held",
  approved = "approved",
  paid = "paid",
  disputed = "disputed",
  cancelled = "cancelled",
}

export enum PayoutStatus {
  pending = "pending",
  processing = "processing",
  paid = "paid",
  failed = "failed",
}

/**
 * How a payout's money actually moves. Chosen by the admin at pay time, not
 * at draft time — a draft is rail-agnostic, which is why the column on
 * vendor_payouts is nullable while the payout is still `pending`.
 *
 * `stripe_connect` is the original (and currently dormant) path: a
 * platform-balance transfer to the vendor's connected account.
 * `manual_bank_transfer` moves no money in-system; an operator sends it from
 * their own banking portal and records the reference.
 */
export enum PayoutRail {
  manual_bank_transfer = "manual_bank_transfer",
  stripe_connect = "stripe_connect",
}

export enum VendorMemberRole {
  owner = "owner",
  manager = "manager",
  staff = "staff",
  viewer = "viewer",
}

export enum VendorMemberStatus {
  pending = "pending",
  active = "active",
  revoked = "revoked",
}
