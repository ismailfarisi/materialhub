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
  // Booking-service events (Phase 5 Task 2; spec §7). vendor_booking_conflict
  // serves Phase 6's iCal-import conflict hook; vendor_booking_cancelled
  // serves Phase 4's auth-failure hook.
  booking_confirmed = "booking_confirmed",
  booking_reminder = "booking_reminder",
  booking_rescheduled = "booking_rescheduled",
  booking_cancelled = "booking_cancelled",
  booking_no_show = "booking_no_show",
  booking_completed = "booking_completed",
  booking_review_request = "booking_review_request",
  booking_payment_failed = "booking_payment_failed",
  vendor_new_booking = "vendor_new_booking",
  vendor_booking_cancelled = "vendor_booking_cancelled",
  vendor_booking_conflict = "vendor_booking_conflict",
  // Per-vendor-member new-order alert routed through the preference-aware
  // dispatch pipeline (the rich SES email from OrderEmailService stays
  // separate and unconditional).
  vendor_new_order = "vendor_new_order",
  // A vendor invited this creator to a collab. Until this existed, an invited
  // creator learned about it only by opening the dashboard.
  collab_invited = "collab_invited",
}

export enum NotificationChannel {
  email = "email",
  push = "push",
  sms = "sms",
  in_app = "in_app",
  whatsapp = "whatsapp",
}
