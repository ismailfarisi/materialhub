export interface NotificationTemplate {
  title: string;
  bodyTemplate: string;
  actionUrlTemplate?: string;
}

const TEMPLATES: Record<string, NotificationTemplate> = {
  order_confirmed: {
    title: "Order Confirmed",
    bodyTemplate: "Your order {order_number} has been confirmed",
    actionUrlTemplate: "/orders/{orderId}",
  },
  order_shipped: {
    title: "Order Shipped",
    bodyTemplate: "Your order has shipped. Track: {tracking_url}",
    actionUrlTemplate: "/orders/{orderId}/tracking",
  },
  order_delivered: {
    title: "Order Delivered",
    bodyTemplate: "Your order has been delivered",
    actionUrlTemplate: "/orders/{orderId}",
  },
  payment_received: {
    title: "Payment Received",
    bodyTemplate: "Payment of {amount} AED received",
    actionUrlTemplate: "/orders/{orderId}",
  },
  payout_sent: {
    title: "Payout Sent",
    bodyTemplate: "Payout of {amount} AED sent to your account",
    actionUrlTemplate: "/vendor/payouts",
  },
  vendor_new_order: {
    title: "New Order Received",
    bodyTemplate: "New order {order_number} ({amount})",
    actionUrlTemplate: "/vendor/orders/{vendorOrderId}",
  },
  new_review: {
    title: "New Review",
    bodyTemplate: "New {rating} star review on {product_name}",
    actionUrlTemplate: "/vendor/products/{productId}/reviews",
  },
  low_stock: {
    title: "Low Stock Alert",
    bodyTemplate: "{product_name} has only {quantity} left",
    actionUrlTemplate: "/vendor/products/{productId}/inventory",
  },
  vendor_approved: {
    title: "Vendor Approved",
    bodyTemplate: "Your vendor account has been approved",
    actionUrlTemplate: "/vendor/dashboard",
  },
  return_requested: {
    title: "Return Requested",
    bodyTemplate: "Return requested for order {order_number}",
    actionUrlTemplate: "/vendor/returns/{returnId}",
  },
  dispute_opened: {
    title: "Dispute Opened",
    bodyTemplate: "Dispute opened for order {order_number}",
    actionUrlTemplate: "/disputes/{disputeId}",
  },
  dispute_resolved: {
    title: "Dispute Resolved",
    bodyTemplate: "Dispute resolved: {resolution}",
    actionUrlTemplate: "/disputes/{disputeId}",
  },
};

export function getTemplate(eventType: string): NotificationTemplate | null {
  return TEMPLATES[eventType] || null;
}

export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => variables[key] || `{${key}}`);
}

export function renderHtmlEmail(title: string, body: string, actionUrl?: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #333;">${title}</h2>
  <p style="color: #666; font-size: 16px;">${body}</p>
  ${actionUrl ? `<a href="${actionUrl}" style="display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">View Details</a>` : ""}
  <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
  <p style="color: #999; font-size: 12px;">MaterialHub</p>
</body></html>`;
}
