import { type Static, Type } from "@sinclair/typebox";

// Common schemas
export const PaginationQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type PaginationQuery = Static<typeof PaginationQuery>;

export const IdParam = Type.Object({
  id: Type.String({ format: "uuid" }),
});
export type IdParam = Static<typeof IdParam>;

export const ErrorResponse = Type.Object({
  statusCode: Type.Number(),
  message: Type.String(),
  error: Type.Optional(Type.String()),
  timestamp: Type.String(),
});
export type ErrorResponse = Static<typeof ErrorResponse>;

export const HealthResponse = Type.Object({
  status: Type.String(),
  service: Type.String(),
  timestamp: Type.String(),
});
export type HealthResponse = Static<typeof HealthResponse>;

// Domain DTOs
export * from "./auth.dto.ts";
export * from "./product.dto.ts";
export * from "./order.dto.ts";
export * from "./vendor.dto.ts";
export * from "./notification.dto.ts";
export * from "./cms.dto.ts";
export * from "./support.dto.ts";
export * from "./reason-keys.ts";
export * from "./checkout-quote.dto.ts";
export * from "./admin-payout.dto.ts";
export * from "./newsletter.dto.ts";
export * from "./product-group.dto.ts";

// Re-export typebox for convenience
export { Type, type Static } from "@sinclair/typebox";
