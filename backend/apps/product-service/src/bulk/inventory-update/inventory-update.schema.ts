import { Type } from "@sinclair/typebox";

export const InventoryUpdateRowSchema = Type.Object({
  sku: Type.Optional(Type.String({ maxLength: 64 })),
  external_id: Type.Optional(Type.String({ maxLength: 128 })),
  quantity_on_hand: Type.Integer({ minimum: 0, maximum: 10_000_000 }),
  note: Type.Optional(Type.String({ maxLength: 200 })),
});

export interface InventoryUpdateRow {
  sku: string | null;
  external_id: string | null;
  quantity_on_hand: number;
  note: string | null;
  /** Echo for diff log / error messages */
  rowNumber: number;
}
