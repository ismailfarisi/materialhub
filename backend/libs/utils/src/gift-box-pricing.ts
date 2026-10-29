export interface PricingItem {
  product_id: string;
  variant_id: string | null;
  vendor_id: string;
  quantity: number;
  unit_price: number; // fils
}

export interface GiftBoxPriceInput {
  items: PricingItem[];
  packagingPrice: number; // fils
  discountPercentage: number | null;
}

export interface GiftBoxPriceResult {
  itemsSubtotal: number;
  discount: number;
  packaging: number;
  total: number;
  perVendor: Record<string, number>;
}

export function computeGiftBoxPrice(input: GiftBoxPriceInput): GiftBoxPriceResult {
  const perVendor: Record<string, number> = {};
  let itemsSubtotal = 0;
  for (const it of input.items) {
    const line = it.unit_price * it.quantity;
    itemsSubtotal += line;
    perVendor[it.vendor_id] = (perVendor[it.vendor_id] ?? 0) + line;
  }
  const pct = input.discountPercentage ?? 0;
  const discount = Math.round((itemsSubtotal * pct) / 100);
  const packaging = input.packagingPrice;
  const total = itemsSubtotal - discount + packaging;
  return { itemsSubtotal, discount, packaging, total, perVendor };
}
