export enum UserRole {
  super_admin = "super_admin",
  admin = "admin",
  customer = "customer",
  guest = "guest",
}

export enum UserStatus {
  active = "active",
  inactive = "inactive",
  suspended = "suspended",
  pending_verification = "pending_verification",
}

export enum AddressType {
  shipping = "shipping",
  billing = "billing",
  both = "both",
}

export enum TokenType {
  email_verify = "email_verify",
  password_reset = "password_reset",
  two_fa_setup = "two_fa_setup",
  magic_link = "magic_link",
}

export enum NotificationType {
  order_update = "order_update",
  payment = "payment",
  promotion = "promotion",
  system = "system",
  vendor = "vendor",
  // Granular event types (S5-05)
  order_confirmed = "order_confirmed",
  order_shipped = "order_shipped",
  order_delivered = "order_delivered",
  payment_received = "payment_received",
  payout_sent = "payout_sent",
  new_review = "new_review",
  low_stock = "low_stock",
  vendor_approved = "vendor_approved",
  return_requested = "return_requested",
  dispute_opened = "dispute_opened",
  dispute_resolved = "dispute_resolved",
  // Per-vendor-member new-order alert routed through the preference-aware
  // dispatch pipeline (the rich SES email from OrderEmailService stays
  // separate and unconditional).
  vendor_new_order = "vendor_new_order",
  // Request for quotation (RFQ)
  quote_request_received = "quote_request_received",
  quote_response_received = "quote_response_received",
  quote_message_received = "quote_message_received",
  quote_accepted = "quote_accepted",
}

export enum NotificationChannel {
  email = "email",
  push = "push",
  sms = "sms",
  in_app = "in_app",
  whatsapp = "whatsapp",
}
