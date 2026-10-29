export const vendorOrderCreatedSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "vendor_order.created",
  version: 1,
  type: "object",
  properties: {
    vendor_order: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        vendor_order_number: { type: "string" },
        status: { type: "string" },
        subtotal: { type: "integer", description: "fils" },
        shipping_cost: { type: "integer" },
        tax_total: { type: "integer" },
        vendor_total: { type: "integer" },
        currency: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              product_name: { type: "string" },
              sku: { type: "string" },
              quantity: { type: "integer" },
              unit_price: { type: "integer" },
            },
          },
        },
      },
    },
    order: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        order_number: { type: "string" },
        user: {
          type: "object",
          properties: {
            email: { type: "string", "x-sensitive": false },
            phone: { type: "string", "x-sensitive": false },
            first_name: { type: "string" },
            last_name: { type: "string" },
          },
        },
        shipping_address: { type: "object" },
      },
    },
  },
} as const;
