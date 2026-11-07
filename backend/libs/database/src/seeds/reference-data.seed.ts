import type { DataSource } from "typeorm";
import { VendorMemberRole } from "../enums/vendor.enums.ts";

/**
 * Default vendor role → permission matrix, read by `permissionMatrix` in
 * libs/guards and edited at runtime via `PUT /admin/role-permissions/:role`.
 *
 * This is the matrix the VendorMembershipFoundation migration seeded before the
 * schema was squashed into InitialSchema (which creates the table but inserts
 * nothing). Permission names must stay in `PERMISSIONS`
 * (libs/guards/src/permissions.ts); owner must hold every one of them, which the
 * admin route enforces too (OWNER_PERMISSIONS_LOCKED).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<VendorMemberRole, readonly string[]> = {
  [VendorMemberRole.owner]: [
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
  ],
  // Everything except changing bank details and managing the team.
  [VendorMemberRole.manager]: [
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
    "analytics.read",
    "team.read",
  ],
  // Warehouse / fulfilment floor: pick, pack, ship and adjust stock.
  [VendorMemberRole.staff]: [
    "products.read",
    "orders.read",
    "orders.fulfill",
    "inventory.write",
    "team.read",
  ],
  // Read-only.
  [VendorMemberRole.viewer]: [
    "products.read",
    "orders.read",
    "payouts.read",
    "analytics.read",
    "team.read",
  ],
};

/**
 * Seed the permission matrix without overriding admin edits:
 * - owner always ends up with every default permission (owner is locked to the
 *   full set, so re-adding a missing one only repairs drift);
 * - every other role is seeded only while it has no rows at all, so a role an
 *   admin narrowed is left as they set it.
 * Re-runnable: inserts use ON CONFLICT DO NOTHING on (role, permission).
 */
export async function seedRolePermissions(ds: DataSource): Promise<void> {
  const counts = (await ds.query(
    "SELECT role::text AS role, COUNT(*)::int AS n FROM role_permissions GROUP BY role",
  )) as Array<{ role: string; n: number }>;
  const existing = new Map(counts.map((r) => [r.role, r.n]));

  let inserted = 0;
  for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    if (role !== VendorMemberRole.owner && (existing.get(role) ?? 0) > 0) continue;
    const rows = (await ds.query(
      `INSERT INTO role_permissions (role, permission)
       SELECT $1::role_permissions_role_enum, p FROM unnest($2::varchar[]) AS p
       ON CONFLICT (role, permission) DO NOTHING
       RETURNING id`,
      [role, permissions],
    )) as unknown[];
    inserted += rows.length;
  }
  console.log(
    inserted > 0
      ? `  ✓ Seeded ${inserted} role permission(s)`
      : "  – Role permissions already seeded, skipping",
  );
}

interface ThresholdDefault {
  provider: "tabby" | "tamara" | "cod";
  min_amount_fils: number;
  max_amount_fils: number;
  plans: Array<{ installments: number; interval_days: number }>;
  surcharge_fils: number | null;
}

/**
 * Checkout payment-method rules (`payment_method_thresholds`). Checkout rejects
 * COD outright without an active `cod` row, and the quote hides Tabby/Tamara
 * without theirs. Values are the ones the pre-squash migrations inserted
 * (CheckoutQuoteApiP1, AddCodToPaymentMethodThresholds): COD up to AED 5,000
 * with an AED 10 fee.
 */
export const DEFAULT_PAYMENT_METHOD_THRESHOLDS: readonly ThresholdDefault[] = [
  {
    provider: "tabby",
    min_amount_fils: 10000,
    max_amount_fils: 500000,
    plans: [
      { installments: 4, interval_days: 30 },
      { installments: 3, interval_days: 30 },
    ],
    surcharge_fils: null,
  },
  {
    provider: "tamara",
    min_amount_fils: 5000,
    max_amount_fils: 300000,
    plans: [{ installments: 3, interval_days: 30 }],
    surcharge_fils: null,
  },
  {
    provider: "cod",
    min_amount_fils: 0,
    max_amount_fils: 500000,
    plans: [],
    surcharge_fils: 1000,
  },
];

/** Insert each missing provider; rows that exist (possibly admin-edited) are kept. */
export async function seedPaymentMethodThresholds(ds: DataSource): Promise<void> {
  const created: string[] = [];
  for (const t of DEFAULT_PAYMENT_METHOD_THRESHOLDS) {
    const rows = (await ds.query(
      `INSERT INTO payment_method_thresholds
         (provider, min_amount_fils, max_amount_fils, plans, is_active, surcharge_fils)
       VALUES ($1, $2, $3, $4::jsonb, true, $5)
       ON CONFLICT (provider) DO NOTHING
       RETURNING provider`,
      [t.provider, t.min_amount_fils, t.max_amount_fils, JSON.stringify(t.plans), t.surcharge_fils],
    )) as unknown[];
    if (rows.length > 0) created.push(t.provider);
  }
  console.log(
    created.length > 0
      ? `  ✓ Created payment method thresholds (${created.join(", ")})`
      : "  – Payment method thresholds already seeded, skipping",
  );
}
