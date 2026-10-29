export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  "products.read": "View product catalog",
  "products.write": "Create and edit products",
  "products.publish": "Publish/unpublish products",
  "orders.read": "View orders",
  "orders.fulfill": "Mark orders as fulfilled, generate shipments",
  "orders.refund": "Issue refunds and process returns",
  "inventory.write": "Adjust stock levels",
  "vendor.profile.write": "Edit vendor profile, settings, holidays",
  "payouts.read": "View payout history",
  "bank.read": "View bank account details",
  "bank.write": "Add/remove/edit bank accounts and Stripe Connect",
  "analytics.read": "View analytics dashboards",
  "team.read": "View team members",
  "team.write": "Invite, remove, change roles, transfer ownership",
};

export const PERMISSION_GROUPS: Record<string, string[]> = {
  Products: ["products.read", "products.write", "products.publish"],
  Orders: ["orders.read", "orders.fulfill", "orders.refund"],
  Inventory: ["inventory.write"],
  Profile: ["vendor.profile.write"],
  Payouts: ["payouts.read"],
  Bank: ["bank.read", "bank.write"],
  Analytics: ["analytics.read"],
  Team: ["team.read", "team.write"],
};

export const ROLES = ["owner", "manager", "staff", "viewer"] as const;
export type Role = (typeof ROLES)[number];
