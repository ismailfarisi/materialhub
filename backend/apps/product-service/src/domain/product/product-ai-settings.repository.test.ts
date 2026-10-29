import { afterEach, describe, expect, mock, test } from "bun:test";

type UpsertOptions = {
  conflictPaths?: string[];
  indexPredicate?: string;
};

type SiteSettingRow = Record<string, unknown> & {
  value?: string | null;
};

function makeSiteSettingRepo(row: SiteSettingRow | null = null) {
  let current = row;
  const upserts: Array<{
    row: Record<string, unknown>;
    options: UpsertOptions;
  }> = [];

  return {
    get current() {
      return current;
    },
    upserts,
    findOne: async () => current,
    upsert: async (next: Record<string, unknown>, options: unknown) => {
      upserts.push({ row: next, options: options as UpsertOptions });
      current = { ...current, ...next };
    },
  };
}

mock.module("@materialhub/database", () => ({
  AppDataSource: {
    getRepository: () => ({
      findOne: async () => null,
      upsert: async () => {},
    }),
  },
  Attribute: class {},
  Brand: class {},
  Category: class {},
  Product: class {},
  ProductAttributeValue: class {},
  ProductCategory: class {},
  ProductImage: class {},
  ProductTranslation: class {},
  ProductVideo: class {},
  ProductVariant: class {},
  ProductGroup: class {},
  ProductGroupMember: class {},
  AttributeValue: class {},
  Vendor: class {},
  Warehouse: class {},
  WarehouseVendorPermission: class {},
  SiteSetting: class {},
  AuditLog: class {},
  Order: class {},
  OrderItem: class {},
  VendorOrder: class {},
  Address: class {},
  User: class {},
  Cart: class {},
  CartItem: class {},
  Coupon: class {},
  Commission: class {},
  PaymentMethod: class {},
  Shipment: class {},
  ShipmentItem: class {},
  ShipmentTracking: class {},
  Inventory: class {},
  InventoryMovement: class {},
}));

const { PRODUCT_AI_SETTINGS_KEY, ProductAiSettingsRepository } = await import(
  "./product-ai-settings.repository.ts"
);

describe("ProductAiSettingsRepository", () => {
  afterEach(() => {
    process.env.QWEN_API_KEY = undefined;
  });

  test("returns safe Qwen defaults when no setting exists", async () => {
    const repo = makeSiteSettingRepo(null);
    const settings = new ProductAiSettingsRepository(repo);

    await expect(settings.get()).resolves.toMatchObject({
      enabled: false,
      provider: "qwen",
      base_url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      model: "qwen-plus",
      prompt: expect.any(String),
      timeout_ms: 90000,
      api_key: "",
    });

    const defaults = await settings.get();
    expect(defaults.prompt.trim().length).toBeGreaterThan(0);
  });

  test("public settings mask stored keys, omit raw key, and report env fallback", async () => {
    process.env.QWEN_API_KEY = "env-key";
    const repo = makeSiteSettingRepo({
      key: PRODUCT_AI_SETTINGS_KEY,
      value: JSON.stringify({
        enabled: true,
        provider: "qwen",
        base_url: "https://example.test/v1",
        model: "qwen-plus",
        prompt: "Prompt",
        timeout_ms: 30000,
        api_key: "sk-test-1234",
      }),
    });
    const settings = new ProductAiSettingsRepository(repo);

    const publicSettings = await settings.getPublic();

    expect(publicSettings).toMatchObject({
      enabled: true,
      api_key_set: true,
      api_key_preview: "\u2022\u2022\u2022\u20221234",
      env_key_set: true,
    });
    expect("api_key" in publicSettings).toBe(false);
  });

  test("updates product AI settings with the active site setting conflict predicate", async () => {
    const repo = makeSiteSettingRepo(null);
    const settings = new ProductAiSettingsRepository(repo);

    const updated = await settings.update(
      {
        enabled: true,
        base_url: " https://example.test/compatible/v1 ",
        model: " qwen-max ",
        prompt: " Write product copy as JSON. ",
        timeout_ms: 45000,
        api_key: "sk-live-9999",
      },
      "admin-1",
    );

    expect(updated).toMatchObject({
      enabled: true,
      provider: "qwen",
      base_url: "https://example.test/compatible/v1",
      model: "qwen-max",
      prompt: "Write product copy as JSON.",
      timeout_ms: 45000,
      api_key: "sk-live-9999",
    });
    expect(repo.upserts).toHaveLength(1);
    expect(repo.upserts[0]!.row).toMatchObject({
      key: PRODUCT_AI_SETTINGS_KEY,
      value_type: "json",
      group: "ai",
      updated_by: "admin-1",
    });
    expect(repo.upserts[0]!.options).toEqual({
      conflictPaths: ["key"],
      indexPredicate: "deleted_at IS NULL",
    });
    expect(JSON.parse(String(repo.current?.value))).toMatchObject(updated);
  });
});
