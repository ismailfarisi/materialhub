import { describe, expect, mock, test } from "bun:test";

mock.module("@materialhub/database", () => ({
  AppDataSource: {
    getRepository: () => ({
      findOne: async () => null,
      save: async (row: unknown) => row,
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

mock.module("@materialhub/plugins", () => {
  class MockHttpError extends Error {
    public statusCode: number;
    public code: string;
    constructor(status: number, message: string, code: string) {
      super(message);
      this.statusCode = status;
      this.code = code;
    }
  }
  return {
    HttpError: MockHttpError,
    BadRequestError: class BadRequestError extends MockHttpError {
      constructor(message = "Bad Request", code = "BAD_REQUEST") {
        super(400, message, code);
      }
    },
    UnauthorizedError: class UnauthorizedError extends MockHttpError {
      constructor(message = "Unauthorized", code = "UNAUTHORIZED") {
        super(411, message, code);
      }
    },
    ForbiddenError: class ForbiddenError extends MockHttpError {
      constructor(message = "Forbidden", code = "FORBIDDEN") {
        super(403, message, code);
      }
    },
    NotFoundError: class NotFoundError extends MockHttpError {
      constructor(message = "Not Found", code = "NOT_FOUND") {
        super(404, message, code);
      }
    },
    TooManyRequestsError: class TooManyRequestsError extends MockHttpError {
      constructor(message = "Too Many Requests", code = "TOO_MANY_REQUESTS") {
        super(429, message, code);
      }
    },
    ServiceUnavailableError: class ServiceUnavailableError extends MockHttpError {
      constructor(message = "Service Unavailable", code = "SERVICE_UNAVAILABLE") {
        super(503, message, code);
      }
    },
    InternalServerError: class InternalServerError extends MockHttpError {
      constructor(message = "Internal Server Error", code = "INTERNAL_SERVER_ERROR") {
        super(500, message, code);
      }
    },
  };
});

const { ProductAiEnhanceService } = await import("./product-ai-enhance.service.ts");
const { ServiceUnavailableError } = await import("@materialhub/plugins");

function productFixture() {
  return {
    id: "product-1",
    name: "Moon Serum",
    description: "Hydrating serum",
    ingredients: "Water, Glycerin",
    usage_instructions: "Apply nightly",
    tags: ["serum"],
    category_id: "cat-skin-care",
    category: { id: "cat-skin-care", name: "Skin Care" },
    brand: { name: "MaterialHub UAE" },
    categoryAttributes: [
      {
        is_required: true,
        sort_order: 1,
        attribute_id: "attr-skin",
        attribute: {
          id: "attr-skin",
          name: "Skin type",
          type: "select",
          is_variant: false,
          values: [
            { id: "value-dry", value: "dry", display_value: "Dry" },
            { id: "value-oily", value: "oily", display_value: "Oily" },
          ],
        },
      },
      {
        is_required: false,
        sort_order: 2,
        attribute_id: "attr-spf",
        attribute: {
          id: "attr-spf",
          name: "SPF",
          type: "number",
          is_variant: false,
          values: [],
        },
      },
    ],
    attributeValues: [
      {
        attribute_id: "attr-skin",
        attribute: {
          id: "attr-skin",
          name: "Skin type",
          type: "select",
          is_variant: false,
          values: [{ id: "value-dry", value: "dry", display_value: "Dry" }],
        },
        attributeValue: null,
        text_value: null,
      },
    ],
    translations: [],
  };
}

describe("ProductAiEnhanceService", () => {
  test("throws ServiceUnavailableError when disabled", async () => {
    const service = new ProductAiEnhanceService({
      get: async () => ({
        enabled: false,
        provider: "qwen" as const,
        base_url: "https://example.test/v1",
        model: "qwen-plus",
        prompt: "Prompt",
        timeout_ms: 30000,
        api_key: "sk-test",
      }),
    });

    await expect(service.generateDraft({ product: productFixture() })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
  });

  test("validates and maps Qwen strict JSON draft without persisting", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const service = new ProductAiEnhanceService(
      {
        get: async () => ({
          enabled: true,
          provider: "qwen" as const,
          base_url: "https://example.test/v1",
          model: "qwen-plus",
          prompt: "Prompt",
          timeout_ms: 30000,
          api_key: "sk-test",
        }),
      },
      (async (url: unknown, init?: { body?: unknown }) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    product: {
                      name: "Moon Serum",
                      description: "A polished hydrating serum.",
                      ingredients: "Water, Glycerin",
                      usage_instructions: "Apply at night.",
                      meta_title: "Moon Serum",
                      meta_description: "Hydrating serum for nightly care.",
                      tags: ["serum", "hydrating"],
                    },
                    translations: [
                      {
                        locale: "ar",
                        name: "سيروم القمر",
                        description: "سيروم مرطب.",
                        ingredients: "ماء، جلسرين",
                        usage_instructions: "يستخدم مساء.",
                        meta_title: "سيروم القمر",
                        meta_description: "سيروم مرطب للعناية الليلية.",
                      },
                    ],
                    attributes: [{ attribute_id: "attr-skin", value_id: "value-dry" }],
                    warnings: [],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as unknown as typeof fetch,
    );

    const draft = await service.generateDraft({
      product: productFixture(),
    });

    expect(calls[0]?.url).toBe("https://example.test/v1/chat/completions");
    expect(calls[0]?.body?.model).toBe("qwen-plus");
    const userMessage = (calls[0]?.body?.messages as Array<{ role: string; content: string }>).find(
      (message) => message.role === "user",
    );
    const userContext = JSON.parse(userMessage?.content ?? "{}") as {
      category_attributes?: unknown;
    };
    expect(userContext.category_attributes).toEqual([
      {
        attribute_id: "attr-skin",
        name: "Skin type",
        type: "select",
        is_variant: false,
        is_required: true,
        allowed_values: [
          { id: "value-dry", value: "dry", display_value: "Dry" },
          { id: "value-oily", value: "oily", display_value: "Oily" },
        ],
      },
      {
        attribute_id: "attr-spf",
        name: "SPF",
        type: "number",
        is_variant: false,
        is_required: false,
        allowed_values: [],
      },
    ]);
    expect(draft.product.description).toContain("polished");
    expect(draft.translations[0]).toMatchObject({
      locale: "ar",
      name: "سيروم القمر",
    });
    expect(draft.attributes).toEqual([{ attribute_id: "attr-skin", value_id: "value-dry" }]);
  });

  test("strips markdown wrappers from Qwen response and parses successfully", async () => {
    const service = new ProductAiEnhanceService(
      {
        get: async () => ({
          enabled: true,
          provider: "qwen" as const,
          base_url: "https://example.test/v1",
          model: "qwen-plus",
          prompt: "Prompt",
          timeout_ms: 30000,
          api_key: "sk-test",
        }),
      },
      (async () => {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `\`\`\`json\n${JSON.stringify({
                    product: {
                      name: "Moon Serum",
                      description: "A polished hydrating serum.",
                      ingredients: "Water, Glycerin",
                      usage_instructions: "Apply at night.",
                      meta_title: "Moon Serum",
                      meta_description: "Hydrating serum for nightly care.",
                      tags: ["serum", "hydrating"],
                    },
                    translations: [
                      {
                        locale: "ar",
                        name: "سيروم القمر",
                        description: "سيروم مرطب.",
                        ingredients: "ماء، جلسرين",
                        usage_instructions: "يستخدم مساء.",
                        meta_title: "سيروم القمر",
                        meta_description: "سيروم مرطب للعناية الليلية.",
                      },
                    ],
                    attributes: [{ attribute_id: "attr-skin", value_id: "value-dry" }],
                    warnings: [],
                  })}\n\`\`\``,
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as unknown as typeof fetch,
    );

    const draft = await service.generateDraft({
      product: productFixture(),
    });

    expect(draft.product.name).toBe("Moon Serum");
  });
});
