export enum PaymentStatus {
  pending = "pending",
  authorized = "authorized",
  captured = "captured",
  failed = "failed",
  refunded = "refunded",
  partially_refunded = "partially_refunded",
  chargeback = "chargeback",
  cancelled = "cancelled",
}

export enum PaymentMethod {
  credit_card = "credit_card",
  debit_card = "debit_card",
  paypal = "paypal",
  stripe = "stripe",
  bank_transfer = "bank_transfer",
  cash_on_delivery = "cash_on_delivery",
  wallet = "wallet",
  crypto = "crypto",
  tabby = "tabby",
  tamara = "tamara",
}

export enum GiftCardStatus {
  active = "active",
  redeemed = "redeemed",
  expired = "expired",
  disabled = "disabled",
}

export enum WebhookStatus {
  pending = "pending",
  processed = "processed",
  failed = "failed",
  skipped = "skipped",
}
