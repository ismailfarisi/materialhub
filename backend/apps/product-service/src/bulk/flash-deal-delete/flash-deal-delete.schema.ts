import { Type } from "@sinclair/typebox";

export const FlashDealDeleteRowSchema = Type.Object({
  sku: Type.Optional(Type.String({ maxLength: 64 })),
  external_id: Type.Optional(Type.String({ maxLength: 128 })),
  note: Type.Optional(Type.String({ maxLength: 200 })),
});

export interface CoercedFlashDealDeleteRow {
  rowNumber: number;
  sku: string | null;
  external_id: string | null;
  note: string | null;
}
