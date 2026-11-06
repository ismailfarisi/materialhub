// Business accounts, net terms and VAT tax invoices (workstream 3).

export enum BusinessVerificationStatus {
  pending = "pending",
  verified = "verified",
  rejected = "rejected",
}

export enum BusinessMemberRole {
  admin = "admin",
  approver = "approver",
  buyer = "buyer",
}

export enum BusinessMemberStatus {
  invited = "invited",
  active = "active",
  removed = "removed",
}

export enum NetTermsStatus {
  applied = "applied",
  approved = "approved",
  rejected = "rejected",
  suspended = "suspended",
}

export enum NetTermsPeriod {
  net_30 = "net_30",
  net_60 = "net_60",
}

export enum OrderApprovalStatus {
  pending = "pending",
  approved = "approved",
  rejected = "rejected",
  used = "used",
  expired = "expired",
  cancelled = "cancelled",
}

export enum TaxInvoiceKind {
  /** Goods sold by a vendor: one per vendor sub-order. */
  vendor = "vendor",
  /** Shipping and payment surcharges charged by the platform. */
  platform = "platform",
}

export enum TaxInvoicePaymentStatus {
  paid = "paid",
  unpaid = "unpaid",
  void = "void",
}

export enum EInvoiceStatus {
  /** B2C invoice to a buyer without a TRN: no Peppol exchange expected. */
  not_applicable = "not_applicable",
  /** Structured record complete; waiting for an ASP. */
  ready = "ready",
  submitted = "submitted",
  accepted = "accepted",
  rejected = "rejected",
}
