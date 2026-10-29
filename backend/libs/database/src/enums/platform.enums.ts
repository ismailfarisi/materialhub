export enum CouponType {
  percentage = "percentage",
  fixed_amount = "fixed_amount",
  free_shipping = "free_shipping",
  buy_x_get_y = "buy_x_get_y",
}

export enum CouponApplicableTo {
  all = "all",
  specific_products = "specific_products",
  specific_categories = "specific_categories",
  specific_vendors = "specific_vendors",
  specific_collection = "specific_collection",
}

export enum TicketStatus {
  open = "open",
  in_progress = "in_progress",
  waiting_customer = "waiting_customer",
  resolved = "resolved",
  closed = "closed",
}

export enum TicketPriority {
  low = "low",
  medium = "medium",
  high = "high",
  urgent = "urgent",
}

export enum PageStatus {
  draft = "draft",
  published = "published",
  archived = "archived",
}
