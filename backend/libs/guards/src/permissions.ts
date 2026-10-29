export const PERMISSIONS = [
  "products.read",
  "products.write",
  "products.publish",
  "orders.read",
  "orders.fulfill",
  "orders.refund",
  "inventory.write",
  "vendor.profile.write",
  "payouts.read",
  "bank.read",
  "bank.write",
  "analytics.read",
  "team.read",
  "team.write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET = new Set<string>(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}
