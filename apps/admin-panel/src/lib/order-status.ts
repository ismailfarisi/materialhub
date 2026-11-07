// Values are the order_status enum (OrderStatus); anything else is a 400.
export const ORDER_STATUS_OPTIONS = [
  { label: "Awaiting payment", value: "pending_payment" },
  { label: "Payment failed", value: "payment_failed" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Processing", value: "processing" },
  { label: "Ready to ship", value: "ready_to_ship" },
  { label: "Shipped", value: "shipped" },
  { label: "Partially shipped", value: "partially_shipped" },
  { label: "Out for delivery", value: "out_for_delivery" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Refund requested", value: "refund_requested" },
  { label: "Refunded", value: "refunded" },
  { label: "Disputed", value: "disputed" },
];
