import { Type } from "@sinclair/typebox";

export const FlashDealImportRowSchema = Type.Object({
  sku: Type.Optional(Type.String({ maxLength: 64 })),
  external_id: Type.Optional(Type.String({ maxLength: 128 })),
  title: Type.String({ maxLength: 255 }),
  deal_price: Type.Integer({ minimum: 1 }),
  original_price: Type.Optional(Type.Integer({ minimum: 1 })),
  quantity_limit: Type.Optional(Type.Integer({ minimum: 1 })),
  starts_at: Type.String(),
  expires_at: Type.String(),
  is_active: Type.Optional(Type.Boolean()),
});

/** Typed coerced row emitted from coerce.ts. */
export interface CoercedFlashDealImportRow {
  rowNumber: number;
  sku: string | null;
  external_id: string | null;
  title: string;
  deal_price: number;
  /** May be null after coerce; preValidate fills it from product price. */
  original_price: number | null;
  quantity_limit: number | null;
  starts_at: Date;
  expires_at: Date;
  is_active: boolean;
}
