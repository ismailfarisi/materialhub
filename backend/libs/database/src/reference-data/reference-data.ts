/**
 * Reference data the platform needs to work: rows that live features read but
 * nobody creates through the UI before first use (the vendor permission
 * matrix, checkout payment-method rules, sales channels, storefront section
 * types and the vendor storefront template, the platform default shipping rate
 * and contribution bands, and the site settings that feature code looks up).
 *
 * The pre-squash migrations inserted all of this; the squashed InitialSchema
 * creates the tables empty. The RestoreReferenceData migration and the dev
 * seed both call `applyReferenceData`, so production and local data come from
 * the same lists.
 *
 * Every insert is insert-if-missing, so this is safe to re-run and never
 * overwrites a row an admin has edited. A row that exists in any state,
 * soft-deleted included, counts as present: an admin who deleted a channel or
 * a shipping band keeps it deleted.
 *
 * Lives outside `migrations/` on purpose: TypeORM loads every module in that
 * folder as a migration.
 */

/** Anything with `.query()`: a QueryRunner, DataSource or EntityManager. */
export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<any>;
}

// ── Vendor role → permission matrix ─────────────────────────────────────────

/**
 * Default vendor role → permission matrix, read by `permissionMatrix` in
 * libs/guards and edited at runtime via `PUT /admin/role-permissions/:role`.
 * Permission names must stay in `PERMISSIONS` (libs/guards/src/permissions.ts);
 * owner holds every one of them, which the admin route enforces too
 * (OWNER_PERMISSIONS_LOCKED). Source: VendorMembershipFoundation1746500000000.
 */
export const DEFAULT_ROLE_PERMISSIONS = {
  owner: [
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
  manager: [
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
  staff: ["products.read", "orders.read", "orders.fulfill", "inventory.write", "team.read"],
  // Read-only.
  viewer: ["products.read", "orders.read", "payouts.read", "analytics.read", "team.read"],
} as const satisfies Record<"owner" | "manager" | "staff" | "viewer", readonly string[]>;

/**
 * Owner is always topped up to the full set (owner is locked to it, so this
 * only repairs drift). Every other role is seeded only while it has no rows,
 * so a role an admin narrowed keeps the admin's set.
 */
export async function applyRolePermissions(q: Queryable): Promise<number> {
  const counts = (await q.query(
    "SELECT role::text AS role, COUNT(*)::int AS n FROM role_permissions GROUP BY role",
  )) as Array<{ role: string; n: number }>;
  const existing = new Map(counts.map((r) => [r.role, r.n]));

  let inserted = 0;
  for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    if (role !== "owner" && (existing.get(role) ?? 0) > 0) continue;
    const rows = (await q.query(
      `INSERT INTO "role_permissions" ("role", "permission")
       SELECT $1::"role_permissions_role_enum", p FROM unnest($2::varchar[]) AS p
       ON CONFLICT ("role", "permission") DO NOTHING
       RETURNING "id"`,
      [role, permissions],
    )) as unknown[];
    inserted += rows.length;
  }
  return inserted;
}

// ── Checkout payment-method rules ───────────────────────────────────────────

/**
 * `payment_method_thresholds`. Checkout rejects COD outright without an active
 * `cod` row, and the quote hides Tabby/Tamara without theirs. Source:
 * CheckoutQuoteApiP1744724400000 and AddCodToPaymentMethodThresholds1744724406000
 * (COD up to AED 5,000 with an AED 10 fee).
 */
export const DEFAULT_PAYMENT_METHOD_THRESHOLDS = [
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
] as const;

export async function applyPaymentMethodThresholds(q: Queryable): Promise<number> {
  let inserted = 0;
  for (const t of DEFAULT_PAYMENT_METHOD_THRESHOLDS) {
    const rows = (await q.query(
      `INSERT INTO "payment_method_thresholds"
         ("provider", "min_amount_fils", "max_amount_fils", "plans", "is_active", "surcharge_fils")
       VALUES ($1, $2, $3, $4::jsonb, true, $5)
       ON CONFLICT ("provider") DO NOTHING
       RETURNING "provider"`,
      [t.provider, t.min_amount_fils, t.max_amount_fils, JSON.stringify(t.plans), t.surcharge_fils],
    )) as unknown[];
    inserted += rows.length;
  }
  return inserted;
}

// ── Sales channels ──────────────────────────────────────────────────────────

/**
 * One row per `sales_channels_code_enum` value; the admin sales-channel routes
 * and feed/delta crons look channels up by code. Disabled until an admin adds
 * credentials. Source: SalesChannelsFoundation1779600000000.
 */
export const DEFAULT_SALES_CHANNELS = [
  { code: "google_merchant", display_name: "Google Merchant Center" },
  { code: "meta_catalog", display_name: "Meta Catalog" },
  { code: "tiktok", display_name: "TikTok" },
] as const;

export async function applySalesChannels(q: Queryable): Promise<number> {
  // The unique index on code is partial (WHERE deleted_at IS NULL), so guard
  // with NOT EXISTS; a soft-deleted channel stays deleted.
  const rows = (await q.query(
    `INSERT INTO "sales_channels" ("code", "display_name")
     SELECT c.code::"sales_channels_code_enum", c.display_name
       FROM jsonb_to_recordset($1::jsonb) AS c(code text, display_name text)
      WHERE NOT EXISTS (
        SELECT 1 FROM "sales_channels" s WHERE s."code"::text = c.code
      )
     RETURNING "id"`,
    [JSON.stringify(DEFAULT_SALES_CHANNELS)],
  )) as unknown[];
  return rows.length;
}

// ── Storefront section types and the vendor storefront template ─────────────

/**
 * The section types the storefront renders (apps/web layout-renderer
 * SECTION_REGISTRY). `scope: "both"` types are copied into a vendor's own
 * storefront from the template. Source: HomepageLayoutSystem1712200000000 and
 * AddVendorOwnedLayouts1746000020000 (which set the scopes).
 */
export const DEFAULT_SECTION_TYPES = [
  {
    name: "hero_carousel",
    label: { en: "Hero Carousel", ar: "كاروسيل رئيسي" },
    icon: "image",
    supports_bidding: false,
    scope: "both",
    default_settings: { autoplay: true, interval_ms: 5000 },
  },
  {
    name: "category_grid",
    label: { en: "Category Grid", ar: "شبكة الفئات" },
    icon: "grid-3x3",
    supports_bidding: false,
    scope: "both",
    default_settings: { columns: { mobile: 2, tablet: 3, desktop: 4 } },
  },
  {
    name: "product_carousel",
    label: { en: "Product Carousel", ar: "كاروسيل المنتجات" },
    icon: "shopping-bag",
    supports_bidding: true,
    scope: "both",
    default_settings: { show_price: true, show_rating: true },
  },
  {
    name: "vendor_showcase",
    label: { en: "Vendor Showcase", ar: "عرض البائعين" },
    icon: "store",
    supports_bidding: true,
    scope: "platform",
    default_settings: { layout: "horizontal_scroll" },
  },
  {
    name: "brand_spotlight",
    label: { en: "Brand Spotlight", ar: "أضواء على العلامات" },
    icon: "award",
    supports_bidding: false,
    scope: "platform",
    default_settings: {},
  },
  {
    name: "promotional_banner",
    label: { en: "Promotional Banner", ar: "بانر ترويجي" },
    icon: "megaphone",
    supports_bidding: false,
    scope: "both",
    default_settings: {},
  },
  {
    name: "newsletter_signup",
    label: { en: "Newsletter Signup", ar: "الاشتراك بالنشرة" },
    icon: "mail",
    supports_bidding: false,
    scope: "platform",
    default_settings: {},
  },
  {
    name: "testimonials",
    label: { en: "Testimonials", ar: "شهادات العملاء" },
    icon: "quote",
    supports_bidding: false,
    scope: "both",
    default_settings: {},
  },
] as const;

export async function applySectionTypes(q: Queryable): Promise<number> {
  const rows = (await q.query(
    `INSERT INTO "section_types"
       ("name", "label", "icon", "supports_bidding", "scope", "default_settings")
     SELECT t.name, t.label, t.icon, t.supports_bidding, t.scope, t.default_settings
       FROM jsonb_to_recordset($1::jsonb) AS t(
         name varchar, label jsonb, icon varchar, supports_bidding boolean,
         scope varchar, default_settings jsonb
       )
     ON CONFLICT ("name") DO NOTHING
     RETURNING "id"`,
    [JSON.stringify(DEFAULT_SECTION_TYPES)],
  )) as unknown[];
  return rows.length;
}

/**
 * The published admin template (`page_layouts.slug = 'vendor-default'`,
 * vendor_id NULL) that VendorLayoutInitService clones into each vendor's
 * storefront; without it vendor storefront init fails LAYOUT_TEMPLATE_NOT_READY.
 */
export const VENDOR_TEMPLATE_LAYOUT = {
  slug: "vendor-default",
  title: { en: "Vendor Storefront Template", ar: "قالب متجر البائع" },
  sections: [
    {
      type: "hero_carousel",
      source_mode: "manual",
      settings: { use_vendor_banner: true },
      blocks: [],
      data_source: null,
    },
    {
      type: "promotional_banner",
      source_mode: "manual",
      settings: {},
      blocks: [],
      data_source: null,
    },
    {
      type: "product_carousel",
      source_mode: "query",
      settings: { title: { en: "Featured Products" } },
      blocks: null,
      data_source: { type: "products", query: { limit: 12, sort: "newest" } },
    },
    {
      type: "testimonials",
      source_mode: "manual",
      settings: { title: { en: "What Customers Say" } },
      blocks: [],
      data_source: null,
    },
  ],
} as const;

/**
 * Creates the template only when no layout has the slug yet (page_layouts.slug
 * is globally unique) and a super_admin exists to own it (created_by is NOT
 * NULL). On an empty database the migration therefore skips it and the seed,
 * which runs after the admin user exists, creates it. Returns 1 if created.
 */
export async function applyVendorTemplateLayout(q: Queryable): Promise<number> {
  const layout = (await q.query(
    `INSERT INTO "page_layouts" ("slug", "title", "status", "created_by")
     SELECT $1::varchar, $2::jsonb, 'published', u."id"
       FROM "users" u
      WHERE u."role" = 'super_admin'
        AND u."deleted_at" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "page_layouts" WHERE "slug" = $1::varchar)
      ORDER BY u."created_at" ASC
      LIMIT 1
     RETURNING "id", "created_by"`,
    [VENDOR_TEMPLATE_LAYOUT.slug, JSON.stringify(VENDOR_TEMPLATE_LAYOUT.title)],
  )) as Array<{ id: string; created_by: string }>;
  const created = layout[0];
  if (!created) return 0;

  const version = (await q.query(
    `INSERT INTO "layout_versions" ("layout_id", "version_number", "published_at", "created_by")
     VALUES ($1, 1, now(), $2)
     RETURNING "id"`,
    [created.id, created.created_by],
  )) as Array<{ id: string }>;
  const versionId = version[0]?.id;
  await q.query(`UPDATE "page_layouts" SET "published_version_id" = $1 WHERE "id" = $2`, [
    versionId,
    created.id,
  ]);

  await q.query(
    `INSERT INTO "layout_sections"
       ("version_id", "section_type_id", "position", "source_mode", "settings", "blocks", "data_source")
     SELECT $1, st."id", s.position, s.source_mode::"layout_sections_source_mode_enum",
            s.settings, s.blocks, s.data_source
       FROM jsonb_to_recordset($2::jsonb) AS s(
         type varchar, position smallint, source_mode text,
         settings jsonb, blocks jsonb, data_source jsonb
       )
       JOIN "section_types" st ON st."name" = s.type`,
    [
      versionId,
      JSON.stringify(VENDOR_TEMPLATE_LAYOUT.sections.map((s, position) => ({ ...s, position }))),
    ],
  );
  return 1;
}

// ── Shipping: platform default rate and vendor contribution bands ───────────

/**
 * Platform default standard rate (vendor_id and zone_id NULL), the fallback
 * checkout, quote and delivery estimate use when a vendor has no rate of its
 * own. Source: RetireShippingFlatFeeSetting1780300001000 (AED 15, free above
 * AED 150, 2–4 days).
 */
export const DEFAULT_PLATFORM_SHIPPING_RATE = {
  name: "Standard (platform default)",
  method: "standard",
  base_cost: 1500,
  free_above: 15000,
  estimated_days_min: 2,
  estimated_days_max: 4,
} as const;

export async function applyPlatformShippingRate(q: Queryable): Promise<number> {
  const r = DEFAULT_PLATFORM_SHIPPING_RATE;
  const rows = (await q.query(
    `INSERT INTO "shipping_rates"
       ("vendor_id", "zone_id", "name", "method", "base_cost", "per_kg_cost", "free_above",
        "currency", "estimated_days_min", "estimated_days_max", "is_active", "sort_order")
     SELECT NULL, NULL, $1, $2::varchar, $3, 0, $4, 'AED', $5, $6, true, 0
      WHERE NOT EXISTS (
        SELECT 1 FROM "shipping_rates"
         WHERE "vendor_id" IS NULL AND "zone_id" IS NULL AND "method" = $2::varchar
      )
     RETURNING "id"`,
    [r.name, r.method, r.base_cost, r.free_above, r.estimated_days_min, r.estimated_days_max],
  )) as unknown[];
  return rows.length;
}

/**
 * Platform-wide (vendor_id NULL) bands for the vendor's share of shipping, in
 * fils: the highest band whose min_order_value the sub-order reaches applies.
 * Source: CreateShippingContributionTiers1781500000000.
 */
export const DEFAULT_SHIPPING_CONTRIBUTION_TIERS = [
  { min_order_value: 0, vendor_contribution: 300, sort_order: 0 },
  { min_order_value: 2100, vendor_contribution: 500, sort_order: 1 },
  { min_order_value: 5100, vendor_contribution: 800, sort_order: 2 },
  { min_order_value: 12100, vendor_contribution: 1000, sort_order: 3 },
] as const;

/**
 * The bands are one schedule, so they are inserted as a set: only while no
 * platform band exists at all. Adding single defaults next to an admin's own
 * schedule would change what vendors pay.
 */
export async function applyShippingContributionTiers(q: Queryable): Promise<number> {
  const rows = (await q.query(
    `INSERT INTO "shipping_contribution_tiers"
       ("vendor_id", "min_order_value", "vendor_contribution", "sort_order")
     SELECT NULL, t.min_order_value, t.vendor_contribution, t.sort_order
       FROM jsonb_to_recordset($1::jsonb) AS t(
         min_order_value integer, vendor_contribution integer, sort_order integer
       )
      WHERE NOT EXISTS (SELECT 1 FROM "shipping_contribution_tiers" WHERE "vendor_id" IS NULL)
     RETURNING "id"`,
    [JSON.stringify(DEFAULT_SHIPPING_CONTRIBUTION_TIERS)],
  )) as unknown[];
  return rows.length;
}

// ── Site settings read by feature code ──────────────────────────────────────

interface SettingDefault {
  key: string;
  value: string;
  value_type: string;
  setting_group: string;
  description: string;
}

/**
 * Settings that feature code looks up by key. Sources: AddIntegrationEventsFlag,
 * AddIntegrationInboundFlag, AddIntegrationRetention{Total,Pii}DaysFlag,
 * AddVendorAiUsageAndSettings, AddShippingContributionColumns,
 * AddOrderOpsNotificationEmailSetting, SlackSupportRelay, PayoutCorrectness.
 */
export const DEFAULT_SITE_SETTINGS: readonly SettingDefault[] = [
  {
    key: "vendor_integrations_outbound_enabled",
    value: "false",
    value_type: "boolean",
    setting_group: "integrations",
    description:
      'Master switch for outbound vendor integration events (vendor_order.created, vendor_order.status_changed, shipment.created, shipment.status_changed). Default off; flip to "true" once a vendor integration is configured and you are ready to dispatch.',
  },
  {
    key: "vendor_integrations_inbound_enabled",
    value: "false",
    value_type: "boolean",
    setting_group: "integrations",
    description:
      'Master switch for inbound vendor integration webhooks (order.accept, order.reject, shipment.create, shipment.update_status, inventory.adjust, product.update_price, product.update_attribute). Default off; flip to "true" once a vendor integration is configured and you are ready to accept inbound writes.',
  },
  {
    key: "data_retention_integration_total_days",
    value: "365",
    value_type: "integer",
    setting_group: "integrations",
    description:
      "How many days of vendor_integration_deliveries to keep. The retention cron deletes older rows on the 1st of each month at 03:00 UTC. CASCADE removes related pending_writes.",
  },
  {
    key: "data_retention_integration_pii_days",
    value: "90",
    value_type: "integer",
    setting_group: "integrations",
    description:
      "Age in days after which the daily PII scrub cron removes email/phone/shipping_address fields from request_body in vendor_integration_deliveries. Row metadata is preserved for audit; only sensitive fields are stripped.",
  },
  {
    key: "ai_image_enhance",
    value: JSON.stringify({
      enabled: false,
      model: "gemini-2.5-flash-image",
      prompt:
        "Improve this product photo for an ecommerce marketplace listing. Brighten exposure, balance white levels, sharpen product edges, and remove minor background distractions. Keep the product, packaging text, color, and shape exactly faithful — no creative changes. Output a clean photo at the same composition.",
      per_vendor_monthly_cap: 200,
      per_vendor_per_minute_cap: 5,
    }),
    value_type: "json",
    setting_group: "ai",
    description: "AI image enhance configuration",
  },
  {
    key: "shipping.base_carrier_cost_fils",
    value: "1300",
    value_type: "integer",
    setting_group: "shipping",
    // Original description named a third-party carrier; kept carrier-neutral.
    description:
      "Base carrier cost per shipment, in fils. Reference for vendor-absorbed shipping display.",
  },
  {
    key: "order_ops_notification_email",
    value: "",
    value_type: "string",
    setting_group: "general",
    description:
      "Internal inbox that receives a full-detail email on every new order. Leave blank to disable. Set from the admin Settings page.",
  },
  {
    key: "slack_support",
    value: '{"enabled":false}',
    value_type: "json",
    setting_group: "slack",
    description: "Slack support relay configuration",
  },
  {
    key: "payout_settlement_window_days",
    value: "7",
    value_type: "number",
    setting_group: "commission",
    description: "Days after delivery before a vendor commission becomes payable",
  },
];

export async function applySiteSettings(q: Queryable): Promise<number> {
  // site_settings has a full UNIQUE ("key") constraint (plus a partial index),
  // so a soft-deleted key also counts as present.
  const rows = (await q.query(
    `INSERT INTO "site_settings" ("key", "value", "value_type", "setting_group", "description")
     SELECT s.key, s.value, s.value_type, s.setting_group, s.description
       FROM jsonb_to_recordset($1::jsonb) AS s(
         key varchar, value text, value_type varchar, setting_group varchar, description text
       )
     ON CONFLICT ("key") DO NOTHING
     RETURNING "id"`,
    [JSON.stringify(DEFAULT_SITE_SETTINGS)],
  )) as unknown[];
  return rows.length;
}

// ── All of it ───────────────────────────────────────────────────────────────

export type ReferenceDataCounts = Record<
  | "role_permissions"
  | "payment_method_thresholds"
  | "sales_channels"
  | "section_types"
  | "vendor_template_layout"
  | "shipping_rates"
  | "shipping_contribution_tiers"
  | "site_settings",
  number
>;

/** Insert every missing reference row; returns how many rows each step added. */
export async function applyReferenceData(q: Queryable): Promise<ReferenceDataCounts> {
  return {
    role_permissions: await applyRolePermissions(q),
    payment_method_thresholds: await applyPaymentMethodThresholds(q),
    sales_channels: await applySalesChannels(q),
    // Section types before the template, whose sections reference them by name.
    section_types: await applySectionTypes(q),
    vendor_template_layout: await applyVendorTemplateLayout(q),
    shipping_rates: await applyPlatformShippingRate(q),
    shipping_contribution_tiers: await applyShippingContributionTiers(q),
    site_settings: await applySiteSettings(q),
  };
}
