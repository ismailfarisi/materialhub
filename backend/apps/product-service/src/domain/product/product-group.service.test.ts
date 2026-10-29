import { beforeEach, describe, expect, mock, test } from "bun:test";

const state = {
  attribute: { id: "attr-color", type: "color", is_groupable: true } as any,
  savedProducts: [] as any[],
  savedGroups: [] as any[],
  savedMembers: [] as any[],
  savedAttrValues: [] as any[],
  reindexed: [] as string[],
};

function makeManager() {
  return {
    getRepository: (entity: any) => ({
      findOne: async (opts: any) => {
        const name = typeof entity === "string" ? entity : entity?.name;
        if (name === "Attribute") {
          return opts?.where?.id === state.attribute.id ? state.attribute : null;
        }
        return null;
      },
    }),
    create: (_entity: any, row: any) => row,
    save: async (entity: any, row: any) => {
      const name = typeof entity === "string" ? entity : entity?.name;
      if (name === "Product") {
        row.id = row.id ?? `prod-${state.savedProducts.length + 1}`;
        state.savedProducts.push(row);
      } else if (name === "ProductGroup") {
        row.id = row.id ?? "group-1";
        state.savedGroups.push(row);
      } else if (name === "ProductGroupMember") {
        row.id = row.id ?? `member-${state.savedMembers.length + 1}`;
        state.savedMembers.push(row);
      } else if (name === "ProductAttributeValue") {
        state.savedAttrValues.push(row);
      }
      return row;
    },
  };
}

mock.module("@materialhub/database", () => ({
  AppDataSource: {
    transaction: async (cb: any) => cb(makeManager()),
    getRepository: (entity: any) => ({
      findOne: async (opts: any) => {
        if (entity === "ProductGroup" || entity?.name === "ProductGroup") {
          const id = opts?.where?.id;
          return state.savedGroups.find((g) => g.id === id) ?? null;
        }
        return null;
      },
    }),
  },
  // Full superset of all entity names exported by sibling test files so that
  // no matter which mock.module registration is active at ESM link time, every
  // statically-imported name resolves (missing names → SyntaxError at link).
  Attribute: class {},
  AttributeValue: class {},
  Brand: class {},
  Category: class {},
  Product: class {},
  ProductAttributeValue: class {},
  ProductCategory: class {},
  ProductImage: class {},
  ProductVariant: class {},
  Vendor: class {},
  Inventory: class {},
  InventoryMovement: class {},
  Warehouse: class {},
  WarehouseVendorPermission: class {},
  ProductGroup: class {},
  ProductGroupMember: class {},
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
}));

mock.module("@materialhub/plugins", () => ({
  HttpError: class HttpError extends Error {
    constructor(
      public status: number,
      public override message: string,
      public code: string,
    ) {
      super(message);
    }
  },
}));

mock.module("@materialhub/utils", () => ({
  generateSlug: (s: string) => s.toLowerCase().replace(/\s+/g, "-"),
}));

// Spread the real module so other exports (SearchSyncProcessor, used by
// search-sync.job.test.ts in the same bun process) survive the mock.
const realSearchSync = await import("../search/search-sync.job.ts");
mock.module("../search/search-sync.job.ts", () => ({
  ...realSearchSync,
  enqueueSearchSync: async () => {},
}));

const { ProductGroupService } = await import("./product-group.service.ts");

const reindexProduct = async (id: string) => {
  state.reindexed.push(id);
};

function makeService() {
  return new ProductGroupService({ reindexProduct } as any);
}

beforeEach(() => {
  state.attribute = { id: "attr-color", type: "color", is_groupable: true };
  state.savedProducts = [];
  state.savedGroups = [];
  state.savedMembers = [];
  state.savedAttrValues = [];
  state.reindexed = [];
});

describe("createGroup", () => {
  const body = {
    name: "Velvet Lipstick",
    grouping_attribute_id: "attr-color",
    shared: { category_id: "cat-1" },
    members: [
      {
        attribute_value_id: "val-red",
        name: "Velvet Lipstick — Red",
        price: 4900,
        is_primary: true,
      },
      { attribute_value_id: "val-pink", name: "Velvet Lipstick — Pink", price: 4900 },
    ],
  };

  test("creates one product + member per row and a single group", async () => {
    const service = makeService();
    await service.createGroup("vendor-1", body as any);

    expect(state.savedGroups).toHaveLength(1);
    expect(state.savedProducts).toHaveLength(2);
    expect(state.savedMembers).toHaveLength(2);
    expect(state.savedAttrValues).toHaveLength(2);
    expect(state.reindexed).toHaveLength(2);
  });

  test("marks exactly one primary member (the flagged one)", async () => {
    const service = makeService();
    await service.createGroup("vendor-1", body as any);
    const primaries = state.savedMembers.filter((m) => m.is_primary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].attribute_value_id).toBe("val-red");
  });

  test("defaults the first member to primary when none flagged", async () => {
    const service = makeService();
    await service.createGroup("vendor-1", {
      ...body,
      members: [
        { attribute_value_id: "val-red", name: "Red", price: 4900 },
        { attribute_value_id: "val-pink", name: "Pink", price: 4900 },
      ],
    } as any);
    const primaries = state.savedMembers.filter((m) => m.is_primary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].attribute_value_id).toBe("val-red");
  });

  test("rejects a non-groupable attribute", async () => {
    state.attribute = { id: "attr-color", type: "color", is_groupable: false };
    const service = makeService();
    await expect(service.createGroup("vendor-1", body as any)).rejects.toMatchObject({
      code: "ATTRIBUTE_NOT_GROUPABLE",
    });
  });

  test("rejects a non-select/color attribute type", async () => {
    state.attribute = { id: "attr-color", type: "text", is_groupable: true };
    const service = makeService();
    await expect(service.createGroup("vendor-1", body as any)).rejects.toMatchObject({
      code: "ATTRIBUTE_NOT_GROUPABLE",
    });
  });

  test("rejects duplicate attribute values across members", async () => {
    const service = makeService();
    await expect(
      service.createGroup("vendor-1", {
        ...body,
        members: [
          { attribute_value_id: "val-red", name: "Red", price: 4900 },
          { attribute_value_id: "val-red", name: "Red 2", price: 4900 },
        ],
      } as any),
    ).rejects.toMatchObject({ code: "DUPLICATE_GROUP_VALUE" });
  });
});
