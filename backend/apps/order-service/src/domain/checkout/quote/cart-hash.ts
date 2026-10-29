import { createHash } from "node:crypto";

export interface CartHashItem {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
}

export function computeCartHash(items: CartHashItem[]): string {
  const sorted = [...items]
    .map((i) => ({
      product_id: i.product_id,
      variant_id: i.variant_id ?? null,
      quantity: i.quantity,
      unit_price: i.unit_price,
    }))
    .sort((a, b) => {
      const k = (x: CartHashItem) => `${x.product_id}|${x.variant_id ?? ""}`;
      return k(a).localeCompare(k(b));
    });
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}
